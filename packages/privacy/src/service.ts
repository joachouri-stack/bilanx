import { strToU8, zipSync, type Zippable } from 'fflate';
import { verifyPassword, writeAudit, type Mailer } from '@bilanx/auth';
import type { Sql, TransactionSql } from '@bilanx/db';
import type { DocumentsService } from '@bilanx/documents';
import { ForbiddenError, type Actor, type ProfilesService } from '@bilanx/profiles';

export const ACCOUNT_GRACE_DAYS = 7;
export const PROFILE_RETENTION_DAYS = 30;
const DAY = 86_400_000;

export interface PrivacyConfig {
  sql: Sql;
  profiles: ProfilesService;
  documents: DocumentsService;
  mailer: Mailer;
  appUrl: string;
  now?: () => Date;
}

// ───────────────────────── CSV ─────────────────────────
type Cell = string | number | boolean | Date | null | undefined;
function csv(header: string[], rows: Cell[][]): Uint8Array {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Point-virgule et BOM UTF-8 : ouverture directe dans un tableur réglé en français.
  return strToU8(`﻿${[header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')}\r\n`);
}
const json = (v: unknown) => strToU8(JSON.stringify(v, null, 2));
const safeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'fichier';

const README = `Export de vos données BILANX
============================

Cette archive contient les données de votre compte et de chacun des profils que vous gérez,
telles qu'enregistrées dans BILANX à la date indiquée dans compte.json.

- compte.json : compte, consentements, historique des connexions, profils partagés avec vous.
- profils/<nom>/ : un dossier par profil géré
    profil.json            informations du profil et personnes ayant accès
    analyses.csv           résultats d'analyses (valeur, unité, références du laboratoire, source)
    glycemie.csv           mesures de glycémie (mg/dL ; capteur, capillaire)
    insuline.csv           injections déclarées ; insulines.csv ; modifications-prescrites.csv
    journal.csv            repas et événements
    medicaments.csv        traitements prescrits (posologie recopiée, horaires, période, arrêt)
    prises-medicaments.csv prises renseignées (prise / non prise)
    rendez-vous.csv        rendez-vous et notes
    activite-pas.csv       nombre de pas par jour (import Apple Santé)
    documents.csv          liste des documents ; documents/ : originaux déchiffrés
    valeurs-lues.csv       valeurs détectées dans les documents et décision prise
    journal-d-acces.csv    qui a consulté ou modifié quoi, et quand

Les fichiers CSV utilisent le point-virgule comme séparateur et l'encodage UTF-8.
Les dates sont en UTC (format ISO 8601).

Ces données sont personnelles et sensibles : conservez cette archive en lieu sûr.
`;

