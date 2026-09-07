# Roadmaps — v0

App de pilotage de roadmaps multi-équipes (démo interne). 100% gratuit, tourne en local sur ta machine.

## Ce qui est fait dans cette v0

- Authentification (inscription / connexion)
- Création d'un espace de travail (workspace)
- Création d'une roadmap
- Ajout / suppression d'items (titre, dates, statut, progression, owner)
- Changement de statut horodaté
- Dépendances affichées (badge "bloqué par", y compris inter-roadmaps — visibles dès qu'un item en a via le seed de démo)
- Ajout de risques (impact, probabilité) + changement de statut (ouvert/mitigé/clos)
- Vue consolidée admin avec statut de santé auto-calculé (vert/orange/rouge)
- Design system : palette, typo (Inter), composants de base (Button, Input, Card, badges de statut...)

## Ce qui n'est pas encore fait (prochaines étapes)

- Vue Gantt visuelle avec drag-and-drop (redimensionner, déplacer, réordonner)
- Création de dépendances depuis l'interface (actuellement en base via le seed uniquement)
- Jalons dans l'interface (le modèle de données existe, pas encore d'écran)
- Invitation de membres par lien/email

---

## Installation sur Windows

### Prérequis

1. **Node.js** (version 20 ou supérieure) — https://nodejs.org (version LTS)
2. **Docker Desktop** — https://www.docker.com/products/docker-desktop (doit être lancé avant de démarrer la base de données)

Vérifie que tout est installé en ouvrant un terminal (PowerShell) :

```powershell
node -v
docker -v
```

### Étapes

1. **Dézippe le projet** puis ouvre un terminal dans le dossier `roadmap-app`.

2. **Installe les dépendances :**
   ```powershell
   npm install
   ```

3. **Crée ton fichier d'environnement :**
   ```powershell
   copy .env.example .env
   ```
   Le fichier `.env` par défaut fonctionne tel quel pour du local. Tu peux changer `NEXTAUTH_SECRET` par une chaîne aléatoire si tu veux (pas obligatoire en local).

4. **Démarre la base de données PostgreSQL** (via Docker) :
   ```powershell
   docker compose up -d
   ```
   Vérifie qu'elle tourne : `docker ps` doit afficher un conteneur `roadmap-db`.

5. **Crée les tables en base** (migration Prisma) :
   ```powershell
   npx prisma migrate dev --name init
   ```

6. **(Optionnel mais recommandé) Charge le jeu de données de démo :**
   ```powershell
   npm run db:seed
   ```
   Ça crée un workspace "Programme Démo" avec 2 roadmaps, des items, un risque, et une dépendance inter-roadmaps. Comptes de connexion : `admin@demo.local` / `pm-a@demo.local` / `pm-b@demo.local`, mot de passe `password123`.

7. **Lance l'application :**
   ```powershell
   npm run dev
   ```
   Ouvre http://localhost:3000 — tu devrais être redirigé vers la page de connexion.

### Pour arrêter / relancer

- Arrêter l'app : `Ctrl+C` dans le terminal
- Arrêter la base : `docker compose down` (les données restent sur ton disque dans `postgres-data/`)
- Relancer plus tard : `docker compose up -d` puis `npm run dev`

### Outils utiles

- **Prisma Studio** (interface graphique pour voir/éditer les données) :
  ```powershell
  npx prisma studio
  ```

---

## Stack technique

Next.js 14 (App Router) · TypeScript · PostgreSQL · Prisma · NextAuth · Tailwind CSS · shadcn-style components · @dnd-kit (drag-and-drop, à venir)

Coût : **0€** en local. Le passage sur Hetzner (production/démo publique) reste à faire plus tard, comme prévu au cahier des charges.
