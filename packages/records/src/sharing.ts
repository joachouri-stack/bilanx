/**
 * Partage sécurisé d'un rapport avec un professionnel de santé.
 *
 * - Le rapport partagé est un PDF FIGÉ au moment du partage (période et rubriques choisies par le
 *   titulaire), chiffré en base, effacé à la révocation ou après expiration.
 * - Accès : lien (jeton aléatoire) + code à 8 chiffres transmis séparément. 5 codes erronés
 *   verrouillent le lien. Durée et nombre d'ouvertures limités. Chaque essai est journalisé.
 * - Le visiteur n'a pas de compte : les requêtes publiques présentent l'empreinte du jeton à
 *   PostgreSQL (app.share_token_hash), seule clé qui ouvre ce partage (RLS, migration 0016).
 */
import { randomInt, randomUUID } from 'node:crypto';
import { decrypt, deriveKey, encrypt, hmacSha256, randomToken, safeEqual, sha256, writeAudit, type Mailer } from '@bilanx/auth';
import type { Sql, TransactionSql } from '@bilanx/db';
import type { Actor, ProfilesService } from '@bilanx/profiles';

export interface SharingConfig {
  sql: Sql;
  profiles: ProfilesService;
  secretKey: Buffer;
  mailer: Mailer;
  appUrl: string;
  now?: () => Date;
}

export const SHARE_DURATIONS: Record<string, { label: string; hours: number }> = {
  '1': { label: '24 heures', hours: 24 },
  '7': { label: '7 jours', hours: 7 * 24 },
  '30': { label: '30 jours', hours: 30 * 24 },
};
export const SHARE_MAX_VIEWS: Record<string, string> = { '': 'Sans limite (pendant la durée choisie)', '1': '1 ouverture', '3': '3 ouvertures', '10': '10 ouvertures' };
export const SHARE_MAX_CODE_FAILURES = 5;
/** Durée de consultation après saisie du bon code. */
export const SHARE_VIEWER_MINUTES = 30;

export type ShareStatus = 'active' | 'expired' | 'revoked' | 'locked' | 'exhausted';

export interface ShareRow {
  id: string;
  recipient: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  maxViews: number | null;
  views: number;
  failures: number;
  lastAccessAt: Date | null;
  periodStart: string;
  periodEnd: string;
  sections: string[];
  status: ShareStatus;
}

export interface CreateShareInput {
  pdf: Buffer;
  periodStart: string;
  periodEnd: string;
  sections: string[];
  recipient?: string;
  duration: string; // clé de SHARE_DURATIONS
  maxViews?: string; // clé de SHARE_MAX_VIEWS
  sharerName: string;
}

const UUID = /^[0-9a-f-]{36}$/i;

type LinkRow = {
  id: string;
  profile_id: string;
  report_id: string | null;
  access_code_hash: Buffer | null;
  expires_at: Date;
  revoked_at: Date | null;
  max_views: number | null;
  recipient: string | null;
  sharer_name: string;
  created_at: Date;
  created_by: string;
  period_start: string;
  period_end: string;
  sections: string[];
  has_data: boolean;
  views: number;
  failures: number;
  last_access: Date | null;
};

