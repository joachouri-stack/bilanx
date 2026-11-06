'use client';

import { useFormStatus } from 'react-dom';
import { buttonClass } from './ui';

/**
 * Éléments communs aux deux formulaires de validation (valeurs d'un bilan, traitements d'une ordonnance).
 */

/** Confirmer / Ignorer, en bas de chaque ligne, sur deux colonnes égales. */
export function DecisionButtons({ value, onChange, label }: { value: 'confirm' | 'ignore' | null; onChange: (v: 'confirm' | 'ignore') => void; label: string }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={label}>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'confirm'}
        onClick={() => onChange('confirm')}
        className={buttonClass({ variant: value === 'confirm' ? 'primary' : 'secondary', className: value === 'confirm' ? '!bg-sage' : '' })}
      >
        Confirmer
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'ignore'}
        onClick={() => onChange('ignore')}
        className={buttonClass({ variant: 'secondary', className: value === 'ignore' ? '!bg-surface-2 !text-ink ring-2 ring-ink-3' : '' })}
      >
        Ignorer
      </button>
    </div>
  );
}

/** Classes communes des lignes à valider (bordure selon la décision ou les alertes). */
export function rowClass(action: 'confirm' | 'ignore' | null, alert: 'block' | 'warn' | null): string {
  const border = action === 'confirm' ? 'border-sage bg-sage-2/40' : action === 'ignore' ? 'border-line opacity-70' : alert === 'block' ? 'border-red' : alert === 'warn' ? 'border-amber' : 'border-line';
  return `rounded-2xl border p-3.5 ${border}`;
}

/**
 * Barre d'enregistrement collante en bas de l'écran (au-dessus de la barre d'onglets sur téléphone) :
 * rappelle combien de lignes restent à traiter.
 */
export function StickySaveBar({ undecided, disabled, pending, children }: { undecided: number; disabled: boolean; pending: string; children: React.ReactNode }) {
  const s = useFormStatus();
  return (
    <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 rounded-2xl border border-line bg-surface p-3 shadow-lg lg:bottom-3">
      <p className="mb-2 text-center text-sm text-ink-2" aria-live="polite">
        {undecided ? `Encore ${undecided} ligne${undecided > 1 ? 's' : ''} à traiter` : 'Toutes les lignes sont traitées.'}
      </p>
      <button type="submit" disabled={s.pending || disabled} className={buttonClass({ variant: 'primary', className: 'w-full' })}>
        {s.pending ? pending : children}
      </button>
    </div>
  );
}
