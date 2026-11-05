import type { AgpHour, DailyInsulin, GlucoseStats, StepsDay, StepsStats } from '@bilanx/domain';

export type Source = 'manual' | 'document' | 'import' | 'demo';

export interface ReportLab {
  analyte: string;
  value: number;
  comparator: string | null;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  sampledAt: Date;
  laboratory: string | null;
  source: Source;
}

export interface ReportData {
  profile: { name: string; birthDate: string | null; relationship: string | null };
  period: { from: string; to: string; days: number }; // AAAA-MM-JJ
  generatedAt: Date;
  generatedBy: string;
  timeZone: string;
  isDemo: boolean;
  /** Modules non autorisés pour l'auteur du rapport (indiqués comme tels, jamais remplis). */
  notAuthorized: string[];
  glucose?: {
    stats: GlucoseStats;
    agp: AgpHour[];
    capillaryCount: number;
    source: Source;
    targets: { low: number; high: number };
  };
  hba1c?: ReportLab[]; // historique complet (pour l'évolution), dates réelles uniquement
  lab?: ReportLab[]; // résultats de la période (hors HbA1c)
  insulin?: {
    days: DailyInsulin[];
    total: number;
    averagePerRecordedDay: number | null;
    daysWithData: number;
    rapidSharePct: number | null;
    products: { name: string; type: string }[];
    changes: { date: string; subject: string; previous: string | null; next: string; prescribedBy: string | null; goal: string | null }[];
    source: Source;
  };
  activity?: { days: StepsDay[]; goal: number; stats: StepsStats; source: Source; devices: string[] };
  journal?: { at: Date; endedAt: Date | null; title: string; detail: string }[];
  appointments?: { at: Date; who: string; location: string | null; notesAfter: string | null; upcoming: boolean }[];
}

export const SECTION_KEYS = ['glucose', 'hba1c', 'lab', 'insulin', 'activity', 'journal', 'appointments'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const SECTION_LABELS: Record<SectionKey, string> = {
  glucose: 'Glycémie (capteur)',
  hba1c: 'HbA1c de laboratoire',
  lab: 'Autres résultats d’analyses',
  insulin: 'Insuline et évolution du traitement',
  activity: 'Activité physique (pas)',
  journal: 'Journal des repas et événements',
  appointments: 'Rendez-vous',
};
