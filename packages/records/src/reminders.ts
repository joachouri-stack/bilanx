/**
 * Rappels de prise par notification (Web Push, RFC 8030 / 8291 / 8292).
 *
 * - Clé du serveur (VAPID) dérivée de la clé maîtresse : rien de plus à configurer.
 * - Par défaut, la notification ne nomme pas le médicament (écran verrouillé) : « Prise de traitement
 *   prévue à 08:00 ». Le nom n'apparaît que si l'utilisateur le demande.
 * - La tâche d'envoi lit les traitements AU NOM du compte destinataire : la RLS du module Médicaments
 *   vérifie son accès à chaque passage (un accès retiré arrête les rappels).
 * - Un rappel par prise et par compte (reminder_sent) ; pas de rappel si la prise est déjà renseignée.
 */
import { createECDH, hkdfSync } from 'node:crypto';
import webpush from 'web-push';
import { formatLocalDate, localDateOf, plannedFor, type ScheduleSlot } from '@bilanx/domain';
import { writeAudit } from '@bilanx/auth';
import type { Sql } from '@bilanx/db';
import { canAccess, type Actor, type ProfilesService } from '@bilanx/profiles';

export interface RemindersConfig {
  sql: Sql;
  profiles: ProfilesService;
  secretKey: Buffer;
  appUrl: string;
  timeZone?: string;
  now?: () => Date;
  /** Tests uniquement : accepte des points d'envoi http://localhost (service de notification simulé). */
  allowInsecureEndpoints?: boolean;
  /** Contact transmis aux services de notification (exigé par VAPID). */
  contact?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Fenêtre d'envoi : une prise est rappelée si son heure est passée depuis moins de 10 minutes. */
export const REMINDER_WINDOW_MINUTES = 10;

/** Clés VAPID (P-256) dérivées de la clé maîtresse, stables d'un démarrage à l'autre. */
export function vapidKeysFrom(secretKey: Buffer): { publicKey: string; privateKey: string } {
  for (let i = 0; i < 16; i++) {
    const priv = Buffer.from(hkdfSync('sha256', secretKey, Buffer.alloc(0), `bilanx-vapid-${i}`, 32));
    try {
      const ecdh = createECDH('prime256v1');
      ecdh.setPrivateKey(priv); // refuse une clé hors de l'intervalle valide (probabilité ~2⁻³²)
      return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: priv.toString('base64url') };
    } catch {
      /* clé suivante */
    }
  }
  throw new Error('Impossible de dériver les clés VAPID.');
}

const B64U = /^[A-Za-z0-9_-]+$/;

