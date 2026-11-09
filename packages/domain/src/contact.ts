/**
 * Contacts des professionnels de santé : validation de la saisie et liens directs
 * (appeler, écrire, itinéraire GPS). Aucun service tiers n'est contacté par BILANX :
 * les liens ouvrent l'application du téléphone (Téléphone, Mail, Plans / Google Maps / Waze).
 */

export interface ContactInput {
  firstName?: string;
  lastName?: string;
  specialty?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export type ContactErrors = Partial<Record<keyof ContactInput, string>>;

export interface ValidContact {
  firstName: string | null;
  lastName: string | null;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Chiffres du numéro, avec le « + » international éventuel : « 01 23-45.67 89 » → « 0123456789 ». */
export function phoneDigits(phone: string): string {
  const t = phone.trim();
  return (t.startsWith('+') ? '+' : '') + t.replace(/\D/g, '');
}

/**
 * Numéro affiché par groupes de deux chiffres (format français) quand c'est un numéro français
 * à 10 chiffres ; sinon tel que saisi.
 */
export function formatPhone(phone: string): string {
  const d = phoneDigits(phone);
  if (/^0\d{9}$/.test(d)) return d.replace(/(\d{2})(?=\d)/g, '$1 ');
  if (/^\+33\d{9}$/.test(d)) return `+33 ${d.slice(3, 4)} ${d.slice(4).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
  return phone.trim();
}

export function validateContact(input: ContactInput): { ok: true; value: ValidContact } | { ok: false; errors: ContactErrors } {
  const errors: ContactErrors = {};
  const text = (v: string | undefined, max: number, k: keyof ContactInput) => {
    const s = v?.trim().replace(/\s+/g, ' ') || null;
    if (s && s.length > max) errors[k] = `${max} caractères maximum.`;
    return s;
  };
  const firstName = text(input.firstName, 80, 'firstName');
  const lastName = text(input.lastName, 80, 'lastName');
  const specialty = text(input.specialty, 80, 'specialty');
  const phone = text(input.phone, 30, 'phone');
  const email = text(input.email, 254, 'email')?.toLowerCase() ?? null;
  const address = input.address?.trim() || null;
  if (address && address.length > 300) errors.address = '300 caractères maximum.';
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 1000) errors.notes = '1000 caractères maximum.';
  if (!firstName && !lastName) errors.lastName = 'Indiquez au moins le nom ou le prénom.';
  if (phone && !errors.phone) {
    const d = phoneDigits(phone);
    if (!/^[+\d\s().\-/]+$/.test(phone) || d.replace('+', '').length < 3 || d.replace('+', '').length > 15) errors.phone = 'Numéro de téléphone invalide.';
  }
  if (email && !errors.email && !EMAIL.test(email)) errors.email = 'Adresse e-mail invalide.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { firstName, lastName, specialty, phone, email, address, notes } };
}

/** Nom affiché : « Dr » n'est pas ajouté (la spécialité peut être kiné, laboratoire…). */
export function contactName(c: { firstName: string | null; lastName: string | null }): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Contact';
}

/** Initiales pour la pastille : « Claire Martin » → « CM ». */
export function contactInitials(c: { firstName: string | null; lastName: string | null }): string {
  const i = (s: string | null) => (s?.trim()[0] ?? '').toUpperCase();
  return i(c.firstName) + i(c.lastName) || '?';
}

/** Lien « appeler » : tel:0123456789. */
export function telHref(phone: string): string {
  return `tel:${phoneDigits(phone)}`;
}

/** Lien « écrire » : ouvre l'application Mail avec le destinataire rempli. */
export function mailtoHref(email: string): string {
  return `mailto:${encodeURIComponent(email.trim()).replace(/%40/g, '@')}`;
}

/** Itinéraires vers l'adresse : Google Maps (tous téléphones), Plans d'Apple (iPhone) et Waze. */
export function mapsLinks(address: string): { google: string; apple: string; waze: string } {
  const q = encodeURIComponent(address.replace(/\s+/g, ' ').trim());
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: `https://maps.apple.com/?daddr=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}
