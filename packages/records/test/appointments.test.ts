import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createAppointmentsService, createLabService } from '../src';

describe.skipIf(!TEST_DB)('rendez-vous médicaux (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let rdv: ReturnType<typeof createAppointmentsService>;
  let lab: ReturnType<typeof createLabService>;
  let jo: Actor, marc: Actor;
  let pid = '', marcPid = '', futureId = '';

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }

  beforeAll(async () => {
    ctx = await setupAuth(); // 2026-11-04 10:00 UTC
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    rdv = createAppointmentsService({ profiles, now });
    lab = createLabService({ profiles, now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
    marcPid = (await profiles.listProfiles(marc.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('crée, classe (à venir / passés) et modifie les rendez-vous', async () => {
    const f = await rdv.save(jo, pid, { date: '2026-11-17', time: '10:30', specialty: 'Endocrinologie', practitioner: 'Dr Exemple', reminder: '1440', toPrepare: 'Rapport 90 jours' });
    expect(f.ok).toBe(true);
    if (f.ok) futureId = f.id;
    expect((await rdv.save(jo, pid, { date: '2026-09-01', time: '09:00', specialty: 'Médecine générale' })).ok).toBe(true);
    expect(await rdv.save(jo, pid, { date: '2026-11-17', time: '10:30' })).toMatchObject({ ok: false });
    const { upcoming, past } = await rdv.list(jo, pid);
    expect(upcoming.map((a) => [a.specialty, a.startsAt.toISOString(), a.reminderMinutes])).toEqual([['Endocrinologie', '2026-11-17T09:30:00.000Z', 1440]]);
    expect(past.map((a) => a.specialty)).toEqual(['Médecine générale']);
    const upd = await rdv.save(jo, pid, { date: '2026-11-17', time: '11:00', specialty: 'Endocrinologie', notesAfter: 'Contrôle dans 3 mois' }, futureId);
    expect(upd).toEqual({ ok: true, id: futureId });
    expect(await rdv.get(jo, pid, futureId)).toMatchObject({ startsAt: new Date('2026-11-17T10:00:00Z'), notesAfter: 'Contrôle dans 3 mois', reminderMinutes: null });
  });

  it('associe un résultat du même profil, refuse celui d’un autre profil', async () => {
    const mine = await lab.addManual(jo, pid, { analyteCode: 'hba1c', value: '7,2', unit: '%', sampledOn: '2026-09-03' });
    const other = await lab.addManual(marc, marcPid, { analyteCode: 'hba1c', value: '6,1', unit: '%', sampledOn: '2026-09-03' });
    if (!mine.ok || !other.ok) throw new Error('ajouts attendus');
    expect(await rdv.link(jo, pid, futureId, { labResultId: mine.id })).toBe(true);
    expect(await rdv.link(jo, pid, futureId, { labResultId: mine.id })).toBe(true); // idempotent
    expect(await rdv.link(jo, pid, futureId, { labResultId: other.id })).toBe(false);
    const a = (await rdv.get(jo, pid, futureId))!;
    expect(a.links).toHaveLength(1);
    expect(await rdv.unlink(jo, pid, a.links[0]!.id)).toBe(true);
    expect((await rdv.get(jo, pid, futureId))!.links).toHaveLength(0);
  });

  it('les liens sont cloisonnés par la base', async () => {
    const mine = await lab.addManual(jo, pid, { analyteCode: 'ferritin', value: '25', unit: 'µg/L', sampledOn: '2026-09-03' });
    if (!mine.ok) throw new Error('ajout attendu');
    await rdv.link(jo, pid, futureId, { labResultId: mine.id });
    const seen = await ctx.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.account_id', ${marc.accountId}, true)`;
      return (await tx`SELECT count(*)::int AS n FROM appointment_link`)[0]!.n;
    });
    expect(seen).toBe(0);
  });

  it('autorisations : lecture seule pour un aidant, rien sans accès', async () => {
    await expect(rdv.list(marc, pid)).rejects.toBeInstanceOf(ForbiddenError);
    await profiles.invite(jo, pid, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { appointments: 'read' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
    expect((await rdv.list(marc, pid)).upcoming).toHaveLength(1);
    await expect(rdv.save(marc, pid, { date: '2026-12-01', time: '09:00', specialty: 'X' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('suppression logique', async () => {
    expect(await rdv.remove(jo, pid, futureId)).toBe(true);
    expect(await rdv.get(jo, pid, futureId)).toBeNull();
    expect((await rdv.list(jo, pid)).upcoming).toHaveLength(0);
  });
});