export function createRemindersService(cfg: RemindersConfig) {
  const { sql, profiles: P } = cfg;
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const vapid = vapidKeysFrom(cfg.secretKey);

  function validEndpoint(endpoint: string): boolean {
    try {
      const u = new URL(endpoint);
      if (u.protocol === 'https:') return endpoint.length <= 1000;
      return !!cfg.allowInsecureEndpoints && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
    } catch {
      return false;
    }
  }

  // ───────────────────────── Appareils ─────────────────────────
  async function subscribe(actor: Actor, sub: PushSubscriptionInput, userAgent?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
    const p256dh = String(sub?.keys?.p256dh ?? '');
    const auth = String(sub?.keys?.auth ?? '');
    if (!validEndpoint(String(sub?.endpoint ?? '')) || !B64U.test(p256dh) || !B64U.test(auth) || p256dh.length > 200 || auth.length > 100)
      return { ok: false, error: 'Abonnement aux notifications invalide.' };
    // Un même appareil (point d'envoi) n'appartient qu'à un compte : le dernier qui s'y abonne.
    await sql`
      INSERT INTO push_subscription (account_id, endpoint, p256dh, auth, user_agent, created_at)
      VALUES (${actor.accountId}, ${sub.endpoint}, ${p256dh}, ${auth}, ${userAgent?.slice(0, 300) ?? null}, ${now()})
      ON CONFLICT (endpoint) DO UPDATE SET account_id = EXCLUDED.account_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent, created_at = EXCLUDED.created_at, failure_count = 0`;
    return { ok: true };
  }

  async function unsubscribe(actor: Actor, endpoint: string): Promise<void> {
    await sql`DELETE FROM push_subscription WHERE account_id = ${actor.accountId} AND endpoint = ${String(endpoint)}`;
  }

  async function devices(accountId: string) {
    return sql<{ id: string; endpoint: string; user_agent: string | null; created_at: Date; last_success_at: Date | null }[]>`
      SELECT id, endpoint, user_agent, created_at, last_success_at FROM push_subscription WHERE account_id = ${accountId} ORDER BY created_at`;
  }

  async function removeDevice(actor: Actor, id: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
    return (await sql`DELETE FROM push_subscription WHERE id = ${id} AND account_id = ${actor.accountId} RETURNING id`).length > 0;
  }

  // ───────────────────────── Préférences par profil ─────────────────────────
  async function prefs(actor: Actor, profileId: string): Promise<{ enabled: boolean; showNames: boolean }> {
    const [r] = await sql<{ show_names: boolean }[]>`SELECT show_names FROM reminder_pref WHERE account_id = ${actor.accountId} AND profile_id = ${profileId}`;
    return { enabled: !!r, showNames: r?.show_names ?? false };
  }

  /** Activer exige de pouvoir LIRE les médicaments de ce profil (vérifié par l'application et la RLS). */
  async function setPrefs(actor: Actor, profileId: string, enabled: boolean, showNames: boolean): Promise<void> {
    if (!enabled) {
      await sql`DELETE FROM reminder_pref WHERE account_id = ${actor.accountId} AND profile_id = ${profileId}`;
      return;
    }
    await P.withProfileData(actor, profileId, 'medications', 'read', async () => undefined); // ForbiddenError sinon
    await sql`
      INSERT INTO reminder_pref (account_id, profile_id, show_names, created_at) VALUES (${actor.accountId}, ${profileId}, ${showNames}, ${now()})
      ON CONFLICT (account_id, profile_id) DO UPDATE SET show_names = EXCLUDED.show_names`;
  }

  // ───────────────────────── Envoi ─────────────────────────
  type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

  /** Envoie une notification chiffrée ; supprime les abonnements expirés (404/410). */
  async function push(sub: Sub, payload: Record<string, unknown>): Promise<boolean> {
    const details = webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      vapidDetails: { subject: cfg.contact ?? 'mailto:no-reply@bilanx.fr', publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 30 * 60, // un rappel qui arrive plus de 30 min après n'a plus de sens
      urgency: 'high',
      contentEncoding: 'aes128gcm',
    });
    try {
      const res = await fetch(details.endpoint, {
        method: details.method,
        headers: details.headers as Record<string, string>,
        body: details.body ? new Uint8Array(details.body as Buffer) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404 || res.status === 410) {
        await sql`DELETE FROM push_subscription WHERE id = ${sub.id}`;
        return false;
      }
      if (!res.ok) throw new Error(String(res.status));
      await sql`UPDATE push_subscription SET last_success_at = ${now()}, failure_count = 0 WHERE id = ${sub.id}`;
      return true;
    } catch {
      await sql`UPDATE push_subscription SET failure_count = failure_count + 1 WHERE id = ${sub.id}`;
      await sql`DELETE FROM push_subscription WHERE id = ${sub.id} AND failure_count >= 20`;
      return false;
    }
  }

  async function sendTest(actor: Actor): Promise<{ sent: number; devices: number }> {
    const subs = await sql<Sub[]>`SELECT id, endpoint, p256dh, auth FROM push_subscription WHERE account_id = ${actor.accountId}`;
    let sent = 0;
    for (const s of subs) if (await push(s, { title: 'BILANX', body: 'Notification de test : les rappels fonctionnent sur cet appareil.', url: '/medicaments', tag: 'test' })) sent++;
    return { sent, devices: subs.length };
  }

  /**
   * Tâche de fond (chaque minute) : rappels des prises dont l'heure vient de passer, non renseignées,
   * pas encore rappelées. Renvoie le nombre de notifications envoyées.
   */
  async function runDue(): Promise<number> {
    const at = now();
    const from = at.getTime() - REMINDER_WINDOW_MINUTES * 60_000;
    const days = [...new Set([formatLocalDate(localDateOf(new Date(from), tz)), formatLocalDate(localDateOf(at, tz))])];
    const wanted = await sql<{ account_id: string; profile_id: string; show_names: boolean }[]>`
      SELECT p.account_id, p.profile_id, p.show_names FROM reminder_pref p
      WHERE EXISTS (SELECT 1 FROM push_subscription s WHERE s.account_id = p.account_id)`;
    let sent = 0;
    for (const w of wanted) {
      // Accès toujours valide ? (sinon la préférence est retirée)
      const access = await P.getAccess(w.account_id, w.profile_id);
      if (!access || !canAccess(access.role, access.permissions, 'medications', 'read')) {
        await sql`DELETE FROM reminder_pref WHERE account_id = ${w.account_id} AND profile_id = ${w.profile_id}`;
        continue;
      }
      const due = await sql.begin(async (tx) => {
        // Lecture au nom du compte : la RLS du module Médicaments s'applique.
        await tx`SELECT set_config('app.account_id', ${w.account_id}, true), set_config('app.profile_id', ${w.profile_id}, true)`;
        const meds = await tx<{ id: string; name: string; strength: string | null; schedule: ScheduleSlot[]; start_date: string | null; end_date: string | null; stopped_on: string | null }[]>`
          SELECT id, name, strength, schedule, start_date::text, end_date::text, stopped_on::text FROM medication
          WHERE profile_id = ${w.profile_id} AND deleted_at IS NULL AND status IN ('active', 'stopped') AND schedule <> '[]'::jsonb`;
        if (!meds.length) return [];
        const schedulable = meds.map((m) => ({ id: m.id, schedule: m.schedule, startDate: m.start_date, endDate: m.end_date, stoppedOn: m.stopped_on }));
        const doses = days
          .flatMap((d) => {
            const [y, mo, dd] = d.split('-').map(Number) as [number, number, number];
            return plannedFor(schedulable, { year: y, month: mo, day: dd }, tz);
          })
          .filter((p) => p.at.getTime() > from && p.at.getTime() <= at.getTime());
        if (!doses.length) return [];
        const recorded = await tx<{ medication_id: string; scheduled_at: Date }[]>`
          SELECT medication_id, scheduled_at FROM medication_intake
          WHERE profile_id = ${w.profile_id} AND scheduled_at > ${new Date(from)} AND scheduled_at <= ${at}`;
        const done = new Set(recorded.map((r) => `${r.medication_id}|${r.scheduled_at.getTime()}`));
        const out: { dose: (typeof doses)[number]; med: (typeof meds)[number] }[] = [];
        for (const d of doses) {
          if (done.has(`${d.medicationId}|${d.at.getTime()}`)) continue;
          // Réservation : un seul envoi par prise et par compte, même avec plusieurs instances.
          const [first] = await tx`
            INSERT INTO reminder_sent (medication_id, scheduled_at, account_id, sent_at) VALUES (${d.medicationId}, ${d.at}, ${w.account_id}, ${at})
            ON CONFLICT DO NOTHING RETURNING medication_id`;
          if (first) out.push({ dose: d, med: meds.find((m) => m.id === d.medicationId)! });
        }
        if (out.length) await writeAudit(tx, at, { accountId: w.account_id, profileId: w.profile_id, action: 'reminder.sent', resource: 'medications', resourceId: null, context: { count: out.length } });
        return out;
      });
      if (!due.length) continue;
      const subs = await sql<Sub[]>`SELECT id, endpoint, p256dh, auth FROM push_subscription WHERE account_id = ${w.account_id}`;
      const who = access.relationship === 'self' && access.role === 'owner' ? '' : ` (${access.displayName})`;
      for (const { dose, med } of due) {
        const time = dose.time.replace(':', ' h ');
        const payload = w.show_names
          ? { title: `${med.name}${med.strength ? ` ${med.strength}` : ''}${who}`, body: `Prise de ${time}${dose.qty ? ` : ${dose.qty}` : ''}` }
          : { title: `Prise de traitement${who}`, body: `Prise prévue à ${time}. Ouvrez BILANX pour la noter.` };
        for (const s of subs)
          if (await push(s, { ...payload, url: '/medicaments', tag: `prise-${med.id}-${dose.at.getTime()}` })) sent++;
      }
    }
    // Ménage : traces d'envoi de plus de 7 jours.
    await sql`DELETE FROM reminder_sent WHERE sent_at < ${addDaysUtc(at, -7)}`;
    return sent;
  }

  return { vapidPublicKey: () => vapid.publicKey, subscribe, unsubscribe, devices, removeDevice, prefs, setPrefs, sendTest, runDue };
}

const addDaysUtc = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export type RemindersService = ReturnType<typeof createRemindersService>;
