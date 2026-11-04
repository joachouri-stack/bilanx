import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createJournalService } from '../src';

describe.skipIf(!TEST_DB)('journal des repas et événements (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let journal: ReturnType<typeof createJournalService>;
  let jo: Actor, marc: Actor;
  let pid = '';
  const day = [new Date('2026-11-03T23:00:00Z'), new Date('2026-11-04T23:00:00Z')] as const; // 4 nov. à Paris

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }

  beforeAll(async () => {
    ctx = await setupAuth(); // 2026-11-04 10:00 UTC = 11:00 à Paris
    ctx.advance(8 * 60); // 19:00 à Paris
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    journal = createJournalService({ profiles, now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('enregistre repas et événements, restitués dans l’ordre de la journée', async () => {
    expect(await journal.add(jo, pid, { kind: 'meal', mealKind: 'lunch', date: '2026-11-04', time: '12:30', description: 'Lentilles', carbs: '45' })).toMatchObject({ ok: true });
    expect(await journal.add(jo, pid, { kind: 'meal', mealKind: 'breakfast', date: '2026-11-04', time: '07:45', description: 'Tartines' })).toMatchObject({ ok: true });
    expect(await journal.add(jo, pid, { kind: 'activity', date: '2026-11-04', time: '17:00', endTime: '17:40', description: 'Marche', intensity: '3' })).toMatchObject({ ok: true });
    expect(await journal.add(jo, pid, { kind: 'meal', mealKind: 'dinner', date: '2026-11-03', time: '20:00', description: 'Veille' })).toMatchObject({ ok: true });
    const rows = await journal.list(jo, pid, day[0], day[1]);
    expect(rows.map((r) => [r.kind, r.mealKind, r.description, r.carbsG])).toEqual([
      ['meal', 'breakfast', 'Tartines', null],
      ['meal', 'lunch', 'Lentilles', 45],
      ['activity', null, 'Marche', null],
    ]);
    expect(rows[2]!.endedAt!.getTime() - rows[2]!.at.getTime()).toBe(40 * 60_000);
  });

  it('refuse une saisie invalide sans rien écrire', async () => {
    expect(await journal.add(jo, pid, { kind: 'meal', mealKind: 'lunch', date: '2026-11-04', time: '21:00', description: 'Futur' })).toMatchObject({ ok: false });
    expect((await journal.list(jo, pid, day[0], day[1])).length).toBe(3);
  });

  it('supprime logiquement', async () => {
    const [first] = await journal.list(jo, pid, day[0], day[1]);
    expect(await journal.remove(jo, pid, first!.id)).toBe(true);
    expect(await journal.remove(jo, pid, first!.id)).toBe(false);
    expect((await journal.list(jo, pid, day[0], day[1])).length).toBe(2);
  });

  it('respecte les autorisations du module Journal', async () => {
    await expect(journal.list(marc, pid, day[0], day[1])).rejects.toBeInstanceOf(ForbiddenError);
    await profiles.invite(jo, pid, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { journal: 'read' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
    expect((await journal.list(marc, pid, day[0], day[1])).length).toBe(2);
    await expect(journal.add(marc, pid, { kind: 'other', date: '2026-11-04', time: '10:00', description: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
