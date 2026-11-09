import { cookies } from 'next/headers';
import type { SessionInfo } from '@bilanx/auth';
import { canAccess, type ModuleKey, type ProfileAccess } from '@bilanx/profiles';
import { profiles, requireUser } from './auth';

export const PROFILE_COOKIE = 'bilanx_profil';
export const DEMO_PROFILE_ID = 'demo';

export type ActiveProfile =
  | { kind: 'demo' }
  | { kind: 'real'; access: ProfileAccess };

export interface AppContext {
  user: SessionInfo;
  profiles: ProfileAccess[];
  active: ActiveProfile;
}

/**
 * Session complète + profil affiché. Le choix du profil (cookie) est toujours
 * revalidé contre les accès actifs : un accès révoqué cesse immédiatement.
 */
export async function appContext(): Promise<AppContext> {
  const user = await requireUser();
  const list = await profiles().listProfiles(user.accountId);
  const wanted = (await cookies()).get(PROFILE_COOKIE)?.value;
  let active: ActiveProfile;
  if (wanted === DEMO_PROFILE_ID && demoEnabled(list.length)) active = { kind: 'demo' };
  else {
    const found = list.find((p) => p.profileId === wanted) ?? list[0];
    active = found ? { kind: 'real', access: found } : { kind: 'demo' };
  }
  return { user, profiles: list, active };
}

/**
 * Profil de démonstration (« Claire », données fictives) : masqué dès que le compte a un vrai profil.
 * BILANX_DEMO=1 le réaffiche (tests de bout en bout, présentation).
 */
export function demoEnabled(realProfiles: number): boolean {
  return process.env.BILANX_DEMO === '1' || realProfiles === 0;
}

export function moduleAllowed(active: ActiveProfile, module: ModuleKey, mode: 'read' | 'write' = 'read'): boolean {
  return active.kind === 'demo' || canAccess(active.access.role, active.access.permissions, module, mode);
}

/** Correspondance des pages de navigation avec les modules de données. */
export const NAV_MODULES: Record<string, ModuleKey> = {
  '/glycemie': 'glucose',
  '/hba1c': 'lab',
  '/analyses': 'lab',
  '/traitements': 'insulin',
  '/medicaments': 'medications',
  '/activite': 'activity',
  '/salle-de-sport': 'activity',
  '/poids': 'activity',
  '/journal': 'journal',
  '/documents': 'documents',
  '/ordonnances': 'documents',
  '/rendez-vous': 'appointments',
  '/rapports': 'reports',
};

/** Unités d'affichage du profil affiché (démonstration : mg/dL et %). */
export function displayUnits(active: ActiveProfile): { glucose: 'mg/dL' | 'mmol/L' | 'g/L'; hba1c: '%' | 'mmol/mol' } {
  return active.kind === 'real' ? { glucose: active.access.glucoseUnit, hba1c: active.access.hba1cUnit } : { glucose: 'mg/dL', hba1c: '%' };
}
