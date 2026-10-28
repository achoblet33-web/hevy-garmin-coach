# TrainSync 3.0 — Centre sportif PWA (première livraison)

## Source de vérité
- **Intervals.icu** : activités course, historique cardio, calendrier et métriques de récupération disponibles.
- **Hevy** : détails des entraînements de musculation (exercices, séries, charges, répétitions, RPE).
- **Apple Watch Ultra 3** : séances enregistrées dans Exercice; transferts via **Intervals.icu Companion** sur iPhone.
- **Garmin** : historique ancien conservé, mais n'est plus le flux prioritaire des activités nouvelles.
- **Bevel** : scores propriétaires non lus directement; les métriques partagées dans Apple Santé peuvent transiter via Companion avec permission.

Aucune application native TrainSync ni licence développeur Apple nécessaire. La PWA ne peut pas parler à HealthKit/WorkoutKit directement.

## Ce qui est développé sur la branche
- Onglet **Performance** ajouté à la PWA sans écraser les sections historiques.
- Tableau de bord running sur 7/28 jours avec liste des activités Intervals et des séances planifiées.
- Indicateurs de récupération (HRV, FC repos, sommeil) selon disponibilité dans Intervals.
- Hevy : indice prudent de sollicitation récente des jambes (règle descriptive, pas un diagnostic).
- Formulaire d'objectif (distance, chrono, date, séances/semaine) stocké localement. **Ce n'est pas encore un programme périodisé généré automatiquement.**
- Générateur de **4 séances structurées** : endurance, sortie longue, tempo, fractionné, avec aperçu avant publication.
- Écriture API Intervals via Worker Cloudflare, auth serveur, ID externe stable et contrôle anti-doublon avant POST. Vérification de la structure renvoyée par API. **Le transfert effectif vers la montre n'est pas vérifié par TrainSync.**
- Anciennes routes Cloudflare v2.3 maintenues par délégation à `worker-v23.js`.

## Déploiement : pas encore effectué
Il s'agit d'une branche et d'une PR. La production GitHub Pages et le Worker Cloudflare actuels restent inchangés.

1. Sur Cloudflare Workers, garder les secrets côté serveur : `APP_TOKEN`, `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`, et éventuellement `HEVY_API_KEY`. Ne les coller ni dans GitHub, ni dans la PWA, ni dans les commentaires de la PR.
2. Préparer `INTERVALS_API_KEY` dans Intervals.icu **Settings > Developer Settings**. Le Worker existant utilise déjà les noms de variables `INTERVALS_API_KEY` et `INTERVALS_ATHLETE_ID`, mais **leur présence réelle en production n'a pas été vérifiée**.
3. Dans Intervals.icu > Sport Settings > Run, vérifier les **zones de fréquence cardiaque et d'allure**, en particulier allure au seuil et limites des zones. Sans elles, un entraînement peut arriver sans cibles exploitables.
4. Une fois les tests et la PR validés, déployer `Backend/worker-v30.js` via `Backend/wrangler.jsonc` et publier `web/` sur GitHub Pages. Contrôler `GET /v3/status` avec APP_TOKEN, puis `GET /v3/dashboard`.
5. Dans **Intervals.icu Companion** sur iPhone, activer le transfert des activités Apple Santé vers Intervals, ainsi que la synchronisation des entraînements planifiés vers Apple Watch. Ouvrir Companion avec l'iPhone déverrouillé pour pousser une séance avant de la commencer.
6. Test bout en bout : publier une **séance de test future** depuis TrainSync; contrôler sa structure sur Intervals; vérifier sa présence dans Exercice sur l'Ultra 3; effectuer une course d'essai; synchroniser Companion; vérifier qu'elle apparaît **une seule fois** dans TrainSync.

## API v3
- `GET /v3/status` : état de configuration (jamais de clé).
- `GET /v3/dashboard?days=90` : activités Intervals, calendrier, wellness et musculation Hevy.
- `POST /v3/workouts/preview` : valide et renvoie la description structurée.
- `POST /v3/workouts/publish` : publication après validation explicite (et contrôle anti-doublon).
- Toutes les routes v3 exigent `Authorization: Bearer APP_TOKEN`.
- Les nouvelles écritures Apple Santé ne sont **jamais** réalisées par TrainSync, afin de prévenir les doublons.

## Limitations prévues
- La synchronisation Apple Watch dépend de Companion (pas de connexion directe depuis la PWA). Un échange du 27 octobre 2026 sur le forum indique qu'un iPhone déverrouillé avec Companion ouvert peut encore être nécessaire.
- Le contrôle anti-doublon par `external_id` protège les clics répétés, pas deux requêtes simultanées; une éventuelle mise à jour de séance existante demande un futur mécanisme d'upsert sous contrôle utilisateur.
- L'endpoint wellness dépend des autorisations et des champs disponibles; on n'invente pas de score de préparation.
- Les zones HR/Pace et la conversion par Companion doivent être confirmées sur la montre; un event Intervals ne garantit pas sa présence effective sur watchOS.
- La prédiction chrono, la périodisation complète, les notifications PWA et l'adaptation météo n'ont **pas** encore été développées.
- Les anciennes parties de l'application restent intactes; un nettoyage des scripts historiques et un stockage IndexedDB restent à faire.

## Sources de référence
- https://www.intervals.icu/features/open-api/
- https://forum.intervals.icu/t/workout-builder-syntax-quick-guide/123701
- https://forum.intervals.icu/t/api-access-to-intervals-icu/609
- https://forum.intervals.icu/t/events-created-via-api-with-workout-doc-the-web-download-produces-an-empty-fit-while-the-api-download-does-not-which-representation-feeds-device-sync/132326
- https://forum.intervals.icu/t/watch-app-direct-upload-sync-over-wi-fi-pace-alerts-on-segment-average/133279
