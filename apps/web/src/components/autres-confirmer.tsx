import { buttonClass } from './ui';

/**
 * Suppression en deux temps, sans JavaScript : « Supprimer » révèle « Confirmer la suppression ».
 * `action` : action serveur ; `fields` : champs cachés envoyés avec le formulaire.
 */
export function ConfirmDelete({
  action,
  fields,
  label = 'Supprimer',
  confirmLabel = 'Confirmer la suppression',
  summaryAriaLabel,
  confirmAriaLabel,
  question,
  className = '',
}: {
  action: (fd: FormData) => void | Promise<void>;
  fields?: Record<string, string | number>;
  label?: string;
  confirmLabel?: string;
  summaryAriaLabel?: string;
  confirmAriaLabel?: string;
  /** Phrase courte au-dessus du bouton de confirmation. */
  question?: string;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary aria-label={summaryAriaLabel} className={buttonClass({ variant: 'ghost', className: 'cursor-pointer list-none text-red hover:bg-red-2 [&::-webkit-details-marker]:hidden' })}>
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline">Annuler</span>
      </summary>
      <form action={action} className="mt-2 flex flex-col items-start gap-2">
        {Object.entries(fields ?? {}).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {question && <p className="text-sm text-ink-2">{question}</p>}
        <button type="submit" aria-label={confirmAriaLabel} className={buttonClass({ variant: 'danger' })}>
          {confirmLabel}
        </button>
      </form>
    </details>
  );
}
