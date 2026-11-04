import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '@bilanx/db';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createProfilesService, ForbiddenError, type Actor } from '../src';

const PW = 'cheval-agrafe-batterie';

describe.skipIf(!TEST_DB)('Famille & profils (PostgreSQL réel, Row-Level Security)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let jo: Actor, marc: Actor, dr: Actor, intrus: Actor;
  let mamieId = '';
  let marcAccessId = '';

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: PW, displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }

  /** Requête SQL brute « en tant que » un compte : contourne l'application, seule la RLS protège. */
  async function asAccount<T>(accountId: string, fn: (tx: Sql) => Promise<T>): Promise<T> {
    return ctx.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.account_id', ${accountId}, true)`;
      return fn(tx as unknown as Sql);
    }) as Promise<T>;
  }

  beforeAll(async () => {
    ctx = await setupAuth();
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now: () => new Date(ctx.clock.t) });
    // Catalogue chargé par la migration 0004.
    expect((await ctx.sql`SELECT count(*)::int AS n FROM analyte`)[0]!.n).toBe(22);
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    dr = await createUser('dr.martin@exemple.fr', 'Dr Martin');
    intrus = await createUser('intrus@exemple.fr', 'Intrus');
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('liste le profil personnel créé à l’inscription', async () => {
    const list = await profiles.listProfiles(jo.accountId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ displayName: 'Jo', relationship: 'self', role: 'owner' });
  });

  it('exige une base légale déclarée pour créer le profil d’un proche', async () => {
    const base = { displayName: 'Mamie Rose', relationship: 'grandparent', birthDate: '1941-03-12' };
    expect(await profiles.createRelativeProfile(jo, { ...base, legalBasis: 'consent_of_person', attested: false })).toMatchObject({ ok: false });
    expect(await profiles.createRelativeProfile(jo, { ...base, legalBasis: 'nimporte', attested: true })).toMatchObject({ ok: false });
    expect(await profiles.createRelativeProfile(jo, { ...base, legalBasis: 'parental_authority', attested: true })).toMatchObject({ ok: false });
    expect(
      await profiles.createRelativeProfile(jo, { displayName: 'Léo', relationship: 'child', birthDate: '2001-01-01', legalBasis: 'parental_authority', attested: true }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('majeure') });
    const r = await profiles.createRelativeProfile(jo, { ...base, legalBasis: 'consent_of_person', attested: true });
    expect(r.ok).toBe(true);
    if (r.ok) mamieId = r.profileId;
    const [pa] = await ctx.sql`SELECT role, legal_basis, legal_basis_attested_at FROM profile_access WHERE profile_id = ${mamieId}`;
    expect(pa).toMatchObject({ role: 'owner', legal_basis: 'consent_of_person' });
    expect(pa!.legal_basis_attested_at).toBeInstanceOf(Date);
  });

  it('interdit un second gestionnaire au niveau de la base', async () => {
    await expect(
      ctx.sql`INSERT INTO profile_access (profile_id, account_id, role) VALUES (${mamieId}, ${marc.accountId}, 'owner')`,
    ).rejects.toThrow(/profile_single_owner/);
  });

  it('le gestionnaire écrit des données ; personne d’autre ne les voit', async () => {
    await profiles.withProfileData(jo, mamieId, 'lab', 'write', (tx) =>
      tx`INSERT INTO lab_result (profile_id, analyte_code, value, unit, sampled_at, source_type, confirmed_by)
         VALUES (${mamieId}, 'ferritin', 25, 'µg/L', now(), 'manual', ${jo.accountId})`,
    );
    await profiles.withProfileData(jo, mamieId, 'appointments', 'write', (tx) =>
      tx`INSERT INTO appointment (profile_id, starts_at, specialty, created_by) VALUES (${mamieId}, now() + interval '7 days', 'Cardiologie', ${jo.accountId})`,
    );
    for (const who of [marc, intrus]) {
      const n = await asAccount(who.accountId, async (tx) => (await tx`SELECT count(*)::int AS n FROM lab_result`)[0]!.n);
      expect(n).toBe(0);
    }
    // Sans compte déclaré : rien non plus.
    expect((await ctx.sql`SELECT count(*)::int AS n FROM lab_result`)[0]!.n).toBe(0);
  });

  it('un gestionnaire de plusieurs profils ne voit que le profil consulté, même sans filtre dans la requête', async () => {
    const [self] = await profiles.listProfiles(jo.accountId);
    await profiles.withProfileData(jo, self!.profileId, 'lab', 'write', (tx) =>
      tx`INSERT INTO lab_result (profile_id, analyte_code, value, unit, sampled_at, source_type, confirmed_by)
         VALUES (${self!.profileId}, 'ferritin', 80, 'µg/L', now(), 'manual', ${jo.accountId})`,
    );
    // Requêtes volontairement SANS « WHERE profile_id = … » : la base cloisonne quand même.
    const mine = await profiles.withProfileData(jo, self!.profileId, 'lab', 'read', (tx) => tx`SELECT value FROM lab_result`);
    expect(mine.map((r) => Number(r.value))).toEqual([80]);
    const hers = await profiles.withProfileData(jo, mamieId, 'lab', 'read', (tx) => tx`SELECT value FROM lab_result`);
    expect(hers.map((r) => Number(r.value))).toEqual([25]);
    // Écrire dans un autre profil que celui annoncé est refusé.
    await expect(
      profiles.withProfileData(jo, self!.profileId, 'lab', 'write', (tx) =>
        tx`INSERT INTO lab_result (profile_id, analyte_code, value, unit, sampled_at, source_type, confirmed_by)
           VALUES (${mamieId}, 'ferritin', 1, 'µg/L', now(), 'manual', ${jo.accountId})`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('refuse les invitations invalides', async () => {
    const ok = { email: 'marc@exemple.fr', role: 'caregiver', permissions: { appointments: 'read' } };
    expect(await profiles.invite(jo, mamieId, { ...ok, email: 'jo@exemple.fr' })).toMatchObject({ ok: false });
    expect(await profiles.invite(jo, mamieId, { ...ok, permissions: { inconnu: 'write' } })).toMatchObject({ ok: false });
    expect(await profiles.invite(jo, mamieId, { ...ok, role: 'owner' })).toMatchObject({ ok: false });
    expect(await profiles.invite(jo, mamieId, { ...ok, role: 'guest_professional', accessDays: 30, permissions: { lab: 'write' } })).toMatchObject({ ok: false });
    expect(await profiles.invite(jo, mamieId, { ...ok, role: 'guest_professional', permissions: { lab: 'read' } })).toMatchObject({ ok: false });
    await expect(profiles.invite(marc, mamieId, ok)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('une invitation ne donne aucun accès avant d’être acceptée, et seulement par la bonne adresse', async () => {
    expect(await profiles.invite(jo, mamieId, { email: 'MARC@exemple.fr', role: 'caregiver', permissions: { appointments: 'read' } })).toEqual({ ok: true });
    const mail = ctx.mailer.last('marc@exemple.fr')!;
    expect(mail.subject).toContain('Jo vous invite');
    expect(mail.text).not.toMatch(/ferritine|25/i); // aucune donnée de santé dans l'e-mail
    const token = tokenFrom(mail.text);
    expect(await profiles.getAccess(marc.accountId, mamieId)).toBeNull();

    const preview = await profiles.previewInvitation(token);
    expect(preview).toMatchObject({ status: 'pending', profileName: 'Mamie Rose', inviter: 'Jo', role: 'caregiver', permissions: { appointments: 'read' } });

    expect(await profiles.respondToInvitation(intrus, token, true)).toMatchObject({ ok: false, error: expect.stringContaining('autre adresse') });
    const r = await profiles.respondToInvitation(marc, token, true);
    expect(r.ok).toBe(true);
    expect(await profiles.respondToInvitation(marc, token, true)).toMatchObject({ ok: false });
    expect(ctx.mailer.last('jo@exemple.fr')?.subject).toContain('acceptée');
    const a = (await profiles.getAccess(marc.accountId, mamieId))!;
    expect(a).toMatchObject({ role: 'caregiver', permissions: { appointments: 'read' } });
    marcAccessId = a.accessId;
  });

  it('l’aidant ne voit que le module accordé, en lecture seule — appliqué par PostgreSQL', async () => {
    await expect(profiles.withProfileData(marc, mamieId, 'lab', 'read', async () => 1)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(profiles.withProfileData(marc, mamieId, 'appointments', 'write', async () => 1)).rejects.toBeInstanceOf(ForbiddenError);
    const rdv = await profiles.withProfileData(marc, mamieId, 'appointments', 'read', (tx) => tx`SELECT specialty FROM appointment`);
    expect(rdv.map((r) => r.specialty)).toEqual(['Cardiologie']);

    // Contournement volontaire de l'application : la base refuse quand même.
    await asAccount(marc.accountId, async (tx) => {
      expect((await tx`SELECT count(*)::int AS n FROM lab_result`)[0]!.n).toBe(0);
      expect((await tx`SELECT count(*)::int AS n FROM appointment`)[0]!.n).toBe(1);
      expect((await tx`DELETE FROM appointment RETURNING id`).length).toBe(0);
      expect((await tx`UPDATE appointment SET specialty = 'x' RETURNING id`).length).toBe(0);
    });
    await expect(
      asAccount(marc.accountId, (tx) => tx`INSERT INTO appointment (profile_id, starts_at, created_by) VALUES (${mamieId}, now(), ${marc.accountId})`),
    ).rejects.toThrow(/row-level security/);
  });

  it('le gestionnaire ajuste les autorisations module par module', async () => {
    expect(await profiles.updatePermissions(jo, mamieId, marcAccessId, { appointments: 'write', lab: 'read' })).toEqual({ ok: true });
    await asAccount(marc.accountId, async (tx) => {
      expect((await tx`SELECT count(*)::int AS n FROM lab_result`)[0]!.n).toBe(1);
      expect((await tx`UPDATE appointment SET notes_after = 'RAS' RETURNING id`).length).toBe(1);
    });
    await expect(profiles.updatePermissions(marc, mamieId, marcAccessId, { lab: 'write' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('un professionnel invité : lecture seule et durée limitée', async () => {
    await profiles.invite(jo, mamieId, { email: 'dr.martin@exemple.fr', role: 'guest_professional', permissions: { lab: 'read' }, accessDays: 30 });
    expect((await profiles.respondToInvitation(dr, tokenFrom(ctx.mailer.last('dr.martin@exemple.fr')?.text), true)).ok).toBe(true);
    const a = (await profiles.getAccess(dr.accountId, mamieId))!;
    expect(a.role).toBe('guest_professional');
    expect(a.expiresAt!.getTime() - ctx.clock.t.getTime()).toBe(30 * 86_400_000);
    const { accesses } = await profiles.listAccesses(jo, mamieId);
    expect(await profiles.updatePermissions(jo, mamieId, accesses.find((x) => x.role === 'guest_professional')!.id, { lab: 'write' })).toMatchObject({ ok: false });

    // Côté application (horloge simulée) : l'accès disparaît après 30 jours.
    ctx.advance(31 * 24 * 60);
    expect(await profiles.getAccess(dr.accountId, mamieId)).toBeNull();
    // Côté base (horloge réelle) : on simule l'échéance.
    await ctx.sql`UPDATE profile_access SET expires_at = now() - interval '1 second' WHERE account_id = ${dr.accountId}`;
    expect(await asAccount(dr.accountId, async (tx) => (await tx`SELECT count(*)::int AS n FROM lab_result`)[0]!.n)).toBe(0);
  });

  it('la révocation est immédiate et notifiée', async () => {
    expect(await profiles.revokeAccess(jo, mamieId, marcAccessId)).toEqual({ ok: true });
    expect(ctx.mailer.last('marc@exemple.fr')?.subject).toContain('retiré');
    expect(await profiles.getAccess(marc.accountId, mamieId)).toBeNull();
    expect(await asAccount(marc.accountId, async (tx) => (await tx`SELECT count(*)::int AS n FROM appointment`)[0]!.n)).toBe(0);
    expect(await profiles.revokeAccess(jo, mamieId, (await profiles.listProfiles(jo.accountId)).find((p) => p.profileId === mamieId)!.accessId)).toMatchObject({ ok: false }); // pas le gestionnaire
  });

  it('une invitation en attente peut être retirée, puis renvoyée et acceptée à nouveau', async () => {
    await profiles.invite(jo, mamieId, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { journal: 'read' } });
    const first = tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text);
    const { invitations } = await profiles.listAccesses(jo, mamieId);
    expect(await profiles.revokeInvitation(jo, mamieId, invitations[0]!.id)).toEqual({ ok: true });
    expect((await profiles.previewInvitation(first))?.status).toBe('revoked');
    await profiles.invite(jo, mamieId, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { journal: 'read' } });
    expect((await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true)).ok).toBe(true);
    expect((await profiles.getAccess(marc.accountId, mamieId))?.permissions).toEqual({ journal: 'read' });
  });

  it('un aidant peut renoncer à son accès', async () => {
    expect(await profiles.leaveProfile(marc, mamieId)).toEqual({ ok: true });
    expect(await profiles.getAccess(marc.accountId, mamieId)).toBeNull();
    expect(await profiles.leaveProfile(jo, mamieId)).toMatchObject({ ok: false });
  });

  it('le journal d’accès retrace qui a fait quoi, et n’est lisible que par le gestionnaire', async () => {
    const log = await profiles.accessLog(jo, mamieId, 100);
    const lines = log.map((l) => `${l.email}:${l.action}:${l.resource}`);
    expect(lines).toContain('marc@exemple.fr:data.read:appointments');
    expect(lines).toContain('marc@exemple.fr:access.granted:profile_access');
    expect(lines).toContain('jo@exemple.fr:access.revoked:profile_access');
    expect(lines).toContain('jo@exemple.fr:profile.created:profile');
    await expect(profiles.accessLog(marc, mamieId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
