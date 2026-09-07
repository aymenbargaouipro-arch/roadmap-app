import { startOfMonth, addMonths, startOfQuarter, addQuarters } from "date-fns";

export const MS_PER_DAY = 86400000;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function diffInDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function computeTimelineRange(items: { startDate: Date; endDate: Date }[]) {
  if (items.length === 0) {
    const today = startOfDay(new Date());
    return { start: addDays(today, -7), end: addDays(today, 21) };
  }
  const min = new Date(Math.min(...items.map((i) => i.startDate.getTime())));
  const max = new Date(Math.max(...items.map((i) => i.endDate.getTime())));
  return { start: addDays(startOfDay(min), -3), end: addDays(startOfDay(max), 4) };
}

// --- Zoom Gantt (semaine / mois / trimestre) ------------------------------------------------
//
// Les semaines avancent par pas fixe de 7 jours (deja gere directement dans les composants
// Gantt, notamment a cause de l'alignement optionnel sur la date de reference d'un sprint).
// Les mois et trimestres n'ont PAS une longueur fixe en jours (28-31 jours, ~90-92 jours) :
// il faut caler les graduations sur le vrai calendrier plutot que sur un pas de jours fixe.

export type ZoomLevel = "week" | "month" | "quarter";

export type PeriodTick = {
  // Decalage en jours depuis le debut de la plage visible (range.start), peut etre negatif
  // si le mois/trimestre calendaire commence avant range.start.
  offsetDays: number;
  label: string;
};

export function computeCalendarTicks(
  zoomLevel: "month" | "quarter",
  rangeStart: Date,
  rangeEnd: Date,
  formatLabel: (periodStart: Date) => string
): PeriodTick[] {
  const startFn = zoomLevel === "month" ? startOfMonth : startOfQuarter;
  const stepFn = zoomLevel === "month" ? (d: Date) => addMonths(d, 1) : (d: Date) => addQuarters(d, 1);

  let current = startFn(rangeStart);
  const ticks: PeriodTick[] = [];
  // Garde-fou anti-boucle infinie (defense en profondeur, ne devrait jamais se produire avec
  // des dates valides).
  let safety = 0;
  while (current < rangeEnd && safety < 200) {
    ticks.push({ offsetDays: diffInDays(current, rangeStart), label: formatLabel(current) });
    current = stepFn(current);
    safety += 1;
  }
  return ticks;
}
