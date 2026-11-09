import type { Adherence, AgpHour, DailyInsulin, GlucoseStats, GlucoseUnit, LabQualitative, MeterStats, StepsDay, StepsStats } from '@bilanx/domain';

export type Source = 'manual' | 'document' | 'import' | 'demo';

export interface ReportLab {
  analyte: string;
  /** Null pour un résultat seulement qualitatif (sérologie « Négatif »). */
  value: number | null;
  qualitative?: LabQualitative | null;
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
    /** Nombre de glycémies du lecteur (doigt) sur la période. */
    capillaryCount: number;
    /**
     * Glycémies du lecteur (doigt), saisies à la main : statistiques à part (jamais mêlées au capteur)
     * et liste datée avec le moment de la mesure (`fasting`, `after_meal`…).
     */
    meter?: { stats: MeterStats; readings: { at: Date; mgdl: number; context: string | null }[]; source: Source };
    source: Source;
    targets: { low: number; high: number };
    /** Unité d'affichage choisie pour le profil (valeurs fournies en mg/dL). Défaut : mg/dL. */
    unit?: GlucoseUnit;
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
  medications?: {
    items: {
      name: string;
      strength: string | null;
      posology: string;
      times: string[];
      startDate: string | null;
      endDate: string | null;
      stoppedOn: string | null;
      stopReason: string | null;
      prescriber: string | null;
    }[];
    adherence: Adherence;
    source: Source;
  };
  activity?: { days: StepsDay[]; goal: number; stats: StepsStats; source: Source; /** Des jours ont été saisis à la main. */ manual?: boolean; devices: string[] };
  journal?: { at: Date; endedAt: Date | null; title: string; detail: string }[];
  appointments?: { at: Date; who: string; location: string | null; notesAfter: string | null; upcoming: boolean }[];
}

export const SECTION_KEYS = ['glucose', 'hba1c', 'lab', 'insulin', 'medications', 'activity', 'journal', 'appointments'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const SECTION_LABELS: Record<SectionKey, string> = {
  glucose: 'Glycémie (capteur et lecteur)',
  hba1c: 'HbA1c de laboratoire',
  lab: 'Autres résultats d’analyses',
  insulin: 'Insuline et évolution du traitement',
  medications: 'Médicaments',
  activity: 'Activité physique (pas)',
  journal: 'Journal des repas et événements',
  appointments: 'Rendez-vous',
};
