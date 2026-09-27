# Apex - Roadmaps multi-équipes

**Français** · [English](README.md)

Apex est une application web auto-hébergée pour piloter plusieurs roadmaps projet (une par équipe ou par PM) au sein d'un même programme, avec une vue consolidée de la santé, des dépendances et des risques. Elle vise la simplicité et la rapidité, sans la lourdeur des outils de portefeuille d'entreprise.

L'interface est en français.

## Fonctionnalités

### Espaces et accès
- **Instance privée** : on entre uniquement par un lien d'invitation. Le tout premier compte d'une installation neuve peut s'inscrire sans invitation et créer le premier espace ; ensuite, l'inscription est fermée.
- Liens d'invitation : valables 7 jours, à usage unique pour un Admin, réutilisables pour un Membre, révocables à tout moment.
- Deux rôles par espace : Admin et Membre, avec changement de rôle et retrait d'un membre (le dernier admin est protégé).
- Un compte appartient à un seul espace (le multi-espace est prévu).

### Roadmaps et items
- Création de roadmap depuis le dashboard (titre, description, couleur, emoji ou logo).
- Items avec titre, dates, statut, avancement et responsable ; changements de statut horodatés.
- Hiérarchie Epic / sous-item (un niveau), avec agrégation automatique des dates et de l'avancement.
- Jalons, personnalisation visuelle de chaque roadmap, export Excel (items, jalons, risques, dépendances).
- Suppression d'une roadmap réservée aux admins, avec confirmation.

### Vue Gantt
- Glisser-déposer des dates, poignées de redimensionnement.
- Connecteurs de dépendance en courbes de Bézier, avec poignée déplaçable.
- Zoom Semaine / Mois / Trimestre calé sur le vrai calendrier.
- Bandeau de calendrier de sprints configurable.
- Suivi des dates prévues et réelles.

### Dépendances et risques
- Quatre types de dépendance (FD, DD, FF, DF) et trois types de cible (tâche, équipe, système externe).
- Détection des dépendances circulaires, tableau récapitulatif par roadmap.
- Risques par roadmap : impact, probabilité, statut (ouvert, mitigé, clos).

### Dashboard et vue consolidée
- KPI globaux, panneau « Attention requise », graphique de tendance de santé.
- Statut de santé automatique (vert, orange, rouge), avec des seuils configurables.
- Filtres instantanés et accès au détail de chaque roadmap.

### Imports assistés par IA (Anthropic Claude Haiku)
- Import Excel : détection de la ligne d'en-tête, mapping des colonnes par l'IA, revue humaine avant import.
- Import depuis une image (capture d'un tableau ou d'une vue Gantt / swimlane).

### Intégration Jira Cloud (bidirectionnelle)
- Connexion par espace, jetons d'API chiffrés en AES-256-GCM (clé dérivée par HKDF et liée à l'espace, rotation de clé possible).
- Mapping du projet et des champs de date par roadmap, synchronisation des Epics, Stories et liens « Blocks ».
- Les items sont masqués (jamais supprimés) si leurs dates disparaissent ou si les tickets sont supprimés dans Jira.
- Écriture des dates vers Jira lors des modifications manuelles.
- Fonctionne derrière un proxy d'entreprise (voir plus bas).

### Interface
- Thème sombre, composants de style shadcn faits main, police Inter auto-hébergée.

## Sécurité