export function createSharingService(cfg: SharingConfig) {
  const { sql, profiles: P, mailer } = cfg;
  const now = cfg.now ?? (() => new Date());
  const keys = {
    pdf: deriveKey(cfg.secretKey, 'shared-report-pdf'),
    code: deriveKey(cfg.secretKey, 'share-access-code'),
    viewer: deriveKey(cfg.secretKey, 'share-viewer'),
    ip: deriveKey(cfg.secretKey, 'ip'),
  };
  const codeHash = (shareId: string, code: string) => hmacSha256(keys.code, `${shareId}:${code.replace(/\D/g, '')}`);
  const statusOf = (r: Pick<LinkRow, 'revoked_at' | 'expires_at' | 'failures' | 'max_views' | 'views' | 'has_data'>): ShareStatus =>
    r.revoked_at
      ? 'revoked'
      : r.expires_at.getTime() <= now().getTime() || !r.has_data
        ? 'expired'
        : r.failures >= SHARE_MAX_CODE_FAILURES
          ? 'locked'
          : r.max_views !== null && r.views >= r.max_views
            ? 'exhausted'
            : 'active';

  const LINK_COLS = (tx: TransactionSql) => tx`
    s.id, s.profile_id, s.report_id, s.access_code_hash, s.expires_at, s.revoked_at, s.max_views, s.recipient, s.sharer_name,
    s.created_at, s.created_by,
    r.period_start::text, r.period_end::text, r.sections, (r.data_enc IS NOT NULL) AS has_data,
    (SELECT count(*)::int FROM share_access a WHERE a.share_id = s.id AND a.success) AS views,
    (SELECT count(*)::int FROM share_access a WHERE a.share_id = s.id AND NOT a.success) AS failures,
    (SELECT max(a.occurred_at) FROM share_access a WHERE a.share_id = s.id) AS last_access`;

  const toRow = (r: LinkRow): ShareRow => ({
    id: r.id,
    recipient: r.recipient,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    maxViews: r.max_views,
    views: r.views,
    failures: r.failures,
    lastAccessAt: r.last_access,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    sections: r.sections,
    status: statusOf(r),
  });

  // ───────────────────────── Côté titulaire ─────────────────────────
  async function create(
    actor: Actor,
    profileId: string,
    input: CreateShareInput,
  ): Promise<{ ok: true; id: string; token: string; code: string; expiresAt: Date } | { ok: false; error: string }> {
    const duration = SHARE_DURATIONS[input.duration];
    if (!duration) return { ok: false, error: 'Choisissez une durée.' };
    if (!((input.maxViews ?? '') in SHARE_MAX_VIEWS)) return { ok: false, error: 'Nombre d’ouvertures invalide.' };
    const maxViews = input.maxViews ? Number(input.maxViews) : null;
    const recipient = input.recipient?.trim().slice(0, 120) || null;
    if (!input.pdf.length || input.pdf.length > 20 * 1024 * 1024) return { ok: false, error: 'Rapport vide ou trop volumineux.' };
    if (!input.sections.length) return { ok: false, error: 'Choisissez au moins une rubrique.' };
    const token = randomToken();
    const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
    const shareId = randomUUID();
    const expiresAt = new Date(now().getTime() + duration.hours * 3_600_000);
    await P.withProfileData(actor, profileId, 'reports', 'write', async (tx) => {
      const [rep] = await tx<{ id: string }[]>`
        INSERT INTO report (profile_id, period_start, period_end, sections, storage_key, generated_by, generated_at, size_bytes)
        VALUES (${profileId}, ${input.periodStart}, ${input.periodEnd}, ${input.sections}, 'db', ${actor.accountId}, ${now()}, ${input.pdf.length})
        RETURNING id`;
      await tx`UPDATE report SET data_enc = ${encrypt(keys.pdf, input.pdf, rep!.id)} WHERE id = ${rep!.id}`;
      await tx`
        INSERT INTO share_link (id, profile_id, report_id, token_hash, access_code_hash, expires_at, max_views, created_by, created_at, recipient, sharer_name)
        VALUES (${shareId}, ${profileId}, ${rep!.id}, ${sha256(token)}, ${codeHash(shareId, code)}, ${expiresAt}, ${maxViews}, ${actor.accountId}, ${now()},
                ${recipient}, ${input.sharerName.trim().slice(0, 80)})`;
      await writeAudit(tx, now(), { accountId: actor.accountId, profileId, action: 'share.created', resource: 'share_link', resourceId: shareId, context: { hours: duration.hours, maxViews } });
    });
    return { ok: true, id: shareId, token, code: `${code.slice(0, 4)} ${code.slice(4)}`, expiresAt };
  }

  async function list(actor: Actor, profileId: string): Promise<ShareRow[]> {
    return P.withProfileData(actor, profileId, 'reports', 'read', async (tx) => {
      const rows = await tx<LinkRow[]>`
        SELECT ${LINK_COLS(tx)} FROM share_link s JOIN report r ON r.id = s.report_id
        WHERE s.profile_id = ${profileId} ORDER BY s.created_at DESC LIMIT 100`;
      return rows.map(toRow);
    });
  }

  async function accessLog(actor: Actor, profileId: string, shareId: string) {
    if (!UUID.test(shareId)) return [];
    return P.withProfileData(actor, profileId, 'reports', 'read', (tx) =>
      tx<{ occurred_at: Date; success: boolean; user_agent: string | null }[]>`
        SELECT occurred_at, success, user_agent FROM share_access
        WHERE share_id = ${shareId} AND profile_id = ${profileId} ORDER BY occurred_at DESC, id DESC LIMIT 50`,
    );
  }

  /** Révocation immédiate ; le PDF est effacé. */
  async function revoke(actor: Actor, profileId: string, shareId: string): Promise<boolean> {
    if (!UUID.test(shareId)) return false;
    return P.withProfileData(actor, profileId, 'reports', 'write', async (tx) => {
      const [s] = await tx<{ report_id: string }[]>`
        UPDATE share_link SET revoked_at = COALESCE(revoked_at, ${now()}) WHERE id = ${shareId} AND profile_id = ${profileId} RETURNING report_id`;
      if (!s) return false;
      await tx`UPDATE report SET data_enc = NULL WHERE id = ${s.report_id} AND profile_id = ${profileId}`;
      await writeAudit(tx, now(), { accountId: actor.accountId, profileId, action: 'share.revoked', resource: 'share_link', resourceId: shareId });
      return true;
    });
  }

  // ───────────────────────── Côté destinataire (sans compte) ─────────────────────────
  /** Transaction où PostgreSQL ne laisse voir QUE le partage correspondant au jeton. */
  function withToken<T>(token: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return sql.begin(async (tx) => {
      await tx`SELECT set_config('app.share_token_hash', ${sha256(String(token)).toString('hex')}, true)`;
      return fn(tx);
    }) as Promise<T>;
  }
  async function findLink(tx: TransactionSql, token: string): Promise<LinkRow | null> {
    const [r] = await tx<LinkRow[]>`
      SELECT ${LINK_COLS(tx)} FROM share_link s JOIN report r ON r.id = s.report_id WHERE s.token_hash = ${sha256(String(token))}`;
    return r ?? null;
  }

  /** Informations affichées avant la saisie du code (aucune donnée de santé). */
  async function publicInfo(token: string): Promise<{ status: ShareStatus; sharerName: string; recipient: string | null; periodStart: string; periodEnd: string; expiresAt: Date } | null> {
    if (!token || token.length > 100) return null;
    return withToken(token, async (tx) => {
      const r = await findLink(tx, token);
      if (!r) return null;
      return { status: statusOf(r), sharerName: r.sharer_name, recipient: r.recipient, periodStart: r.period_start, periodEnd: r.period_end, expiresAt: r.expires_at };
    });
  }

  type OpenResult =
    | { status: 'ok'; viewerToken: string; viewerExpiresAt: Date }
    | { status: 'wrong_code'; attemptsLeft: number }
    | { status: 'not_found' | Exclude<ShareStatus, 'active'> };

  /** Saisie du code : en cas de succès, droit de consultation de 30 minutes (jeton signé). */
  async function open(token: string, code: string, client: { ip?: string | null; userAgent?: string | null }): Promise<OpenResult> {
    if (!token || token.length > 100) return { status: 'not_found' };
    let notify: { to: string; recipient: string | null } | null = null;
    const result = await withToken(token, async (tx): Promise<OpenResult> => {
      // Verrou de transaction sur ce jeton : deux essais simultanés ne contournent pas la limite.
      // (Pas de SELECT … FOR UPDATE : il exigerait un droit de modification que le visiteur n'a pas.)
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${sha256(String(token)).toString('hex')}, 7426002))`;
      const r = await findLink(tx, token);
      if (!r) return { status: 'not_found' };
      const st = statusOf(r);
      if (st !== 'active') return { status: st };
      const ok = !!r.access_code_hash && safeEqual(codeHash(r.id, code), r.access_code_hash);
      await tx`
        INSERT INTO share_access (share_id, profile_id, occurred_at, success, ip_hash, user_agent)
        VALUES (${r.id}, ${r.profile_id}, ${now()}, ${ok}, ${client.ip ? hmacSha256(keys.ip, client.ip) : null}, ${client.userAgent?.slice(0, 300) ?? null})`;
      await writeAudit(tx, now(), { accountId: null, profileId: r.profile_id, action: ok ? 'share.opened' : 'share.wrong_code', resource: 'share_link', resourceId: r.id });
      if (!ok) {
        const left = SHARE_MAX_CODE_FAILURES - (r.failures + 1);
        return left <= 0 ? { status: 'locked' } : { status: 'wrong_code', attemptsLeft: left };
      }
      // Première consultation (aucune ouverture réussie avant celle-ci) : le titulaire est prévenu.
      if (r.views === 0) {
        const [owner] = await tx<{ email: string }[]>`SELECT email FROM account WHERE id = ${r.created_by} AND deleted_at IS NULL`;
        if (owner) notify = { to: owner.email, recipient: r.recipient };
      }
      const exp = new Date(now().getTime() + SHARE_VIEWER_MINUTES * 60_000);
      const payload = `${r.id}.${exp.getTime()}`;
      return { status: 'ok', viewerToken: `${payload}.${hmacSha256(keys.viewer, payload).toString('base64url')}`, viewerExpiresAt: exp };
    });
    if (notify) {
      const n = notify as { to: string; recipient: string | null };
      await mailer.send({
        to: n.to,
        subject: 'Votre rapport BILANX partagé vient d’être consulté',
        text: `Le rapport que vous avez partagé${n.recipient ? ` avec ${n.recipient}` : ''} vient d'être ouvert pour la première fois.\n\nVous pouvez consulter le journal des accès ou révoquer le partage dans Rapports PDF : ${cfg.appUrl.replace(/\/$/, '')}/rapports\nSi vous n'êtes pas à l'origine de ce partage, révoquez-le immédiatement.`,
      });
    }
    return result;
  }

  /** PDF du partage, pour un visiteur ayant saisi le bon code (jeton de consultation valide). */
  async function pdf(token: string, viewerToken: string): Promise<Buffer | null> {
    const [id, expRaw, sig] = String(viewerToken ?? '').split('.');
    if (!id || !expRaw || !sig || !UUID.test(id)) return null;
    if (!safeEqual(Buffer.from(sig, 'base64url'), hmacSha256(keys.viewer, `${id}.${expRaw}`))) return null;
    if (Number(expRaw) < now().getTime()) return null;
    return withToken(token, async (tx) => {
      const [r] = await tx<{ id: string; report_id: string; revoked_at: Date | null; expires_at: Date }[]>`
        SELECT id, report_id, revoked_at, expires_at FROM share_link WHERE token_hash = ${sha256(String(token))}`;
      // Le jeton de consultation doit correspondre à CE partage, toujours valide (révocation immédiate).
      if (!r || r.id !== id || r.revoked_at || r.expires_at.getTime() <= now().getTime()) return null;
      const [rep] = await tx<{ data_enc: Buffer | null }[]>`SELECT data_enc FROM report WHERE id = ${r.report_id}`;
      return rep?.data_enc ? decrypt(keys.pdf, rep.data_enc, r.report_id) : null;
    });
  }

  /** Tâche de fond : efface les PDF dont tous les partages sont expirés ou révoqués. */
  async function purgeExpired(): Promise<number> {
    return sql.begin(async (tx) => {
      await tx`SELECT set_config('app.purge', 'on', true)`;
      const r = await tx`UPDATE report SET data_enc = NULL WHERE data_enc IS NOT NULL AND app_report_purgeable(id) RETURNING id`;
      return r.length;
    }) as Promise<number>;
  }

  return { create, list, accessLog, revoke, publicInfo, open, pdf, purgeExpired };
}

export type SharingService = ReturnType<typeof createSharingService>;
