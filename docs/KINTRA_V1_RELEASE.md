# KINTRA — V1.0, identité sportive et centre de performance
Date : 28 octobre 2026

## Marque et interface
- Nom officiel affiché : **KINTRA** ; slogan : « Ton potentiel en mouvement ».
- Logo vectoriel original : `web/runna-next/kintra-logo.svg`.
- Icône de marque : `kintra-icon.svg` et fichiers PNG 192/512 px générés pour iPhone et PWA.
- Direction visuelle : cartes blanches, fond clair, typographie sobre, rouge rubis, bordeaux et corail. Les interfaces des séances, de la navigation et de la progression restent mobiles.
- Installation PWA : `https://trainsync-staging-demo-staging.up.railway.app/runna-next/index.html`. Le domaine actuel conserve son ancien libellé technique, **l'application s'appelle KINTRA**.
- Retirer au besoin l'ancien raccourci TrainSync de l'écran d'accueil et ajouter la nouvelle page KINTRA depuis Safari > Partager > Sur l'écran d'accueil, afin de prendre la nouvelle icône. Ceci ne supprime pas les historiques du service Intervals.icu.

## Modules disponibles
- **Aujourd'hui** : état d'entraînement et de récupération basé exclusivement sur des mesures existantes (pas de faux score Garmin/Runna), sommeils/HRV/FC de repos lorsque fournis, charge course sur 7 j, contexte musculation, séance programmée, conseil prudence.
- **Coach, objectif événement** : course objectif, distance, échéance, chrono facultatif, volume actuel, fréquence, jours disponibles ; programme avec entraînements faciles, intervalles contrôlés, semaine allégée et affûtage. Algorithme original **provisoire** à valider avec l'historique réel de l'athlète.
- **Coach, mode maintien** : cycle renouvelable de quatre semaines, sans course fictive ; endurance, sortie longue, intensité modérée facultative selon le volume déclaré et 4e semaine allégée. Les réorganisations nécessitent confirmation.
- **Progrès** : activités réelles Intervals.icu, kilométrage, analyse des tours et compte rendu de séance, notes RPE, lien avec le programme lorsque `paired_event_id` est présent.
- **Apple Watch Ultra 3** : publication d'entraînements structurés vers le calendrier Intervals.icu, récupération sur l'Apple Watch via Companion, puis retour dans les données d'activité. La présence de la séance dans l'application Exercice a été confirmée par l'athlète lors du jalon précédent.
- **Renforcement** : entraînements de force remontés par Intervals.icu ; connexion facultative Hevy **Pro** en lecture seule avec clé API personnelle, détails exercices/séries, sans modification Hevy.
- **Météo** : demande explicite de localisation via le navigateur, coordonnées arrondies à 2 décimales envoyées au serveur pour consulter Open-Meteo (température, ressenti, humidité, vent). Aucune localisation stockée dans l'application ou Railway.

## Confidentialité et qualité
- La clé Intervals.icu reste privée, envoyée uniquement aux appels API HTTPS, non stockée sur Railway ; sauvegarde client facultative chiffrée à l'aide d'une phrase secrète.
- Même approche pour une clé Hevy Pro facultative. Clés jamais présentes dans GitHub.
- Les réponses sportives et météo ne sont pas mises en cache par le service worker.
- Les valeurs manquantes restent **« — »**. Les avertissements sur HRV, sommeil et charge sont des signaux de prudence et **non un diagnostic, ni un score médical ou physiologique de référence**.
- Les plans et conseils sont fondés sur des règles transparentes et conservatrices ; ils ne reprennent ni les algorithmes, ni les données propriétaires de Garmin/Runna.
- Ne pas modifier automatiquement les charges, séances ni cibles d'allure à partir d'un score isolé. Toute adaptation future doit être prévisualisée et approuvée.
- Ancienne production Cloudflare / GitHub Pages **inchangée** ; PR en brouillon et déploiement limité au projet Railway dédié.

## Validation
- `npm test` : génération course, maintien, sécurité des clés, Hevy mock, Intervals mock, récupération et appariement des activités.
- `node --check` : modules KINTRA, relais, site.
- `npx wrangler deploy --dry-run` : vérification sans publication Cloudflare.
- GitHub Actions : tests HTTPS et Chromium (iPhone simulé), création de programme événement, maintien, séance libre, bilan post-course et UI.
- **Non validés sur le compte réel** dans cette phase : récupération Hevy Pro, météo avec permission effective iPhone, intelligence Garmin/Runna équivalente, qualité scientifique à long terme du plan. Seule la passerelle de séance Apple Watch a déjà été confirmée par l'utilisateur.

## Sources publiques utilisées pour guider les fonctionnalités
- Runna : <https://support.runna.com/fr/articles/15443877-comment-creer-un-programme-d-entrainement-sur-runna>
- Runna : <https://support.runna.com/fr/articles/10473504-votre-guide-rapide-pour-utiliser-l-application-runna>
- Garmin : <https://support.garmin.com/fr-FR/?faq=oYknGZ910l1pfBNzkDHX6A>
- Hevy API : <https://api.hevyapp.com/docs/>
- Open-Meteo : <https://open-meteo.com/en/docs>
