import type { Metadata } from "next";
import Link from "next/link";
import {
  addDays,
  compareLocalDates,
  dayBounds,
  formatLocalDate,
  formatNumberFr,
  monthlyAverages,
  parseLocalDate,
  stepsSeries,
  stepsStats,
  type LocalDate,
} from "@bilanx/domain";
import { DEMO_TIMEZONE, demoToday } from "@/lib/demo-data";
import { appContext, moduleAllowed } from "@/lib/server/context";
import {
  manualSteps,
  stepsDaily,
  stepsGoal,
  stepsHourly,
  stepsSource,
} from "@/lib/server/activity-data";
import { clearActivityAction, removeStepsAction } from "@/lib/server/actions";
import {
  Button,
  Card,
  Chip,
  Meta,
  PageHeader,
  Segmented,
} from "@/components/ui";
import { DayNav } from "@/components/day-nav";
import { Icon } from "@/components/icon";
import { StepsBars, type Bar } from "@/components/steps-bars";
import {
  AppleHealthImport,
  GoalForm,
  ManualStepsForm,
} from "@/components/activity-forms";
import { ConfirmDelete } from "@/components/autres-confirmer";
import { ModuleForbidden } from "@/components/module-forbidden";
import { ProgressRing } from "@/components/progress-ring";
import { Disclosure } from "@/components/disclosure";
import { StepsSync } from "@/components/steps-sync";
import { apiTokens } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Activité & Pas" };

type View = "jour" | "semaine" | "mois" | "annee";
const VIEWS: [View, string][] = [
  ["jour", "Jour"],
  ["semaine", "Semaine"],
  ["mois", "Mois"],
  ["annee", "Année"],
];
const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];
const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const PREV_LABEL: Record<View, string> = {
  jour: "la semaine précédente",
  semaine: "la semaine précédente",
  mois: "le mois précédent",
  annee: "l’année précédente",
};

/** Bornes de la période contenant `d` pour la vue choisie (semaine du lundi au dimanche). */
function range(
  view: View,
  d: LocalDate,
): { from: LocalDate; to: LocalDate; prev: LocalDate; next: LocalDate } {
  if (view === "jour")
    return { from: d, to: d, prev: addDays(d, -1), next: addDays(d, 1) };
  if (view === "semaine") {
    const dow =
      (new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() + 6) % 7;
    const from = addDays(d, -dow);
    return {
      from,
      to: addDays(from, 6),
      prev: addDays(from, -7),
      next: addDays(from, 7),
    };
  }
  if (view === "mois") {
    const from = { year: d.year, month: d.month, day: 1 };
    const to = addDays(
      {
        year: d.month === 12 ? d.year + 1 : d.year,
        month: d.month === 12 ? 1 : d.month + 1,
        day: 1,
      },
      -1,
    );
    return { from, to, prev: addDays(from, -1), next: addDays(to, 1) };
  }
  return {
    from: { year: d.year, month: 1, day: 1 },
    to: { year: d.year, month: 12, day: 31 },
    prev: { year: d.year - 1, month: 12, day: 31 },
    next: { year: d.year + 1, month: 1, day: 1 },
  };
}

