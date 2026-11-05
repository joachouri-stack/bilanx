import type { Metadata } from 'next';
import Link from 'next/link';
import { addDays, compareLocalDates, formatLocalDate, formatNumberFr, parseLocalDate } from '@bilanx/domain';
import { isOngoing, type DoseOfDay, type MedicationRow } from '@bilanx/records';
import { demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { medicationDay, medicationFollowUp, medicationList } from '@/lib/server/medication-data';
import { recordIntakeAction } from '@/lib/server/actions';
import { reminders } from '@/lib/server/auth';
import { ReminderSetup } from '@/components/reminder-setup';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { MedicationForm } from '@/components/medication-forms';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Médicaments' };

const FOLLOW = [7, 30] as const;
const fmtDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'medium' });
const dateFr = (iso: string) => fmtD.format(new Date(`${iso}T12:00:00Z`));

function MedRow({ m }: { m: MedicationRow }) {
  const today = formatLocalDate(demoToday());
  const ongoing = isOngoing(m, today);
  const ended = m.stoppedOn
    ? `${ongoing ? 'arrêt prévu le' : 'arrêté le'} ${dateFr(m.stoppedOn)}`
    : m.endDate
      ? `jusqu’au ${dateFr(m.endDate)}`
      : null;
  return (
    <li>
      <Link href={`/medicaments/${m.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-surface-2">
        <span className="min-w-0">
          <span className="block font-medium">
            {m.name}
            {m.strength && <span className="font-normal text-ink-2"> · {m.strength}</span>}
          </span>
          <span className="block text-sm text-ink-2">{m.posology}</span>
          <span className="block text-xs text-ink-3">
            {m.schedule.length ? `Prises : ${m.schedule.map((s) => s.time.replace(':', ' h ')).join(', ')}` : 'Sans horaire fixe (si besoin, ou prise espacée)'}
            {ended ? ` · ${ended}` : ''}
          </span>
        </span>
        <span className="shrink-0 whitespace-nowrap">
          {ongoing && m.startDate && m.startDate > today ? <Chip tone="petrol">à partir du {dateFr(m.startDate)}</Chip> : ongoing ? <Chip tone="sage">en cours</Chip> : <Chip tone="neutral">{m.status === 'stopped' ? 'arrêté' : 'terminé'}</Chip>}
        </span>
      </Link>
    </li>
  );
}

function DoseRow({ d, jour, canWrite }: { d: DoseOfDay; jour: string; canWrite: boolean }) {
  const label = d.status === 'taken' ? 'prise' : d.status === 'skipped' ? 'non prise' : null;
  const btn = 'min-h-10 rounded-xl px-3 text-sm font-medium';
  const form = (status: string, children: React.ReactNode, className: string) => (
    <form action={recordIntakeAction}>
      <input type="hidden" name="medicationId" value={d.medicationId} />
      <input type="hidden" name="at" value={d.at.toISOString()} />
      <input type="hidden" name="jour" value={jour} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="min-w-0">
        <span className="tabular mr-2 font-semibold">{d.time.replace(':', ' h ')}</span>
        <span className="font-medium">{d.name}</span>
        {d.strength && <span className="text-ink-2"> · {d.strength}</span>}
        {d.qty && <span className="block text-xs text-ink-3">{d.qty}</span>}
      </span>
      <span className="flex items-center gap-2">
        {label ? (
          <>
            <Chip tone={d.status === 'taken' ? 'sage' : 'amber'}>{label}</Chip>
            {canWrite && form('clear', 'Annuler', 'rounded-lg px-2 py-1 text-xs text-ink-3 underline')}
          </>
        ) : !canWrite ? (
          <Chip tone="neutral">{d.recordable || d.at.getTime() <= Date.now() ? 'non renseignée' : 'à venir'}</Chip>
        ) : d.recordable ? (
          <>
            {form('taken', <>✓ Prise</>, `${btn} bg-sage-2 text-sage`)}
            {form('skipped', 'Non prise', `${btn} bg-surface-2 text-ink-2`)}
          </>
        ) : (
          <Chip tone="neutral">à venir</Chip>
        )}
      </span>
    </li>
  );
}

export default async function MedicationsPage({ searchParams }: { searchParams: Promise<{ jour?: string; suivi?: string; supprime?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'medications')) return <ModuleForbidden title="Médicaments" profileName={name} />;
  const sp = await searchParams;
  const isDemo = ctx.active.kind === 'demo';
  const canWrite = !isDemo && moduleAllowed(ctx.active, 'medications', 'write');
  const now = new Date();
  const today = demoToday(now);
  const asked = sp.jour ? parseLocalDate(sp.jour) : null;
  const day = asked && compareLocalDates(asked, today) <= 0 && compareLocalDates(asked, addDays(today, -366)) >= 0 ? asked : today;
  const jour = formatLocalDate(day);
  const follow = (FOLLOW as readonly number[]).includes(Number(sp.suivi)) ? Number(sp.suivi) : 7;

  const [{ current, past }, doses, f] = await Promise.all([medicationList(ctx), medicationDay(ctx, day, now), medicationFollowUp(ctx, follow, now)]);
  const reminderPrefs = ctx.active.kind === 'real' ? await reminders().prefs(ctx.user, ctx.active.access.profileId) : null;
  const isToday = compareLocalDates(day, today) === 0;
  const prev = formatLocalDate(addDays(day, -1));
  const next = formatLocalDate(addDays(day, 1));

  return (
    <div className="fade-in">
      <PageHeader title="Médicaments" subtitle={`Profil : ${name}${isDemo ? ' (démonstration, données fictives)' : ''}`} />
      {sp.supprime && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Saisie supprimée.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2" id="prises">
              <h2 className="font-semibold first-letter:uppercase">
                Prises {isToday ? 'du jour' : `du ${fmtDay.format(new Date(`${jour}T12:00:00Z`))}`}
              </h2>
              <nav aria-label="Jour" className="flex items-center gap-1 text-sm">
                <Link href={`/medicaments?jour=${prev}`} className="rounded-lg px-2.5 py-1.5 hover:bg-surface-2" aria-label="Jour précédent">
                  ←
                </Link>
                {!isToday && (
                  <Link href="/medicaments" className="rounded-lg px-2.5 py-1.5 hover:bg-surface-2">
                    Aujourd’hui
                  </Link>
                )}
                {!isToday && (
                  <Link href={`/medicaments?jour=${next}`} className="rounded-lg px-2.5 py-1.5 hover:bg-surface-2" aria-label="Jour suivant">
                    →
                  </Link>
                )}
              </nav>
            </div>
            {doses.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">Aucune prise à heure fixe prévue ce jour-là.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {doses.map((d) => (
                  <DoseRow key={`${d.medicationId}-${d.time}`} d={d} jour={jour} canWrite={canWrite} />
                ))}
              </ul>
            )}
            <Meta className="mt-2">
              Une prise peut être notée dès une heure avant l’horaire prévu. Ce suivi est un aide-mémoire : il ne remplace pas l’avis de votre
              médecin ou pharmacien en cas d’oubli.
            </Meta>
          </Card>

          <Card>
            <h2 className="font-semibold">Traitements en cours</h2>
            {current.length ? (
              <ul className="mt-1 divide-y divide-line">{current.map((m) => <MedRow key={m.id} m={m} />)}</ul>
            ) : (
              <p className="mt-2 text-sm text-ink-3">Aucun traitement enregistré.</p>
            )}
          </Card>
          {past.length > 0 && (
            <Card>
              <h2 className="font-semibold">Historique</h2>
              <ul className="mt-1 divide-y divide-line">{past.map((m) => <MedRow key={m.id} m={m} />)}</ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Suivi des prises</h2>
              <nav aria-label="Période du suivi" className="inline-flex rounded-xl bg-surface-2 p-1 text-sm">
                {FOLLOW.map((p) => (
                  <Link
                    key={p}
                    href={`/medicaments?suivi=${p}${isToday ? '' : `&jour=${jour}`}`}
                    aria-current={p === follow ? 'page' : undefined}
                    className={`rounded-lg px-3 py-1 ${p === follow ? 'bg-surface shadow-sm' : 'text-ink-3'}`}
                  >
                    {p} j
                  </Link>
                ))}
              </nav>
            </div>
            {f.planned === 0 ? (
              <p className="mt-2 text-sm text-ink-3">Aucune prise à heure fixe prévue sur cette période.</p>
            ) : (
              <>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="tabular text-4xl font-semibold">{f.takenPctOfRecorded === null ? '—' : formatNumberFr(f.takenPctOfRecorded, 0)}</span>
                  <span className="text-sm text-ink-3">% des prises renseignées</span>
                </p>
                <div className="my-2 flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${f.taken} prises, ${f.skipped} non prises, ${f.unrecorded} non renseignées`}>
                  <div className="bg-sage" style={{ width: `${(f.taken / f.planned) * 100}%` }} />
                  <div className="bg-amber" style={{ width: `${(f.skipped / f.planned) * 100}%` }} />
                </div>
                <ul className="tabular space-y-0.5 text-sm">
                  <li>
                    <span className="mr-1.5 inline-block size-2.5 rounded-sm bg-sage" /> {f.taken} prise{f.taken > 1 ? 's' : ''}
                  </li>
                  <li>
                    <span className="mr-1.5 inline-block size-2.5 rounded-sm bg-amber" /> {f.skipped} non prise{f.skipped > 1 ? 's' : ''}
                  </li>
                  <li>
                    <span className="mr-1.5 inline-block size-2.5 rounded-sm bg-surface-2 ring-1 ring-line" /> {f.unrecorded} non renseignée{f.unrecorded > 1 ? 's' : ''}
                  </li>
                </ul>
                <Meta className="mt-2">
                  Sur {f.planned} prise{f.planned > 1 ? 's' : ''} prévue{f.planned > 1 ? 's' : ''} jusqu’à maintenant. Une prise non renseignée n’est pas
                  comptée comme oubliée : BILANX ne sait simplement pas.
                </Meta>
              </>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold" id="rappels">
              🔔 Rappels sur ce téléphone
            </h2>
            {reminderPrefs ? (
              <ReminderSetup vapidKey={reminders().vapidPublicKey()} enabled={reminderPrefs.enabled} showNames={reminderPrefs.showNames} profileName={name} />
            ) : (
              <p className="text-sm text-ink-3">Non disponible pour le profil de démonstration.</p>
            )}
          </Card>
          <Card>
            <h2 className="mb-1 font-semibold">Ajouter un traitement</h2>
            {isDemo ? (
              <p className="text-sm text-ink-3">Le profil de démonstration est en lecture seule. Choisissez votre profil pour enregistrer vos traitements.</p>
            ) : !canWrite ? (
              <p className="text-sm text-ink-3">Vous pouvez consulter ces traitements, mais pas les modifier.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-ink-3">
                  Recopiez l’ordonnance. BILANX ne propose et ne modifie jamais un traitement : tout changement se décide avec votre médecin.
                </p>
                <MedicationForm initial={{ slots: [{ time: '08:00', qty: '' }] }} mode="create" today={formatLocalDate(today)} />
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
