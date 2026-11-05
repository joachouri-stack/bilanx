/**
 * Lecture EN FLUX de l'export « Toutes les données de santé » d'Apple Santé (export.zip,
 * ou le fichier export.xml / exportation.xml qu'il contient). Seuls les pas
 * (HKQuantityTypeIdentifierStepCount) sont retenus ; tout le reste est ignoré.
 *
 * Format : un élément <Record type="…" sourceName="…" unit="count"
 * startDate="2026-11-04 10:00:12 +0100" endDate="…" value="823"/> par mesure.
 */
import { Unzip, UnzipInflate } from 'fflate';
import type { StepSample } from '@bilanx/domain';

export interface AppleHealthStats {
  xmlFound: boolean;
  records: number; // éléments <Record> rencontrés
  stepRecords: number;
  ignored: number; // pas mal formés
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
  );
}

/** « 2026-11-04 10:00:12 +0100 » → Date. */
export function parseAppleDate(s: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const isMainXml = (name: string) => /(^|\/)(export|exportation)\.xml$/i.test(name);

/**
 * Consomme le flux d'octets et appelle `onSample` pour chaque échantillon de pas.
 * Détecte automatiquement ZIP (« PK ») ou XML.
 */
export async function readAppleHealthSteps(chunks: AsyncIterable<Uint8Array>, onSample: (s: StepSample) => void): Promise<AppleHealthStats> {
  const stats: AppleHealthStats = { xmlFound: false, records: 0, stepRecords: 0, ignored: 0 };
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  const feedXml = (bytes: Uint8Array, final: boolean) => {
    stats.xmlFound = true;
    buf += decoder.decode(bytes, { stream: !final });
    let last = 0;
    // Les attributs ne contiennent jamais « > » (échappé en &gt;) : une balise s'arrête au premier « > ».
    const re = /<Record\b([^>]*)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(buf))) {
      last = re.lastIndex;
      stats.records++;
      const attrs = m[1]!;
      if (!attrs.includes('HKQuantityTypeIdentifierStepCount')) continue;
      const get = (k: string) => {
        const r = new RegExp(`\\b${k}="([^"]*)"`).exec(attrs);
        return r ? decode(r[1]!) : null;
      };
      if (get('type') !== 'HKQuantityTypeIdentifierStepCount') continue;
      stats.stepRecords++;
      const start = parseAppleDate(get('startDate') ?? '');
      const end = parseAppleDate(get('endDate') ?? '');
      const value = Number(get('value'));
      const unit = get('unit');
      if (!start || !end || !Number.isFinite(value) || (unit && unit !== 'count')) {
        stats.ignored++;
        continue;
      }
      onSample({ source: get('sourceName') ?? 'Inconnu', start, end, value });
    }
    // On garde la fin du tampon (balise éventuellement coupée), sans laisser grossir le texte inutile.
    const tail = buf.slice(last);
    const open = tail.lastIndexOf('<');
    buf = open >= 0 ? tail.slice(open) : '';
  };

  const it = chunks[Symbol.asyncIterator]();
  const first = await it.next();
  if (first.done) return stats;
  const head = first.value;
  const isZip = head[0] === 0x50 && head[1] === 0x4b;

  if (!isZip) {
    feedXml(head, false);
    for (let r = await it.next(); !r.done; r = await it.next()) feedXml(r.value, false);
    feedXml(new Uint8Array(0), true);
    return stats;
  }

  let error: Error | null = null;
  const unzip = new Unzip((file) => {
    if (!isMainXml(file.name)) return; // autres fichiers de l'archive : ignorés (non décompressés)
    file.ondata = (err, data, final) => {
      if (err) error = err;
      else feedXml(data, final);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(head, false);
  for (let r = await it.next(); !r.done; r = await it.next()) {
    unzip.push(r.value, false);
    if (error) throw error;
  }
  unzip.push(new Uint8Array(0), true);
  if (error) throw error;
  return stats;
}
