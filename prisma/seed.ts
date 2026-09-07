import { PrismaClient, ItemStatus, RiskLevel, RiskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_WORKSPACE_NAME = "Programme Démo";

// Efface toutes les donnees du workspace demo existant (roadmaps, items, risques, jalons,
// dependances, historique de statut/decalages, snapshots de sante) avant de tout recreer,
// pour que le seed reste rejouable a volonte. Cherche le workspace via la PREMIERE
// adhesion du compte admin (meme critere que l'app elle-meme : membership.findFirst
// orderBy createdAt asc) plutot que par un nom fixe - un nom fixe casse silencieusement
// des qu'on renomme le workspace (ex: via Prisma Studio), le reset ne trouvant alors plus
// rien et creant un second workspace fantome jamais affiche par l'app. Retourne le nom a
// reutiliser (celui d'avant, pour ne pas ecraser un renommage volontaire).
async function resetDemoWorkspace(): Promise<string> {
  const admin = await prisma.user.findUnique({
    where: { email: "admin@demo.local" },
    include: { memberships: { orderBy: { createdAt: "asc" } } },
  });

  if (!admin || admin.memberships.length === 0) return DEMO_WORKSPACE_NAME;

  let preservedName = DEMO_WORKSPACE_NAME;

  for (const [index, membership] of admin.memberships.entries()) {
    const existing = await prisma.workspace.findUnique({ where: { id: membership.workspaceId } });
    if (!existing) continue;

    // Le plus ancien est celui que l'app affiche normalement (membership.findFirst orderBy
    // createdAt asc) : on garde son nom pour la recreation, meme s'il a ete renomme depuis.
    if (index === 0) preservedName = existing.name;

    console.log(`Nettoyage du workspace "${existing.name}"...`);

    const roadmapIds = (
      await prisma.roadmap.findMany({ where: { workspaceId: existing.id }, select: { id: true } })
    ).map((r) => r.id);

    if (roadmapIds.length > 0) {
      await prisma.statusHistory.deleteMany({ where: { item: { roadmapId: { in: roadmapIds } } } });
      await prisma.itemDateShift.deleteMany({ where: { item: { roadmapId: { in: roadmapIds } } } });
      await prisma.dependency.deleteMany({
        where: {
          OR: [
            { blockingItem: { roadmapId: { in: roadmapIds } } },
            { blockedItem: { roadmapId: { in: roadmapIds } } },
            { targetRoadmapId: { in: roadmapIds } },
          ],
        },
      });
      // Les sous-items (parentId non nul) doivent partir avant leurs Epics.
      await prisma.item.deleteMany({ where: { roadmapId: { in: roadmapIds }, parentId: { not: null } } });
      await prisma.item.deleteMany({ where: { roadmapId: { in: roadmapIds } } });
      await prisma.milestone.deleteMany({ where: { roadmapId: { in: roadmapIds } } });
      await prisma.risk.deleteMany({ where: { roadmapId: { in: roadmapIds } } });
      await prisma.healthSnapshot.deleteMany({ where: { roadmapId: { in: roadmapIds } } });
      await prisma.roadmap.deleteMany({ where: { id: { in: roadmapIds } } });
    }

    await prisma.invite.deleteMany({ where: { workspaceId: existing.id } });
    await prisma.membership.deleteMany({ where: { workspaceId: existing.id } });
    await prisma.workspace.delete({ where: { id: existing.id } });
  }

  return preservedName;
}

async function main() {
  const workspaceName = await resetDemoWorkspace();

  const passwordHash = await bcrypt.hash("password123", 10);
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.local" },
    update: {},
    create: { email: "admin@demo.local", name: "Admin Démo", passwordHash },
  });

  const teams = ["Rocker", "Solid", "Falcon", "DMi", "B2C"] as const;
  const pms: Record<string, { id: string }> = {};
  for (const team of teams) {
    pms[team] = await prisma.user.upsert({
      where: { email: `pm-${team.toLowerCase()}@demo.local` },
      update: {},
      create: { email: `pm-${team.toLowerCase()}@demo.local`, name: `PM ${team}`, passwordHash },
    });
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: workspaceName,
      memberships: {
        create: [
          { userId: admin.id, role: "ADMIN" },
          ...teams.map((t) => ({ userId: pms[t].id, role: "MEMBER" as const })),
        ],
      },
    },
  });

  // Rocker : volontairement SAIN (risque faible/faible, aucun retard, aucun blocage) -
  // toutes les demos n'ont pas besoin d'etre en feu pour etre credibles.
  const rocker = await prisma.roadmap.create({
    data: {
      name: "Rocker · Onboarding mobile v2",
      description: "Refonte du parcours d'inscription mobile.",
      position: 0,
      workspaceId: workspace.id,
      items: {
        create: [
          { title: "Recherche utilisateurs", startDate: days(-15), endDate: days(-6), status: ItemStatus.DONE, progress: 100, position: 0, ownerId: pms.Rocker.id },
          { title: "Prototypage", startDate: days(-5), endDate: days(10), status: ItemStatus.IN_PROGRESS, progress: 55, position: 1, ownerId: pms.Rocker.id },
          { title: "Développement écrans", startDate: days(11), endDate: days(25), status: ItemStatus.TODO, progress: 0, position: 2, ownerId: pms.Rocker.id },
        ],
      },
      risks: {
        create: [{ title: "Turnover designer en cours", impact: RiskLevel.LOW, probability: RiskLevel.LOW, status: RiskStatus.OPEN }],
      },
    },
    include: { items: true },
  });

  // Solid : volontairement CRITIQUE (risque fort/fort sur la fenetre de maintenance, item
  // bloque) - demontre le declencheur "risque ouvert impact fort + probabilite forte".
  const solid = await prisma.roadmap.create({
    data: {
      name: "Solid · Migration base de données",
      description: "Migration vers la nouvelle infrastructure PostgreSQL.",
      position: 1,
      workspaceId: workspace.id,
      items: {
        create: [
          { title: "Audit schéma actuel", startDate: days(-20), endDate: days(-10), status: ItemStatus.DONE, progress: 100, position: 0, ownerId: pms.Solid.id },
          { title: "Script de migration", startDate: days(-9), endDate: days(8), status: ItemStatus.BLOCKED, progress: 20, position: 1, ownerId: pms.Solid.id },
        ],
      },
      risks: {
        create: [{ title: "Fenêtre de maintenance non validée par le client", impact: RiskLevel.HIGH, probability: RiskLevel.HIGH, status: RiskStatus.OPEN }],
      },
    },
    include: { items: true },
  });

  // Falcon : volontairement A SURVEILLER (risque probabilite moyenne, sinon rien de
  // critique) - demontre le declencheur orange "risque moyen" sans etre en feu.
  const falcon = await prisma.roadmap.create({
    data: {
      name: "Falcon · Refonte design system",
      description: "Nouveau design system partagé entre toutes les équipes produit.",
      position: 2,
      workspaceId: workspace.id,
      items: {
        create: [
          { title: "Audit composants existants", startDate: days(-12), endDate: days(-4), status: ItemStatus.DONE, progress: 100, position: 0, ownerId: pms.Falcon.id },
          { title: "Tokens & fondations", startDate: days(-3), endDate: days(12), status: ItemStatus.IN_PROGRESS, progress: 70, position: 1, ownerId: pms.Falcon.id },
          { title: "Documentation Storybook", startDate: days(13), endDate: days(24), status: ItemStatus.TODO, progress: 0, position: 2, ownerId: pms.Falcon.id },
        ],
      },
      risks: {
        create: [{ title: "Adoption incertaine par les autres équipes", impact: RiskLevel.LOW, probability: RiskLevel.MEDIUM, status: RiskStatus.OPEN }],
      },
    },
    include: { items: true },
  });

  // DMi : CRITIQUE via dependance active (bloque par Solid) - demontre le declencheur
  // "dependance active non resolue", independamment de ses propres items/risques.
  const dmi = await prisma.roadmap.create({
    data: {
      name: "DMi · Data warehouse interne",
      description: "Centralisation des données produit pour le reporting.",
      position: 3,
      workspaceId: workspace.id,
      items: {
        create: [
          { title: "Spécification des flux de données", startDate: days(-18), endDate: days(-8), status: ItemStatus.DONE, progress: 100, position: 0, ownerId: pms.DMi.id },
          { title: "Connexion au data warehouse", startDate: days(10), endDate: days(22), status: ItemStatus.TODO, progress: 0, position: 1, ownerId: pms.DMi.id },
          { title: "Tableaux de bord Power BI", startDate: days(23), endDate: days(35), status: ItemStatus.TODO, progress: 0, position: 2, ownerId: pms.DMi.id },
        ],
      },
      risks: {
        create: [{ title: "Dépendance forte à la migration Solid", impact: RiskLevel.MEDIUM, probability: RiskLevel.MEDIUM, status: RiskStatus.OPEN }],
      },
    },
    include: { items: true },
  });

  // B2C : CRITIQUE via dependance active (bloque par Falcon), meme logique que DMi.
  const b2c = await prisma.roadmap.create({
    data: {
      name: "B2C · App mobile grand public",
      description: "Application grand public consommant le nouveau design system.",
      position: 4,
      workspaceId: workspace.id,
      items: {
        create: [
          { title: "Cadrage fonctionnel", startDate: days(-14), endDate: days(-5), status: ItemStatus.DONE, progress: 100, position: 0, ownerId: pms.B2C.id },
          { title: "Intégration design system v2", startDate: days(13), endDate: days(24), status: ItemStatus.TODO, progress: 0, position: 1, ownerId: pms.B2C.id },
          { title: "Tests bêta utilisateurs", startDate: days(25), endDate: days(35), status: ItemStatus.TODO, progress: 0, position: 2, ownerId: pms.B2C.id },
        ],
      },
      risks: {
        create: [{ title: "Délai de review App Store incertain", impact: RiskLevel.LOW, probability: RiskLevel.MEDIUM, status: RiskStatus.OPEN }],
      },
    },
    include: { items: true },
  });

  // Dépendances inter-équipes
  const findItem = (roadmap: typeof rocker, title: string) => roadmap.items.find((i) => i.title === title)!;

  await prisma.dependency.createMany({
    data: [
      // DMi "Connexion au data warehouse" bloqué par Solid "Script de migration"
      {
        blockingItemId: findItem(solid, "Script de migration").id,
        blockedItemId: findItem(dmi, "Connexion au data warehouse").id,
      },
      // B2C "Intégration design system v2" bloqué par Falcon "Tokens & fondations"
      {
        blockingItemId: findItem(falcon, "Tokens & fondations").id,
        blockedItemId: findItem(b2c, "Intégration design system v2").id,
      },
    ],
  });

  console.log("Seed terminé — mix de santé attendu : Rocker = Sain, Falcon = À surveiller, Solid/DMi/B2C = Critique.");
  console.log("Mot de passe pour tous les comptes : password123");
  console.log("Comptes : admin@demo.local, pm-rocker@demo.local, pm-solid@demo.local, pm-falcon@demo.local, pm-dmi@demo.local, pm-b2c@demo.local");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
