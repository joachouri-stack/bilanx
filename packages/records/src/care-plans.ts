import { carePlanState, validateCarePlan, type CarePlanErrors, type CarePlanInput, type CarePlanState } from '@bilanx/domain';
import type { TransactionSql } from '@bilanx/db';
import type { Actor, ProfilesService } from '@bilanx/profiles';

/** Suivis réguliers d'un profil (mêmes droits que les rendez-vous). */
export interface CarePlansConfig {
  profiles: ProfilesService;
  timeZone?: string;
  now?: () => Date;
}

export interface CarePlanRow extends CarePlanState {
  id: string;
  label: string;
  icon: string;
  specialty: string | null;
  everyMonths: number | null;
  fixedMonth: number | null;
  remindDays: number;
  /** Dernier passage saisi à la main. */
  lastDoneManual: string | null;
  /** Dernier passage retenu (saisi, rendez-vous passé lié ou dernière analyse liée). */
  lastDone: string | null;
  lastDoneSource: 'manual' | 'appointment' | 'lab' | null;
  labAnalyte: string | null;
  /** Prochain rendez-vous pris pour ce suivi. */
  nextAppointment: { id: string; startsAt: Date } | null;
}

const UUID = /^[0-9a-f-]{36}$/i;

type Tx = TransactionSql;

/**
 * Suivis du profil avec leur état du jour. Lu dans une transaction déjà ouverte au nom d'un compte
 * (RLS des rendez-vous et, pour l'analyse liée, du module Analyses).
 */
export async function loadCarePlans(tx: Tx, profileId: string, at: Date, tz: string): Promise<CarePlanRow[]> {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  const today = day(at);
  const plans = await tx<
    { id: string; label: string; icon: string; specialty: string | null; every_months: number | null; fixed_month: number | null; remind_days: number; last_done: string | null; lab_analyte: string | null }[]
  >`SELECT id, label, icon, specialty, every_months, fixed_month, remind_days, to_char(last_done, 'YYYY-MM-DD') AS last_done, lab_analyte
    FROM care_plan WHERE profile_id = ${profileId} AND deleted_at IS NULL ORDER BY created_at`;
  if (!plans.length) return [];
  const appts = await tx<{ id: string; care_plan_id: string; starts_at: Date }[]>`
    SELECT id, care_plan_id, starts_at FROM appointment
    WHERE profile_id = ${profileId} AND deleted_at IS NULL AND care_plan_id IS NOT NULL ORDER BY starts_at`;
  const analytes = [...new Set(plans.map((p) => p.lab_analyte).filter((a): a is string => !!a))];
  const labs = analytes.length
    ? await tx<{ analyte_code: string; sampled_at: Date }[]>`
        SELECT analyte_code, max(sampled_at) AS sampled_at FROM lab_result
        WHERE profile_id = ${profileId} AND analyte_code = ANY(${analytes}) GROUP BY analyte_code`
    : [];
  // Un rendez-vous compte comme passage dès qu'il a commencé.
  return plans.map((p) => {
    const mine = appts.filter((a) => a.care_plan_id === p.id);
    const past = mine.filter((a) => a.starts_at.getTime() <= at.getTime()).at(-1);
    const next = mine.find((a) => a.starts_at.getTime() > at.getTime()) ?? null;
    const lab = p.lab_analyte ? labs.find((l) => l.analyte_code === p.lab_analyte) : undefined;
    const candidates: { d: string; src: CarePlanRow['lastDoneSource'] }[] = [];
    if (p.last_done) candidates.push({ d: p.last_done, src: 'manual' });
    if (past) candidates.push({ d: day(past.starts_at), src: 'appointment' });
    if (lab) candidates.push({ d: day(lab.sampled_at), src: 'lab' });
    const best = candidates.sort((a, b) => (a.d < b.d ? 1 : -1))[0] ?? null;
    const state = carePlanState(
      { everyMonths: p.every_months, fixedMonth: p.fixed_month, remindDays: p.remind_days, lastDone: best?.d ?? null, nextBooked: next ? day(next.starts_at) : null },
      today,
    );
    return {
      ...state,
      id: p.id,
      label: p.label,
      icon: p.icon,
      specialty: p.specialty,
      everyMonths: p.every_months,
      fixedMonth: p.fixed_month,
      remindDays: p.remind_days,
      lastDoneManual: p.last_done,
      lastDone: best?.d ?? null,
      lastDoneSource: best?.src ?? null,
      labAnalyte: p.lab_analyte,
      nextAppointment: next ? { id: next.id, startsAt: next.starts_at } : null,
    };
  });
}

export function createCarePlansService(cfg: CarePlansConfig) {
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const P = cfg.profiles;
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now());

  async function list(actor: Actor, profileId: string): Promise<CarePlanRow[]> {
    return P.withProfileData(actor, profileId, 'appointments', 'read', (tx) => loadCarePlans(tx, profileId, now(), tz));
  }

  async function save(actor: Actor, profileId: string, input: CarePlanInput, id?: string): Promise<{ ok: true; id: string } | { ok: false; errors: CarePlanErrors }> {
    const v = validateCarePlan(input, today());
    if (!v.ok) return v;
    const c = v.value;
    return P.withProfileData(actor, profileId, 'appointments', 'write', async (tx) => {
      if (id) {
        if (!UUID.test(id)) return { ok: false as const, errors: { label: 'Suivi introuvable.' } };
        const r = await tx<{ id: string }[]>`
          UPDATE care_plan SET label = ${c.label}, icon = ${c.icon}, specialty = ${c.specialty}, every_months = ${c.everyMonths}, fixed_month = ${c.fixedMonth},
                 remind_days = ${c.remindDays}, last_done = ${c.lastDone}, lab_analyte = ${c.labAnalyte}, updated_at = ${now()}
          WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`;
        return r.length ? { ok: true as const, id } : { ok: false as const, errors: { label: 'Suivi introuvable.' } };
      }
      const [r] = await tx<{ id: string }[]>`
        INSERT INTO care_plan (profile_id, label, icon, specialty, every_months, fixed_month, remind_days, last_done, lab_analyte, created_by, created_at)
        VALUES (${profileId}, ${c.label}, ${c.icon}, ${c.specialty}, ${c.everyMonths}, ${c.fixedMonth}, ${c.remindDays}, ${c.lastDone}, ${c.labAnalyte},
                ${actor.accountId}, ${now()})
        RETURNING id`;
      return { ok: true as const, id: r!.id };
    });
  }

  /** Date du dernier passage (saisie depuis la carte du suivi). */
  async function setLastDone(actor: Actor, profileId: string, id: string, date: string | null): Promise<boolean> {
    if (!UUID.test(id)) return false;
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today())) return false;
    const r = await P.withProfileData(actor, profileId, 'appointments', 'write', (tx) =>
      tx`UPDATE care_plan SET last_done = ${date}, updated_at = ${now()} WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`,
    );
    return r.length > 0;
  }

  async function remove(actor: Actor, profileId: string, id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const r = await P.withProfileData(actor, profileId, 'appointments', 'write', async (tx) => {
      await tx`UPDATE appointment SET care_plan_id = NULL WHERE care_plan_id = ${id} AND profile_id = ${profileId}`;
      return tx`UPDATE care_plan SET deleted_at = ${now()} WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`;
    });
    return r.length > 0;
  }

  return { list, save, setLastDone, remove };
}

export type CarePlansService = ReturnType<typeof createCarePlansService>;
