# Atlas - Roadmaps multi-équipes

App de pilotage de roadmaps multi-équipes (démo interne CRIT Innovation). Tourne en local sur ta machine, 0€ de coût.

## Fonctionnalités en place

### Authentification & espace de travail
- Inscription / connexion (NextAuth)
- Création d'un workspace, invitation de membres par lien
- 2 rôles : Admin / Membre

### Roadmaps & items
- Création de roadmap via une modale intégrée au Dashboard (titre, description, couleur, emoji/logo)
- Ajout / suppression d'items : titre, dates, statut, % avancement, owner
- Changement de statut horodaté
- Hiérarchie Epic / sous-item (un seul niveau) : agrégation automatique des dates et de la progression sur l'Epic, lignes repliables, suppression en cascade avec confirmation
- Jalons (modèle de données + affichage sur le Gantt)
- Personnalisation visuelle de chaque roadmap (couleur pastel, emoji ou logo uploadé), reprise de façon cohérente dans toute l'app

### Vue Gantt
- Drag-and-drop des dates, poignées de redimensionnement
- Connecteurs de dépendance en courbes de Bézier avec poignée déplaçable positionnée sur la courbe
- Zoom Semaine / Mois / Trimestre avec graduations calées sur le vrai calendrier
- Bandeau calendrier de sprints (date de référence, durée, numéro de départ configurables dans Paramètres), avec extrapolation passé/futur
- Suivi prévu vs réel : dates planifiées vs dates réelles, extensions pointillées rouge/vert sur les barres

### Dépendances
- 4 types classiques : FD, DD, FF, DF
- 3 types de cible : Tâche, Équipe, Système externe
- Statut manuel (Résolue / En attente) sur chaque dépendance
- Détection et blocage des dépendances circulaires
- Tableau récapitulatif des dépendances par roadmap (accessible depuis le Gantt et la vue de suivi)
- Déduplication des flèches quand un Epic est replié

### Risques
- Liste par roadmap : titre, impact, probabilité
- Statut : ouvert / mitigé / clos

### Dashboard & vue consolidée
- KPIs globaux, panneau "Attention requise"
- Graphique de tendance de santé avec infobulles par roadmap
- Cartes roadmap enrichies (couleur, emoji/logo, statut)
- Statut de santé auto-calculé (vert / orange / rouge), seuils configurables dans Paramètres
- Filtres instantanés sur la vue consolidée
- Drill-down vers le détail de chaque roadmap

### Imports assistés par IA (Claude Haiku)
- Import Excel : détection automatique de la ligne d'en-tête, mapping des colonnes par l'IA, écran de revue humaine avant import
- Import depuis une image (capture d'écran d'un tableau ou d'une vue Gantt/swimlane type Bubble Plan, Roadmunk) : détection Epic/sous-item, jalons, owner, % d'avancement
- Logique de transformation commune aux deux imports (`lib/import-transform.ts`)

### Intégration Jira Cloud (bidirectionnelle)
- Connexion au niveau workspace, jetons chiffrés AES-256-GCM
- Mapping projet et champs de date par roadmap (détection date vs date-heure)
- Synchronisation des Epics et Stories, mapping des statuts
- Masquage (pas suppression) des items en cas de perte de dates ou de suppression côté Jira
- Synchronisation des dépendances (liens de type "Blocks")
- Écriture des dates vers Jira lors des modifications manuelles, recalcul des agrégats d'Epic
- Bouton de synchronisation globale sur la vue consolidée, avec filtre de seuil de date ("Synchroniser depuis le")
- Compatible réseau d'entreprise (proxy PAC, `undici` ProxyAgent)

### Interface & design
- Identité "Atlas" : nom, logo (dégradé bleu)
- Thème sombre uniquement, composants shadcn-style faits main
- Sidebar réductible avec bouton flottant au survol
- Police Inter auto-hébergée (évite les problèmes de proxy au démarrage)
- Écran Paramètres unifié : seuils de santé, calendrier de sprints, connexion Jira

## Prochaines étapes possibles

- Détection automatique des lignes de groupement à l'import Excel (mise de côté après la mise en place de la hiérarchie Epic, à revisiter)
- Résolution propre de la confiance TLS entreprise (`NODE_TLS_REJECT_UNAUTHORIZED=0` est un contournement temporaire à retirer)
- Déploiement Hetzner (guide en 15 étapes déjà rédigé, à exécuter)

---

## Installation sur Windows

### Prérequis

1. **Node.js** (version 20 ou supérieure) - https://nodejs.org (version LTS)
2. **Docker Desktop** - https://www.docker.com/products/docker-desktop (doit être lancé avant de démarrer la base de données)

Vérifie que tout est installé :

```powershell
node -v
docker -v
```

### Étapes

1. Ouvre un terminal dans le dossier `roadmap-app`.

2. Installe les dépendances :
   ```powershell
   npm install
   ```

3. Crée ton fichier d'environnement :
   ```powershell
   copy .env.example .env
   ```

4. Démarre la base de données PostgreSQL :
   ```powershell
   docker compose up -d
   ```
   Vérifie : `docker ps` doit afficher un conteneur `roadmap-db`.

5. Crée les tables en base :
   ```powershell
   npx prisma migrate dev --name init
   ```

6. Charge le jeu de données de démo (optionnel mais recommandé) :
   ```powershell
   npm run db:seed
   ```
   Crée un workspace de démo avec plusieurs roadmaps (Rocker, Solid, Falcon, DMi, B2C), des items, des risques et des dépendances inter-équipes. Comptes : `admin@demo.local` / `pm-a@demo.local` / `pm-b@demo.local`, mot de passe `password123`.

7. Lance l'application :
   ```powershell
   npm run dev
   ```
   Ouvre http://localhost:3000

### Pour arrêter / relancer

- Arrêter l'app : `Ctrl+C`
- Arrêter la base : `docker compose down` (les données restent dans `postgres-data/`)
- Relancer : `docker compose up -d` puis `npm run dev`

### Outils utiles

```powershell
npx prisma studio
```

---

## Stack technique

Next.js 14 (App Router) · TypeScript · PostgreSQL · Prisma · NextAuth · Tailwind CSS · composants shadcn-style faits main · Claude Haiku (import Excel/image, via `undici` ProxyAgent) · Jira Cloud API (sync bidirectionnelle, jetons AES-256-GCM) · Docker Compose

Coût : **0€** en local. Passage sur Hetzner documenté séparément (guide de déploiement en 15 étapes).