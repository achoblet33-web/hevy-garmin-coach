# Audit Runna → TrainSync Performance Coach
**Référence publique vérifiée : 28 octobre 2026.** Runna iOS, application 8.59.0 (20 octobre 2026) et centre d'aide officiel. Audit fonctionnel : **pas d'accès aux composants internes, API privées, algorithmes propriétaires ou à un compte Runna Premium**. Ne pas copier l'identité visuelle, les textes longs, le code, les illustrations, les cours propriétaires ou les marques Runna. S'inspirer des parcours et concevoir notre propre expérience.

## Architecture conservée
- PWA TrainSync hébergée indépendamment, sans licence Apple Developer.
- **Intervals.icu** : activité running, calendrier, récupération selon disponibilité; **Hevy** : source exacte des séries et charges; **Bevel** : seulement données Apple Santé accessibles par passerelle, pas de scores propriétaires.
- Worker Cloudflare 3.0 (préproduction à connecter, production 2.3.1 intacte). **Companion** assure l'acheminement des séances vers l'application Exercice d'Apple, sans application watchOS native TrainSync.
- Version de démonstration Railway isolée, données fictives : https://trainsync-staging-demo-staging.up.railway.app/?demo=1 .
- Préserver les anciennes fonctionnalités, modules, historiques et toutes les connexions de TrainSync; architecture additive, déploiement après tests.

## Inventaire des parcours & fonctionnalités documentés
| Domaine | Fonction Runna observée publiquement | Équivalent TrainSync cible | État |
|---|---|---|---|
| Accueil | Aujourd'hui, prochaine séance, kilométrage, conseils | Coach Today et prochain entraînement | V3.1 prototype |
| Objectifs | Première course/5/10/semi/marathon/ultra/distance libre | Programme sur mesure avec échéance | V3.1 prototype 5/10/semi/marathon |
| Évaluation | Niveau actuel, historique, allure, volume, fréquence | Calibration historique Intervals et seuil | À faire |
| Construction du plan | 8–26 semaines, cycles et phases | Fondations, charge, assimilation, affûtage | V3.1 prototype de planification, à valider |
| Fréquence & disponibilité | Jours d'entraînement, course longue préférée | Choix des jours, course longue, 2–6 courses/sem. | V3.1 prototype |
| Calendrier | Semaine, jours, types de séance colorés | Timeline hebdo, dates et phases | V3.1 prototype |
| Gestion des séances | Déplacer une séance, revoir calendrier | Déplacer manuellement, historique de versions | V3.1 prototype |
| Plan flexible | Vacances et interruption | Pause 3–21 jours, footings seulement ou arrêt | V3.1 première version |
| Fatigue & reprise | « Not feeling 100% » avec reprise graduée | Allègement temporaire et reprise graduée | Réduction V3.1, reprise multi-étapes à faire |
| B-Races | Course préparatoire, réduction et récupération | Course secondaire à échéance intermédiaire | À faire |
| Sorties faciles | Easy / recovery / run-walk | Footings faciles et marche-course | Easy V3; run-walk à faire |
| Entraînements ciblés | Intervalles, tempo, côtes, progressif, fartlek, tests, long | Bibliothèque de modèles WorkoutKit via Intervals | Easy/long/tempo/interval V3 ; reste à faire |
| Séances libres | Instant Workouts, temps, distance, allure | Séance à la demande sans programme | V3 basique |
| Allures | Cibles personnalisées, zones, allure/RPE | Calibration seuil, zones et RPE | Cibles zone basiques; calibration à faire |
| Adaptation des allures | Pace Insights, proposition explicite et réversible | Détection écarts, recommandation à accepter | À faire |
| Progression | Kilométrage hebdo/annuel, records, historique | Statistiques d'entraînement et tendance | V3 basique |
| Score de progrès | Score Runna propriétaire | Score TrainSync explicable (pas de copie de formule) | À faire |
| Briefing | Conseil avant séance, météo, entraînement précédent, ravitaillement | Briefing généré selon source réelle | V3.1 texte initial; briefing enrichi à faire |
| Bilan | Écart réel vs attendu, workout insights | Comparaison répétitions, GPS et cibles | À faire |
| Retour utilisateur | Note séance + raison (« trop difficile », etc.) | RPE, douleur, ressentis et révision manuelle | À faire |
| Chaleur | Adapt for Heat : ressenti + durée + acceptation | Alerte chaleur/humidité + option de RPE | À faire |
| Pente | Profil dénivelé, séance côtes | Détection D+, estimation effort ajusté | À faire |
| Montre | Programme synchronisé vers Apple Watch | Intervals.icu → Companion → Exercice | Backend prêt, test physique en attente |
| Coaching direct | Vibration/audio, contrôle sur iPhone et montre | Alertes natives dans Exercice via WorkoutKit/Companion | Dépend Companion ; mirroring impossible en PWA |
| Enregistrement | Outdoor, Indoor, tapis connecté Bluetooth FTMS | Enregistrement via Apple Watch; données retour | Extérieur à tester; tapis BT non disponible directement sur iOS PWA sans support |
| Parcours | Navigation sur itinéraires Strava publics | Import GPX et carte + export si passerelle permet | À étudier |
| Mobilité & renforcement | Force, yoga, Pilates | Hevy en référence, mobilité informative | Hevy V3; mobilité facultative |
| Nutrition | Hydratation, alimentation, stratégie de course | Conseils généraux personnalisables | À faire |
| Chaussures | Paires suivies au kilométrage | Inventaire et kilométrage automatique | À faire |
| Records | Records calculés et ajustables | PR par distance, réconciliation GPS | À faire |
| Calendrier externe | Synchronisation calendrier et montres | Calendrier Intervals + export ICS | Intervals V3; ICS à faire |
| Notifications | Alertes audio/rappels | Web Push sur PWA installée, sous autorisation | À faire |
| Communauté | Club, sondages et événements | Optionnel, ne pas créer sans besoin explicite | Hors V3 prioritaire |
| Assistance | Support, guides, contenus coach | Centre d'aide dans PWA + assistant explicatif | À faire |
| Confidentialité | Autorisations et données santé | Séparer secrets, consentements et exports | Clés serveurs V3, stockage local proto |
| Historique | Plans passés, activités hors plan | Historique de versions, import sans doublons | Versions V3.1, réconciliation à fiabiliser |
| Équipement | Préférences piste/tapis/zones | Préférences course et capteurs | À faire |

