import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createInsulinService } from '../src';

describe.skipIf(!TEST_DB)('module insuline (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let ins: ReturnType<typeof createInsulinService>;
  let jo: Actor, marc: Actor;
  let pid = '', rapid = '', lente = '';

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }

  beforeAll(async () => {
    ctx = await setupAuth(); // horloge : 2026-11-04 10:00 UTC (11:00 à Paris)
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    ins = createInsulinService({ profiles, now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('gère la liste des insulines du profil', async () => {
    const a = await ins.addProduct(jo, pid, { name: 'Insuline rapide A', type: 'rapid' });
    const b = await ins.addProduct(jo, pid, { name: 'Insuline lente B', type: 'long' });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok) rapid = a.id;
    if (b.ok) lente = b.id;
    expect(await ins.addProduct(jo, pid, { name: 'insuline RAPIDE a', type: 'rapid' })).toMatchObject({ ok: false, error: expect.stringContaining('déjà') });
    expect(await ins.addProduct(jo, pid, { name: 'X', type: 'magique' })).toMatchObject({ ok: false });
    expect((await ins.listProducts(jo, pid)).map((p) => p.name)).toEqual(['Insuline rapide A', 'Insuline lente B']);
  });

  it('enregistre les injections déclarées, à l’heure locale', async () => {
    expect(await ins.addDose(jo, pid, { productId: rapid, units: '4', date: '2026-11-04', time: '07:30', status: 'taken' })).toMatchObject({ ok: true });
    expect(await ins.addDose(jo, pid, { productId: lente, units: '16', date: '2026-11-03', time: '22:00', status: 'taken', comment: 'Avant le coucher' })).toMatchObject({ ok: true });
    expect(await ins.addDose(jo, pid, { productId: rapid, units: '3', date: '2026-11-04', time: '12:30', status: 'planned' })).toMatchObject({ ok: true });
    const list = await ins.listDoses(jo, pid, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-06T00:00:00Z'));
    expect(list.map((d) => [d.productName, d.units, d.status, d.at.toISOString()])).toEqual([
      ['Insuline rapide A', 3, 'planned', '2026-11-04T11:30:00.000Z'],
      ['Insuline rapide A', 4, 'taken', '2026-11-04T06:30:00.000Z'],
      ['Insuline lente B', 16, 'taken', '2026-11-03T21:00:00.000Z'],
    ]);
  });

  it('refuse les saisies invalides et une insuline d’un autre profil', async () => {
    expect(await ins.addDose(jo, pid, { productId: rapid, units: '400', date: '2026-11-04', time: '08:00', status: 'taken' })).toMatchObject({ ok: false, errors: { units: expect.any(String) } });
    expect(await ins.addDose(jo, pid, { productId: rapid, units: '4', date: '2026-11-04', time: '23:00', status: 'taken' })).toMatchObject({ ok: false, errors: { time: expect.any(String) } });
    const other = (await profiles.listProfiles(marc.accountId))[0]!.profileId;
    const m = await ins.addProduct(marc, other, { name: 'Autre', type: 'rapid' });
    if (!m.ok) throw new Error('attendu');
    expect(await ins.addDose(jo, pid, { productId: m.id, units: '2', date: '2026-11-04', time: '08:00', status: 'taken' })).toMatchObject({ ok: false, errors: { productId: expect.any(String) } });
  });

  it('signale une double saisie rapprochée et ne l’enregistre qu’après confirmation', async () => {
    const dose = { productId: rapid, units: '4', date: '2026-11-04', time: '07:40', status: 'taken' };
    expect(await ins.addDose(jo, pid, dose)).toMatchObject({ ok: false, duplicate: true });
    expect(await ins.addDose(jo, pid, { ...dose, acceptDuplicate: true })).toMatchObject({ ok: true });
  });

  it('supprime logiquement une injection', async () => {
    const before = await ins.listDoses(jo, pid, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-06T00:00:00Z'));
    const dupe = before.find((d) => d.at.toISOString() === '2026-11-04T06:40:00.000Z')!;
    expect(await ins.deleteDose(jo, pid, dupe.id)).toBe(true);
    expect(await ins.deleteDose(jo, pid, dupe.id)).toBe(false);
    expect((await ins.listDoses(jo, pid, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-06T00:00:00Z'))).length).toBe(before.length - 1);
  });

  it('historique des modifications prescrites', async () => {
    expect(await ins.addChange(jo, pid, { subject: `insulin:${lente}`, effectiveDate: '2026-09-01', newRegimen: '18 U le soir', prescribedBy: 'Dr Exemple' })).toMatchObject({ ok: true });
    expect(
      await ins.addChange(jo, pid, { subject: `insulin:${lente}`, effectiveDate: '2026-10-15', previousRegimen: '18 U le soir', newRegimen: '16 U le soir', prescribedBy: 'Dr Exemple', goalNote: 'Objectif fixé avec le médecin : HbA1c < 7 %' }),
    ).toMatchObject({ ok: true });
    expect(await ins.addChange(jo, pid, { subject: 'medication:x', effectiveDate: '2026-10-15', newRegimen: 'x' })).toMatchObject({ ok: false });
    const list = await ins.listChanges(jo, pid);
    expect(list.map((c) => [c.effectiveDate, c.newRegimen])).toEqual([
      ['2026-10-15', '16 U le soir'],
      ['2026-09-01', '18 U le soir'],
    ]);
  });

  it('un aidant en lecture voit le journal mais ne peut rien saisir ; sans accès, rien', async () => {
    await expect(ins.listDoses(marc, pid, new Date(0), new Date('2030-01-01'))).rejects.toBeInstanceOf(ForbiddenError);
    await profiles.invite(jo, pid, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { insulin: 'read' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
    expect((await ins.listDoses(marc, pid, new Date(0), new Date('2030-01-01'))).length).toBe(3);
    await expect(ins.addDose(marc, pid, { productId: rapid, units: '2', date: '2026-11-04', time: '08:00', status: 'taken' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(ins.addChange(marc, pid, { subject: `insulin:${lente}`, effectiveDate: '2026-11-01', newRegimen: '10 U' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
