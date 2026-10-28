# KINTRA Coach — Cahier des charges fonctionnel et technique final

**Révision :** RC 1 — 28 octobre 2026  
**Dépôt :** \`achoblet33-web/hevy-garmin-coach\`  
**Branche d'intégration :** \`feat/trainsync-3-intervals-hub\`  
**Environnement de recette :** https://trainsync-staging-demo-staging.up.railway.app/  
**Usage :** personnel, entraînement course à pied + musculation, Apple Watch Ultra 3 et PWA iPhone.  
**Important :** ce document définit la cible complète. L'existence d'une exigence **n'implique pas** que sa fonctionnalité soit livrée. Voir la matrice d'état et le rapport d'audit.

## 1. Vision, limites et critères de succès

KINTRA est un coach de sport personnel : il montre **ce qui était prévu**, **ce qui a réellement été effectué** et **ce qui peut être ajusté**, en séparant clairement données certifiées, données suggérées et données manquantes.

Principes non négociables :
1. **Aucune mesure inventée.** Un champ absent reste « — » ou « données insuffisantes » ; aucune note de « récupération » créée sans preuve mesurée.
2. **Aucun plan changé silencieusement.** L'utilisateur voit avant/après, raisons, conséquences et accepte ou refuse. Historique restaurable.
3. **Aucune écriture dans Hevy** ; Intervals.icu n'est modifié que lors d'une **publication de séance explicitement demandée**.
4. **Plusieurs sources sans double comptage.** Intervals.icu = entraînements réalisés, calendrier et données accessibles ; Hevy Pro = séries/répétitions/charges ; Apple Santé = via les autorisations d'une passerelle native tierce, jamais directement depuis la PWA.
5. **Confidentialité par défaut.** Clés personnelles non conservées sur le serveur, requêtes chiffrées, restauration volontaire, cartes externes seulement avec accord.
6. **Mobile d'abord.** iPhone 320–430 px, portrait, safe areas, clavier, zoom, navigation tactile.
7. **Séparer les environnements.** Tests fictifs et préproduction avant recette réelle ; production inchangée jusqu'à feu vert explicite.

**Objectifs de recette :** 0 perte de plan / 0 double validation / 0 publication involontaire ; 0 overflow horizontal aux largeurs testées ; parcours suivi en démonstration et réel ; API sans clés = réponse contrôlée et sans fuite ; zéro erreur de console bloquante sur les scénarios clés.

## 2. Parcours utilisateur cible

### Premier lancement
- Écran d'accueil clair : Aujourd'hui / Coach / Progression / Profil.
- Onboarding : objectif (5, 10, semi, marathon, distance libre ou maintien), date ou mode continu, volume de départ, fréquence, jours disponibles, jour de sortie longue, niveau de confiance.
- L'utilisateur confirme **le programme entier** avant enregistrement. Retenir la dernière version validée ; retour possible à une version précédente.
- Les connexions Intervals.icu et Hevy sont facultatives mais l'absence de données doit être visible. Une démo n'a jamais accès aux clés réelles.

### Journée d'entraînement
- Tuiles : prochain entraînement, nombre de courses, musculation, sommeil/récupération si données réelles, météo (lieu choisi manuellement ou GPS avec permission).
- Proposer durée, distance, allures ou RPE en fonction des données ; pas de fausse précision.
- Afficher éventuellement **séance jambes récente** et risque d'interférence avec la qualité running.
- Avant une séance difficile, proposer allégement/décalage/reprise *avec confirmation*, en rappelant l'incertitude.
- Publier une séance structurée vers Intervals.icu, vérifiée côté calendrier ; l'envoi vers Exercice/Apple Watch dépend de Companion.

### Après la course
- Synchroniser Companion/Intervals.icu ; afficher activité, parcours GPS, fractions, distance, durée, allure, FC, puissance, cadence, D+/D− **si transmis**.
- Un entraînement planifié n'est **terminé** que si l'identifiant Intervals.icu l'atteste, ou si l'utilisateur confirme un rapprochement manuel (identifié « confirmé localement »).
- Détecter des importations semblables **sans jamais supprimer automatiquement**.
- L'utilisateur peut renseigner RPE / commentaire et voir les écarts prévu/réalisé sur la période concernée, puis les propositions pour les prochaines séances.

### Musculation
- Afficher les dernières séances Hevy Pro, exercices, séries, charges, répétitions, RPE, durées, éventuel historique partiel.
- Différencier « séance de jambes » et « séance haut du corps » comme signaux de contexte, sans transformer des kilogrammes levés en charge de course.

### Données personnelles
- Export/restauration **chiffrés AES-GCM** en priorité ; anciennes sauvegardes JSON lisibles avec avertissement.
- Les sauvegardes ne contiennent ni clé API, ni coordonnées GPS, ni mesure de santé importée.
- La conservation locale des plans/ressentis en clair dans localStorage demeure une **limitation à traiter** pour le niveau « production prêt à être partagé ».

## 3. Exigences fonctionnelles vérifiables

| ID | Exigence | Critères d'acceptation | État à l'ouverture de la RC |
|---|---|---|---|
| F01 | Accueil iPhone, navigation 4 onglets | Chaque onglet consultable, retour, pas de défilement horizontal 320/390 px | **Implémenté** ; recette réelle en attente |
| F02 | Onboarding et plan daté | Objectif, jours, semaines, séances, restitution après rechargement | **Implémenté** ; pertinence sportive non certifiée |
| F03 | Séances structurées / Apple Watch | Prévisualiser, publier après confirmation, éviter doublon, vérification dans Exercice | **Partiellement validé** : présence sur montre observée, retour complet non validé |
| F04 | Activités Intervals.icu / GPS / détail | Parcours et valeurs réelles quand source fournit les streams ; absence explicitée | **Implémenté** et testé en données fictives |
| F05 | Hevy en lecture seule | Liste, détails, 60 dernières, indication « historique partiel » | **Implémenté** ; vrai compte/limites à vérifier |
| F06 | Prévu/réalisé et association | Identifiant explicite ou confirmation locale, jamais simple coïncidence de date | **Implémenté** ; tests automatisés |
| F07 | Doublons inter-fournisseurs | Regrouper identifiant identique ; signaler ressemblance sans supprimer | **Implémenté** ; arbitrage multi-source avancé à faire |
| F08 | Recommandations course × jambes × récupération | Règles lisibles et indicateurs réellement présents ; aucun diagnostic | **Première version livrée** ; moteur multidisciplinaire complet à faire |
| F09 | Modification de séance proposée | Avant/après, accepter/refuser, version précédente, pas d'écriture externe | **Partiellement implémenté** (allégement) ; décalage/raccourci/reprise à enrichir |
| F10 | Météo dans le format iPhone | Recherche de ville, GPS facultatif, 12 h, ressenti, humidité, avertissements | **Implémenté** ; test Safari physique à réaliser |
| F11 | Export de parcours | GPX manuel, uniquement points accessibles ; avertissement vie privée | **Implémenté** ; parcours éventuellement simplifié |
| F12 | Sauvegarde et restauration | Chiffrement local, passphrase non envoyée, mot de passe erroné = aucun écrasement, aperçu avant acceptation | **Livrable RC** ; tests automatisés requis |
| F13 | Rapports sportifs avancés | Charge hebdo, tendance, régularité fractions, PR, historique long terme | **Partiel** ; PR / tendance long terme à faire |
| F14 | Calendrier croisé course + force | Détecter conflits jambes–qualité, proposer réorganisation | **Partiel** : avertissement ; calendrier multi-activités à faire |
| F15 | PWA hors ligne | Dernière interface disponible, jamais d'API santé mise en cache par service worker | **Partiel** ; cache des assets publics uniquement |
| F16 | Notifications et ICS | Consentement explicite, aucun spam, export calendrier | **Non livré** |
| F17 | Gestion chaussures / nutrition | Suivi kilométrage / conseils généraux optionnels | **Non livré** |
| F18 | Assistance et diagnostics | Connecteurs visibles, raison précise des données absentes, reprise après erreur | **Partiel** |
| F19 | Synchronisation multi-appareils | Même plan iPhone/Mac avec authentification et conflits résolus | **Non livré** ; backend et consentements nécessaires |
| F20 | Santé Apple et entraînement natif | Une passerelle autorisée lit Santé ; Watch WorkoutKit selon capacités natives | **Non disponible depuis une PWA seule** |

## 4. Exigences techniques, sécurité et performance

### T01 — Modèle de données
Chaque activité doit garder {source, identifiant source, date locale et UTC si disponibles, catégorie, champs nullable, appariement fournisseur, qualité de source}. Les identifiants peuvent coïncider entre fournisseurs : ne jamais fusionner seulement sur le titre, la date ou la distance. Le plan courant, son historique, les ressentis et les associations locales sont distincts.

### T02 — Intégrations
- Intervals.icu : lecture activités/calendrier/wellness/détail/fractions ; publication calendrier sur demande uniquement. API documentée : https://www.intervals.icu/features/open-api/
- Hevy : API personnelle **Hevy Pro**, clé temporaire ; pagination et information claire sur la profondeur disponible. API : https://api.hevyapp.com/docs/
- Apple Watch Ultra 3 : Intervals.icu Companion ; validation physique de la boucle bout à bout nécessaire.
- Météo : Open-Meteo et géocodage par recherche manuelle ; la météo est un **contexte**, pas une certification de sécurité.
- Cartographie : coordonnées conservées localement dans l'onglet d'activité ; fond OpenStreetMap externe seulement à la demande.

### T03 — Sûreté des données
- Clés personnelles Intervals et Hevy en-têtes HTTPS, **jamais dans l'URL, le dépôt ou les logs**.
- Coffre chiffré des clés côté navigateur facultatif, phrase secrète personnelle.
- Sauvegardes personnelles : chiffrement AES-256-GCM avec sel et nonce aléatoires, clé PBKDF2-SHA256 ; fichier chiffré dans Téléchargements, mot de passe inconnu du serveur.
- Restauration : taille contrôlée, schéma contrôlé, champs validés, aperçu puis confirmation ; format inconnu rejeté.
- À faire : chiffrement/synchronisation du stockage des ressentis/plan au repos et politique de suppression.
- Prévenir XSS, injection de données des fournisseurs, CSRF sur futures actions synchronisées, importations gigantesques, refus de réseau et cache obsolète.
- Aucune évaluation médicale, aucun score « readiness » inventé.

### T04 — Performance
- Cible : aucune page blanche sur 320–430 px, aucune exception JS non gérée sur les parcours clés.
- Cible de mesure : p75 LCP inférieur à 2,5 s sur environnement mobile représentatif ; interactions inférieures à 200 ms sans réseau ; cette cible doit être **mesurée** avant affirmation de conformité.
- Traitement capteurs volumineux : agrégation en flux, carte simplifiée à ~420 points, compte d'origine affiché et sans calcul Math.min(...180000).
- Rafraîchissement des APIs avec timeouts explicites ; échec réseau non destructif.
- Service worker ne cache jamais \`/v3/*\`, les clés, les réponses Hevy/Intervals ou les données météo privées.

### T05 — Interface et accessibilité
- Portrait iPhone, safe area, clavier virtuel, modales qui restent dans le viewport ; boutons 44 px recommandés ; contraste et focus clavier ; labels/VoiceOver.
- Ne jamais faire déborder l'écran lorsque le champ de recherche météo est ouvert.
- Écran activité : carte seulement si points disponibles, message honnête sinon ; export GPX manuel.
- Sur iPhone Safari réel, vérifier affichage ajouté à l'écran d'accueil (PWA), retour de l'app en arrière-plan, mode réseau dégradé et accessibilité.

## 5. Stratégie de validation et décision de sortie

| Niveau | Test demandé | À réaliser sans clés privées | Sortie attendue |
|---|---|---|---|
| A — syntaxe et logique | Node test, moteur de plan, GPX long, réconciliation, cryptographie | Oui | 100 % vert |
| B — sécurité et API | 401 sans clé, clé jamais renvoyée, erreurs amont simulées, entrées invalides | Oui | Aucun secret divulgué |
| C — navigateur | Chromium mobile 320/390 px, sessions, météo, GPX, import/export, chiffrement | Oui | Aucun débordement / aucune exception bloquante |
| D — environnement | HTTPS staging Railway, santé, assets MIME, SW, révisions versionnées | Oui | Nouveau commit répond en HTTP 200 |
| E — terrain | Apple Watch, Intervals réel, Hevy réel, météo de Martinique, GPS réel | Non : requiert permissions réelles | Compte rendu utilisateur |
| F — Go/no-go production | Audit de sécurité, validation terrain, sauvegarde, rollback, revue des données | Oui + utilisateur | **Autorisation explicite** |

**Ne pas déclarer production finale** tant que E/F sont incomplets. Les versions dites « RC » sont destinées à la recette. Un test fictif réussi n'atteste ni les allures cibles sur la montre ni les 60 séances Hevy dans un compte réel.

## 6. Recette utilisateur iPhone — liste ordonnée

1. Ouvrir l'URL staging en Safari puis en PWA installée ; vérifier l'accueil en portrait et les onglets.
2. Créer un plan maintien/course, consulter une séance, modifier un objectif, tester refuser puis accepter un ajustement.
3. Ouvrir Profil, créer une **sauvegarde chiffrée**, la restaurer après vérification, tester une mauvaise phrase secrète (aucune donnée écrasée).
4. Choisir une ville météo puis fermer le panneau : le zoom et la largeur du téléphone doivent rester normaux.
5. Connecter Intervals.icu avec sa clé **directement dans l'application**, consulter les activités et GPS et les fractions ; vérifier la différence entre « associé » et « à vérifier ».
6. Sur une activité ayant un GPS : fond OSM manuel, export GPX, comparer la trace avec la source.
7. Connecter Hevy Pro via Profil : liste, exercices, séries, charges, historique partiel et diagnostic de connexion.
8. Vérifier sur Apple Watch Ultra 3 la séance structurée envoyée via Companion ; après une vraie séance, vérifier le retour des données.
9. Tester réseau indisponible, fermeture/réouverture, clavier dans la recherche météo, Safari et mode PWA.
10. Noter les anomalies avec écran, action, attendu, obtenu, heure et présence/absence de connexion **sans jamais inclure de clé ou donnée sensible**.

## 7. Backlog après RC

**Bloquants avant qualification « production finale » :** boucle Apple Watch réelle, données Intervals/Hevy réelles, gestion de données au repos/multi-appareils selon besoin, sécurité et robustesse connecteurs en conditions réelles, recette iOS Safari.

**Améliorations ultérieures :** programmation de musculation croisée, adaptations selon RPE et sommeil historique, fractionnés et PR, calendrier ICS, chaussures, notifications, paramétrage avancé, accessibilité complète, métriques de performance mesurées.

**Traçabilité :** GitHub issue #9 ; auditer toute modification en PR, passer CI, déployer staging, effectuer recette, mettre à jour la matrice. Aucun changement de production sur simple réussite des tests fictifs.
