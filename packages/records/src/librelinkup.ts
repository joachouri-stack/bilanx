/**
 * Capteur FreeStyle Libre via LibreLinkUp (application « suiveur » d'Abbott).
 *
 * ⚠️ Interface NON OFFICIELLE (celle de l'app LibreLinkUp) : elle peut changer sans préavis.
 * BILANX s'y connecte avec un compte suiveur DÉDIÉ (lecture seule), jamais le compte principal.
 *
 *   POST /llu/auth/login                    → jeton (ou redirection vers la bonne région)
 *   GET  /llu/connections                   → personnes partagées avec ce compte
 *   GET  /llu/connections/{id}/graph        → ~12 h de mesures (toutes les 15 min) + la dernière
 */
import { createHash } from 'node:crypto';
import { decrypt, deriveKey, encrypt } from '@bilanx/auth';
import type { Sql } from '@bilanx/db';
import { ForbiddenError, type Actor, type ProfilesService } from '@bilanx/profiles';

export const LIBRE_DEFAULT_HOST = 'api-eu.libreview.io';
const APP_VERSION = '4.16.0';
/** Intervalle minimal entre deux synchronisations d'un même profil. */
export const LIBRE_SYNC_MINUTES = 5;
/** Après ce nombre d'échecs d'identification, on arrête (évite de bloquer le compte chez Abbott). */
const MAX_AUTH_FAILURES = 3;

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

export class LibreError extends Error {
  constructor(
    message: string,
    /** « auth » : identifiants refusés ou conditions à accepter (inutile de réessayer seul). */
    readonly kind: 'auth' | 'network' | 'format' | 'empty' = 'network',
  ) {
    super(message);
  }
}

export interface LibreReading {
  at: Date;
  mgdl: number;
}

/** « 11/6/2026 9:30:00 PM » (heure UTC chez Abbott pour FactoryTimestamp) → Date. */
export function parseLibreTimestamp(s: unknown): Date | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) ?(AM|PM)?$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[4]);
  const ap = m[7]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), h, Number(m[5]), Number(m[6])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function readingOf(x: unknown): LibreReading | null {
  const r = x as { FactoryTimestamp?: unknown; ValueInMgPerDl?: unknown } | null;
  const at = parseLibreTimestamp(r?.FactoryTimestamp);
  const v = Number(r?.ValueInMgPerDl);
  if (!at || !Number.isFinite(v)) return null;
  // Limites du capteur (« LO » / « HI ») et de la table : 40–500 mg/dL affichés par Libre.
  return { at, mgdl: Math.min(500, Math.max(40, Math.round(v))) };
}