const plural = (n: number, one: string, many: string) =>
  `${formatNumberFr(n)} ${n > 1 ? many : one}`;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; date?: string; efface?: string }>;
}) {
  const ctx = await appContext();
  const name =
    ctx.active.kind === "real" ? ctx.active.access.displayName : "Claire";
  if (!moduleAllowed(ctx.active, "activity"))
    return <ModuleForbidden title="Activité & Pas" profileName={name} />;
  const sp = await searchParams;
  const now = new Date();
  const today = demoToday(now);
  const view: View =
    (["jour", "semaine", "mois", "annee"] as const).find((v) => v === sp.vue) ??
    "semaine";
  let day = (sp.date && parseLocalDate(sp.date)) || today;
  if (compareLocalDates(day, today) > 0) day = today;
  const { from, to, prev, next } = range(view, day);
  // Période de comparaison : la semaine (vues jour et semaine), le mois ou l'année précédents.
  const cmpView: View = view === "jour" ? "semaine" : view;
  const cmp = range(cmpView, day);
  const before = range(cmpView, cmp.prev);
  const isDemo = ctx.active.kind === "demo";
  const canWrite = !isDemo && moduleAllowed(ctx.active, "activity", "write");
  const lastTo = compareLocalDates(to, today) > 0 ? today : to;
  const cmpTo = compareLocalDates(cmp.to, today) > 0 ? today : cmp.to;

  const [goal, source, daily, cmpDaily, beforeDaily, hourly, manual] =
    await Promise.all([
      stepsGoal(ctx),
      stepsSource(ctx),
      stepsDaily(ctx, from, lastTo, now),
      view === "jour"
        ? stepsDaily(ctx, cmp.from, cmpTo, now)
        : Promise.resolve(null),
      stepsDaily(ctx, before.from, before.to, now),
      view === "jour"
        ? stepsHourly(ctx, day, now)
        : Promise.resolve(new Map<number, number>()),
      canWrite ? manualSteps(ctx) : Promise.resolve([]),
    ]);
  const syncTokens =
    canWrite && ctx.active.kind === "real"
      ? await apiTokens().list(
          ctx.user.accountId,
          ctx.active.access.profileId,
          "steps",
        )
      : [];
  const endpoint = `${(process.env.BILANX_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/v1/pas`;
  const days =
    compareLocalDates(from, today) > 0 ? [] : stepsSeries(daily, from, lastTo);
  const stats = stepsStats(days, goal);
  const cmpStats =
    view === "jour"
      ? stepsStats(stepsSeries(cmpDaily!, cmp.from, cmpTo), goal)
      : stats;
  const beforeStats = stepsStats(
    stepsSeries(beforeDaily, before.from, before.to),
    goal,
  );
  const fmtLong = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    dateStyle: "long",
  });
  const dd = (iso: string) => fmtLong.format(new Date(`${iso}T12:00:00Z`));
  const short = (iso: string) =>
    `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
  const todayIso = formatLocalDate(today);

  let bars: Bar[] = [];
  let periodLabel = "";
  let barGoal: number | null = goal;
  let currentIndex: number | undefined;
  let currentLabel = "Aujourd’hui (journée en cours)";
  if (view === "jour") {
    const { start } = dayBounds(day, DEMO_TIMEZONE);
    const fmtH = new Intl.DateTimeFormat("fr-FR", {
      timeZone: DEMO_TIMEZONE,
      hour: "numeric",
    });
    bars = Array.from({ length: 24 }, (_, h) => {
      const t = start.getTime() + h * 3_600_000;
      const v = hourly.get(t) ?? null;
      const hh = fmtH.format(t).replace(/\D/g, "");
      if (t <= now.getTime() && now.getTime() < t + 3_600_000) currentIndex = h;
      return {
        label: `${hh} h`,
        value: v,
        title: `${hh} h : ${v === null ? "aucune donnée" : `${formatNumberFr(v)} pas`}`,
      };
    });
    currentLabel = "Heure en cours";
    barGoal = null; // l'objectif est quotidien, pas horaire
  } else if (view === "annee") {
    const months = monthlyAverages(stepsSeries(daily, from, lastTo));
    bars = MONTHS.map((m, i) => {
      const k = `${from.year}-${String(i + 1).padStart(2, "0")}`;
      const r = months.find((x) => x.month === k);
      const v = r?.averagePerDay != null ? Math.round(r.averagePerDay) : null;
      return {
        label: m,
        shortLabel: m.slice(0, 1).toUpperCase(),
        value: v,
        title: `${m} ${from.year} : ${v === null ? "aucune donnée" : `${formatNumberFr(v)} pas par jour en moyenne (${plural(r!.daysWithData, "jour noté", "jours notés")})`}`,
      };
    });
    if (from.year === today.year) currentIndex = today.month - 1;
    currentLabel = "Mois en cours";
    periodLabel = `Année ${from.year} — moyenne quotidienne par mois`;
  } else {
    const series = stepsSeries(daily, from, to);
    bars = series.map((d) => {
      const wd =
        WEEKDAYS[(new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7]!;
      return {
        label:
          view === "semaine"
            ? `${wd} ${short(d.date)}`
            : String(Number(d.date.slice(8, 10))),
        shortLabel: view === "semaine" ? wd : undefined,
        value: d.steps,
        title: `${dd(d.date)} : ${d.steps === null ? "aucune donnée" : `${formatNumberFr(d.steps)} pas`}`,
      };
    });
    const idx = series.findIndex((d) => d.date === todayIso);
    if (idx >= 0) currentIndex = idx;
    periodLabel =
      view === "mois"
        ? new Intl.DateTimeFormat("fr-FR", {
            timeZone: "UTC",
            month: "long",
            year: "numeric",
          }).format(new Date(Date.UTC(from.year, from.month - 1, 15)))
        : `Semaine du ${dd(formatLocalDate(from))} au ${dd(formatLocalDate(to))}`;
  }
  const href = (v: View, d: LocalDate) =>
    `/activite?vue=${v}&date=${formatLocalDate(d)}`;
  const navBtn =
    "grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-surface-2";
  const hasNext = compareLocalDates(next, today) <= 0;
  // Total du jour : valeur quotidienne enregistrée (import ou saisie), sinon somme des heures.
  const dayDaily =
    view === "jour" ? (daily.get(formatLocalDate(day)) ?? null) : null;
  const dayTotal =
    view === "jour"
      ? (dayDaily ??
        (hourly.size ? [...hourly.values()].reduce((a, b) => a + b, 0) : null))
      : null;
  const fmtDT = new Intl.DateTimeFormat("fr-FR", {
    timeZone: DEMO_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const avg =
    cmpStats.averagePerDay === null ? null : Math.round(cmpStats.averagePerDay);
  const avgBefore =
    beforeStats.averagePerDay === null
      ? null
      : Math.round(beforeStats.averagePerDay);
  const comparison =
    avg === null
      ? "aucun jour noté"
      : avgBefore === null
        ? `pas de donnée pour ${PREV_LABEL[view]}`
        : avg === avgBefore
          ? `identique à ${PREV_LABEL[view]}`
          : `${avg > avgBefore ? "+" : "−"}${formatNumberFr(Math.abs(avg - avgBefore))} pas par rapport à ${PREV_LABEL[view]} (${formatNumberFr(avgBefore)})`;
  const avgTitle =
    view === "jour" || view === "semaine"
      ? "Moyenne de la semaine"
      : view === "mois"
        ? "Moyenne du mois"
        : "Moyenne de l’année";

  // Libellé court de la période (dans le bandeau) : « 2 – 8 nov. », « novembre 2026 », « 2026 », « sam. 7 nov. ».
  const fmtDM = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
  const isoDate = (d: LocalDate) => new Date(`${formatLocalDate(d)}T12:00:00Z`);
  const shortPeriod =
    view === "jour"
      ? new Intl.DateTimeFormat("fr-FR", {
          timeZone: "UTC",
          weekday: "short",
          day: "numeric",
          month: "short",
        }).format(isoDate(day))
      : view === "semaine"
        ? `${from.day} – ${fmtDM.format(isoDate(to))}`
        : view === "mois"
          ? new Intl.DateTimeFormat("fr-FR", {
              timeZone: "UTC",
              month: "long",
              year: "numeric",
            }).format(isoDate(from))
          : String(from.year);

  // Anneau : pas du jour (vue jour) ou moyenne quotidienne de la période, rapportés à l'objectif.
  const ringValue = view === "jour" ? dayTotal : avg;
  const ringPct = ringValue === null ? 0 : ringValue / goal;
  const delta = avg !== null && avgBefore !== null ? avg - avgBefore : null;
  const weekDays = view === "semaine" ? stepsSeries(daily, from, to) : [];

  const navArrow =
    "grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25";
  const hero = (
    <section
      aria-label="Résumé de la période"
      className="overflow-hidden rounded-[var(--radius-card,18px)] bg-[linear-gradient(140deg,#0e4a33_0%,#17704b_50%,#2a8a6e_100%)] p-4 text-white shadow-[var(--shadow-card)] sm:p-6"
    >
      {view === "jour" ? (
        <div className="rounded-2xl bg-white/95 p-1 text-ink dark:bg-surface">
          <DayNav
            basePath="/activite"
            param="date"
            extraQuery="vue=jour"
            value={formatLocalDate(day)}
            max={todayIso}
            prevHref={href("jour", prev)}
            nextHref={hasNext ? href("jour", next) : undefined}
            todayHref="/activite?vue=jour"
            label="Choisir le jour"
          />
        </div>
      ) : (
        <nav aria-label="Période" className="flex items-center gap-2">
          <Link
            href={href(view, prev)}
            className={navArrow}
            aria-label="Période précédente"
          >
            <Icon name="chevronLeft" className="size-5" />
          </Link>
          <h2
            className="min-w-0 flex-1 text-center text-lg font-semibold first-letter:uppercase"
            aria-live="polite"
          >
            <span aria-hidden>{shortPeriod}</span>
            <span className="sr-only">{periodLabel}</span>
          </h2>
          {hasNext ? (
            <Link
              href={href(view, next)}
              className={navArrow}
              aria-label="Période suivante"
            >
              <Icon name="chevronRight" className="size-5" />
            </Link>
          ) : (
            <span className={`${navArrow} opacity-30`} aria-hidden>
              <Icon name="chevronRight" className="size-5" />
            </span>
          )}
        </nav>
      )}

      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
        <ProgressRing
          value={ringPct}
          size={168}
          stroke={14}
          color={ringPct >= 1 ? "#7ef0ad" : "#ffd08a"}
        >
          <div>
            <p className="tabular text-[34px] font-bold leading-none">
              {ringValue === null ? "—" : formatNumberFr(ringValue)}
            </p>
            <p className="mt-1 text-[13px] text-white/85">
              {view === "jour" ? "pas" : "pas / jour"}
            </p>
            <p className="mt-1.5 text-[12px] font-semibold text-white">
              {ringValue === null
                ? "aucune donnée"
                : `${Math.round(ringPct * 100)} % de l’objectif`}
            </p>
          </div>
        </ProgressRing>

        <ul className="grid w-full flex-1 grid-cols-3 gap-2 sm:gap-3">
          {(view === "jour"
            ? [
                {
                  icon: "check" as const,
                  tone: "bg-sage-2 text-go",
                  label: "Objectif",
                  value: formatNumberFr(goal),
                },
                {
                  icon: "chart" as const,
                  tone: "bg-indigo-2 text-indigo",
                  label: "Moy. semaine",
                  value: avg === null ? "—" : formatNumberFr(avg),
                },
                {
                  icon: "steps" as const,
                  tone: "bg-amber-2 text-amber",
                  label: "Reste",
                  value:
                    dayTotal === null
                      ? "—"
                      : dayTotal >= goal
                        ? "Atteint"
                        : formatNumberFr(goal - dayTotal),
                },
              ]
            : [
                {
                  icon: "check" as const,
                  tone: "bg-sage-2 text-go",
                  label: "Objectif atteint",
                  value: stats.daysWithData
                    ? `${stats.goalReachedDays}/${stats.daysWithData}`
                    : "—",
                },
                {
                  icon: "chart" as const,
                  tone: "bg-indigo-2 text-indigo",
                  label: "Total",
                  value: stats.daysWithData ? formatNumberFr(stats.total) : "—",
                },
                {
                  icon: "sparkle" as const,
                  tone: "bg-amber-2 text-amber",
                  label: "Meilleur jour",
                  value: stats.best ? formatNumberFr(stats.best.steps!) : "—",
                },
              ]
          ).map((t) => (
            <li
              key={t.label}
              className="flex flex-col items-center rounded-2xl bg-surface px-1.5 py-3 text-center text-ink shadow-[0_6px_16px_rgba(0,0,0,0.18)]"
            >
              <span
                className={`grid size-8 place-items-center rounded-full ${t.tone}`}
                aria-hidden
              >
                <Icon name={t.icon} className="size-4" />
              </span>
              <span className="tabular mt-1.5 text-[17px] font-bold leading-tight">
                {t.value}
              </span>
              <span className="mt-0.5 text-[11.5px] leading-tight text-ink-2">
                {t.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {weekDays.length > 0 && (
        <ol
          className="mt-5 grid grid-cols-7 gap-1"
          aria-label="Objectif jour par jour"
        >
          {weekDays.map((d) => {
            const wd =
              WEEKDAYS[(new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7]!;
            const future = d.date > todayIso;
            const pctDay = d.steps === null ? 0 : d.steps / goal;
            return (
              <li
                key={d.date}
                className={`flex flex-col items-center gap-1 ${future ? "opacity-40" : ""}`}
              >
                <ProgressRing
                  value={pctDay}
                  size={40}
                  stroke={5}
                  color={pctDay >= 1 ? "#7ef0ad" : "#ffd08a"}
                >
                  {pctDay >= 1 ? (
                    <Icon name="check" className="size-4" strokeWidth={3} />
                  ) : null}
                </ProgressRing>
                <span
                  className={`text-[12px] ${d.date === todayIso ? "font-bold" : "text-white/80"}`}
                >
                  {d.date === todayIso ? "auj." : wd.replace(".", "")}
                </span>
                <span className="sr-only">
                  {dd(d.date)} :{" "}
                  {d.steps === null
                    ? "aucune donnée"
                    : `${formatNumberFr(d.steps)} pas${pctDay >= 1 ? ", objectif atteint" : ""}`}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {delta !== null && (
        <p className="mt-4 flex justify-center">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${delta >= 0 ? "bg-sage-2 text-go" : "bg-amber-2 text-amber"}`}
          >
            {delta >= 0 ? "↑" : "↓"} {formatNumberFr(Math.abs(delta))} pas/jour
            vs {PREV_LABEL[view].replace(/^(la|le|l’) /, "")}
          </span>
        </p>
      )}
      <p className="sr-only">
        {avgTitle} :{" "}
        {avg === null ? "aucune donnée" : `${formatNumberFr(avg)} pas par jour`}
        , {comparison}.
      </p>
    </section>
  );

  // Vue jour sans détail horaire (total envoyé ou saisi une fois par jour) : pas de graphique vide.
  const chart =
    view === "jour" && hourly.size === 0 ? null : (
      <Card>
        <h2 className="mb-3 font-semibold">
          {view === "jour"
            ? "Heure par heure"
            : view === "annee"
              ? "Moyenne par mois"
              : "Jour par jour"}
        </h2>
        <StepsBars
          bars={bars}
          goal={barGoal}
          currentIndex={currentIndex}
          currentLabel={currentLabel}
        />
      </Card>
    );

  const sourceKind =
    source?.status === "demo"
      ? "fictif"
      : source?.status === "manual"
        ? "saisie"
        : source?.status === "active"
          ? "automatique"
          : source
            ? "import de fichier"
            : null;

  return (
    <div className="fade-in">
      <PageHeader title="Activité & Pas" />
      <div className="mb-4">
        <Segmented
          label="Vue"
          items={VIEWS.map(([v, l]) => ({
            href: href(v, day),
            label: l,
            current: v === view,
          }))}
        />
      </div>
      {sp.efface && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm"
        >
          Données d’activité effacées.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {hero}
          {chart}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {!source && (
            <p className="px-1 text-sm text-ink-2">
              Aucune donnée d’activité pour ce profil.
            </p>
          )}
          {source && (
            <p className="flex flex-wrap items-center gap-2 px-1 text-sm text-ink-2">
              <Chip tone={source.status === "active" ? "sage" : "neutral"}>
                {sourceKind}
              </Chip>
              <span>{source.label}</span>
              {source.lastImportAt && (
                <span className="text-ink-3">
                  · {fmtDT.format(source.lastImportAt)}
                </span>
              )}
            </p>
          )}

          {canWrite && (
            <Disclosure
              id="saisir-pas"
              className="group scroll-mt-20 rounded-[var(--radius-card,18px)] border border-line bg-surface shadow-[var(--shadow-card)]"
              initialOpen={!source}
              summary={
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold [&::-webkit-details-marker]:hidden">
                  <span
                    className="grid size-9 place-items-center rounded-full bg-sage-2 text-go"
                    aria-hidden
                  >
                    <Icon name="plus" className="size-5" />
                  </span>
                  <span className="flex-1">Saisir mes pas</span>
                  <Icon
                    name="chevronDown"
                    className="size-5 text-ink-3 transition-transform group-open:rotate-180"
                  />
                </summary>
              }
            >
              <div className="px-4 pb-4">
                <ManualStepsForm
                  today={todayIso}
                  defaultDay={formatLocalDate(view === "jour" ? day : today)}
                />
                {manual.length > 0 && (
                  <details className="group/m mt-3">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-petrol [&::-webkit-details-marker]:hidden">
                      <Icon
                        name="chevronDown"
                        className="size-4 transition-transform group-open/m:rotate-180"
                      />
                      Jours saisis à la main (
                      {manual.length === 14 ? "14 derniers" : manual.length})
                    </summary>
                    <ul className="mt-1 divide-y divide-line">
                      {manual.map((m) => (
                        <li
                          key={m.day}
                          className="flex flex-wrap items-center justify-between gap-x-2 py-1.5 text-sm"
                        >
                          <span>
                            {dd(m.day)} ·{" "}
                            <span className="tabular font-medium">
                              {formatNumberFr(m.steps)} pas
                            </span>
                          </span>
                          <ConfirmDelete
                            action={removeStepsAction}
                            fields={{ day: m.day }}
                            summaryAriaLabel={`Supprimer la saisie du ${dd(m.day)}`}
                            confirmAriaLabel={`Confirmer la suppression de la saisie du ${dd(m.day)}`}
                          />
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </Disclosure>
          )}

          {canWrite && (
            <details
              id="reglages-activite"
              className="group rounded-[var(--radius-card,18px)] border border-line bg-surface shadow-[var(--shadow-card)]"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold [&::-webkit-details-marker]:hidden">
                <span
                  className="grid size-9 place-items-center rounded-full bg-indigo-2 text-indigo"
                  aria-hidden
                >
                  <Icon name="settings" className="size-5" />
                </span>
                <span className="flex-1">Réglages</span>
                <span className="text-sm font-normal text-ink-3">
                  objectif, envoi auto…
                </span>
                <Icon
                  name="chevronDown"
                  className="size-5 text-ink-3 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="flex flex-col gap-5 border-t border-line px-4 pb-4 pt-4">
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-ink-2">
                    Objectif quotidien
                  </h3>
                  <GoalForm goal={goal} />
                </section>
                <section
                  id="envoi-automatique"
                  className="border-t border-line pt-4"
                >
                  <h3 className="mb-2 text-sm font-semibold text-ink-2">
                    Envoi automatique depuis l’iPhone
                  </h3>
                  <StepsSync
                    endpoint={endpoint}
                    tokens={syncTokens.map((t) => ({
                      id: t.id,
                      label: t.label,
                      hint: t.hint,
                      createdAt: t.createdAt.toISOString(),
                      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
                    }))}
                  />
                </section>
                <section className="border-t border-line pt-4">
                  <h3 className="mb-2 text-sm font-semibold text-ink-2">
                    Importer un export Apple Santé
                  </h3>
                  <AppleHealthImport />
                </section>
                {source && (
                  <details className="group/e border-t border-line pt-3 text-sm">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-ink-2 [&::-webkit-details-marker]:hidden">
                      <Icon
                        name="chevronDown"
                        className="size-4 transition-transform group-open/e:rotate-180"
                      />
                      Effacer toutes les données d’activité
                    </summary>
                    <form action={clearActivityAction} className="mt-2">
                      <Button type="submit" variant="danger">
                        Confirmer l’effacement
                      </Button>
                    </form>
                  </details>
                )}
              </div>
            </details>
          )}
          {isDemo && <Meta>Démonstration : données fictives.</Meta>}
        </div>
      </div>
    </div>
  );
}