### Statuts et preuves
- **V3 existant** : code présent sur branche, tests de service et de séance simulés; ne préjuge pas de connexion Apple Watch physique.
- **V3.1 prototype** : plan généré localement (non publié en bloc), validation et rollback, calendrier, adaptation de base. Des tests ne prouvent pas la qualité d'entraînement à long terme ni l'équivalence clinique à un coach.
- **À faire** : fonctionnalité recherchée, documentée mais pas implémentée. **Impossible en PWA seule** : pilotage live WorkoutKit/HealthKit, GPS sportif en arrière-plan fiable avec alertes haptique natives, mirroring de la montre, contrôle FTMS natif; une passerelle ou une app native tierce est requise.

## Priorité de développement
1. **Expérience coach Runna** : Aujourd'hui, onboarding, calendrier hebdo, bibliothèque de séances, plan progressif, semaines allégées, affûtage.
2. **Fiabilité des données & publication** : normaliser séances (distance réelle vs prévue), fusion Apple Santé/Intervals, charge Hevy, confirmation état sur montre, suppression doublons.
3. **Coach adaptatif explicable** : ressenti, Hevy jambes, HRV tendance, sommeil, stress, événement secondaire, vacations, retour d'interruption, état météo; appliquer seulement après consentement.
4. **Performance avancée** : analyses de fractions et écarts à l'allure cible, estimation PR, Pace Insights propriétaire TrainSync, feedback après course, dénivelé.
5. **Plus** : chaussures, calendrier ICS, circuits GPS, notification PWA, nutrition/hydratation, conseils piste/tapis; communauté facultative.

## Règles de calcul et limites actuelles
- Le prototype V3.1 emploie une **progression indicative** au plus 6 % d'une semaine à l'autre sur son cycle théorique, décharges et affûtage, une sortie longue limitée, intensités proposées selon le volume initial; ce n'est pas une méthode garantie médicalement ni un entraînement final validé.
- Ne pas inférer une allure cible à partir d'un chrono souhaité seul. Calibrer sur séances réelles, zones de seuil, et ressentis; sinon travailler par RPE.
- La fatigue Hevy et le sommeil restent des signaux, pas un diagnostic. En cas de douleurs ou maladie, repos et prise d'avis médical au besoin.
- L'utilisateur doit valider les changements; aucun plan modifié silencieusement. Pas de travail asynchrone sans automation.
- Pour Runna, la fonction Pace Insights **ne modifie pas directement** le plan : elle demande une acceptation du changement de cible. Le reproduire avec une logique différente et transparente.
- Sauf app native tierce, le coach vocal original et la commande de la montre depuis une PWA sont hors de portée.

## Sources officielles Runna (consultées le 28/10/2026)
- https://apps.apple.com/fr/app/runna-coach-course-%C3%A0-pied/id1594204443
- https://support.runna.com/fr/articles/10473504-votre-guide-rapide-pour-utiliser-l-application-runna
- https://support.runna.com/fr/collections/3431949-fonctionnalites-de-l-application-abonnements-et-questions-frequentes
- https://support.runna.com/fr/articles/10116460-comment-utiliser-les-entrainements-instantanes
- https://support.runna.com/fr/articles/14656203-que-sont-les-analyses-d-allure-et-comment-fonctionnent-elles
- https://support.runna.com/fr/articles/13169751-que-sont-les-briefings-d-entrainement
- https://support.runna.com/fr/articles/15647483-comment-runna-adapte-t-il-mes-entrainements-en-fonction-de-la-chaleur-et-de-l-humidite
- https://support.runna.com/fr/articles/7895279-qu-est-ce-que-le-score-runna
- https://support.runna.com/fr/articles/9973602-analysez-vos-seances-d-entrainement-pour-optimiser-votre-programme
- https://support.runna.com/fr/articles/10856802-comment-ajouter-et-gerer-votre-b-race
- https://support.runna.com/fr/articles/6306200-utiliser-votre-apple-watch-avec-runna-et-en-tirer-le-meilleur-parti
