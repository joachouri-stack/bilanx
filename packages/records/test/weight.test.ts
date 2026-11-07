import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createWeightService, parseWeightKg } from '../src';

describe('lecture du poids saisi', () => {
  it('virgule, point, « kg », arrondi à 0,1', () => {
    expect(parseWeightKg('72,5')).toBe(72.5);
    expect(parseWeightKg(' 72.46 kg ')).toBe(72.5);
    expect(parseWeightKg(80)).toBe(80);
    expect(parseWeightKg('soixante')).toBeNull();
    expect(parseWeightKg('')).toBeNull();
  });
});

describe.skipIf(!TEST_DB)('poids (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let w: ReturnType<typeof createWeightService>;
  let jo: Actor, marc: Actor;
  let pid = '';

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }
  beforeAll(async () => {
    ctx = await setupAuth(); // 4 nov. 2026
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    w = createWeightService({ profiles, now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('une valeur par jour : la nouvelle saisie remplace', async () => {
    expect(await w.setWeight(jo, pid, '2026-11-01', '74,2')).toEqual({ ok: true, kg: 74.2, day: '2026-11-01' });
    await w.setWeight(jo, pid, '2026-11-04', '73.8');
    await w.setWeight(jo, pid, '2026-11-04', '73,6');
    expect(await w.listWeights(jo, pid, '2026-10-01', '2026-11-30')).toEqual([
      { day: '2026-11-01', kg: 74.2 },
      { day: '2026-11-04', kg: 73.6 },
    ]);
  });
  it('refus : futur, hors limites, illisible', async () => {
    expect((await w.setWeight(jo, pid, '2026-11-05', '70')).ok).toBe(false);
    expect((await w.setWeight(jo, pid, '2026-11-04', '12')).ok).toBe(false);
    expect((await w.setWeight(jo, pid, '2026-11-04', 'beaucoup')).ok).toBe(false);
  });
  it('suppression ; un autre compte ne voit rien', async () => {
    expect(await w.removeWeight(jo, pid, '2026-11-01')).toBe(true);
    expect((await w.listWeights(jo, pid, '2026-10-01', '2026-11-30')).length).toBe(1);
    await expect(w.listWeights(marc, pid, '2026-10-01', '2026-11-30')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
