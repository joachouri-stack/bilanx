/** Libellés partagés par la carte du tableau de bord et la page Salle de sport. */
import { formatNumberFr, GYM_WEEKLY_GOAL, type GymWeekStatus } from '@bilanx/domain';

export const GYM_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const GYM_WEEKDAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);
/** « lundi 2 novembre ». */
export const gymDayLong = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(utc(iso));
/** « 2 novembre ». */
export const gymDayMonth = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(utc(iso));
/** « novembre 2026 ». */
export const gymMonthName = (year: number, month: number, withYear = true) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', ...(withYear ? { year: 'numeric' } : {}) }).format(new Date(Date.UTC(year, month - 1, 15)));

export const gymPlural = (n: number, one: string, many = `${one}s`) => `${formatNumberFr(n)} ${n > 1 ? many : one}`;

/** « Encore 2 séances » / « Objectif atteint ». */
export const gymRemainingLabel = (w: GymWeekStatus) => (w.reached ? 'Objectif atteint' : `Encore ${gymPlural(w.remaining, 'séance')}`);

/** Phrase d'une semaine pour les lecteurs d'écran : « Semaine du 2 novembre : 2 séances sur 3, en cours ». */
export function gymWeekSentence(w: GymWeekStatus): string {
  const state = w.future ? 'à venir' : w.reached ? 'objectif atteint' : w.current ? 'en cours' : 'objectif non atteint';
  return `Semaine du ${gymDayMonth(w.start)} : ${gymPlural(w.count, 'séance')} sur ${GYM_WEEKLY_GOAL}, ${state}`;
}

/** Couleur du trait d'une semaine : vert si atteinte, rouge sinon (semaine en cours comprise), neutre si à venir. */
export const gymWeekBar = (w: GymWeekStatus) => (w.future ? 'bg-line' : w.reached ? 'bg-sage' : 'bg-red');
