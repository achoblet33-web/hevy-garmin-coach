# Hevy Garmin Coach — MVP iPhone

Application SwiftUI iOS 17 qui réunit les séances Hevy et Garmin, affiche une analyse sur 28 jours et génère des suggestions de musculation/cardio.

## Ce qui fonctionne

- Historique Hevy via l’API officielle (`api-key`, Hevy Pro).
- Activités Garmin via Apple Santé / HealthKit.
- Onglets Séances, Analyse, Coach et Réglages.
- Mode démonstration immédiatement visible.
- Suggestions locales hors ligne.
- Suggestions ChatGPT via le relais sécurisé inclus dans `Backend/worker.js`.
- Clé Hevy et jeton du relais conservés dans le Trousseau iOS.

## Ouvrir dans Xcode

1. Installer Xcode 16 ou plus récent.
2. Ouvrir directement `HevyGarminCoach.xcodeproj`.
3. Dans **Signing & Capabilities**, choisir son équipe Apple et vérifier que **HealthKit** est activé.
4. Sélectionner un iPhone réel puis lancer l’app. HealthKit n’est pas pleinement testable dans le simulateur.

Le fichier `project.yml` est aussi fourni pour régénérer le projet avec XcodeGen si nécessaire.

## Connecter Garmin

Dans Garmin Connect : **Plus → Paramètres → Applications connectées → Apple Santé → Se connecter**. Autoriser au minimum les entraînements, la distance et l’énergie. Ouvrir Garmin Connect après la synchronisation de la montre afin qu’il transmette les activités à Santé.

## Connecter Hevy

Récupérer la clé dans les réglages développeur de Hevy Web (abonnement Hevy Pro), puis la coller dans l’onglet **Réglages** de l’app.

## Activer ChatGPT

Ne jamais mettre une clé OpenAI dans l’app iPhone. Déployer `Backend/worker.js` comme Cloudflare Worker, puis définir :

- secret `OPENAI_API_KEY` ;
- variable facultative `OPENAI_MODEL` (par défaut `gpt-5.6-luna`) ;
- secret facultatif `APP_TOKEN`.

Renseigner ensuite `https://<worker>/recommend` et le même `APP_TOKEN` dans l’app. Sans cette URL, le Coach utilise automatiquement le moteur local.

## Limites du MVP

- Garmin ne transmet pas la trace GPS complète à Apple Santé.
- La fréquence cardiaque détaillée d’une activité Garmin peut manquer dans Santé.
- Les conseils ne remplacent pas un avis médical ; l’app évite les diagnostics et recommande une option de récupération.
- Pour une publication App Store, ajouter un backend authentifié par utilisateur, une politique de confidentialité, une icône et des tests sur appareil réel.
