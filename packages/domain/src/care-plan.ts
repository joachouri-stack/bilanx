/**
 * Suivis réguliers : un rendez-vous à refaire à intervalle fixe (« tous les 3 mois ») ou chaque année
 * à un mois donné (« en juillet »). Calcule la prochaine échéance, la date du rappel « prendre RDV »
 * et l'état (à jour, à prendre, en retard, RDV pris). Aucune recommandation médicale : les fréquences
 * sont celles que la personne choisit.
 *
 * Toutes les dates sont des jours locaux « AAAA-MM-JJ ».
 */

export interface CarePlanInput {
  label: string;
  icon?: string | null;
  specialty?: string | null;
  everyMonths?: number | null;
  fixedMonth?: number | null;
  remindDays?: number | null;
  lastDone?: string | null;
  labAnalyte?: string | null;
}

export interface CarePlanValue {
  label: string;
  icon: string;
  specialty: string | null;
  everyMonths: number | null;
  fixedMonth: number | null;
  remindDays: number;
  lastDone: string | null;
  labAnalyte: string | null;
}

export type CarePlanErrors = Partial<Record<'label' | 'frequency' | 'remindDays' | 'lastDone', string>>;

export const CARE_PLAN_ICONS = ['calendar', 'tooth', 'flask', 'vessel', 'drop', 'foot', 'eye', 'heart', 'brain', 'ear', 'kidney', 'user'] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

export function validateCarePlan(input: CarePlanInput, today: string): { ok: true; value: CarePlanValue } | { ok: false; errors: CarePlanErrors } {
  const errors: CarePlanErrors = {};
  const label = (input.label ?? '').trim().replace(/\s+/g, ' ');
  if (!label) errors.label = 'Donnez un nom au suivi (ex. « Détartrage »).';
  else if (label.length > 80) errors.label = 'Nom trop long (80 caractères au plus).';
  const every = input.everyMonths ?? null;
  const fixed = input.fixedMonth ?? null;
  if ((every === null) === (fixed === null)) errors.frequency = 'Choisissez une fréquence : tous les N mois, ou chaque année à un mois donné.';
  else if (every !== null && (!Number.isInteger(every) || every < 1 || every > 60)) errors.frequency = 'Fréquence entre 1 et 60 mois.';
  else if (fixed !== null && (!Number.isInteger(fixed) || fixed < 1 || fixed > 12)) errors.frequency = 'Mois invalide.';
  const remind = input.remindDays ?? 30;
  if (!Number.isInteger(remind) || remind < 0 || remind > 180) errors.remindDays = 'Rappel entre 0 et 180 jours avant.';
  const lastDone = input.lastDone?.trim() || null;
  if (lastDone && (!validIso(lastDone) || lastDone > today)) errors.lastDone = 'Date du dernier passage invalide (pas dans le futur).';
  if (Object.keys(errors).length) return { ok: false, errors };
  const icon = (CARE_PLAN_ICONS as readonly string[]).includes(input.icon ?? '') ? input.icon! : 'calendar';
  return {
    ok: true,
    value: {
      label,
      icon,
      specialty: input.specialty?.trim().slice(0, 80) || null,
      everyMonths: every,
      fixedMonth: fixed,
      remindDays: remind,
      lastDone,
      labAnalyte: input.labAnalyte?.trim().slice(0, 40) || null,
    },
  };
}

// ───────────────────────── Dates ─────────────────────────
const toUtc = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
export const shiftDays = (s: string, n: number) => fromUtc(toUtc(s) + n * 86_400_000);

/** Ajoute des mois en gardant le jour (31 janv. + 1 mois → 28/29 févr.). */
export function addMonthsIso(s: string, n: number): string {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7)) - 1 + n;
  const d = Number(s.slice(8, 10));
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(year, month, Math.min(d, last)));
}

