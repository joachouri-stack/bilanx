'use client';

import { useActionState, useState } from 'react';
import { createStepsTokenAction, revokeStepsTokenAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';
import { Icon } from './icon';
import { buttonClass } from './ui';

export interface StepsTokenView {
  id: string;
  label: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 2000);
        } catch {
          /* presse-papiers indisponible : l'utilisateur sélectionne le texte */
        }
      }}
      className={buttonClass({ variant: 'secondary', className: 'shrink-0 !px-4' })}
      aria-label={label}
    >
      <Icon name={done ? 'check' : 'document'} className="size-4" />
      {done ? 'Copié' : 'Copier'}
    </button>
  );
}

function Value({ text, label }: { text: string; label: string }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[13px]">{text}</code>
      <Copy text={text} label={label} />
    </div>
  );
}

/**
 * Envoi automatique des pas depuis l'iPhone : un Raccourci lit le total du jour dans Apple Santé
 * et l'envoie à BILANX avec une clé personnelle (créée ici, révocable).
 */
export function StepsSync({ endpoint, tokens }: { endpoint: string; tokens: StepsTokenView[] }) {
  const [state, action] = useActionState(createStepsTokenAction, {} as FormState);
  const token = state.token;
  const fmt = (iso: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-4 text-[15px]">
      <p className="text-ink-2">
        Un raccourci de l’app <strong className="text-ink">Raccourcis</strong> lit le total de vos pas dans Apple Santé et l’envoie ici chaque soir, tout seul. À
        régler une seule fois.
      </p>

      {tokens.length > 0 && !token && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {t.label} <span className="font-mono text-[13px] text-ink-3">…{t.hint}</span>
                </span>
                <span className="block text-[13px] text-ink-3">{t.lastUsedAt ? `Dernier envoi : ${fmt(t.lastUsedAt)}` : 'Jamais utilisée pour l’instant'}</span>
              </span>
              <form action={revokeStepsTokenAction}>
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" className="min-h-11 px-2 text-sm font-medium text-red" aria-label={`Révoquer la clé ${t.label}`}>
                  Révoquer
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {!token && (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="label" value="iPhone" />
          {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
          <SubmitButton pendingLabel="Création…">{tokens.length ? 'Créer une nouvelle clé' : 'Créer ma clé d’envoi'}</SubmitButton>
        </form>
      )}

      {token && (
        <div className="flex flex-col gap-4">
          <Alert tone="success">Clé créée. Copiez-la maintenant : elle ne sera plus jamais affichée.</Alert>
          <div>
            <p className="text-sm font-medium">Votre clé</p>
            <Value text={`Bearer ${token}`} label="Copier la clé" />
          </div>
          <div>
            <p className="text-sm font-medium">Adresse d’envoi</p>
            <Value text={endpoint} label="Copier l’adresse d’envoi" />
          </div>
        </div>
      )}

      <details className="group rounded-xl border border-line" open={!!token}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden">
          Régler le raccourci sur l’iPhone (5 min)
          <Icon name="chevronDown" className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
        </summary>
        <ol className="flex list-decimal flex-col gap-3 px-3 pb-4 pl-8 pt-1 text-[15px] leading-snug marker:font-semibold marker:text-petrol">
          <li>
            Ouvrez l’app <strong>Raccourcis</strong>, onglet <strong>Automatisation</strong>, puis <strong>＋</strong> (ou <strong>Nouvelle automatisation</strong>).
          </li>
          <li>
            Choisissez <strong>Heure de la journée</strong> : <strong>22:00</strong>, <strong>Quotidiennement</strong>, et cochez <strong>Exécuter immédiatement</strong>.
            Touchez <strong>Suivant</strong>, puis <strong>Nouveau raccourci vide</strong>.
          </li>
          <li>
            Ajoutez l’action <strong>Rechercher des échantillons de santé</strong> :
            <ul className="mt-1 list-disc pl-5 text-ink-2">
              <li>
                Type : <strong className="text-ink">Nombre de pas</strong>
              </li>
              <li>
                Filtre : <strong className="text-ink">Date de début</strong> est <strong className="text-ink">aujourd’hui</strong>
              </li>
              <li>
                Grouper par : <strong className="text-ink">Jour</strong> (indispensable : évite de compter deux fois iPhone et Apple Watch)
              </li>
            </ul>
          </li>
          <li>
            Ajoutez l’action <strong>Obtenir le contenu de l’URL</strong> :
            <ul className="mt-1 list-disc pl-5 text-ink-2">
              <li>
                URL : collez l’<strong className="text-ink">adresse d’envoi</strong>
              </li>
              <li>
                Méthode : <strong className="text-ink">POST</strong>
              </li>
              <li>
                En-têtes : nom <strong className="text-ink">Authorization</strong>, valeur : collez <strong className="text-ink">votre clé</strong> (elle commence par
                « Bearer »)
              </li>
              <li>
                Corps de la requête : <strong className="text-ink">JSON</strong>, ajoutez un champ <strong className="text-ink">Texte</strong> nommé{' '}
                <strong className="text-ink">pas</strong>, valeur : la variable <strong className="text-ink">Échantillons de santé</strong>
              </li>
            </ul>
          </li>
          <li>
            Touchez <strong>▶︎</strong> pour essayer : autorisez l’accès à Santé, la réponse doit contenir <code className="font-mono text-sm">&quot;ok&quot;:true</code>. Le total
            apparaît alors sur cette page.
          </li>
        </ol>
        <p className="px-3 pb-4 text-[13px] text-ink-3">
          Chaque envoi remplace le total du jour : l’envoyer plusieurs fois ne crée pas de doublon. Si l’iPhone est verrouillé à 22 h, iOS peut bloquer la lecture
          de Santé : choisissez alors plutôt le déclencheur <strong>App</strong> › <strong>Est ouverte</strong> avec une app que vous ouvrez chaque soir.
        </p>
      </details>
    </div>
  );
}
