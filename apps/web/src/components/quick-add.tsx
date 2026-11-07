'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { QuickAddItem } from '@/lib/navigation';
import { DOC_SHORTCUTS } from '@/lib/document-categories';
import { toggleGymAction } from '@/lib/server/actions';
import { Icon } from './icon';
import { DocIcon } from './documents-icons';

const CHIP: Record<QuickAddItem['tone'] | 'amber' | 'neutral', string> = {
  glucose: 'bg-glucose-2 text-glucose',
  petrol: 'bg-petrol-2 text-petrol',
  sage: 'bg-sage-2 text-sage',
  violet: 'bg-violet-2 text-violet',
  rose: 'bg-rose-2 text-rose',
  indigo: 'bg-indigo-2 text-indigo',
  amber: 'bg-amber-2 text-amber',
  neutral: 'bg-surface text-ink-2',
};

/** Ajout d'un document dans un dossier : ouvre le formulaire d'ajout déjà présélectionné (catégorie, examen, spécialité ou dossier). */
const uploadHref = (href: string) => (href === '/ordonnances' ? '/documents?cat=ordonnances' : href) + '#ajouter';

const tile =
  'flex h-full min-h-24 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 p-3 text-center text-[15px] font-medium leading-tight transition active:scale-[0.98] disabled:opacity-60';

/**
 * Contenu de la feuille « Ajouter » (bouton ＋ de la barre du bas).
 * - Chaque pastille a la couleur de sa carte du tableau de bord.
 * - « Séance de sport » coche la séance d'aujourd'hui sans quitter la page.
 * - « Document ou photo » propose d'abord le dossier, puis ouvre l'ajout déjà rangé au bon endroit.
 */
export function QuickAddContent({ items, onDone }: { items: QuickAddItem[]; onDone: () => void }) {
  const [step, setStep] = useState<'main' | 'documents'>('main');
  const [gymDone, setGymDone] = useState(false);
  const [pending, start] = useTransition();
  const top = useRef<HTMLDivElement>(null);
  // Changement d'écran : on remonte en haut de la feuille (sinon « Retour » reste caché).
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, [step]);

  useEffect(() => {
    if (!gymDone) return;
    const t = window.setTimeout(onDone, 1200);
    return () => window.clearTimeout(t);
  }, [gymDone, onDone]);

  const noteGym = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('day', new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()));
      fd.set('present', '1');
      await toggleGymAction(fd);
      setGymDone(true);
    });

  if (step === 'documents')
    return (
      <div ref={top} className="scroll-mt-20">
        <button type="button" onClick={() => setStep('main')} className="mb-3 inline-flex min-h-11 items-center gap-1 font-medium text-petrol">
          <span aria-hidden>‹</span> Retour
        </button>
        <h3 className="mb-3 text-[15px] font-semibold">Dans quel dossier ?</h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DOC_SHORTCUTS.map((s) => (
            <li key={s.key}>
              <Link href={uploadHref(s.href)} onClick={onDone} className="flex min-h-14 items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[15px] font-medium leading-tight active:scale-[0.98]">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${CHIP[s.tone]}`} aria-hidden>
                  <DocIcon name={s.icon} className="size-5" />
                </span>
                {s.label}
              </Link>
            </li>
          ))}
          <li className="col-span-2 sm:col-span-3">
            <Link href="/documents#ajouter" onClick={onDone} className="flex min-h-12 items-center justify-center rounded-xl border border-dashed border-line px-3 text-[15px] font-medium text-ink-2">
              Autre document (je ne sais pas)
            </Link>
          </li>
        </ul>
      </div>
    );

  return (
    <div ref={top} className="scroll-mt-20">
      {gymDone && (
        <p role="status" className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-sage-2 px-4 py-3 font-semibold text-sage">
          <Icon name="check" className="size-5" strokeWidth={2.4} />
          Séance du jour notée
        </p>
      )}
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {items.map((q) => {
          const chip = (
            <span className={`grid size-10 place-items-center rounded-full ${CHIP[q.tone]}`} aria-hidden>
              <Icon name={q.svg} className="size-6" />
            </span>
          );
          if (q.special === 'gym')
            return (
              <li key={q.href}>
                <button type="button" onClick={noteGym} disabled={pending || gymDone} className={tile}>
                  {chip}
                  {pending ? 'Enregistrement…' : gymDone ? 'Séance notée ✓' : 'Séance de sport aujourd’hui'}
                </button>
              </li>
            );
          if (q.special === 'documents')
            return (
              <li key={q.href} className="col-span-2 sm:col-span-3">
                <button type="button" onClick={() => setStep('documents')} className={`${tile} !min-h-16 !flex-row !justify-start gap-3 px-4 text-left`}>
                  {chip}
                  <span className="flex-1">
                    {q.label}
                    <span className="block text-[13px] font-normal text-ink-3">Ordonnance, bilan, imagerie, mutuelle…</span>
                  </span>
                  <span aria-hidden className="text-xl text-ink-3">›</span>
                </button>
              </li>
            );
          return (
            <li key={q.href}>
              <Link href={q.href} onClick={onDone} className={tile}>
                {chip}
                {q.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
