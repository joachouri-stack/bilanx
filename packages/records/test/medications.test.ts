import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createMedicationsService, isOngoing, lastDay } from '../src';

describe.skipIf(!TEST_DB)('médicaments (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let meds: ReturnType<typeof createMedicationsService>;
  let jo: Actor, marc: Actor;
  let pid = '', marcPid = '', metId = '', newMetId = '';

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }

  beforeAll(async () => {
    ctx = await setupAuth(); // 2026-11-04 10:00 UTC (11:00 à Paris)
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    meds = createMedicationsService({ profiles, now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
    marcPid = (await profiles.listProfiles(marc.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('enregistre le traitement prescrit tel quel, refuse une saisie invalide', async () => {
    const r = await meds.save(jo, pid, { name: 'Metformine', strength: '1000 mg', posology: '1 comprimé matin et soir', times: ['08:00', '20:00'], qty: ['1 cp', '1 cp'], startDate: '2026-11-01', prescriber: 'Dr Exemple' });
    expect(r.ok).toBe(true);
    if (r.ok) metId = r.id;
    expect((await meds.save(jo, pid, { name: 'Vitamine D3', posology: '1 ampoule par mois' })).ok).toBe(true);
    expect(await meds.save(jo, pid, { name: '', posology: '' })).toMatchObject({ ok: false });
    const { current, past } = await meds.list(jo, pid);
    expect(current.map((m) => m.name)).toEqual(['Metformine', 'Vitamine D3']);
    expect(past).toEqual([]);
    expect(current[0]).toMatchObject({ posology: '1 comprimé matin et soir', schedule: [{ time: '08:00', qty: '1 cp' }, { time: '20:00', qty: '1 cp' }], startDate: '2026-11-01' });
  });

  it('prises du jour : renseigner, corriger, effacer ; refuse une heure non prévue ou trop future', async () => {
    const day = await meds.day(jo, pid, { year: 2026, month: 11, day: 4 });
    expect(day.map((d) => [d.name, d.time, d.status, d.recordable])).toEqual([
      ['Metformine', '08:00', null, true],
      ['Metformine', '20:00', null, false],
    ]);
    const morning = day[0]!.at;
    expect(await meds.record(jo, pid, metId, morning, 'skipped')).toBe(true);
    expect(await meds.record(jo, pid, metId, morning, 'taken')).toBe(true); // correction
    expect((await meds.day(jo, pid, { year: 2026, month: 11, day: 4 }))[0]!.status).toBe('taken');
    expect(await meds.record(jo, pid, metId, new Date('2026-11-04T08:00:00Z'), 'taken')).toBe(false); // pas une prise prévue
    expect(await meds.record(jo, pid, metId, day[1]!.at, 'taken')).toBe(false); // ce soir : trop tôt
    expect(await meds.record(jo, pid, metId, new Date('2026-10-30T07:00:00Z'), 'taken')).toBe(false); // avant le début
    expect(await meds.record(jo, pid, metId, new Date('2026-11-03T19:00:00Z'), 'skipped')).toBe(true);
    expect(await meds.record(jo, pid, metId, new Date('2026-11-03T19:00:00Z'), null)).toBe(true);
  });

  it('suivi : les prises non renseignées restent « non renseignées », pas « oubliées »', async () => {
    await meds.record(jo, pid, metId, new Date('2026-11-03T07:00:00Z'), 'skipped');
    const f = await meds.followUp(jo, pid, 7);
    // Prévues passées : 1, 2, 3 nov (2 chacun) + 4 nov 08:00 = 7 ; renseignées : 1 prise, 1 non prise.
    expect(f).toMatchObject({ from: '2026-10-29', to: '2026-11-04', planned: 7, taken: 1, skipped: 1, unrecorded: 5, takenPctOfRecorded: 50 });
  });

  it('changement de prescription : l’ancienne ligne est conservée et arrêtée', async () => {
    expect(await meds.change(jo, pid, metId, { name: 'Metformine', strength: '850 mg', posology: '1 comprimé matin, midi et soir', times: ['08:00', '12:00', '20:00'] }, '2026-11-01')).toMatchObject({ ok: false });
    const c = await meds.change(jo, pid, metId, { name: 'Metformine', strength: '850 mg', posology: '1 comprimé matin, midi et soir', times: ['08:00', '12:00', '20:00'], prescriber: 'Dr Exemple' }, '2026-11-05');
    expect(c.ok).toBe(true);
    if (c.ok) newMetId = c.id;
    const m = (await meds.get(jo, pid, newMetId))!;
    expect(m).toMatchObject({ strength: '850 mg', startDate: '2026-11-05', replacesId: metId });
    expect(m.history.map((h) => [h.strength, h.stoppedOn, h.stopReason])).toEqual([['1000 mg', '2026-11-05', 'Nouvelle prescription']]);
    // Le 4 : ancienne prescription ; le 5 : nouvelle.
    expect((await meds.day(jo, pid, { year: 2026, month: 11, day: 4 })).map((d) => d.medicationId)).toEqual([metId, metId]);
    expect((await meds.day(jo, pid, { year: 2026, month: 11, day: 5 })).map((d) => [d.medicationId, d.time])).toEqual([
      [newMetId, '08:00'], [newMetId, '12:00'], [newMetId, '20:00'],
    ]);
    // Les prises déjà renseignées de l'ancienne prescription restent comptées.
    expect((await meds.followUp(jo, pid, 7)).taken).toBe(1);
    // Le 4, l'ancienne prescription court encore (jusqu'à la veille du changement) ; la nouvelle est à venir.
    let { current, past } = await meds.list(jo, pid);
    expect(current.map((x) => x.strength)).toEqual(['1000 mg', '850 mg', null]);
    expect(past).toEqual([]);
    ctx.clock.t = new Date('2026-11-05T10:00:00Z');
    ({ current, past } = await meds.list(jo, pid));
    expect(current.map((x) => x.strength)).toEqual(['850 mg', null]);
    expect(past.map((x) => x.strength)).toEqual(['1000 mg']);
    ctx.clock.t = new Date('2026-11-04T10:00:00Z');
  });

  it('arrêt daté et suppression d’une saisie erronée', async () => {
    const vit = (await meds.list(jo, pid)).current.find((m) => m.name === 'Vitamine D3')!;
    expect(await meds.stop(jo, pid, vit.id, '2026-11-04', 'Fin de la cure')).toEqual({ ok: true });
    expect((await meds.stop(jo, pid, vit.id, '2026-11-04')).ok).toBe(false); // déjà arrêté
    expect((await meds.list(jo, pid)).past.find((m) => m.id === vit.id)).toMatchObject({ status: 'stopped', stoppedOn: '2026-11-04', stopReason: 'Fin de la cure' });
    expect(await meds.remove(jo, pid, vit.id)).toBe(true);
    expect(await meds.get(jo, pid, vit.id)).toBeNull();
  });

  it('isolement : un autre compte ne voit ni ne modifie rien', async () => {
    await expect(meds.list(marc, pid)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(meds.record(marc, pid, newMetId, new Date('2026-11-04T07:00:00Z'), 'taken')).rejects.toBeInstanceOf(ForbiddenError);
    // Avec son propre profil, l'identifiant d'un autre profil est introuvable.
    expect(await meds.get(marc, marcPid, newMetId)).toBeNull();
    expect((await meds.stop(marc, marcPid, newMetId, '2026-11-06')).ok).toBe(false);
    expect(await meds.record(marc, marcPid, newMetId, new Date('2026-11-04T07:00:00Z'), 'taken')).toBe(false);
    const [n] = await ctx.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM medication_intake WHERE recorded_by = ${marc.accountId}`;
    expect(n!.n).toBe(0);
  });
});

describe('traitement en cours / dernier jour', () => {
  const base = { status: 'active' as const, endDate: null, stoppedOn: null };
  it('un arrêt daté du futur laisse le traitement en cours jusqu’à la veille', () => {
    const m = { ...base, status: 'stopped' as const, stoppedOn: '2026-11-06' };
    expect(isOngoing(m, '2026-11-05')).toBe(true);
    expect(isOngoing(m, '2026-11-06')).toBe(false);
    expect(lastDay(m)).toBe('2026-11-05');
  });
  it('date de fin incluse ; la plus proche des deux limites l’emporte', () => {
    expect(isOngoing({ ...base, endDate: '2026-11-05' }, '2026-11-05')).toBe(true);
    expect(isOngoing({ ...base, endDate: '2026-11-05' }, '2026-11-06')).toBe(false);
    expect(lastDay({ endDate: '2026-11-03', stoppedOn: '2026-11-10' })).toBe('2026-11-03');
    expect(lastDay({ endDate: null, stoppedOn: '2026-12-01' })).toBe('2026-11-30');
    expect(lastDay(base)).toBeNull();
  });
});