- **Contrôle d'accès sur chaque objet** : un utilisateur ne voit et ne modifie que les données de son espace. « Inexistant » et « pas à toi » renvoient la même 404, pages comprises.
- **Inscription fermée** : invitation obligatoire (sauf pour le tout premier compte), messages d'erreur génériques qui ne révèlent pas si un email est inscrit.
- **Protection de la connexion** : 3 échecs par email et 10 échecs par adresse IP en 15 minutes bloquent les nouvelles tentatives ; même temps de réponse que l'email existe ou non ; mots de passe de 12 caractères minimum.
- **Sessions** : elles expirent après 8 heures d'inactivité et sont renouvelées tant que la personne est active. « Tous les appareils » (barre du haut) ferme toutes les sessions du compte ; le retrait d'un membre révoque aussi ses sessions.
- **Maîtrise des coûts** : les analyses par IA sont limitées par utilisateur, par espace et pour toute l'instance (30 par jour par défaut, voir `APEX_AI_DAILY_LIMIT`).
- Les compteurs de limites sont stockés dans PostgreSQL : ils survivent aux redémarrages et sont partagés entre plusieurs copies du serveur. Les clés sont stockées en empreinte SHA-256 (ni email ni adresse IP en clair).
- En-têtes de sécurité HTTP (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- Validation stricte des données reçues ; logos vérifiés sur leur contenu réel (PNG, JPEG, WebP).
- Intégration Jira limitée à `https://*.atlassian.net`, sans suivre les redirections.
- Aucun corps de réponse externe ni aucun contenu de fichier importé n'est écrit dans les journaux du serveur.
- L'application refuse de démarrer si un secret est absent ou trop faible.

## Installation (développement)

### Prérequis

1. **Node.js 24** - https://nodejs.org
2. **Docker Desktop** (ou Docker Engine) - https://www.docker.com, lancé avant de démarrer la base de données.

### Étapes

1. Installe les dépendances :
   ```bash
   npm install
   ```
2. Crée ton fichier d'environnement et remplace chaque valeur d'exemple (les instructions sont dans le fichier) :
   ```bash
   cp .env.example .env        # Windows PowerShell : copy .env.example .env
   ```
   L'application refuse de démarrer si `NEXTAUTH_SECRET` garde sa valeur d'exemple ou fait moins de 32 caractères.
3. Démarre PostgreSQL (publié sur `127.0.0.1:5432` uniquement) :
   ```bash
   docker compose up -d
   ```
4. Crée les tables :
   ```bash
   npx prisma migrate deploy
   ```
5. Choisis **l'une** des deux options :
   - **Données de démo** : `npm run db:seed` crée un espace de démo avec plusieurs roadmaps, des items, des risques et des dépendances inter-équipes. Comptes : `admin@demo.local` et un PM par équipe (`pm-rocker@demo.local`, `pm-solid@demo.local`, `pm-falcon@demo.local`, `pm-dmi@demo.local`, `pm-b2c@demo.local`). Le mot de passe est aléatoire, sauf si tu en fixes un avec `SEED_DEMO_PASSWORD` (12 caractères minimum) dans `.env`. Relancer le seed efface puis recrée l'espace de démo ; il est refusé en production.
   - **Instance vide** : lance l'application, ouvre `/register` et crée le premier compte, puis crée ton espace et invite ton équipe depuis la page Membres.
6. Lance l'application :
   ```bash
   npm run dev
   ```
   Ouvre http://localhost:3000

### Arrêter / relancer

- Arrêter l'app : `Ctrl+C`
- Arrêter la base : `docker compose down` (les données restent dans `postgres-data/`)
- Relancer : `docker compose up -d`, puis `npm run dev`

### Réseau d'entreprise avec proxy

Si le trafic sortant doit passer par un proxy :

1. Renseigne `JIRA_HTTP_PROXY` dans `.env` (malgré son nom, elle sert à Jira et à Anthropic). Laisse-la en commentaire quand tu n'es pas derrière le proxy, sinon ces appels échouent.
2. Si le proxy inspecte le trafic HTTPS avec son propre certificat, fais confiance aux certificats du système plutôt que de désactiver la vérification. Définis la variable **dans l'environnement du système, pas dans `.env`** (Node la lit avant le chargement de `.env`), puis ouvre un nouveau terminal :
   ```powershell
   [Environment]::SetEnvironmentVariable("NODE_USE_SYSTEM_CA", "1", "User")   # Windows
   ```
   ```bash
   export NODE_USE_SYSTEM_CA=1                                                  # macOS / Linux
   ```
   Si ça ne suffit pas, indique le fichier du certificat racine du proxy dans `NODE_EXTRA_CA_CERTS`. N'utilise jamais `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Configuration

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | oui | Connexion à PostgreSQL |
| `NEXTAUTH_SECRET` | oui | Secret de signature des sessions, 32 caractères aléatoires minimum. Le changer déconnecte tout le monde |
| `NEXTAUTH_URL` | oui | Adresse publique de l'application |
| `JIRA_ENCRYPTION_KEY` | oui | Clé de chiffrement des jetons Jira, 32 caractères aléatoires minimum |
| `JIRA_ENCRYPTION_KEY_PREVIOUS` | non | Ancienne clé, uniquement pendant un changement de clé |
| `ANTHROPIC_API_KEY` | pour les imports IA | Clé d'API Anthropic |
| `APEX_AI_DAILY_LIMIT` | non | Analyses par IA par jour pour toute l'instance (30 par défaut) |
| `JIRA_HTTP_PROXY` | non | Proxy HTTP sortant pour Jira et Anthropic |
| `SEED_DEMO_PASSWORD` | non | Mot de passe fixe des comptes de démo |

## Avant une mise en production

- Place Apex derrière un **proxy inverse HTTPS** qui renseigne `X-Forwarded-For` avec l'adresse réelle du client, et n'expose jamais directement le port de Node : les limites par adresse IP reposent sur cet en-tête.
- Utilise des secrets forts et uniques, et renseigne `NEXTAUTH_URL` avec l'adresse publique.
- Applique les migrations avec `npx prisma migrate deploy`, jamais avec `migrate dev`.
- **Crée le premier compte juste après le déploiement** : tant qu'aucun compte n'existe, toute personne qui atteint l'instance peut s'y inscrire comme premier utilisateur.
- Mets en place des sauvegardes automatiques de PostgreSQL.
- Vérifie avant chaque version :
  ```bash
  npx tsc --noEmit
  npm run build
  npm audit
  ```

## Prochaines étapes

- Connexion unique (SSO, OpenID Connect).
- Comptes multi-espaces avec sélecteur d'espace.
- Emails transactionnels : vérification d'email, mot de passe oublié, invitations liées à une adresse email.
- Content Security Policy avec nonces.

## Stack technique

Next.js 15 (App Router) · React 19 · TypeScript · PostgreSQL · Prisma · NextAuth · Tailwind CSS · composants de style shadcn · Anthropic Claude Haiku · API Jira Cloud · SheetJS · Docker Compose

## Outils utiles

```bash
npx prisma studio
```
