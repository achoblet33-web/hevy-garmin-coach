# TRAIN SYNC COACH — Product direction (Runna-first)
Date: 2026-10-28

## Décision
Les anciennes demandes de fonctionnalités de TrainSync ne constituent **plus** le cahier des charges. Le produit se concentre désormais sur la qualité d'une application de **coaching running** proche de l'expérience publique de Runna : objectifs → programme → séance du jour → entraînement structuré → résultats → adaptation.

Le produit doit conserver ses propres couleurs, termes, architecture, illustrations, code, algorithmes et contenu audio. Pas de copie d'interface pixel-pour-pixel ni d'actifs propriétaires de Runna.

## Nouvelle expérience principale
- **Aujourd'hui** : programme actif, compte à rebours de course, bande de semaine, détails de l'entraînement et conseils.
- **Plan** : semaine en cours, séances types, calendrier modulable, dates, séance longue, contrôle de la charge.
- **Séance** : description pas-à-pas, objectifs et pourquoi, possibilité de marquer, reporter ou donner un ressenti; envoi vers la montre sous confirmation.
- **Activités** : réelles via Intervals.icu après autorisation; progression, distance cumulée, historique et analyse.
- **Profil** : objectifs, gestion des sources, connexions (Apple Watch/Intervals.icu, Hevy pour fatigue), versions précédentes.
- **Séance libre** : easy, long, tempo, interval sans modifier automatiquement le cycle principal.

### État réel
✅ App autonome sur `web/runna-next/` : écran Aujourd'hui, navigation compacte, wizard en quatre étapes, calendrier hebdomadaire, détail, séance libre, historique, adaptation, profil, sauvegarde locale, manifest PWA/service worker, prévisualisation de publication Intervals.icu (démo ou Preview explicitement connecté).
✅ Base du plan : `web/plan-engine.mjs` avec progression de volume conservative, allègement, affûtage, disposition des journées et conseils Hevy basiques.
✅ Démo isolée Railway `https://trainsync-staging-demo-staging.up.railway.app/` ; aucune clé personnelle utilisée en mode démo.
✅ Tests du moteur, de l'API de simulation, de la compilation Worker et contrôles HTTPS.
🔶 **Prototype à tester sur iPhone** : UX, temps de chargement, ergonomie, lisibilité, autres cas d'usage.
⏳ **Pas encore une parité fonctionnelle Runna** : Pace Insights calculés sur tours réels, recommandations chrono calibrées, coach vocal natif, B-races, programmes multi-objectifs, suivi chaussures, plan physiologiquement validé, synthèse sommeil/HRV, reprise optimisée, notifications de séance sur montre. Requiert des données réelles et des tests en conditions d'utilisation.

## Stratégie technique
- **Nouveau parcours** autonome : `web/runna-next/index.html`. Les anciens scripts et données demeurent dans le repo pour rollback et migrer l'historique à terme, mais pas dans l'interface principale.
- PWA : pas de licence Apple Developer, pas de fonctions natives HealthKit/WorkoutKit ; Apple Watch via Intervals.icu Companion.
- Les données de course : Intervals.icu en lecture; musculation Hevy comme contexte, non comme tab principal.
- Les secrets restent côté Cloudflare Preview. En démo Railway, seules des données fictives sont générées. Le formulaire Preview ne retient les secrets qu'en mémoire.
- Écriture réelle dans Intervals uniquement après prévisualisation et consentement, jamais en tâche cachée.
- **Ne pas fusionner sur main ni redéployer le Worker production** sans validation du transfert montre, tests navigateur et revue du moteur de plan.

## Références publiques
- https://support.runna.com/fr/articles/10473504-votre-guide-rapide-pour-utiliser-l-application-runna
- https://support.runna.com/fr/articles/10137793-comment-utiliser-votre-calendrier-d-entrainement
- https://support.runna.com/fr/articles/10116460-comment-utiliser-les-entrainements-instantanes
- https://support.runna.com/fr/articles/14656203-que-sont-les-analyses-d-allure-et-comment-fonctionnent-elles
- https://support.runna.com/fr/articles/10026375-comment-utiliser-la-fonctionnalite-de-reajustement-du-plan
