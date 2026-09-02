# TrainSync — site iPhone Hevy + Garmin

Application web installable (PWA) qui réunit les séances Hevy et Garmin, affiche une analyse sur 28 jours et génère des suggestions de musculation/cardio. Aucun passage par Xcode n’est nécessaire.

## Version web

- Site mobile hébergé par GitHub Pages.
- Onglets Séances, Analyse, Coach et Réglages.
- Mode démonstration immédiatement visible.
- Suggestions locales hors ligne.
- Import CSV/JSON Hevy et Garmin.
- Stockage des séances sur l’appareil avec `localStorage`.
- Installation sur l’écran d’accueil depuis Safari.
- Redéploiement automatique à chaque modification du dossier `web/` sur `main`.
- Relais sécurisé facultatif pour la synchronisation et ChatGPT.
- Suggestions publiées par ChatGPT depuis `web/data/coach.json` et chargées automatiquement à l’ouverture.

Le site se trouve dans `web/`. Le workflow `.github/workflows/pages.yml` le publie automatiquement.

## Activer GitHub Pages

Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**. Le site sera ensuite disponible à l’adresse GitHub Pages du dépôt.

## Ajouter le site à l’iPhone

1. Ouvrir le site dans Safari.
2. Toucher **Partager**.
3. Choisir **Sur l’écran d’accueil**.

## Données et limites

- Un site web ne peut pas lire directement Apple Santé/HealthKit.
- GitHub Pages ne peut pas conserver une clé Hevy ou OpenAI en secret.
- Les imports fonctionnent directement et restent sur l’appareil.
- Pour une synchronisation automatique Hevy et des recommandations ChatGPT, utiliser un relais sécurisé tel que `Backend/worker.js`.
- L’automatisation Garmin nécessite un accès API Garmin approuvé ou une source intermédiaire autorisée ; en attendant, utiliser l’import Garmin Connect.

## Ancien prototype iOS

Les fichiers Swift/Xcode sont conservés dans l’historique du dépôt, mais ne sont plus nécessaires pour utiliser TrainSync.
