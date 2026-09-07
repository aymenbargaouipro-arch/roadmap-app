type ItemLike = { status: string; endDate: Date };
type RiskLike = { status: string; impact: string; probability: string };
type DependencyBlockLike = { blocking: boolean };

export type Health = "green" | "orange" | "red";

export type HealthThresholds = {
  // % (0-100) d'items en retard au-dela duquel la roadmap passe en rouge
  lateRatioRedThreshold: number;
  // nombre d'items en retard a partir duquel la roadmap passe en orange
  lateCountOrangeThreshold: number;
  blockedItemTriggersRed: boolean;
  activeDependencyTriggersRed: boolean;
  highRiskTriggersRed: boolean;
  mediumRiskTriggersOrange: boolean;
};

// Reproduit exactement l'ancien comportement code en dur : sert de valeur par defaut pour
// tout appel qui ne fournit pas encore de seuils (retrocompatibilite), et de valeurs
// initiales lors de la creation d'un workspace.
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  lateRatioRedThreshold: 20,
  lateCountOrangeThreshold: 1,
  blockedItemTriggersRed: true,
  activeDependencyTriggersRed: true,
  highRiskTriggersRed: true,
  mediumRiskTriggersOrange: true,
};

/**
 * Regle de sante, seuils configurables par workspace (page Parametres, admin uniquement) :
 * - Rouge : item bloque (si active), OU risque ouvert impact fort + probabilite forte
 *   (si active), OU % d'items en retard au-dessus du seuil, OU dependance active non
 *   resolue (si active)
 * - Orange : nombre d'items en retard au-dessus du seuil, OU risque ouvert impact ou
 *   probabilite moyenne (si active)
 * - Vert : sinon
 */
export function computeHealth(
  items: ItemLike[],
  risks: RiskLike[],
  dependencies: DependencyBlockLike[] = [],
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): Health {
  const now = new Date();

  const hasBlockedItem = items.some((i) => i.status === "BLOCKED");
  const openRisks = risks.filter((r) => r.status === "OPEN");
  const hasHighRisk = openRisks.some((r) => r.impact === "HIGH" && r.probability === "HIGH");
  const hasMediumRisk = openRisks.some((r) => r.impact === "MEDIUM" || r.probability === "MEDIUM");

  const lateItems = items.filter((i) => i.status !== "DONE" && i.endDate < now);
  const lateRatioPercent = items.length > 0 ? (lateItems.length / items.length) * 100 : 0;

  const hasActiveDependencyBlock = dependencies.some((d) => d.blocking);

  const redTriggered =
    (thresholds.blockedItemTriggersRed && hasBlockedItem) ||
    (thresholds.highRiskTriggersRed && hasHighRisk) ||
    lateRatioPercent > thresholds.lateRatioRedThreshold ||
    (thresholds.activeDependencyTriggersRed && hasActiveDependencyBlock);

  if (redTriggered) {
    return "red";
  }

  const orangeTriggered =
    lateItems.length >= thresholds.lateCountOrangeThreshold ||
    (thresholds.mediumRiskTriggersOrange && hasMediumRisk);

  if (orangeTriggered) {
    return "orange";
  }

  return "green";
}