export function createPrivacyService(cfg: PrivacyConfig) {
  const { sql, profiles } = cfg;
  const now = cfg.now ?? (() => new Date());
  const audit = (tx: TransactionSql, e: Parameters<typeof writeAudit>[2]) => writeAudit(tx, now(), e);

  // ───────────────────────── Export (art. 15 et 20) ─────────────────────────
  async function exportProfileFiles(actor: Actor, profileId: string, dir: string, files: Zippable): Promise<void> {
    const P = profiles;
    const [profile] = await sql`SELECT display_name, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, relationship, created_at FROM profile WHERE id = ${profileId}`;
    const { accesses, invitations } = await P.listAccesses(actor, profileId);
    files[`${dir}/profil.json`] = json({
      nom: profile!.display_name,
      dateDeNaissance: profile!.birth_date,
      lien: profile!.relationship,
      creeLe: profile!.created_at,
      acces: accesses.map((a) => ({ email: a.email, role: a.role, autorisations: a.permissions, depuis: a.granted_at, jusquA: a.expires_at, baseLegale: a.legal_basis })),
      invitationsEnAttente: invitations.map((i) => ({ email: i.invited_email, role: i.role, autorisations: i.permissions, expire: i.expires_at })),
    });

    const lab = await P.withProfileData(actor, profileId, 'lab', 'read', (tx) =>
      tx`SELECT analyte_code, value, comparator, unit, value_canonical, ref_low, ref_high, ref_text, sampled_at, laboratory, source_type, document_id, confirmed_at, note
         FROM lab_result WHERE profile_id = ${profileId} AND deleted_at IS NULL ORDER BY sampled_at`);
    files[`${dir}/analyses.csv`] = csv(
      ['analyse', 'valeur', 'comparateur', 'unite', 'valeur_unite_canonique', 'ref_basse', 'ref_haute', 'ref_texte', 'preleve_le', 'laboratoire', 'source', 'document', 'confirme_le', 'note'],
      lab.map((r) => [r.analyte_code, r.value, r.comparator, r.unit, r.value_canonical, r.ref_low, r.ref_high, r.ref_text, r.sampled_at, r.laboratory, r.source_type, r.document_id, r.confirmed_at, r.note]),
    );

    const glucose = await P.withProfileData(actor, profileId, 'glucose', 'read', (tx) =>
      tx`SELECT measured_at, value_mgdl, kind FROM glucose_reading WHERE profile_id = ${profileId} ORDER BY measured_at`);
    files[`${dir}/glycemie.csv`] = csv(['mesure_le', 'valeur_mg_dl', 'type'], glucose.map((r) => [r.measured_at, r.value_mgdl, r.kind]));

    const [prods, doses, changes] = await P.withProfileData(actor, profileId, 'insulin', 'read', async (tx) => [
      await tx`SELECT id, name, type, active FROM insulin_product WHERE profile_id = ${profileId} ORDER BY name`,
      await tx`SELECT d.occurred_at, p.name, p.type, d.units, d.status, d.comment FROM insulin_dose d JOIN insulin_product p ON p.id = d.product_id
               WHERE d.profile_id = ${profileId} AND d.deleted_at IS NULL ORDER BY d.occurred_at`,
      await tx`SELECT subject, effective_date, previous_regimen, new_regimen, prescribed_by, goal_note FROM treatment_change
               WHERE profile_id = ${profileId} AND deleted_at IS NULL ORDER BY effective_date`,
    ]);
    files[`${dir}/insulines.csv`] = csv(['nom', 'type', 'active'], prods.map((r) => [r.name, r.type, r.active]));
    files[`${dir}/insuline.csv`] = csv(['le', 'insuline', 'type', 'unites', 'statut', 'commentaire'], doses.map((r) => [r.occurred_at, r.name, r.type, r.units, r.status, r.comment]));
    const prodName = new Map(prods.map((p) => [`insulin:${p.id}`, p.name as string]));
    files[`${dir}/modifications-prescrites.csv`] = csv(
      ['date_effet', 'traitement', 'avant', 'prescription', 'prescrit_par', 'objectif'],
      changes.map((r) => [r.effective_date, prodName.get(r.subject) ?? r.subject, r.previous_regimen, r.new_regimen, r.prescribed_by, r.goal_note]),
    );

    const journal = await P.withProfileData(actor, profileId, 'journal', 'read', (tx) =>
      tx`SELECT occurred_at, ended_at, kind, meal_kind, description, quantities, carbs_g, intensity, comment FROM journal_entry
         WHERE profile_id = ${profileId} AND deleted_at IS NULL ORDER BY occurred_at`);
    files[`${dir}/journal.csv`] = csv(
      ['debut', 'fin', 'type', 'repas', 'description', 'quantites', 'glucides_g', 'intensite', 'commentaire'],
      journal.map((r) => [r.occurred_at, r.ended_at, r.kind, r.meal_kind, r.description, r.quantities, r.carbs_g, r.intensity, r.comment]),
    );

    const [meds, intakes] = await P.withProfileData(actor, profileId, 'medications', 'read', async (tx) => [
      await tx`SELECT id, name, strength, posology_text, schedule, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date,
                      prescriber, status, to_char(stopped_on, 'YYYY-MM-DD') AS stopped_on, stop_reason, replaces_id, created_at
               FROM medication WHERE profile_id = ${profileId} AND deleted_at IS NULL ORDER BY name, created_at`,
      await tx`SELECT i.scheduled_at, m.name, m.strength, i.status, i.taken_at, i.recorded_at FROM medication_intake i JOIN medication m ON m.id = i.medication_id
               WHERE i.profile_id = ${profileId} AND m.deleted_at IS NULL ORDER BY i.scheduled_at`,
    ]);
    files[`${dir}/medicaments.csv`] = csv(
      ['id', 'medicament', 'dosage', 'posologie_prescrite', 'heures_de_prise', 'debut', 'fin', 'prescrit_par', 'statut', 'arrete_le', 'motif_arret', 'remplace', 'saisi_le'],
      meds.map((r) => [
        r.id, r.name, r.strength, r.posology_text,
        (r.schedule as { time: string; qty: string }[]).map((x) => (x.qty ? `${x.time} (${x.qty})` : x.time)).join(' ; '),
        r.start_date, r.end_date, r.prescriber, r.status, r.stopped_on, r.stop_reason, r.replaces_id, r.created_at,
      ]),
    );
    files[`${dir}/prises-medicaments.csv`] = csv(
      ['prevue_le', 'medicament', 'dosage', 'statut', 'notee_prise_le', 'renseignee_le'],
      intakes.map((r) => [r.scheduled_at, r.name, r.strength, r.status, r.taken_at, r.recorded_at]),
    );

    const rdv = await P.withProfileData(actor, profileId, 'appointments', 'read', (tx) =>
      tx`SELECT starts_at, specialty, practitioner, location, reason, to_prepare, reminder_minutes, notes_after FROM appointment
         WHERE profile_id = ${profileId} AND deleted_at IS NULL ORDER BY starts_at`);
    files[`${dir}/rendez-vous.csv`] = csv(
      ['le', 'specialite', 'professionnel', 'lieu', 'motif', 'a_preparer', 'rappel_minutes', 'notes_apres'],
      rdv.map((r) => [r.starts_at, r.specialty, r.practitioner, r.location, r.reason, r.to_prepare, r.reminder_minutes?.[0] ?? null, r.notes_after]),
    );

    const steps = await P.withProfileData(actor, profileId, 'activity', 'read', (tx) =>
      tx`SELECT to_char(day, 'YYYY-MM-DD') AS day, steps FROM activity_daily WHERE profile_id = ${profileId} ORDER BY day`);
    files[`${dir}/activite-pas.csv`] = csv(['jour', 'pas'], steps.map((r) => [r.day, r.steps]));

    const docs = await cfg.documents.list(actor, profileId);
    files[`${dir}/documents.csv`] = csv(
      ['id', 'titre', 'type', 'depose_le', 'date_document', 'emetteur', 'pages', 'statut_lecture'],
      docs.map((d) => [d.id, d.title, d.kind, d.uploaded_at, d.document_date, d.issuer, d.page_count, d.job_status]),
    );
    for (const d of docs) {
      for (const f of await cfg.documents.readFiles(actor, profileId, d.id)) {
        const ext = f.mime === 'application/pdf' ? 'pdf' : f.mime === 'image/png' ? 'png' : f.mime === 'image/webp' ? 'webp' : 'jpg';
        files[`${dir}/documents/${d.id.slice(0, 8)}-${safeName(d.title)}-page${f.page}.${ext}`] = [new Uint8Array(f.data), { level: 0 }];
      }
    }
    const drafts = await P.withProfileData(actor, profileId, 'documents', 'read', (tx) =>
      tx`SELECT j.document_id, v.raw_label, v.raw_value, v.raw_unit, v.raw_reference, v.matched_analyte, v.status, v.reviewed_at
         FROM extracted_value_draft v JOIN extraction_job j ON j.id = v.job_id WHERE v.profile_id = ${profileId} ORDER BY j.created_at, v.line_index`);
    files[`${dir}/valeurs-lues.csv`] = csv(
      ['document', 'libelle_lu', 'valeur_lue', 'unite_lue', 'reference_lue', 'analyse_reconnue', 'decision', 'decide_le'],
      drafts.map((r) => [r.document_id, r.raw_label, r.raw_value, r.raw_unit, r.raw_reference, r.matched_analyte, r.status, r.reviewed_at]),
    );

    const log = await P.accessLog(actor, profileId, 5000);
    files[`${dir}/journal-d-acces.csv`] = csv(['le', 'compte', 'action', 'ressource'], log.map((l) => [l.occurred_at, l.email, l.action, l.resource]));
  }

  /** Archive ZIP de toutes les données du compte et des profils qu'il gère. */
  async function exportAccount(actor: Actor): Promise<{ zip: Buffer; profiles: number }> {
    const [acc] = await sql`SELECT email, created_at, email_verified_at, deletion_scheduled_at FROM account WHERE id = ${actor.accountId} AND deleted_at IS NULL`;
    if (!acc) throw new ForbiddenError();
    const consents = await sql`SELECT purpose, version, given_at, withdrawn_at FROM consent WHERE account_id = ${actor.accountId} ORDER BY given_at`;
    const logins = await sql`SELECT occurred_at, success, method, user_agent FROM login_event WHERE account_id = ${actor.accountId} ORDER BY occurred_at DESC LIMIT 500`;
    const list = await profiles.listProfiles(actor.accountId);
    const owned = list.filter((p) => p.role === 'owner');
    const files: Zippable = { 'LISEZ-MOI.txt': strToU8(README) };
    files['compte.json'] = json({
      exporteLe: now(),
      email: acc.email,
      creeLe: acc.created_at,
      emailVerifieLe: acc.email_verified_at,
      suppressionPrevueLe: acc.deletion_scheduled_at,
      consentements: consents,
      connexions: logins,
      profilsGeres: owned.map((p) => p.displayName),
      profilsPartagesAvecMoi: list.filter((p) => p.role !== 'owner').map((p) => ({ profil: p.displayName, role: p.role, autorisations: p.permissions, jusquA: p.expiresAt })),
    });
    const used = new Set<string>();
    for (const p of owned) {
      let dir = `profils/${safeName(p.displayName)}`;
      if (used.has(dir)) dir = `${dir}-${p.profileId.slice(0, 6)}`;
      used.add(dir);
      await exportProfileFiles(actor, p.profileId, dir, files);
    }
    await sql.begin((tx) => audit(tx, { accountId: actor.accountId, action: 'account.exported', context: { profiles: owned.length } }));
    return { zip: Buffer.from(zipSync(files, { level: 6, mtime: now() })), profiles: owned.length };
  }

  // ───────────────────────── Consentements ─────────────────────────
  async function listConsents(accountId: string) {
    return sql<{ purpose: string; version: string; given_at: Date; withdrawn_at: Date | null }[]>`
      SELECT purpose, version, given_at, withdrawn_at FROM consent WHERE account_id = ${accountId}
      ORDER BY given_at DESC`;
  }

  /** Retrait de la lecture automatique des documents (les documents restent, la lecture s'arrête). */
  async function withdrawAutoReading(actor: Actor): Promise<boolean> {
    return sql.begin(async (tx) => {
      const r = await tx`UPDATE consent SET withdrawn_at = ${now()} WHERE account_id = ${actor.accountId} AND purpose = 'ai_extraction' AND withdrawn_at IS NULL RETURNING id`;
      if (r.length) await audit(tx, { accountId: actor.accountId, action: 'consent.withdrawn', context: { purpose: 'ai_extraction' } });
      return r.length > 0;
    });
  }

  // ───────────────────────── Suppression d'un profil de proche ─────────────────────────
  async function deleteProfile(actor: Actor, profileId: string, confirmName: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const a = await profiles.getAccess(actor.accountId, profileId);
    if (!a || a.role !== 'owner') throw new ForbiddenError('Seul·e le ou la gestionnaire du profil peut le supprimer.');
    if (a.relationship === 'self') return { ok: false, error: 'Votre propre profil ne se supprime pas seul : supprimez votre compte.' };
    if (confirmName.trim() !== a.displayName) return { ok: false, error: `Pour confirmer, saisissez exactement « ${a.displayName} ».` };
    const emails = await sql<{ email: string }[]>`
      SELECT a.email FROM profile_access pa JOIN account a ON a.id = pa.account_id
      WHERE pa.profile_id = ${profileId} AND pa.role <> 'owner' AND pa.revoked_at IS NULL`;
    await sql.begin(async (tx) => {
      await tx`UPDATE profile SET deleted_at = ${now()} WHERE id = ${profileId}`;
      await tx`UPDATE profile_access SET revoked_at = ${now()}, revoked_by = ${actor.accountId} WHERE profile_id = ${profileId} AND revoked_at IS NULL`;
      await tx`UPDATE access_invitation SET revoked_at = ${now()} WHERE profile_id = ${profileId} AND accepted_at IS NULL AND revoked_at IS NULL`;
      await audit(tx, { accountId: actor.accountId, profileId, action: 'profile.deleted', resource: 'profile', resourceId: profileId, context: { purgeAfterDays: PROFILE_RETENTION_DAYS } });
    });
    for (const e of emails)
      await cfg.mailer.send({ to: e.email, subject: 'Un profil BILANX auquel vous aviez accès a été supprimé', text: `Le profil « ${a.displayName} » a été supprimé par son ou sa gestionnaire. Votre accès a pris fin.` });
    return { ok: true };
  }

  // ───────────────────────── Suppression du compte ─────────────────────────
  async function requestAccountDeletion(actor: Actor, password: string): Promise<{ ok: true; scheduledAt: Date } | { ok: false; error: string }> {
    const [acc] = await sql<{ password_hash: string | null; email: string }[]>`SELECT password_hash, email FROM account WHERE id = ${actor.accountId} AND deleted_at IS NULL`;
    if (!acc?.password_hash || !(await verifyPassword(acc.password_hash, password))) return { ok: false, error: 'Mot de passe incorrect.' };
    const scheduledAt = new Date(now().getTime() + ACCOUNT_GRACE_DAYS * DAY);
    await sql.begin(async (tx) => {
      await tx`UPDATE account SET deletion_requested_at = ${now()}, deletion_scheduled_at = ${scheduledAt} WHERE id = ${actor.accountId}`;
      await audit(tx, { accountId: actor.accountId, action: 'account.deletion_requested', context: { scheduledAt: scheduledAt.toISOString() } });
    });
    const when = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(scheduledAt);
    await cfg.mailer.send({
      to: acc.email,
      subject: 'Suppression de votre compte BILANX programmée',
      text: `La suppression de votre compte BILANX et des profils que vous gérez est programmée pour le ${when}.\n\nJusque-là, vous pouvez l'annuler depuis Paramètres : ${cfg.appUrl}/parametres\nPensez à exporter vos données si vous souhaitez les conserver.`,
    });
    return { ok: true, scheduledAt };
  }

  async function cancelAccountDeletion(actor: Actor): Promise<boolean> {
    return sql.begin(async (tx) => {
      const r = await tx`UPDATE account SET deletion_requested_at = NULL, deletion_scheduled_at = NULL
                         WHERE id = ${actor.accountId} AND deletion_scheduled_at IS NOT NULL AND deleted_at IS NULL RETURNING id`;
      if (r.length) await audit(tx, { accountId: actor.accountId, action: 'account.deletion_cancelled' });
      return r.length > 0;
    });
  }

  async function deletionStatus(accountId: string): Promise<Date | null> {
    const [r] = await sql<{ deletion_scheduled_at: Date | null }[]>`SELECT deletion_scheduled_at FROM account WHERE id = ${accountId}`;
    return r?.deletion_scheduled_at ?? null;
  }

  // ───────────────────────── Effacement différé ─────────────────────────
  /**
   * À exécuter régulièrement. Efface définitivement :
   *  - les profils supprimés depuis plus de 30 jours (toutes leurs données, en cascade) ;
   *  - les comptes dont le délai de grâce est écoulé : profils gérés effacés, compte anonymisé
   *    (adresse, mot de passe, MFA, sessions, historique de connexion effacés).
   */
  async function purge(): Promise<{ profiles: number; accounts: number }> {
    const t = now();
    let profilesPurged = 0;
    let accountsPurged = 0;
    const due = await sql<{ id: string }[]>`
      SELECT a.id FROM account a WHERE a.deletion_scheduled_at IS NOT NULL AND a.deletion_scheduled_at <= ${t} AND a.deleted_at IS NULL`;
    for (const { id } of due) {
      await sql.begin(async (tx) => {
        // Profils gérés par ce compte : suppression immédiate (le délai de grâce vient de s'écouler).
        // Profils gérés, y compris ceux déjà supprimés et en attente d'effacement (accès clos à la suppression).
        const owned = await tx<{ profile_id: string }[]>`
          SELECT DISTINCT pa.profile_id FROM profile_access pa JOIN profile p ON p.id = pa.profile_id
          WHERE pa.account_id = ${id} AND pa.role = 'owner' AND (pa.revoked_at IS NULL OR p.deleted_at IS NOT NULL)`;
        for (const { profile_id } of owned) {
          const n = await tx`DELETE FROM profile WHERE id = ${profile_id} RETURNING id`;
          profilesPurged += n.length;
        }
        await tx`UPDATE profile_access SET revoked_at = ${t} WHERE account_id = ${id} AND revoked_at IS NULL`;
        await tx`DELETE FROM session WHERE account_id = ${id}`;
        await tx`DELETE FROM mfa_factor WHERE account_id = ${id}`;
        await tx`DELETE FROM mfa_recovery_code WHERE account_id = ${id}`;
        await tx`DELETE FROM auth_token WHERE account_id = ${id}`;
        await tx`DELETE FROM login_event WHERE account_id = ${id}`;
        await tx`DELETE FROM dashboard_module WHERE account_id = ${id}`;
        // Le compte est anonymisé plutôt que supprimé : d'autres profils peuvent conserver des
        // saisies faites par ce compte (en tant qu'aidant), qui le référencent.
        await tx`
          UPDATE account SET email = ${`supprime-${id}@invalid`}, password_hash = NULL, email_verified_at = NULL,
                 deleted_at = ${t}, deletion_scheduled_at = NULL WHERE id = ${id}`;
        await audit(tx, { accountId: id, action: 'account.purged', context: { profiles: owned.length } });
      });
      accountsPurged++;
    }
    const old = await sql<{ id: string }[]>`
      SELECT id FROM profile WHERE deleted_at IS NOT NULL AND deleted_at <= ${new Date(t.getTime() - PROFILE_RETENTION_DAYS * DAY)}`;
    for (const { id } of old) {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM profile WHERE id = ${id}`;
        await audit(tx, { accountId: null, profileId: id, action: 'profile.purged', resource: 'profile', resourceId: id });
      });
      profilesPurged++;
    }
    return { profiles: profilesPurged, accounts: accountsPurged };
  }

  return { exportAccount, listConsents, withdrawAutoReading, deleteProfile, requestAccountDeletion, cancelAccountDeletion, deletionStatus, purge };
}

export type PrivacyService = ReturnType<typeof createPrivacyService>;
