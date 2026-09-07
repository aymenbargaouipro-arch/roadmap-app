// Calcul simplifie du "chemin critique" : plutot qu'un vrai CPM (marge avant/arriere sur des
// durees), les items ont deja des dates fixes. On definit ici le chemin critique comme la
// chaine de dependances Fin->Debut (FD, le type par defaut) qui remonte, depuis l'item qui
// finit le plus tard, vers son predecesseur le plus contraignant (celui qui finit le plus
// tard parmi ses propres predecesseurs), et ainsi de suite. Seules les dependances FD dont
// les dates respectent encore l'ordre (source finit avant/au moment ou la cible commence)
// sont prises en compte : une FD dont les dates ont ete deplacees manuellement depuis ne
// contraint plus rien dans les faits.

export type CriticalPathItem = { id: string; startDate: string; endDate: string };
export type CriticalPathDependency = { blockingItemId: string; blockedItemId: string; type?: string };

export function computeCriticalPath(
  items: CriticalPathItem[],
  dependencies: CriticalPathDependency[]
): Set<string> {
  if (items.length === 0) return new Set();

  const itemById = new Map(items.map((i) => [i.id, i]));
  const predecessorsByItem = new Map<string, string[]>();

  for (const dep of dependencies) {
    const type = dep.type ?? "FD";
    if (type !== "FD") continue;
    const source = itemById.get(dep.blockingItemId);
    const target = itemById.get(dep.blockedItemId);
    if (!source || !target) continue;
    if (new Date(source.endDate).getTime() > new Date(target.startDate).getTime()) continue;

    if (!predecessorsByItem.has(dep.blockedItemId)) predecessorsByItem.set(dep.blockedItemId, []);
    predecessorsByItem.get(dep.blockedItemId)!.push(dep.blockingItemId);
  }

  // Point d'arrivee : l'item qui finit le plus tard globalement (determine la fin de la
  // roadmap ou du programme selon ce qui est passe en entree).
  let terminalId = items[0].id;
  let latestEnd = new Date(items[0].endDate).getTime();
  for (const it of items) {
    const end = new Date(it.endDate).getTime();
    if (end > latestEnd) {
      latestEnd = end;
      terminalId = it.id;
    }
  }

  const path = new Set<string>();
  const visited = new Set<string>();
  let currentId: string | undefined = terminalId;

  while (currentId && !visited.has(currentId)) {
    path.add(currentId);
    visited.add(currentId);

    const preds = predecessorsByItem.get(currentId) ?? [];
    if (preds.length === 0) break;

    let nextId: string | undefined;
    let nextEnd = -Infinity;
    for (const pid of preds) {
      const pItem = itemById.get(pid);
      if (!pItem) continue;
      const end = new Date(pItem.endDate).getTime();
      if (end > nextEnd) {
        nextEnd = end;
        nextId = pid;
      }
    }
    currentId = nextId;
  }

  return path;
}
