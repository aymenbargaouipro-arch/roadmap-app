import { prisma } from "@/lib/prisma";
import { fetchWorkspaceRoadmapHealth } from "@/lib/roadmap-health";
import { DEFAULT_HEALTH_THRESHOLDS, type HealthThresholds } from "@/lib/health";

function dateOnly(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Snapshot "paresseux" : pris (ou mis a jour) a la premiere visite du dashboard de la
// journee, plutot qu'un cron separe - l'app ne tourne pas forcement 24/7 sur un poste
// local. Idempotent : rappele plusieurs fois le meme jour, ne fait qu'un upsert par
// roadmap (pas de doublon grace a la contrainte unique roadmapId+day).
export async function ensureTodayHealthSnapshot(
  workspaceId: string,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): Promise<void> {
  const day = dateOnly(new Date());
  const rows = await fetchWorkspaceRoadmapHealth(workspaceId, thresholds);

  await Promise.all(
    rows.map((row) => {
      const health = row.health.toUpperCase() as "GREEN" | "ORANGE" | "RED";
      return prisma.healthSnapshot.upsert({
        where: { roadmapId_day: { roadmapId: row.id, day } },
        update: { health },
        create: { roadmapId: row.id, day, health },
      });
    })
  );
}

export type HealthTrendPoint = {
  day: string;
  green: number;
  orange: number;
  red: number;
  // Noms des roadmaps dans chaque categorie ce jour-la, pour l'infobulle du graphique.
  // Additifs par rapport aux compteurs : ne changent rien pour qui n'utilise que
  // green/orange/red.
  greenNames: string[];
  orangeNames: string[];
  redNames: string[];
};

// Serie quotidienne complete (contrairement a getHealthTrendDelta qui ne compare que deux
// points) : un point par jour ou au moins un snapshot existe, sur la fenetre demandee.
// Comme les snapshots sont pris a la visite du dashboard, il peut manquer des jours si
// l'app n'a pas ete ouverte - le graphique doit alors afficher "historique en cours" plutot
// que d'inventer des points.
export async function getHealthTrendSeries(workspaceId: string, days = 28): Promise<HealthTrendPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const snapshots = await prisma.healthSnapshot.findMany({
    where: { roadmap: { workspaceId }, day: { gte: since } },
    select: { day: true, health: true, roadmap: { select: { name: true } } },
    orderBy: { day: "asc" },
  });

  const byDay = new Map<
    string,
    { green: number; orange: number; red: number; greenNames: string[]; orangeNames: string[]; redNames: string[] }
  >();
  for (const s of snapshots) {
    const key = s.day.toISOString().slice(0, 10);
    if (!byDay.has(key)) {
      byDay.set(key, { green: 0, orange: 0, red: 0, greenNames: [], orangeNames: [], redNames: [] });
    }
    const bucket = byDay.get(key)!;
    if (s.health === "GREEN") {
      bucket.green++;
      bucket.greenNames.push(s.roadmap.name);
    } else if (s.health === "ORANGE") {
      bucket.orange++;
      bucket.orangeNames.push(s.roadmap.name);
    } else {
      bucket.red++;
      bucket.redNames.push(s.roadmap.name);
    }
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, counts]) => ({ day, ...counts }));
}

export type HealthCounts = { green: number; orange: number; red: number };

function countBy(rows: { health: string }[]): HealthCounts {
  return {
    green: rows.filter((r) => r.health === "GREEN").length,
    orange: rows.filter((r) => r.health === "ORANGE").length,
    red: rows.filter((r) => r.health === "RED").length,
  };
}

// Compare la repartition de sante d'aujourd'hui au snapshot le plus recent pris a J-7 ou
// avant (l'app n'etant pas forcement ouverte tous les jours, il peut ne pas exister de
// snapshot pile a J-7). Retourne previous = null tant qu'aucun historique suffisant
// n'existe encore (premiere semaine d'usage) : le dashboard doit alors afficher "pas
// encore d'historique" plutot qu'une variation fausse.
export async function getHealthTrendDelta(
  workspaceId: string
): Promise<{ current: HealthCounts; previous: HealthCounts | null }> {
  const today = dateOnly(new Date());
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [todaySnapshots, previousSnapshots] = await Promise.all([
    prisma.healthSnapshot.findMany({
      where: { roadmap: { workspaceId }, day: today },
      select: { health: true },
    }),
    prisma.healthSnapshot.findMany({
      where: { roadmap: { workspaceId }, day: { lte: sevenDaysAgo } },
      select: { roadmapId: true, health: true },
      orderBy: { day: "desc" },
    }),
  ]);

  const current = countBy(todaySnapshots);

  if (previousSnapshots.length === 0) {
    return { current, previous: null };
  }

  const latestPerRoadmap = new Map<string, string>();
  for (const s of previousSnapshots) {
    if (!latestPerRoadmap.has(s.roadmapId)) latestPerRoadmap.set(s.roadmapId, s.health);
  }
  const previous = countBy(Array.from(latestPerRoadmap.values()).map((health) => ({ health })));

  return { current, previous };
}
