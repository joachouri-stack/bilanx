import { normalizeEmail, randomToken, sha256, writeAudit, type AuditEntry, type Mailer } from '@bilanx/auth';
import type { Sql, TransactionSql } from '@bilanx/db';
import {
  canAccess,
  LEGAL_BASES,
  MODULES,
  RELATIONSHIPS,
  sanitizePermissions,
  type AccessRole,
  type LegalBasis,
  type ModuleKey,
  type Permissions,
  type Relationship,
} from './modules';

export const INVITATION_DAYS = 7;
export const PRO_ACCESS_MAX_DAYS = 90;
const DAY = 86_400_000;

export class ForbiddenError extends Error {
  constructor(message = 'Accès non autorisé.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface ProfilesConfig {
  sql: Sql;
  mailer: Mailer;
  appUrl: string;
  now?: () => Date;
}

export interface ProfileAccess {
  accessId: string;
  profileId: string;
  displayName: string;
  relationship: Relationship | null;
  birthDate: string | null;
  role: AccessRole;
  permissions: Permissions;
  expiresAt: Date | null;
  /** Unités d'affichage choisies pour ce profil (valeurs toujours stockées en mg/dL et en %). */
  glucoseUnit: 'mg/dL' | 'mmol/L' | 'g/L';
  hba1cUnit: '%' | 'mmol/mol';
}

export interface Actor {
  accountId: string;
  email: string;
  displayName?: string | null;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

export function createProfilesService(cfg: ProfilesConfig) {
  const { sql, mailer } = cfg;
  const now = cfg.now ?? (() => new Date());
  const audit = (tx: TransactionSql, e: AuditEntry) => writeAudit(tx, now(), e);
  const appUrl = cfg.appUrl.replace(/\/$/, '');

  type Row = {
    access_id: string;
    profile_id: string;
    display_name: string;
    relationship: Relationship | null;
    birth_date: string | null;
    role: AccessRole;
    permissions: Permissions;
    expires_at: Date | null;
    glucose_unit: ProfileAccess['glucoseUnit'];
    hba1c_unit: ProfileAccess['hba1cUnit'];
  };
  const toAccess = (r: Row): ProfileAccess => ({
    accessId: r.access_id,
    profileId: r.profile_id,
    displayName: r.display_name,
    relationship: r.relationship,
    birthDate: r.birth_date,
    role: r.role,
    permissions: sanitizePermissions(r.permissions ?? {}),
    expiresAt: r.expires_at,
    glucoseUnit: r.glucose_unit,
    hba1cUnit: r.hba1c_unit,
  });

  // ───────────────────────── Lecture des accès ─────────────────────────
  async function listProfiles(accountId: string): Promise<ProfileAccess[]> {
    const rows = await sql<Row[]>`
      SELECT pa.id AS access_id, p.id AS profile_id, p.display_name, p.relationship, to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date,
             pa.role, pa.permissions, pa.expires_at, p.glucose_unit, p.hba1c_unit
      FROM profile_access pa JOIN profile p ON p.id = pa.profile_id AND p.deleted_at IS NULL
      WHERE pa.account_id = ${accountId} AND pa.revoked_at IS NULL AND (pa.expires_at IS NULL OR pa.expires_at > ${now()})
      ORDER BY (p.relationship = 'self' AND pa.role = 'owner') DESC NULLS LAST, (pa.role = 'owner') DESC, p.display_name`;
    return rows.map(toAccess);
  }

  async function getAccess(accountId: string, profileId: string): Promise<ProfileAccess | null> {
    if (!/^[0-9a-f-]{36}$/i.test(profileId)) return null;
    const [r] = await sql<Row[]>`
      SELECT pa.id AS access_id, p.id AS profile_id, p.display_name, p.relationship, to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date,
             pa.role, pa.permissions, pa.expires_at, p.glucose_unit, p.hba1c_unit
      FROM profile_access pa JOIN profile p ON p.id = pa.profile_id AND p.deleted_at IS NULL
      WHERE pa.account_id = ${accountId} AND pa.profile_id = ${profileId}
        AND pa.revoked_at IS NULL AND (pa.expires_at IS NULL OR pa.expires_at > ${now()})
      ORDER BY (pa.role = 'owner') DESC LIMIT 1`;
    return r ? toAccess(r) : null;
  }

  /** Unités d'affichage d'un profil : réglage du ou de la gestionnaire, appliqué pour tous ses lecteurs. */
  async function setDisplayUnits(actor: Actor, profileId: string, units: { glucose: string; hba1c: string }): Promise<Result> {
    await requireOwner(actor.accountId, profileId);
    if (!['mg/dL', 'mmol/L', 'g/L'].includes(units.glucose) || !['%', 'mmol/mol'].includes(units.hba1c)) return { ok: false, error: 'Unité invalide.' };
    await sql.begin(async (tx) => {
      await tx`UPDATE profile SET glucose_unit = ${units.glucose}, hba1c_unit = ${units.hba1c} WHERE id = ${profileId}`;
      await audit(tx, { accountId: actor.accountId, profileId, action: 'profile.units_changed', resource: 'profile', resourceId: profileId, context: units });
    });
    return { ok: true };
  }

  async function requireOwner(accountId: string, profileId: string): Promise<ProfileAccess> {
    const a = await getAccess(accountId, profileId);
    if (!a || a.role !== 'owner') throw new ForbiddenError('Seul·e le ou la gestionnaire du profil peut faire cela.');
    return a;
  }

  // ───────────────────────── Accès aux données (RLS + journal) ─────────────────────────
  /**
   * Exécute `fn` dans une transaction où PostgreSQL connaît le compte
   * (`app.account_id`) : la Row-Level Security filtre alors par profil ET par
   * module. Chaque accès est inscrit au journal consultable par le gestionnaire.
   */
  async function withProfileData<T>(
    actor: Pick<Actor, 'accountId'>,
    profileId: string,
    module: ModuleKey,
    mode: 'read' | 'write',
    fn: (tx: TransactionSql, access: ProfileAccess) => Promise<T>,
  ): Promise<T> {
    const access = await getAccess(actor.accountId, profileId);
    if (!access || !canAccess(access.role, access.permissions, module, mode)) {
      throw new ForbiddenError(`Vous n’avez pas accès à ce module (${MODULES.find((m) => m.key === module)?.label ?? module}).`);
    }
    return sql.begin(async (tx) => {
      await tx`SELECT set_config('app.account_id', ${actor.accountId}, true), set_config('app.profile_id', ${profileId}, true)`;
      await audit(tx, {
        accountId: actor.accountId,
        profileId,
        action: mode === 'read' ? 'data.read' : 'data.write',
        resource: module,
        resourceId: null,
      });
      return fn(tx, access);
    }) as Promise<T>;
  }

  // ───────────────────────── Profils de proches ─────────────────────────
  async function createRelativeProfile(
    actor: Actor,
    input: { displayName: string; relationship: string; birthDate?: string | null; legalBasis: string; attested: boolean },
  ): Promise<Result<{ profileId: string }>> {
    const displayName = input.displayName.trim();
    if (!displayName || displayName.length > 80) return { ok: false, error: 'Indiquez un prénom (80 caractères maximum).' };
    if (!(input.relationship in RELATIONSHIPS) || input.relationship === 'self') return { ok: false, error: 'Choisissez un lien avec cette personne.' };
    if (!(input.legalBasis in LEGAL_BASES)) return { ok: false, error: 'Indiquez sur quelle base vous gérez les données de cette personne.' };
    if (!input.attested) return { ok: false, error: 'Vous devez confirmer votre déclaration.' };
    if (input.legalBasis === 'parental_authority' && input.relationship !== 'child')
      return { ok: false, error: 'L’autorité parentale ne s’applique qu’à un enfant.' };
    let birthDate: string | null = null;
    if (input.birthDate) {
      const d = new Date(`${input.birthDate}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d > now() || d.getUTCFullYear() < 1900) return { ok: false, error: 'Date de naissance invalide.' };
      birthDate = input.birthDate;
      if (input.legalBasis === 'parental_authority') {
        const adult = new Date(d);
        adult.setUTCFullYear(adult.getUTCFullYear() + 18);
        if (adult <= now()) return { ok: false, error: 'Cette personne est majeure : l’autorité parentale ne s’applique plus. Demandez-lui son accord.' };
      }
    }
    const profileId = await sql.begin(async (tx) => {
      const [p] = await tx<{ id: string }[]>`
        INSERT INTO profile (display_name, birth_date, relationship, created_by)
        VALUES (${displayName}, ${birthDate}, ${input.relationship}, ${actor.accountId}) RETURNING id`;
      await tx`
        INSERT INTO profile_access (profile_id, account_id, role, legal_basis, legal_basis_attested_at, granted_by, granted_at, permissions)
        VALUES (${p!.id}, ${actor.accountId}, 'owner', ${input.legalBasis}, ${now()}, ${actor.accountId}, ${now()}, '{}'::jsonb)`;
      await audit(tx, {
        accountId: actor.accountId,
        profileId: p!.id,
        action: 'profile.created',
        resource: 'profile',
        resourceId: p!.id,
        context: { relationship: input.relationship, legalBasis: input.legalBasis },
      });
      return p!.id;
    });
    return { ok: true, profileId };
  }

  // ───────────────────────── Invitations ─────────────────────────
  async function invite(
    actor: Actor,
    profileId: string,
    input: { email: string; role: string; permissions: Record<string, unknown>; accessDays?: number | null },
  ): Promise<Result> {
    const owner = await requireOwner(actor.accountId, profileId);
    const email = normalizeEmail(input.email);
    if (!EMAIL_RE.test(email)) return { ok: false, error: 'Adresse e-mail invalide.' };
    if (email === normalizeEmail(actor.email)) return { ok: false, error: 'Vous ne pouvez pas vous inviter vous-même.' };
    if (input.role !== 'caregiver' && input.role !== 'guest_professional') return { ok: false, error: 'Rôle invalide.' };
    const permissions = sanitizePermissions(input.permissions);
    if (Object.keys(permissions).length === 0) return { ok: false, error: 'Accordez l’accès à au moins un module.' };
    if (input.role === 'guest_professional' && Object.values(permissions).some((v) => v === 'write'))
      return { ok: false, error: 'Un professionnel invité a un accès en lecture seule.' };

    const days = input.accessDays ?? null;
    if (input.role === 'guest_professional' && (days === null || days < 1 || days > PRO_ACCESS_MAX_DAYS))
      return { ok: false, error: `Pour un professionnel, choisissez une durée d’accès entre 1 et ${PRO_ACCESS_MAX_DAYS} jours.` };
    if (days !== null && (days < 1 || days > 3650)) return { ok: false, error: 'Durée d’accès invalide.' };

    const [already] = await sql`
      SELECT 1 FROM profile_access pa JOIN account a ON a.id = pa.account_id
      WHERE pa.profile_id = ${profileId} AND a.email = ${email} AND pa.revoked_at IS NULL
        AND (pa.expires_at IS NULL OR pa.expires_at > ${now()})`;
    if (already) return { ok: false, error: 'Cette personne a déjà accès à ce profil.' };

    const token = randomToken();
    const accessExpiresAt = days === null ? null : new Date(now().getTime() + days * DAY);
    await sql.begin(async (tx) => {
      await tx`
        UPDATE access_invitation SET revoked_at = ${now()}
        WHERE profile_id = ${profileId} AND invited_email = ${email} AND accepted_at IS NULL AND revoked_at IS NULL AND declined_at IS NULL`;
      const [inv] = await tx<{ id: string }[]>`
        INSERT INTO access_invitation (profile_id, invited_email, role, permissions, token_hash, created_by, created_at, expires_at, access_expires_at)
        VALUES (${profileId}, ${email}, ${input.role}, ${tx.json(permissions)}, ${sha256(token)}, ${actor.accountId}, ${now()},
                ${new Date(now().getTime() + INVITATION_DAYS * DAY)}, ${accessExpiresAt})
        RETURNING id`;
      await audit(tx, {
        accountId: actor.accountId,
        profileId,
        action: 'access.invited',
        resource: 'access_invitation',
        resourceId: inv!.id,
        context: { role: input.role, permissions, accessDays: days },
      });
    });
    const who = actor.displayName?.trim() || actor.email;
    await mailer.send({
      to: email,
      subject: `${who} vous invite sur BILANX`,
      text:
        `${who} vous invite à accéder au profil « ${owner.displayName} » sur BILANX` +
        `${input.role === 'guest_professional' ? ' en tant que professionnel·le de santé, en lecture seule' : ' en tant qu’aidant·e'}.\n\n` +
        `Pour voir le détail des autorisations et accepter ou refuser (lien valable ${INVITATION_DAYS} jours) :\n` +
        `${appUrl}/invitations?jeton=${encodeURIComponent(token)}\n\n` +
        `Vous devrez vous connecter avec cette adresse e-mail (ou créer un compte). Si vous ne connaissez pas cette personne, ignorez ce message.`,
    });
    return { ok: true };
  }

  interface InvitationRow {
    id: string;
    profile_id: string;
    profile_name: string;
    invited_email: string;
    role: 'caregiver' | 'guest_professional';
    permissions: Permissions;
    expires_at: Date;
    access_expires_at: Date | null;
    accepted_at: Date | null;
    revoked_at: Date | null;
    declined_at: Date | null;
    inviter_name: string | null;
    inviter_email: string;
    created_by: string;
  }
  const invitationByToken = (tx: Sql | TransactionSql, token: string, lock = false) =>
    tx<InvitationRow[]>`
      SELECT i.id, i.profile_id, p.display_name AS profile_name, i.invited_email, i.role, i.permissions, i.expires_at,
             i.access_expires_at, i.accepted_at, i.revoked_at, i.declined_at, i.created_by,
             a.email AS inviter_email,
             (SELECT p2.display_name FROM profile_access pa2 JOIN profile p2 ON p2.id = pa2.profile_id
               WHERE pa2.account_id = a.id AND pa2.role = 'owner' AND p2.relationship = 'self' LIMIT 1) AS inviter_name
      FROM access_invitation i
      JOIN profile p ON p.id = i.profile_id AND p.deleted_at IS NULL
      JOIN account a ON a.id = i.created_by
      WHERE i.token_hash = ${sha256(token)}
      ${lock ? tx`FOR UPDATE OF i` : tx``}`;

  function invitationStatus(r: InvitationRow): 'pending' | 'accepted' | 'revoked' | 'declined' | 'expired' {
    if (r.accepted_at) return 'accepted';
    if (r.revoked_at) return 'revoked';
    if (r.declined_at) return 'declined';
    if (r.expires_at <= now()) return 'expired';
    return 'pending';
  }

  async function previewInvitation(token: string) {
    const [r] = await invitationByToken(sql, token);
    if (!r) return null;
    return {
      status: invitationStatus(r),
      profileName: r.profile_name,
      invitedEmail: r.invited_email,
      inviter: r.inviter_name ?? r.inviter_email,
      role: r.role,
      permissions: sanitizePermissions(r.permissions ?? {}),
      accessExpiresAt: r.access_expires_at,
    };
  }

  async function respondToInvitation(actor: Actor, token: string, accept: boolean): Promise<Result<{ profileId?: string }>> {
    const res = await sql.begin(async (tx): Promise<Result<{ profileId?: string; notify?: InvitationRow }>> => {
      const [r] = await invitationByToken(tx, token, true);
      if (!r || invitationStatus(r) !== 'pending') return { ok: false, error: 'Cette invitation n’est plus valable (expirée, déjà utilisée ou retirée).' };
      if (normalizeEmail(r.invited_email) !== normalizeEmail(actor.email))
        return { ok: false, error: `Cette invitation a été envoyée à une autre adresse. Connectez-vous avec ${r.invited_email}.` };
      if (r.created_by === actor.accountId) return { ok: false, error: 'Vous ne pouvez pas accepter votre propre invitation.' };
      if (!accept) {
        await tx`UPDATE access_invitation SET declined_at = ${now()} WHERE id = ${r.id}`;
        await audit(tx, { accountId: actor.accountId, profileId: r.profile_id, action: 'access.declined', resource: 'access_invitation', resourceId: r.id });
        return { ok: true };
      }
      if (r.access_expires_at && r.access_expires_at <= now()) return { ok: false, error: 'La période d’accès prévue est déjà terminée.' };
      // Un accès existant (révoqué ou expiré) est remplacé par le nouveau.
      await tx`
        UPDATE profile_access SET revoked_at = ${now()}, revoked_by = ${actor.accountId}
        WHERE profile_id = ${r.profile_id} AND account_id = ${actor.accountId} AND role <> 'owner' AND revoked_at IS NULL`;
      const [acc] = await tx<{ id: string }[]>`
        INSERT INTO profile_access (profile_id, account_id, role, permissions, legal_basis, granted_by, granted_at, expires_at)
        VALUES (${r.profile_id}, ${actor.accountId}, ${r.role}, ${tx.json(sanitizePermissions(r.permissions ?? {}))},
                'invitation_by_owner', ${r.created_by}, ${now()}, ${r.access_expires_at})
        ON CONFLICT (profile_id, account_id, role) DO UPDATE
          SET permissions = EXCLUDED.permissions, legal_basis = EXCLUDED.legal_basis, granted_by = EXCLUDED.granted_by,
              granted_at = EXCLUDED.granted_at, expires_at = EXCLUDED.expires_at, revoked_at = NULL, revoked_by = NULL
        RETURNING id`;
      await tx`UPDATE access_invitation SET accepted_at = ${now()}, accepted_by = ${actor.accountId} WHERE id = ${r.id}`;
      await audit(tx, {
        accountId: actor.accountId,
        profileId: r.profile_id,
        action: 'access.granted',
        resource: 'profile_access',
        resourceId: acc!.id,
        context: { role: r.role, permissions: r.permissions, invitationId: r.id },
      });
      return { ok: true, profileId: r.profile_id, notify: r };
    });
    if (res.ok && res.notify) {
      await mailer.send({
        to: res.notify.inviter_email,
        subject: 'Invitation acceptée sur BILANX',
        text: `${actor.displayName?.trim() || actor.email} a accepté votre invitation au profil « ${res.notify.profile_name} ».\nVous pouvez modifier ou retirer cet accès à tout moment : ${appUrl}/famille/${res.notify.profile_id}`,
      });
    }
    return res.ok ? { ok: true, profileId: res.profileId } : res;
  }

  // ───────────────────────── Gestion des accès (gestionnaire) ─────────────────────────
  async function listAccesses(actor: Actor, profileId: string) {
    await requireOwner(actor.accountId, profileId);
    const accesses = await sql<
      { id: string; email: string; role: AccessRole; permissions: Permissions; granted_at: Date; expires_at: Date | null; legal_basis: string | null }[]
    >`
      SELECT pa.id, a.email, pa.role, pa.permissions, pa.granted_at, pa.expires_at, pa.legal_basis
      FROM profile_access pa JOIN account a ON a.id = pa.account_id
      WHERE pa.profile_id = ${profileId} AND pa.revoked_at IS NULL AND (pa.expires_at IS NULL OR pa.expires_at > ${now()})
      ORDER BY (pa.role = 'owner') DESC, pa.granted_at`;
    const invitations = await sql<
      { id: string; invited_email: string; role: AccessRole; permissions: Permissions; expires_at: Date; access_expires_at: Date | null; created_at: Date }[]
    >`
      SELECT i.id, i.invited_email, i.role, i.permissions, i.expires_at, i.access_expires_at, i.created_at
      FROM access_invitation i
      WHERE i.profile_id = ${profileId} AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.declined_at IS NULL AND i.expires_at > ${now()}
      ORDER BY i.created_at DESC`;
    return {
      accesses: accesses.map((a) => ({ ...a, permissions: sanitizePermissions(a.permissions ?? {}) })),
      invitations: invitations.map((i) => ({ ...i, permissions: sanitizePermissions(i.permissions ?? {}) })),
    };
  }

  async function targetAccess(tx: Sql | TransactionSql, profileId: string, accessId: string) {
    const [t] = await tx<{ id: string; role: AccessRole; email: string }[]>`
      SELECT pa.id, pa.role, a.email FROM profile_access pa JOIN account a ON a.id = pa.account_id
      WHERE pa.id = ${accessId} AND pa.profile_id = ${profileId} AND pa.revoked_at IS NULL`;
    return t;
  }

  async function updatePermissions(actor: Actor, profileId: string, accessId: string, raw: Record<string, unknown>): Promise<Result> {
    await requireOwner(actor.accountId, profileId);
    const t = await targetAccess(sql, profileId, accessId);
    if (!t || t.role === 'owner') return { ok: false, error: 'Accès introuvable.' };
    const permissions = sanitizePermissions(raw);
    if (t.role === 'guest_professional' && Object.values(permissions).some((v) => v === 'write'))
      return { ok: false, error: 'Un professionnel invité a un accès en lecture seule.' };
    if (Object.keys(permissions).length === 0) return { ok: false, error: 'Pour retirer tout accès, utilisez « Retirer l’accès ».' };
    await sql.begin(async (tx) => {
      await tx`UPDATE profile_access SET permissions = ${tx.json(permissions)} WHERE id = ${accessId}`;
      await audit(tx, { accountId: actor.accountId, profileId, action: 'access.permissions_changed', resource: 'profile_access', resourceId: accessId, context: { permissions } });
    });
    return { ok: true };
  }

  async function revokeAccess(actor: Actor, profileId: string, accessId: string): Promise<Result> {
    const owner = await requireOwner(actor.accountId, profileId);
    const t = await targetAccess(sql, profileId, accessId);
    if (!t || t.role === 'owner') return { ok: false, error: 'Accès introuvable.' };
    await sql.begin(async (tx) => {
      await tx`UPDATE profile_access SET revoked_at = ${now()}, revoked_by = ${actor.accountId} WHERE id = ${accessId}`;
      await audit(tx, { accountId: actor.accountId, profileId, action: 'access.revoked', resource: 'profile_access', resourceId: accessId });
    });
    await mailer.send({
      to: t.email,
      subject: 'Votre accès à un profil BILANX a été retiré',
      text: `Votre accès au profil « ${owner.displayName} » a été retiré par son ou sa gestionnaire.`,
    });
    return { ok: true };
  }

  async function revokeInvitation(actor: Actor, profileId: string, invitationId: string): Promise<Result> {
    await requireOwner(actor.accountId, profileId);
    const r = await sql.begin(async (tx) => {
      const rows = await tx`
        UPDATE access_invitation SET revoked_at = ${now()}
        WHERE id = ${invitationId} AND profile_id = ${profileId} AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`;
      if (rows.length) await audit(tx, { accountId: actor.accountId, profileId, action: 'access.invitation_revoked', resource: 'access_invitation', resourceId: invitationId });
      return rows.length;
    });
    return r ? { ok: true } : { ok: false, error: 'Invitation introuvable.' };
  }

  /** Un aidant ou un professionnel peut renoncer lui-même à son accès. */
  async function leaveProfile(actor: Actor, profileId: string): Promise<Result> {
    const a = await getAccess(actor.accountId, profileId);
    if (!a) return { ok: false, error: 'Accès introuvable.' };
    if (a.role === 'owner') return { ok: false, error: 'Le ou la gestionnaire ne peut pas quitter son propre profil.' };
    await sql.begin(async (tx) => {
      await tx`UPDATE profile_access SET revoked_at = ${now()}, revoked_by = ${actor.accountId} WHERE id = ${a.accessId}`;
      await audit(tx, { accountId: actor.accountId, profileId, action: 'access.left', resource: 'profile_access', resourceId: a.accessId });
    });
    return { ok: true };
  }

  /** Journal d'accès d'un profil, visible par son ou sa gestionnaire. */
  async function accessLog(actor: Actor, profileId: string, limit = 50) {
    await requireOwner(actor.accountId, profileId);
    return sql<{ occurred_at: Date; email: string | null; action: string; resource: string }[]>`
      SELECT l.occurred_at, a.email, l.action, l.resource
      FROM audit_log l LEFT JOIN account a ON a.id = l.account_id
      WHERE l.profile_id = ${profileId}
      ORDER BY l.id DESC LIMIT ${limit}`;
  }

  return {
    listProfiles,
    setDisplayUnits,
    getAccess,
    withProfileData,
    createRelativeProfile,
    invite,
    previewInvitation,
    respondToInvitation,
    listAccesses,
    updatePermissions,
    revokeAccess,
    revokeInvitation,
    leaveProfile,
    accessLog,
  };
}

export type ProfilesService = ReturnType<typeof createProfilesService>;
