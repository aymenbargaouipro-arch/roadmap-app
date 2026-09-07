import { addDays, diffInDays } from "@/lib/gantt";

// --- Calcul des sprints ------------------------------------------------------------------
//
// Un seul calendrier de sprints pour tout le workspace (pas par roadmap). L'utilisateur
// renseigne un sprint de reference (date de debut, duree en semaines, numero), et on extrapole
// a partir de la, dans les deux sens (avant ET apres la date de reference), pour couvrir toute
// la plage visible d'un Gantt donne.

export type SprintConfig = {
  referenceDate: Date;
  durationWeeks: number;
  referenceNumber: number;
};

export type SprintBand = {
  number: number;
  label: string;
  start: Date;
  // Exclusive : le sprint suivant commence exactement a cette date.
  end: Date;
};

export function computeSprintBands(config: SprintConfig, rangeStart: Date, rangeEnd: Date): SprintBand[] {
  const durationDays = config.durationWeeks * 7;
  if (durationDays <= 0) return [];

  // Combien de sprints complets separent rangeStart du sprint de reference (peut etre
  // negatif si rangeStart est avant la date de reference : Math.floor gere ce cas pour
  // toujours pointer sur le DEBUT du sprint qui contient rangeStart, pas celui d'apres).
  const daysSinceRef = diffInDays(rangeStart, config.referenceDate);
  const sprintsSinceRef = Math.floor(daysSinceRef / durationDays);

  let currentNumber = config.referenceNumber + sprintsSinceRef;
  let currentStart = addDays(config.referenceDate, sprintsSinceRef * durationDays);

  const bands: SprintBand[] = [];
  // Garde-fou : borne le nombre d'iterations pour eviter une boucle infinie si jamais
  // rangeEnd/rangeStart sont incoherents (duree nulle deja geree plus haut, mais defense
  // en profondeur).
  let safety = 0;
  while (currentStart < rangeEnd && safety < 500) {
    const currentEnd = addDays(currentStart, durationDays);
    bands.push({
      number: currentNumber,
      label: `Sprint ${currentNumber}`,
      start: currentStart,
      end: currentEnd,
    });
    currentStart = currentEnd;
    currentNumber += 1;
    safety += 1;
  }

  return bands;
}
