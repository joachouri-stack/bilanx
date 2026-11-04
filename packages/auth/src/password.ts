import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id (algorithme par défaut de @node-rs/argon2, vérifié par les tests),
 * paramètres ≥ recommandations OWASP (m = 19 MiB, t = 2, p = 1).
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** Haché factice : utilisé quand le compte n'existe pas, pour un temps de réponse comparable. */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword('bilanx-dummy-password-for-timing');
  return dummy;
}

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const COMMON = new Set([
  'motdepasse123', 'motdepasse1234', '123456789012', 'azertyuiop12', 'azertyuiopqs', 'password1234',
  'passwordpassword', 'qwertyuiop12', 'bonjour12345', 'soleil123456', 'motdepassebilanx', 'bilanx123456',
  'aaaaaaaaaaaa', '000000000000', '111111111111', 'iloveyou1234', 'administrateur',
]);

/**
 * Règles NIST SP 800-63B : longueur plutôt que complexité imposée, refus des
 * mots de passe triviaux. La vérification contre les fuites connues (service
 * k-anonymat) est prévue côté serveur avant ouverture publique.
 */
export function passwordProblems(password: string, email?: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN) problems.push(`Au moins ${PASSWORD_MIN} caractères.`);
  if (password.length > PASSWORD_MAX) problems.push(`Au plus ${PASSWORD_MAX} caractères.`);
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) problems.push('Ce mot de passe est trop courant.');
  if (email && lower.includes(email.toLowerCase().split('@')[0] ?? '\u0000') && (email.split('@')[0]?.length ?? 0) >= 4)
    problems.push('Le mot de passe ne doit pas contenir votre adresse e-mail.');
  return problems;
}
