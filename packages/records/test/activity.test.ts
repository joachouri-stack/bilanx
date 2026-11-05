import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createActivityService, parseAppleDate, readAppleHealthSteps } from '../src';

const pad = (n: number) => String(n).padStart(2, '0');
/** Date au format Apple « AAAA-MM-JJ HH:MM:SS +0100 » (heure de Paris en hiver). */
const apple = (d: Date) => {
  const l = new Date(d.getTime() + 3_600_000);
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())} ${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}:${pad(l.getUTCSeconds())} +0100`;
};
const rec = (src: string, a: Date, minutes: number, value: number, type = 'HKQuantityTypeIdentifierStepCount', unit = 'count') =>
  `  <Record type="${type}" sourceName="${src}" sourceVersion="10.1" device="&lt;&lt;HKDevice: 0x1&gt;, name:Apple Watch&gt;" unit="${unit}" creationDate="${apple(a)}" startDate="${apple(a)}" endDate="${apple(new Date(a.getTime() + minutes * 60_000))}" value="${value}"/>\n`;

function exportXml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE HealthData [\n<!ATTLIST Record type CDATA #REQUIRED>\n]>\n<HealthData locale="fr_FR">\n <ExportDate value="2026-11-05 08:00:00 +0100"/>\n${body}</HealthData>\n`;
}
async function* chunked(buf: Uint8Array, size: number) {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}

// Matinée du 4 nov. 2026 (Paris) : la montre et l'iPhone comptent la même marche.
const base = new Date('2026-11-04T08:00:00Z'); // 09:00 à Paris
const XML = exportXml(
  rec('Apple Watch de Jo &amp; co', base, 20, 1500) +
    rec('iPhone de Jo', new Date(base.getTime() + 5 * 60_000), 10, 1200) +
    rec('iPhone de Jo', new Date('2026-11-04T17:50:00Z'), 20, 800) + // 18:50–19:10 : à cheval, iPhone seul
    `  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch de Jo &amp; co" unit="count" startDate="${apple(new Date('2026-11-03T22:30:00Z'))}" endDate="${apple(new Date('2026-11-03T22:40:00Z'))}" value="300">\n   <MetadataEntry key="HKWasUserEntered" value="0"/>\n  </Record>\n` + // 23:30 le 3 (jour local)
    rec('Apple Watch de Jo &amp; co', base, 30, 72, 'HKQuantityTypeIdentifierHeartRate', 'count/min') +
    `  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="X" unit="count" startDate="pas une date" endDate="x" value="10"/>\n` +
    rec('Futur', new Date('2027-06-01T08:00:00Z'), 10, 999),
);

describe('lecture de l’export Apple Santé', () => {
  it('date Apple → instant', () => {
    expect(parseAppleDate('2026-11-04 10:00:12 +0100')!.toISOString()).toBe('2026-11-04T09:00:12.000Z');
    expect(parseAppleDate('2026-11-04')).toBeNull();
  });
  it('lit les pas d’un XML coupé en petits morceaux, ignore le reste', async () => {
    const seen: string[] = [];
    const st = await readAppleHealthSteps(chunked(strToU8(XML), 37), (s) => seen.push(`${s.source}|${s.value}`));
    expect(st).toMatchObject({ xmlFound: true, stepRecords: 6, ignored: 1 });
    expect(seen).toContain('Apple Watch de Jo & co|1500');
    expect(seen.some((x) => x.includes('|72'))).toBe(false); // fréquence cardiaque ignorée
  });
  it('lit l’archive ZIP au nom français et ignore export_cda.xml', async () => {
    const zip = zipSync({
      'apple_health_export/exportation.xml': strToU8(XML),
      'apple_health_export/exportation_cda.xml': strToU8(exportXml(rec('Leurre', base, 10, 5000))),
      'apple_health_export/electrocardiograms/ecg.csv': strToU8('a;b'),
    });
    const seen: string[] = [];
    await readAppleHealthSteps(chunked(zip, 1000), (s) => seen.push(s.source));
    expect(seen).not.toContain('Leurre');
    expect(seen.length).toBe(5);
  });
});

