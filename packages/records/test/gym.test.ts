import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createGymService } from '../src';

describe.skipIf(!TEST_DB)('salle de sport (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let gym: ReturnType<typeof createGymService>;
  let jo: Actor, marc: Actor;
  let pid = '';

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }
  /** Nombre de séances visibles par un compte, directement sous le rôle applicatif (RLS). */
  async function countAs(accountId: string): Promise<number> {
    const rows = await ctx.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.account_id', ${accountId}, true)`;
      return tx<{ n: number }[]>`SELECT count(*)::int AS n FROM gym_visit`;
    });
    return (rows as unknown as { n: number }[])[0]!.n;
  }
  beforeAll(async () => {
    ctx = await setupAuth();
    ctx.advance(24 * 60); // 5 nov. 2026
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    gym = createGymService({ profiles, now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('coche et décoche des jours, sans doublon', async () => {
    expect(await gym.listVisits(jo, pid, '2026-11-01', '2026-11-30')).toEqual([]);
    expect(await gym.setVisit(jo, pid, '2026-11-05', true)).toEqual({ ok: true });
    expect(await gym.setVisit(jo, pid, '2026-11-05', true)).toEqual({ ok: true }); // idempotent
    expect(await gym.setVisit(jo, pid, '2026-11-03', true)).toEqual({ ok: true });
    expect(await gym.setVisit(jo, pid, '2026-10-30', true)).toEqual({ ok: true });
    expect(await gym.listVisits(jo, pid, '2026-11-01', '2026-11-30')).toEqual(['2026-11-03', '2026-11-05']);
    expect(await gym.listVisits(jo, pid, '2026-10-01', '2026-11-30')).toEqual(['2026-10-30', '2026-11-03', '2026-11-05']);
    expect(await gym.setVisit(jo, pid, '2026-11-03', false)).toEqual({ ok: true });
    expect(await gym.setVisit(jo, pid, '2026-11-03', false)).toEqual({ ok: true }); // idempotent
    expect(await gym.listVisits(jo, pid, '2026-11-01', '2026-11-30')).toEqual(['2026-11-05']);
    expect(await countAs(jo.accountId)).toBe(2);
  });

  it('contrôles : pas de date future, 10 ans au plus, date valide', async () => {
    expect(await gym.setVisit(jo, pid, '2026-11-06', true)).toMatchObject({ ok: false, error: expect.stringContaining('futur') });
    expect(await gym.setVisit(jo, pid, '2016-01-01', true)).toMatchObject({ ok: false, error: expect.stringContaining('ancienne') });
    expect(await gym.setVisit(jo, pid, 'hier', true)).toMatchObject({ ok: false });
    expect(await gym.setVisit(jo, pid, '2026-02-30', true)).toMatchObject({ ok: false });
    expect(await gym.listVisits(jo, pid, 'x', '2026-11-30')).toEqual([]);
  });

  it('droits de la rubrique Activité : un aidant en lecture voit mais ne peut pas cocher', async () => {
    await expect(gym.listVisits(marc, pid, '2026-11-01', '2026-11-30')).rejects.toBeInstanceOf(ForbiddenError);
    await profiles.invite(jo, pid, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { activity: 'read' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
    expect(await gym.listVisits(marc, pid, '2026-11-01', '2026-11-30')).toEqual(['2026-11-05']);
    await expect(gym.setVisit(marc, pid, '2026-11-04', true)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(gym.setVisit(marc, pid, '2026-11-05', false)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await gym.listVisits(jo, pid, '2026-11-01', '2026-11-30')).toEqual(['2026-11-05']);
  });

  it('RLS : sans compte connu, aucune séance visible ; écriture refusée en lecture seule', async () => {
    expect(await countAs('')).toBe(0);
    expect(await countAs(marc.accountId)).toBe(2); // lecture accordée sur la rubrique Activité (30 oct. et 5 nov.)
    const blocked = await ctx.sql
      .begin(async (tx) => {
        await tx`SELECT set_config('app.account_id', ${marc.accountId}, true)`;
        await tx`INSERT INTO gym_visit (profile_id, day) VALUES (${pid}, '2026-11-01')`;
      })
      .then(
        () => false,
        () => true,
      );
    expect(blocked).toBe(true);
  });
});