const monthStart = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-01`;
const monthEnd = (year: number, month: number) => fromUtc(Date.UTC(year, month, 0));

// ───────────────────────── État ─────────────────────────
export type CareStatus = 'booked' | 'late' | 'soon' | 'ok' | 'unknown';

export interface CarePlanFacts {
  everyMonths: number | null;
  fixedMonth: number | null;
  remindDays: number;
  /** Dernier passage connu : date saisie, rendez-vous passé lié, ou dernière analyse liée (la plus récente). */
  lastDone: string | null;
  /** Prochain rendez-vous déjà pris pour ce suivi (jour), s'il y en a un. */
  nextBooked: string | null;
}

export interface CarePlanState {
  status: CareStatus;
  /** Échéance : date à laquelle le passage est attendu (null si le dernier passage est inconnu). */
  due: string | null;
  /** Jour du rappel « prendre RDV ». */
  remindOn: string | null;
  /** Jours restants avant l'échéance (négatif : retard). */
  daysToDue: number | null;
  /** Avancement entre le dernier passage et l'échéance (0 à 1). */
  progress: number | null;
  /** Position du rappel sur la même échelle (0 à 1). */
  remindAt: number | null;
}

/** Prochaine échéance d'un suivi. */
export function carePlanDue(f: Pick<CarePlanFacts, 'everyMonths' | 'fixedMonth' | 'lastDone'>, today: string): string | null {
  if (f.everyMonths) return f.lastDone ? addMonthsIso(f.lastDone, f.everyMonths) : null;
  const m = f.fixedMonth!;
  const y = Number(today.slice(0, 4));
  const slot = monthStart(y, m);
  // Passage déjà fait pour le créneau de cette année (jusqu'à 4 mois en avance) : l'an prochain.
  if (f.lastDone && f.lastDone >= addMonthsIso(slot, -4)) return monthStart(y + 1, m);
  if (today > monthEnd(y, m)) return f.lastDone ? slot : monthStart(y + 1, m);
  return slot;
}

export function carePlanState(f: CarePlanFacts, today: string): CarePlanState {
  const due = carePlanDue(f, today);
  if (!due) return { status: f.nextBooked ? 'booked' : 'unknown', due: null, remindOn: null, daysToDue: null, progress: null, remindAt: null };
  const remindOn = shiftDays(due, -f.remindDays);
  const start = f.lastDone ?? addMonthsIso(due, -(f.everyMonths ?? 12));
  const span = Math.max(1, daysBetween(start, due));
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const daysToDue = daysBetween(today, due);
  const status: CareStatus = f.nextBooked ? 'booked' : daysToDue < 0 ? 'late' : today >= remindOn ? 'soon' : 'ok';
  return {
    status,
    due,
    remindOn,
    daysToDue,
    progress: clamp(daysBetween(start, today) / span),
    remindAt: clamp(daysBetween(start, remindOn) / span),
  };
}

/** Suivis proposés au démarrage (fréquences modifiables). */
export interface CarePlanPreset extends CarePlanInput {
  key: string;
  /** Coché d'avance dans la liste de démarrage. */
  suggested: boolean;
}

export const CARE_PLAN_PRESETS: CarePlanPreset[] = [
  { key: 'diabeto', label: 'Diabétologue', icon: 'drop', specialty: 'Diabétologue', everyMonths: 3, remindDays: 30, suggested: true },
  { key: 'hba1c', label: 'Prise de sang HbA1c', icon: 'flask', specialty: 'Laboratoire', everyMonths: 3, remindDays: 14, labAnalyte: 'hba1c', suggested: true },
  { key: 'podologue', label: 'Podologue', icon: 'foot', specialty: 'Podologue', everyMonths: 4, remindDays: 21, suggested: true },
  { key: 'pied', label: 'Pied (thrombose)', icon: 'vessel', specialty: null, fixedMonth: 7, remindDays: 30, suggested: true },
  { key: 'detartrage', label: 'Détartrage', icon: 'tooth', specialty: 'Dentiste', everyMonths: 12, remindDays: 30, suggested: true },
  { key: 'ophtalmo', label: 'Ophtalmologue', icon: 'eye', specialty: 'Ophtalmologue', everyMonths: 12, remindDays: 45, suggested: false },
  { key: 'cardio', label: 'Cardiologue', icon: 'heart', specialty: 'Cardiologue', everyMonths: 12, remindDays: 45, suggested: false },
];

export const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « Tous les 3 mois », « 1 fois par an », « Chaque année en juillet ». */
export function carePlanFrequency(p: { everyMonths: number | null; fixedMonth: number | null }): string {
  if (p.fixedMonth) return `Chaque année en ${MONTHS_FR[p.fixedMonth - 1]}`;
  const n = p.everyMonths!;
  if (n === 12) return '1 fois par an';
  if (n === 24) return 'Tous les 2 ans';
  if (n === 6) return 'Tous les 6 mois';
  return `Tous les ${n} mois`;
}
