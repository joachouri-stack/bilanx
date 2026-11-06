import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createGlucoseService } from '../src';

describe.skipIf(!TEST_DB)('glycémie capillaire saisie à la main (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let glu: ReturnType<typeof createGlucoseService>;
  let jo: Actor, marc: Actor;
  let pid = '';

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }
  beforeAll(async () => {
    ctx = await setupAuth(); // 4 nov. 2026, 11:00 à Paris
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    glu = createGlucoseService({ profiles, now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('enregistre en mg/dL, remplace une saisie à la même minute, liste et supprime', async () => {
    expect(await glu.addCapillary(jo, pid, { value: '1,05', unit: 'g/L', date: '2026-11-04', time: '07:45', context: 'fasting' })).toMatchObject({ ok: true });
    expect(await glu.addCapillary(jo, pid, { value: '160', unit: 'mg/dL', date: '2026-11-04', time: '10:15', context: 'after_meal' })).toMatchObject({ ok: true });
    expect(await glu.addCapillary(jo, pid, { value: '150', unit: 'mg/dL', date: '2026-11-04', time: '10:15', context: 'after_meal' })).toMatchObject({ ok: true });
    const day = await glu.listCapillary(jo, pid, new Date('2026-11-03T23:00:00Z'), new Date('2026-11-04T23:00:00Z'));
    expect(day.map((r) => [r.at.toISOString(), r.mgdl, r.context])).toEqual([
      ['2026-11-04T09:15:00.000Z', 150, 'after_meal'],
      ['2026-11-04T06:45:00.000Z', 105, 'fasting'],
    ]);
    expect(await glu.removeCapillary(jo, pid, new Date('2026-11-04T09:15:00Z'))).toBe(true);
    expect(await glu.recentCapillary(jo, pid)).toHaveLength(1);
  });

  it('période : toutes les mesures, de la plus ancienne à la plus récente', async () => {
    expect(await glu.addCapillary(jo, pid, { value: '98', unit: 'mg/dL', date: '2026-11-02', time: '07:00', context: 'fasting' })).toMatchObject({ ok: true });
    expect(await glu.addCapillary(jo, pid, { value: '7,2', unit: 'mmol/L', date: '2026-11-03', time: '22:30', context: 'bedtime' })).toMatchObject({ ok: true });
    const range = await glu.listCapillaryRange(jo, pid, new Date('2026-11-01T23:00:00Z'), new Date('2026-11-04T23:00:00Z'));
    expect(range.map((r) => [r.at.toISOString(), r.context])).toEqual([
      ['2026-11-02T06:00:00.000Z', 'fasting'],
      ['2026-11-03T21:30:00.000Z', 'bedtime'],
      ['2026-11-04T06:45:00.000Z', 'fasting'],
    ]);
    expect(range[1]!.mgdl).toBeCloseTo(129.7, 1);
    // Hors période : rien.
    expect(await glu.listCapillaryRange(jo, pid, new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'))).toEqual([]);
  });

  it('refuse une valeur aberrante ou future', async () => {
    expect(await glu.addCapillary(jo, pid, { value: '110', unit: 'g/L', date: '2026-11-04', time: '08:00' })).toMatchObject({ ok: false, errors: { value: expect.any(String) } });
    expect(await glu.addCapillary(jo, pid, { value: '110', unit: 'mg/dL', date: '2026-11-04', time: '13:00' })).toMatchObject({ ok: false, errors: { time: expect.any(String) } });
  });

  it('droits : un aidant en lecture voit les mesures mais ne peut pas en ajouter', async () => {
    await expect(glu.recentCapillary(marc, pid)).rejects.toBeInstanceOf(ForbiddenError);
    await profiles.invite(jo, pid, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { glucose: 'read' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
    expect(await glu.recentCapillary(marc, pid)).toHaveLength(3);
    await expect(glu.addCapillary(marc, pid, { value: '100', unit: 'mg/dL', date: '2026-11-04', time: '09:00' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
