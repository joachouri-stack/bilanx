/** Modules de données pouvant être partagés séparément. */
export const MODULES = [
  { key: 'glucose', label: 'Glycémie' },
  { key: 'lab', label: 'Analyses & bilans' },
  { key: 'insulin', label: 'Insuline & évolution du traitement' },
  { key: 'medications', label: 'Médicaments' },
  { key: 'journal', label: 'Journal & repas' },
  { key: 'activity', label: 'Activité & pas' },
  { key: 'documents', label: 'Documents' },
  { key: 'appointments', label: 'Rendez-vous' },
  { key: 'reports', label: 'Rapports' },
] as const;

export type ModuleKey = (typeof MODULES)[number]['key'];
export type ModuleRight = 'none' | 'read' | 'write';
export type Permissions = Partial<Record<ModuleKey, ModuleRight>>;
export type AccessRole = 'owner' | 'self' | 'caregiver' | 'guest_professional';

export const MODULE_KEYS = MODULES.map((m) => m.key) as readonly ModuleKey[];

export function isModuleKey(k: string): k is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(k);
}

/** Ne conserve que les modules et droits connus ; tout le reste est ignoré. */
export function sanitizePermissions(input: Record<string, unknown>): Permissions {
  const out: Permissions = {};
  for (const [k, v] of Object.entries(input)) {
    if (isModuleKey(k) && (v === 'read' || v === 'write')) out[k] = v;
  }
  return out;
}

export function canAccess(role: AccessRole, permissions: Permissions, module: ModuleKey, mode: 'read' | 'write'): boolean {
  if (role === 'owner') return true;
  const right = permissions[module];
  return mode === 'read' ? right === 'read' || right === 'write' : right === 'write';
}

export const RELATIONSHIPS = {
  self: 'Moi',
  parent: 'Parent',
  child: 'Enfant',
  spouse: 'Conjoint·e',
  sibling: 'Frère ou sœur',
  grandparent: 'Grand-parent',
  other: 'Autre proche',
} as const;
export type Relationship = keyof typeof RELATIONSHIPS;

/** Bases légales qu'un aidant peut déclarer pour créer le profil d'un proche. */
export const LEGAL_BASES = {
  consent_of_person: 'La personne concernée m’a donné son accord pour que je suive ses données de santé.',
  parental_authority: 'J’exerce l’autorité parentale sur cet enfant mineur.',
  legal_protection: 'Je suis désigné·e par une mesure de protection juridique (tutelle, habilitation familiale…) qui le permet.',
} as const;
export type LegalBasis = keyof typeof LEGAL_BASES;

export const ROLE_LABELS: Record<AccessRole, string> = {
  owner: 'Gestionnaire du profil',
  self: 'Personne concernée',
  caregiver: 'Aidant·e autorisé·e',
  guest_professional: 'Professionnel·le invité·e',
};