describe.skipIf(!TEST_DB)('import des pas (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let act: ReturnType<typeof createActivityService>;
  let jo: Actor, marc: Actor;
  let pid = '';

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }
  beforeAll(async () => {
    ctx = await setupAuth();
    ctx.advance(24 * 60); // 5 nov. 2026
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    act = createActivityService({ profiles, now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('importe, dédoublonne montre/iPhone et calcule les jours locaux', async () => {
    const r = await act.importAppleHealth(jo, pid, chunked(zipSync({ 'apple_health_export/export.xml': strToU8(XML) }), 4096));
    expect(r).toMatchObject({ ok: true, from: '2026-11-03', to: '2026-11-04' });
    const days = await act.daily(jo, pid, '2026-11-01', '2026-11-05');
    // 4 nov. : 1500 (montre, iPhone non additionné) + 800 (iPhone seul, 18:50–19:10) ; 3 nov. : 300 ; futur ignoré.
    expect(Object.fromEntries(days)).toEqual({ '2026-11-03': 300, '2026-11-04': 2300 });
    const hours = await act.hourly(jo, pid, new Date('2026-11-03T23:00:00Z'), new Date('2026-11-04T23:00:00Z'));
    expect(hours.get(Date.parse('2026-11-04T08:00:00Z'))).toBe(1500);
    expect(hours.get(Date.parse('2026-11-04T17:00:00Z'))).toBe(400);
    expect(hours.get(Date.parse('2026-11-04T18:00:00Z'))).toBe(400);
    const src = await act.source(jo, pid);
    expect(src).toMatchObject({ status: 'file_import', dataFrom: '2026-11-03', dataTo: '2026-11-04' });
    expect(src!.sources.sort()).toEqual(['Apple Watch de Jo & co', 'iPhone de Jo']);
  });

  it('un nouvel import du même fichier ne double pas les pas', async () => {
    await act.importAppleHealth(jo, pid, chunked(strToU8(XML), 999));
    expect(Object.fromEntries(await act.daily(jo, pid, '2026-11-01', '2026-11-05'))).toEqual({ '2026-11-03': 300, '2026-11-04': 2300 });
    // La liste des appareils est conservée (et fusionnée) d'un import à l'autre.
    expect((await act.source(jo, pid))!.sources.sort()).toEqual(['Apple Watch de Jo & co', 'iPhone de Jo']);
  });

  it('refuse un fichier qui n’est pas un export Apple Santé', async () => {
    expect(await act.importAppleHealth(jo, pid, chunked(strToU8('<html>bonjour</html>'), 100))).toMatchObject({ ok: false });
    expect(await act.importAppleHealth(jo, pid, chunked(zipSync({ 'autre.txt': strToU8('x') }), 100))).toMatchObject({ ok: false, error: expect.stringContaining('export.xml') });
  });

  it('objectif quotidien', async () => {
    expect(await act.goal(jo, pid)).toBe(8000);
    expect(await act.setGoal(jo, pid, 100)).toMatchObject({ ok: false });
    expect(await act.setGoal(jo, pid, 10000)).toEqual({ ok: true });
    expect(await act.goal(jo, pid)).toBe(10000);
  });

  it('droits : un aidant en lecture voit les pas mais ne peut pas importer', async () => {
    await expect(act.daily(marc, pid, '2026-11-01', '2026-11-05')).rejects.toBeInstanceOf(ForbiddenError);
    await profiles.invite(jo, pid, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { activity: 'read' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
    expect((await act.daily(marc, pid, '2026-11-01', '2026-11-05')).size).toBe(2);
    let read = false;
    async function* spy() {
      read = true;
      yield strToU8(XML);
    }
    await expect(act.importAppleHealth(marc, pid, spy())).rejects.toBeInstanceOf(ForbiddenError);
    expect(read).toBe(false); // le fichier n'a même pas été lu
  });

  it('volume réaliste : 2 ans, montre + iPhone (≈ 120 000 mesures)', async () => {
    let body = '';
    const start = Date.parse('2024-11-05T07:00:00Z');
    for (let d = 0; d < 730; d++)
      for (let k = 0; k < 80; k++) {
        const a = new Date(start + d * 86_400_000 + k * 9 * 60_000);
        body += rec('Apple Watch', a, 8, 60 + (k % 7) * 10);
        if (k % 1 === 0) body += rec('iPhone', new Date(a.getTime() + 60_000), 6, 50);
      }
    const xml = strToU8(exportXml(body));
    const t0 = Date.now();
    const r = await act.importAppleHealth(jo, pid, chunked(zipSync({ 'apple_health_export/export.xml': xml }), 64 * 1024));
    const ms = Date.now() - t0;
    expect(r).toMatchObject({ ok: true, stepRecords: 116_800 });
    expect(ms).toBeLessThan(30_000);
    console.info(`  import de ${(xml.length / 1e6).toFixed(0)} Mo de XML (${r.ok && r.stepRecords} mesures) en ${(ms / 1000).toFixed(1)} s`);
  });
});
