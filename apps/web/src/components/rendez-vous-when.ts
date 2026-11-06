import { DEMO_TIMEZONE } from '@/lib/demo-data';

const fmtDate = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit' });

/** Date et heure d'un rendez-vous : « jeudi 19 novembre 2026 à 10 h 30 ». */
export const appointmentWhen = (d: Date) => `${fmtDate.format(d)} à ${fmtTime.format(d).replace(':', ' h ')}`;