/** Client LibreLinkUp minimal (sans état). */
export function libreClient(fetchImpl: FetchLike) {
  const baseHeaders = (token?: string, userId?: string): Record<string, string> => ({
    'content-type': 'application/json',
    accept: 'application/json',
    product: 'llu.ios',
    version: APP_VERSION,
    'cache-control': 'no-cache',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(userId ? { 'account-id': createHash('sha256').update(userId).digest('hex') } : {}),
  });

  async function call(host: string, path: string, init: { method?: string; body?: unknown; token?: string; userId?: string } = {}) {
    let res;
    try {
      res = await fetchImpl(`https://${host}${path}`, {
        method: init.method ?? 'GET',
        headers: baseHeaders(init.token, init.userId),
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new LibreError('LibreLinkUp est injoignable pour le moment.');
    }
    if (res.status === 401) throw new LibreError('Session LibreLinkUp expirée.', 'auth');
    if (res.status === 429) throw new LibreError('LibreLinkUp limite les demandes : nouvel essai plus tard.');
    if (res.status >= 500) throw new LibreError(`LibreLinkUp ne répond pas correctement (${res.status}).`);
    let j: { status?: number; data?: unknown; error?: { message?: string } };
    try {
      j = (await res.json()) as typeof j;
    } catch {
      throw new LibreError('Réponse LibreLinkUp illisible.', 'format');
    }
    return j;
  }

  /** Connexion ; suit la redirection de région (api-eu, api-fr, api-de…). */
  async function login(email: string, password: string, host = LIBRE_DEFAULT_HOST): Promise<{ host: string; token: string; expires: Date; userId: string }> {
    for (let i = 0; i < 2; i++) {
      const j = await call(host, '/llu/auth/login', { method: 'POST', body: { email, password } });
      const d = j.data as { redirect?: boolean; region?: string; authTicket?: { token?: string; expires?: number }; user?: { id?: string }; step?: { type?: string } } | undefined;
      if (d?.redirect && d.region && /^[a-z0-9-]{2,10}$/i.test(d.region)) {
        host = `api-${d.region.toLowerCase()}.libreview.io`;
        continue;
      }
      if (j.status === 2) throw new LibreError('E-mail ou mot de passe LibreLinkUp incorrect.', 'auth');
      if (j.status === 4 || d?.step)
        throw new LibreError('Ouvrez l’app LibreLinkUp avec ce compte et acceptez les conditions d’utilisation, puis réessayez.', 'auth');
      if (j.status !== 0 || !d?.authTicket?.token || !d.user?.id) throw new LibreError(j.error?.message ? `LibreLinkUp : ${j.error.message}` : 'Connexion LibreLinkUp refusée.', 'auth');
      const expires = d.authTicket.expires ? new Date(d.authTicket.expires * 1000) : new Date(Date.now() + 3_600_000);
      return { host, token: d.authTicket.token, expires, userId: d.user.id };
    }
    throw new LibreError('Région LibreLinkUp introuvable.', 'format');
  }

  async function connections(host: string, token: string, userId: string): Promise<{ patientId: string; name: string }[]> {
    const j = await call(host, '/llu/connections', { token, userId });
    if (j.status !== 0 || !Array.isArray(j.data)) throw new LibreError('Liste des personnes partagées illisible.', 'format');
    return (j.data as { patientId?: string; firstName?: string; lastName?: string }[])
      .filter((c) => typeof c.patientId === 'string')
      .map((c) => ({ patientId: c.patientId!, name: [c.firstName, c.lastName].filter(Boolean).join(' ') }));
  }

  /** ~12 h de mesures toutes les 15 min, plus la dernière mesure (minute). */
  async function graph(host: string, token: string, userId: string, patientId: string): Promise<LibreReading[]> {
    if (!/^[0-9a-f-]{8,64}$/i.test(patientId)) throw new LibreError('Identifiant de patient invalide.', 'format');
    const j = await call(host, `/llu/connections/${patientId}/graph`, { token, userId });
    const d = j.data as { graphData?: unknown[]; connection?: { glucoseMeasurement?: unknown } } | undefined;
    if (j.status !== 0 || !d) throw new LibreError('Mesures LibreLinkUp illisibles.', 'format');
    const all = [...(d.graphData ?? []), d.connection?.glucoseMeasurement].map(readingOf).filter((r): r is LibreReading => r !== null);
    // Une mesure par minute au plus (la dernière mesure peut doubler un point du graphique).
    const byMinute = new Map<number, LibreReading>();
    for (const r of all) byMinute.set(Math.floor(r.at.getTime() / 60_000), { at: new Date(Math.floor(r.at.getTime() / 60_000) * 60_000), mgdl: r.mgdl });
    return [...byMinute.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  return { login, connections, graph };
}

export interface LibreLinkStatus {
  email: string;
  patientName: string | null;
  status: 'active' | 'error';
  lastSyncAt: Date | null;
  lastReadingAt: Date | null;
  lastError: string | null;
}

interface LinkRow {
  profile_id: string;
  account_id: string;
  email: string;
  password_enc: Buffer;
  api_host: string;
  patient_id: string | null;
  patient_name: string | null;
  user_id: string | null;
  token_enc: Buffer | null;
  token_expires: Date | null;
  status: 'active' | 'error';
  failures: number;
  last_sync_at: Date | null;
}

export interface LibreLinkConfig {
  sql: Sql;
  profiles: ProfilesService;
  secretKey: Buffer;
  fetch?: FetchLike;
  now?: () => Date;
}

/** Lien LibreLinkUp d'un profil : connexion, synchronisation périodique, état, déconnexion. */
export function createLibreLinkService(cfg: LibreLinkConfig) {
  const { sql, profiles: P } = cfg;
  const now = cfg.now ?? (() => new Date());
  const client = libreClient(cfg.fetch ?? (globalThis.fetch as unknown as FetchLike));
  const key = deriveKey(cfg.secretKey, 'librelinkup');
  const seal = (s: string, profileId: string) => encrypt(key, Buffer.from(s, 'utf8'), `libre:${profileId}`);
  const open = (b: Buffer, profileId: string) => decrypt(key, b, `libre:${profileId}`).toString('utf8');

  /** Vérifie les identifiants, choisit la personne partagée, enregistre le lien, puis synchronise. */
  async function connect(actor: Actor, profileId: string, email: string, password: string): Promise<{ ok: true; patientName: string; readings: number } | { ok: false; error: string }> {
    email = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) return { ok: false, error: 'Indiquez l’e-mail et le mot de passe du compte LibreLinkUp.' };
    await P.withProfileData(actor, profileId, 'glucose', 'write', async () => null); // droit d'écriture requis
    try {
      const s = await client.login(email, password);
      const list = await client.connections(s.host, s.token, s.userId);
      if (!list.length)
        return { ok: false, error: 'Connexion réussie, mais personne ne partage ses glycémies avec ce compte : acceptez l’invitation dans l’app LibreLinkUp.' };
      const p = list[0]!;
      await sql`
        INSERT INTO libre_link (profile_id, account_id, email, password_enc, api_host, patient_id, patient_name, user_id, token_enc, token_expires, status, failures, last_error, created_at)
        VALUES (${profileId}, ${actor.accountId}, ${email}, ${seal(password, profileId)}, ${s.host}, ${p.patientId}, ${p.name || null}, ${s.userId},
                ${seal(s.token, profileId)}, ${s.expires}, 'active', 0, NULL, ${now()})
        ON CONFLICT (profile_id) DO UPDATE SET account_id = EXCLUDED.account_id, email = EXCLUDED.email, password_enc = EXCLUDED.password_enc,
          api_host = EXCLUDED.api_host, patient_id = EXCLUDED.patient_id, patient_name = EXCLUDED.patient_name, user_id = EXCLUDED.user_id,
          token_enc = EXCLUDED.token_enc, token_expires = EXCLUDED.token_expires, status = 'active', failures = 0, last_error = NULL`;
      const r = await syncProfile(profileId);
      return { ok: true, patientName: p.name, readings: r.ok ? r.written : 0 };
    } catch (e) {
      if (e instanceof LibreError) return { ok: false, error: e.message };
      throw e;
    }
  }

  async function status(actor: Actor, profileId: string): Promise<LibreLinkStatus | null> {
    await P.withProfileData(actor, profileId, 'glucose', 'read', async () => null);
    const [r] = await sql<{ email: string; patient_name: string | null; status: 'active' | 'error'; last_sync_at: Date | null; last_reading_at: Date | null; last_error: string | null }[]>`
      SELECT email, patient_name, status, last_sync_at, last_reading_at, last_error FROM libre_link WHERE profile_id = ${profileId}`;
    return r ? { email: r.email, patientName: r.patient_name, status: r.status, lastSyncAt: r.last_sync_at, lastReadingAt: r.last_reading_at, lastError: r.last_error } : null;
  }

  /** Supprime le lien et les identifiants ; les mesures déjà importées restent. */
  async function disconnect(actor: Actor, profileId: string): Promise<void> {
    await P.withProfileData(actor, profileId, 'glucose', 'write', async (tx) => {
      await tx`UPDATE glucose_source SET status = 'revoked' WHERE profile_id = ${profileId} AND source_type = 'librelinkup'`;
    });
    await sql`DELETE FROM libre_link WHERE profile_id = ${profileId}`;
  }

  async function failure(profileId: string, e: LibreError) {
    await sql`
      UPDATE libre_link SET failures = failures + 1, last_error = ${e.message}, last_sync_at = ${now()},
        status = CASE WHEN ${e.kind === 'auth'} AND failures + 1 >= ${MAX_AUTH_FAILURES} THEN 'error' ELSE status END
      WHERE profile_id = ${profileId}`;
  }

  /** Synchronise un profil : jeton (renouvelé si besoin), mesures, écriture sans doublon. */
  async function syncProfile(profileId: string): Promise<{ ok: true; written: number } | { ok: false; error: string }> {
    const [row] = await sql<LinkRow[]>`SELECT * FROM libre_link WHERE profile_id = ${profileId}`;
    if (!row || !row.patient_id) return { ok: false, error: 'Aucun capteur relié.' };
    const actor = { accountId: row.account_id, email: '' };
    try {
      let host = row.api_host;
      let token = row.token_enc ? open(row.token_enc, profileId) : '';
      let userId = row.user_id ?? '';
      const relogin = async () => {
        const s = await client.login(row.email, open(row.password_enc, profileId), host);
        ({ host, token, userId } = s);
        await sql`UPDATE libre_link SET api_host = ${host}, user_id = ${userId}, token_enc = ${seal(token, profileId)}, token_expires = ${s.expires} WHERE profile_id = ${profileId}`;
      };
      if (!token || !row.token_expires || row.token_expires.getTime() - now().getTime() < 10 * 60_000) await relogin();
      let readings: LibreReading[];
      try {
        readings = await client.graph(host, token, userId, row.patient_id);
      } catch (e) {
        if (!(e instanceof LibreError) || e.kind !== 'auth') throw e;
        await relogin();
        readings = await client.graph(host, token, userId, row.patient_id);
      }
      const last = readings.at(-1)?.at ?? null;
      const written = await P.withProfileData(actor, profileId, 'glucose', 'write', async (tx) => {
        const [src] = await tx<{ id: string }[]>`SELECT id FROM glucose_source WHERE profile_id = ${profileId} AND source_type = 'librelinkup' LIMIT 1`;
        const sourceId =
          src?.id ??
          (
            await tx<{ id: string }[]>`
              INSERT INTO glucose_source (profile_id, source_type, device_label, status, last_sync_at)
              VALUES (${profileId}, 'librelinkup', 'FreeStyle Libre (LibreLinkUp)', 'active', ${now()}) RETURNING id`
          )[0]!.id;
        await tx`UPDATE glucose_source SET status = 'active', last_sync_at = ${now()}, last_error = NULL WHERE id = ${sourceId}`;
        if (!readings.length) return 0;
        const rows = await tx`
          INSERT INTO glucose_reading (profile_id, measured_at, value_mgdl, kind, source_id)
          SELECT ${profileId}, t.at, t.v, 'sensor', ${sourceId}
          FROM unnest(${readings.map((r) => r.at.toISOString())}::timestamptz[], ${readings.map((r) => r.mgdl)}::numeric[]) AS t(at, v)
          ON CONFLICT DO NOTHING RETURNING measured_at`;
        return rows.length;
      });
      await sql`
        UPDATE libre_link SET status = 'active', failures = 0, last_error = NULL, last_sync_at = ${now()},
          last_reading_at = GREATEST(COALESCE(last_reading_at, ${last}), ${last})
        WHERE profile_id = ${profileId}`;
      return { ok: true, written };
    } catch (e) {
      if (e instanceof ForbiddenError) {
        // Le compte qui a relié le capteur n'a plus le droit d'écrire : le lien est supprimé.
        await sql`DELETE FROM libre_link WHERE profile_id = ${profileId}`;
        return { ok: false, error: e.message };
      }
      if (e instanceof LibreError) {
        await failure(profileId, e);
        return { ok: false, error: e.message };
      }
      throw e;
    }
  }

  /** Synchronisation à la demande depuis l'interface (droits vérifiés). */
  async function syncNow(actor: Actor, profileId: string) {
    await P.withProfileData(actor, profileId, 'glucose', 'write', async () => null);
    await sql`UPDATE libre_link SET status = 'active', failures = 0 WHERE profile_id = ${profileId}`;
    return syncProfile(profileId);
  }

  /** Tâche de fond : tous les liens actifs dont la dernière synchronisation date d'au moins 5 min. */
  async function syncDue(): Promise<{ synced: number; failed: number }> {
    const due = await sql<{ profile_id: string }[]>`
      SELECT profile_id FROM libre_link
      WHERE status = 'active' AND (last_sync_at IS NULL OR last_sync_at < ${new Date(now().getTime() - (LIBRE_SYNC_MINUTES * 60_000 - 15_000))})
      ORDER BY last_sync_at NULLS FIRST LIMIT 50`;
    let synced = 0;
    let failed = 0;
    for (const d of due) {
      try {
        const r = await syncProfile(d.profile_id);
        if (r.ok) synced++;
        else failed++;
      } catch (e) {
        // Erreur inattendue (ex. clé de chiffrement changée) : on la note et on passe au profil suivant.
        failed++;
        await failure(d.profile_id, new LibreError(`Erreur interne : ${(e as Error).message}`.slice(0, 200), 'format')).catch(() => undefined);
      }
    }
    return { synced, failed };
  }

  return { connect, status, disconnect, syncNow, syncDue };
}

export type LibreLinkService = ReturnType<typeof createLibreLinkService>;
