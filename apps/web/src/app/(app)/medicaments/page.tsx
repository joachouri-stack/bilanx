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
import { Button, Card, CardHeader, Chip, EmptyState, Meta, PageHeader, Segmented } from '@/components/ui';
import { DayNav } from '@/components/day-nav';
import { Icon } from '@/components/icon';
import { MedicationForm } from '@/components/medication-forms';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Médicaments' };

const FOLLOW = [7, 30] as const;
const fmtDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'medium' });
const dateFr = (iso: string) => fmtD.format(new Date(`${iso}T12:00:00Z`));
const hh = (t: string) => t.replace(':', ' h ');
const n = (v: number, one: string, many: string) => `${v} ${v > 1 ? many : one}`;

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
      <Link href={`/medicaments/${m.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-surface-2">
        <span className="min-w-0">
          <span className="block font-medium">
            {m.name}
            {m.strength && <span className="font-normal text-ink-2"> · {m.strength}</span>}
          </span>
          <span className="block text-sm text-ink-2">{m.posology}</span>
          <Meta>
            {m.schedule.length ? `Prises : ${m.schedule.map((s) => hh(s.time)).join(', ')}` : 'Sans horaire fixe'}
            {ended ? ` · ${ended}` : ''}
          </Meta>
          {ongoing && m.startDate && m.startDate > today ? (
            <span className="mt-1 inline-block">
              <Chip tone="petrol">à partir du {dateFr(m.startDate)}</Chip>
            </span>
          ) : !ongoing ? (
            <span className="mt-1 inline-block">
              <Chip tone="neutral">{m.status === 'stopped' ? 'arrêté' : 'terminé'}</Chip>
            </span>
          ) : null}
        </span>
        <Icon name="chevronRight" className="size-5 shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}

function DoseRow({ d, jour, canWrite }: { d: DoseOfDay; jour: string; canWrite: boolean }) {
  const label = d.status === 'taken' ? 'prise' : d.status === 'skipped' ? 'non prise' : null;
  const form = (status: string, children: React.ReactNode, variant: 'primary' | 'secondary' | 'ghost', ariaLabel?: string) => (
    <form action={recordIntakeAction} className="min-w-0 flex-1 sm:flex-none">
      <input type="hidden" name="medicationId" value={d.medicationId} />
      <input type="hidden" name="at" value={d.at.toISOString()} />
      <input type="hidden" name="jour" value={jour} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant} aria-label={ariaLabel} className="w-full sm:w-auto">
        {children}
      </Button>
    </form>
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
      <span className="min-w-0">
        <span className="tabular mr-2 font-semibold">{hh(d.time)}</span>
        <span className="font-medium">{d.name}</span>
        {d.strength && <span className="text-ink-2"> · {d.strength}</span>}
        {d.qty && <Meta>{d.qty}</Meta>}
      </span>
      <span className="flex w-full items-center gap-2 sm:w-auto">
        {label ? (
          <>
            <Chip tone={d.status === 'taken' ? 'sage' : 'amber'}>{label}</Chip>
            {canWrite && <span className="ml-auto sm:ml-0">{form('clear', 'Annuler', 'ghost')}</span>}
          </>
        ) : !canWrite ? (
          <Chip tone="neutral">{d.recordable || d.at.getTime() <= Date.now() ? 'non notée' : 'à venir'}</Chip>
        ) : d.recordable ? (
          <>
            {form(
              'taken',
              <>
                <Icon name="check" className="size-5" /> Prise
              </>,
              'primary',
            )}
            {form('skipped', 'Non prise', 'secondary')}
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
  const minDay = addDays(today, -366);
  const asked = sp.jour ? parseLocalDate(sp.jour) : null;
  const day = asked && compareLocalDates(asked, today) <= 0 && compareLocalDates(asked, minDay) >= 0 ? asked : today;
  const jour = formatLocalDate(day);
  const follow = (FOLLOW as readonly number[]).includes(Number(sp.suivi)) ? Number(sp.suivi) : 7;

  const [{ current, past }, doses, f] = await Promise.all([medicationList(ctx), medicationDay(ctx, day, now), medicationFollowUp(ctx, follow, now)]);
  const reminderPrefs = ctx.active.kind === 'real' ? await reminders().prefs(ctx.user, ctx.active.access.profileId) : null;
  const isToday = compareLocalDates(day, today) === 0;
  const hasAny = current.length + past.length > 0;
  const todayIso = formatLocalDate(today);

  const addCard = (
    <Card id="ajouter-medicament" className="scroll-mt-20">
      <CardHeader title="Ajouter un médicament" />
      {isDemo ? (
        <p className="text-sm text-ink-2">Le profil de démonstration est en lecture seule. Choisissez votre profil pour enregistrer vos médicaments.</p>
      ) : !canWrite ? (
        <p className="text-sm text-ink-2">Vous pouvez consulter ces médicaments, mais pas les modifier.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-2">Recopiez l’ordonnance. BILANX ne propose et ne modifie jamais un traitement.</p>
          <MedicationForm initial={{ slots: [{ time: '08:00', qty: '' }] }} mode="create" today={todayIso} />
        </>
      )}
    </Card>
  );

  return (
    <div className="fade-in">
      <PageHeader title="Médicaments" />
      {sp.supprime && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Médicament supprimé.
        </p>
      )}
      {!hasAny ? (
        <div className="flex max-w-2xl flex-col gap-4" id="prises">
          <EmptyState title="Aucun médicament enregistré." description="Ajoutez vos médicaments pour noter chaque prise et recevoir des rappels." />
          {addCard}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card id="prises" className="scroll-mt-20">
              <h2 className="mb-3 text-[17px] font-semibold leading-6 first-letter:uppercase">
                Prises {isToday ? 'du jour' : `du ${fmtDay.format(new Date(`${jour}T12:00:00Z`))}`}
              </h2>
              <DayNav
                basePath="/medicaments"
                param="jour"
                value={jour}
                min={formatLocalDate(minDay)}
                max={todayIso}
                prevHref={compareLocalDates(day, minDay) > 0 ? `/medicaments?jour=${formatLocalDate(addDays(day, -1))}` : undefined}
                nextHref={isToday ? undefined : `/medicaments?jour=${formatLocalDate(addDays(day, 1))}`}
                todayHref="/medicaments#prises"
                label="Jour des prises"
              />
              {doses.length === 0 ? (
                <p className="mt-3 text-sm text-ink-2">Aucune prise à heure fixe prévue ce jour-là.</p>
              ) : (
                <ul className="mt-1 divide-y divide-line">
                  {doses.map((d) => (
                    <DoseRow key={`${d.medicationId}-${d.time}`} d={d} jour={jour} canWrite={canWrite} />
                  ))}
                </ul>
              )}
              <Meta className="mt-2">Une prise peut être notée dès une heure avant l’horaire prévu. En cas d’oubli, demandez conseil à votre médecin ou pharmacien.</Meta>
            </Card>

            <Card>
              <CardHeader title="Mes médicaments en cours" />
              {current.length ? <ul className="divide-y divide-line">{current.map((m) => <MedRow key={m.id} m={m} />)}</ul> : <p className="text-sm text-ink-2">Aucun médicament en cours.</p>}
            </Card>
            {past.length > 0 && (
              <Card>
                <CardHeader title="Historique" />
                <ul className="divide-y divide-line">{past.map((m) => <MedRow key={m.id} m={m} />)}</ul>
              </Card>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader title="Suivi des prises" />
              <Segmented
                label="Période du suivi"
                items={FOLLOW.map((p) => ({ href: `/medicaments?suivi=${p}${isToday ? '' : `&jour=${jour}`}`, label: `${p} jours`, current: p === follow }))}
              />
              {f.planned === 0 ? (
                <p className="mt-3 text-sm text-ink-2">Aucune prise à heure fixe prévue sur cette période.</p>
              ) : (
                <>
                  {/* Même base que la barre ci-dessous : toutes les prises prévues de la période. */}
                  <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="tabular text-4xl font-semibold">{f.taken}</span>
                    <span className="text-ink-2">
                      {f.taken > 1 ? 'prises faites' : 'prise faite'} sur {f.planned} {f.planned > 1 ? 'prévues' : 'prévue'}
                    </span>
                  </p>
                  {f.takenPctOfRecorded !== null && f.unrecorded > 0 && (
                    <Meta>
                      Parmi les prises notées, {formatNumberFr(f.takenPctOfRecorded, 0)} % ont été faites. « Non notée » ne veut pas dire « oubliée ».
                    </Meta>
                  )}
                  <div className="my-2 flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${n(f.taken, 'prise', 'prises')}, ${n(f.skipped, 'non prise', 'non prises')}, ${n(f.unrecorded, 'non notée', 'non notées')}`}>
                    <div className="bg-sage" style={{ width: `${(f.taken / f.planned) * 100}%` }} />
                    <div className="bg-amber" style={{ width: `${(f.skipped / f.planned) * 100}%` }} />
                  </div>
                  <ul className="tabular space-y-0.5 text-sm">
                    <li>
                      <span className="mr-1.5 inline-block size-2.5 rounded-sm bg-sage" aria-hidden /> {n(f.taken, 'prise', 'prises')}
                    </li>
                    <li>
                      <span className="mr-1.5 inline-block size-2.5 rounded-sm bg-amber" aria-hidden /> {n(f.skipped, 'non prise', 'non prises')}
                    </li>
                    <li>
                      <span className="mr-1.5 inline-block size-2.5 rounded-sm bg-surface-2 ring-1 ring-line" aria-hidden /> {n(f.unrecorded, 'non notée', 'non notées')}
                    </li>
                  </ul>
                  <Meta className="mt-2">
                    Sur {n(f.planned, 'prise prévue', 'prises prévues')} jusqu’à maintenant. Une prise non notée n’est pas comptée comme oubliée.
                  </Meta>
                </>
              )}
            </Card>
            <Card id="rappels" className="scroll-mt-20">
              <CardHeader title="Rappels sur ce téléphone" />
              {reminderPrefs ? (
                <ReminderSetup vapidKey={reminders().vapidPublicKey()} enabled={reminderPrefs.enabled} showNames={reminderPrefs.showNames} profileName={name} />
              ) : (
                <p className="text-sm text-ink-2">Non disponible pour le profil de démonstration.</p>
              )}
            </Card>
            {addCard}
          </div>
        </div>
      )}
    </div>
  );
}
