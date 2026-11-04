import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { createLabService } from '../src';

describe.skipIf(!TEST_DB)('saisie manuelle des analyses (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let lab: ReturnType<typeof createLabService>;
  let jo: Actor, marc: Actor;
  let joProfile = '';

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }
  const rows = (profileId: string) =>
    profiles.withProfileData(jo, profileId, 'lab', 'read', (tx) =>
      tx`SELECT analyte_code, value, unit, value_canonical, source_type, confirmed_by, ref_low, ref_high, laboratory,
                to_char(sampled_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS local
         FROM lab_result WHERE profile_id = ${profileId} AND deleted_at IS NULL ORDER BY sampled_at`);

  beforeAll(async () => {
    ctx = await setupAuth();
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    lab = createLabService({ profiles, now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    joProfile = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('enregistre un résultat saisi, comme confirmé par son auteur, au jour local du prélèvement', async () => {
    const r = await lab.addManual(jo, joProfile, {
      analyteCode: 'ferritin', value: '25', unit: 'µg/L', sampledOn: '2026-09-03', laboratory: 'Labo du centre', refLow: '30', refHigh: '300',
    });
    expect(r).toMatchObject({ ok: true, analyteCode: 'ferritin' });
    expect(await rows(joProfile)).toEqual([
      expect.objectContaining({ analyte_code: 'ferritin', value: '25', unit: 'µg/L', source_type: 'manual', confirmed_by: jo.accountId, laboratory: 'Labo du centre', local: '2026-09-03 12:00' }),
    ]);
  });

  it('enregistre la valeur canonique pour une unité alternative', async () => {
    await lab.addManual(jo, joProfile, { analyteCode: 'vitamin_d_25oh', value: '45', unit: 'nmol/L', sampledOn: '2026-09-03' });
    const vd = (await rows(joProfile)).find((x) => x.analyte_code === 'vitamin_d_25oh')!;
    expect(Number(vd.value_canonical)).toBeCloseTo(18.03, 2);
  });

  it('refuse une saisie invalide sans rien écrire', async () => {
    const before = (await rows(joProfile)).length;
    const r = await lab.addManual(jo, joProfile, { analyteCode: 'hba1c', value: '72', unit: '%', sampledOn: '2027-01-01' });
    expect(r).toMatchObject({ ok: false, errors: { value: expect.any(String), sampledOn: expect.any(String) } });
    expect((await rows(joProfile)).length).toBe(before);
  });

  it('signale un doublon et ne l’enregistre qu’après confirmation', async () => {
    const input = { analyteCode: 'ferritin', value: '25', unit: 'µg/L', sampledOn: '2026-09-03' };
    expect(await lab.addManual(jo, joProfile, input)).toMatchObject({ ok: false, duplicate: true });
    expect(await lab.addManual(jo, joProfile, { ...input, acceptDuplicate: true })).toMatchObject({ ok: true });
  });

  it('exige le droit de saisie sur le module Analyses', async () => {
    await profiles.invite(jo, joProfile, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { lab: 'read' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
    await expect(lab.addManual(marc, joProfile, { analyteCode: 'tsh', value: '2', unit: 'mUI/L', sampledOn: '2026-09-03' })).rejects.toBeInstanceOf(ForbiddenError);
    const access = (await profiles.listAccesses(jo, joProfile)).accesses.find((a) => a.role === 'caregiver')!;
    await profiles.updatePermissions(jo, joProfile, access.id, { lab: 'write' });
    expect(await lab.addManual(marc, joProfile, { analyteCode: 'tsh', value: '2', unit: 'mUI/L', sampledOn: '2026-09-03' })).toMatchObject({ ok: true });
    const tsh = (await rows(joProfile)).find((x) => x.analyte_code === 'tsh')!;
    expect(tsh.confirmed_by).toBe(marc.accountId); // l'auteur réel de la saisie est conservé
  });

  it('supprime logiquement et trace la suppression', async () => {
    const r = await lab.addManual(jo, joProfile, { analyteCode: 'crp', value: '< 5', unit: 'mg/L', sampledOn: '2026-10-01' });
    if (!r.ok) throw new Error('ajout attendu');
    expect(await lab.remove(jo, joProfile, r.id)).toBe(true);
    expect((await rows(joProfile)).some((x) => x.analyte_code === 'crp')).toBe(false);
    expect(await lab.remove(jo, joProfile, r.id)).toBe(false);
    const [still] = await ctx.sql`SELECT count(*)::int AS n FROM audit_log WHERE profile_id = ${joProfile} AND action = 'data.write' AND resource = 'lab'`;
    expect(still!.n).toBeGreaterThanOrEqual(5);
  });
});
