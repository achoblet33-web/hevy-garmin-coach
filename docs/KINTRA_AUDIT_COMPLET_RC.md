# Audit technique, fonctionnel et de recette — KINTRA Coach RC

**Date :** 28 octobre 2026  
**Version examinée :** branche \`feat/kintra-final-rc-audit-20261028\`, base \`30d1cab\` (KINTRA 3.0), assets PWA v16  
**Plateforme :** PWA iPhone, serveur Node/Railway isolé et interfaces Intervals.icu, Hevy Pro, météo Open-Meteo  
**Méthode :** revue statique du dépôt GitHub, inspections ciblées des API et composants, tests GitHub Actions Node et navigateurs simulés, vérification Railway staging. **Aucun accès aux clés personnelles ni aux données santé de l'utilisateur.**  
**Portée exacte :** audit d'ingénierie et fonctionnel **sur code et données fictives**, pas une certification de sécurité, de précision physiologique ou de compatibilité sur iPhone/Apple Watch physiques.

## 1. Résumé exécutif

Le projet est organisé autour de deux ensembles : un coach local en PWA et un relais HTTP lisant les données de plateformes tierces. L'intégration Hevy est **lecture seule**, la publication Intervals.icu exige une action de l'utilisateur. Les critères de séparation entre données certifiées, supposées et absentes sont généralement présents.

**Décision provisoire :** candidature à la **recette utilisateur en préproduction** après CI verte et validation des assets v16. **Pas d'autorisation de production définitive.**

### Échelle et statut
- **PASS :** contrôlé par tests vérifiables ou lecture directe du code.
- **PARTIEL :** code existant, mais couverture limitée ou dépendance à de vraies données.
- **À VALIDER SUR APPAREIL :** impossible à certifier via Linux/Chromium ou WebKit simulé.
- **NON LIVRÉ :** exigence du cahier des charges non développée.
- **BLOQUANT PRODUCTION :** risque ou preuve manquante qui interdit de revendiquer une version finale pour tous les utilisateurs.

## 2. Revue par domaine

| Domaine | Constats et preuves | Évaluation |
|---|---|---|
| Déploiement et environnement | Railway \`staging\` séparé, image construite de la branche développement ; aucune intervention sur la production | PASS historique ; confirmer commit v16 déployé |
| Tests métier | Node 22 : calculs de plan, réconciliation, API simulées, clés absentes, Hevy, GPS, sauvegardes | PASS sur contrôles existants ; verdict CI RC séparé |
| GPS longues courses | \`normalizeStreams\` limite l'échantillon cartographique, agrégation capteurs en boucle sans spread d'un tableau massif ; cas 180 000 échantillons | PASS si nouvelle CI verte ; essai GPS réel manquant |
| Idempotence des publications | Intervals \`external_id\`, existence recherchée avant \`bulk upsert\` ; statut de montre **non vérifié** tant qu'absent | PASS simulé ; vrai serveur/Companion non certifiés |
| Réconciliation prévu/réalisé | \`paired_event_id\` / \`paired_activity_id\` ou confirmation manuelle, une seule activité ne peut valider deux séances | PASS pour tests de collisions ; historique complet partiel |
| Multi-sources et doublons | Déduplication même fournisseur / identifiant ; similitudes inter-fournisseurs signalées sans suppression | PASS conservateur ; dédup Apple Santé/Garmin réelle non démontrée |
| Intégration Hevy | Endpoint GET, filtrage UUID, pagination bornée à 60, liste/exercices/séries/charges/répétitions, indication d'historique incomplet | PASS simulé ; limité à 60, réelle API à vérifier |
| Préparation Apple Watch | Publication vers calendrier confirmée antérieurement par observation de la séance sur Exercice | PARTIEL : aucune validation complète effort/fractions/retour |
| Récupération | Repos, HRV, sommeil, RPE selon disponibilité ; évite les notes arbitraires et diagnostics médicaux | PARTIEL : pas de calibration personnelle longue durée vérifiée |
| Coach adaptatif | Allégement d'une prochaine séance intense selon signaux jambes/récupération, avant/après, accord, aucun POST externe | PASS simulation ; décalages et alternatives avancées manquants |
| Météo | Recherche de ville, GPS facultatif, plage de 12 h, humidité, UV, défilement interne | PASS tests Chromium ; WebKit en vérification ; Safari réel obligatoire |
| Détail de course | Carte OSM facultative, fractions, FC, vitesse, cadence, dénivelé lorsque fournis, export GPX manuel | PASS synthétique ; exhaustivité des streams dépend Intervals |
| Sauvegarde JSON historique | Validation format, taille, dates, identifiants ; export sans clés/GPS. L'ancien format est **en clair** | PASS compatibilité ; déconseillé pour données privées |
| Sauvegarde chiffrée RC | AES-256-GCM, PBKDF2-SHA256, sel et nonce aléatoires, secret utilisateur, intégrité authentifiée ; opération local-only | PASS tests crypto Node ; parcours Safari à vérifier |
| Persistence locale | Plans, versions et ressentis encore en \`localStorage\`. L'échec d'écriture remonte désormais une alerte | PARTIEL ; non chiffré au repos |
| Sécurité serveur | CSP \`script-src 'self'\`, \`frame-ancestors 'none'\`, \`nosniff\`, \`noindex\` en staging, clés fournisseur en en-tête HTTPS | PASS inspection ; pas de pentest |
| Service worker | Cache des ressources statiques seulement ; exclusion \`/v3/*\` et \`/api/*\`, révision explicite \`kintra-ui-16\` | PASS inspection ; offline réel/compatibilité Safari à faire |
| Ergonomie | Navigation fixe, modales adaptées, test mobile 320 / 390 px + matrice WebKit 320/375/390/430 px | PARTIEL ; VoiceOver et clavier physique non validés |
| Observabilité/performance | \`/health\`, smoke API, timeouts ; aucun suivi p75 LCP/INP/RUM ni historique d'erreurs dépersonnalisées démontré | PARTIEL / NON LIVRÉ |
| Synchronisation multi-appareils | Aucun compte KINTRA dédié ni backend de stockage chiffré ; transfert manuel par fichier | NON LIVRÉ |
| Notifications, ICS, chaussures | Non présents dans la version RC | NON LIVRÉ |

## 3. Anomalies et risques classés par priorité

### A-01 — P0 : boucle physique iPhone ↔ Apple Watch non certifiée
- **Symptôme/risque :** présence du workout sur l'Ultra 3 ne garantit pas alertes, zones, intervalles exécutés ou retour GPS.
- **Preuve :** \`docs/RETOUR_APPLE_WATCH_BILAN.md\`, \`docs/TEST_APPLE_WATCH_PREPROD.md\`.
- **Mesure :** sur vrai appareil, réaliser un effort de test sûr puis comparer montre, Companion, Intervals.icu et KINTRA par identifiant, distance, durée, FC et segments.
- **Statut :** À VALIDER SUR APPAREIL. Bloquant pour une allégation « boucle complète validée ».

### A-02 — P0 : persistance locale non chiffrée au repos
- **Symptôme/risque :** plans et ressentis restent accessibles au contexte navigateur et peuvent être supprimés par purge Safari.
- **Correctif RC :** sauvegarde **portable chiffrée**, restauration locale, alerte en cas d'échec d'écriture.
- **Risque résiduel :** données de travail dans \`localStorage\` et absence de synchronisation multi-appareils.
- **Décision :** acceptable comme prototype personnel documenté, **bloquant** pour annoncer un produit mature partagé sans conception d'identité / persistance / suppression.

### A-03 — P1 : limites de récupération Hevy Pro
- **Constat :** les 60 dernières séances sont chargées avec profondeur maximale de 6 pages ; pageCount/partialHistory explicites. Une erreur sur une page fait échouer la synchronisation entière.
- **Correctif RC :** délai client adapté à la pagination maximale.
- **À faire :** validation avec compte réel, statut partiel si sous-page indisponible, reprise sur réseau médiocre, événements de suppression/mise à jour, pagination au-delà de 60 si nécessaire.

### A-04 — P1 : relation calendrier local ↔ calendrier Intervals
- **Constat :** un programme local et les événements Intervals peuvent avoir des identifiants distincts. Une séance à date semblable ne doit pas passer « confirmée » sans preuve.
- **Mesure actuelle :** rapprochement volontaire, révocable ; labels « à vérifier ».
- **À faire :** identité canonique des séances publiées, vérification bidirectionnelle sans double consommation, recherche historique et contrôle si l'utilisateur change de plan.

### A-05 — P1 : robustesse des fichiers GPS
- **Constat :** les réponses Intervals peuvent comporter des séries longues. L'ancienne agrégation avec \`Math.min(...arr)\`/\`Math.max(...arr)\` risquait un dépassement de pile.
- **Correction RC :** calcul min/max/moyenne incrémental et test 180 000 mesures.
- **Limite :** la carte/export GPX porte un **échantillon** de la trace source (maximum ~420 points), pas une reproduction FIT complète.
- **À faire :** valider une trace réellement enregistrée, D+/D−, données absentes et distorsion des boucles.

### A-06 — P1 : confiance et conformité du coaching
- **Constat :** conseils déterministes prudents mais non validés médicalement. Les seuils de fatigue, chaleur et volume sont heuristiques.
- **Mesure :** formulations indicatives, choix explicites, refus d'ajustement sans modification.
- **À faire :** calibration aux allures réelles, intégration du RPE et de l'historique multi-semaines ; revue sportive indépendante avant diffusion commerciale.

### A-07 — P1 : téléchargement chiffré et navigateur iOS
- **Constat :** un chiffrement long asynchrone peut perdre l'activation utilisateur requise pour télécharger un Blob sur Safari.
- **Correction RC :** deux actions séparées : « Chiffrer et préparer », puis « Télécharger ma sauvegarde ».
- **À valider :** flux WebKit simulé et vrai Safari, téléchargement dans Fichiers, saisie de phrase secrète, import et refus si mauvaise phrase.
- **Risque résiduel :** perte de phrase secrète = restauration impossible (comportement voulu).

### A-08 — P2 : performance, accessibilité, tolérance aux réseaux
- **Constats :** aucune métrique LCP/INP réelle ; pas de tests VoiceOver, zoom système ou perte de connectivité sur iPhone physique ; CSS d'ensemble volumineux et code d'interface concentré dans un module conséquent.
- **À faire :** mesures p75 sur appareils représentatifs, tests accessibilité, budgets de ressources, audits d'images/services et refactorisation ciblée sans régression.

### A-08 bis — P1 : notification qui effaçait une saisie en cours
- **Anomalie reproduite en CI :** la disparition automatique d'un toast déclenchait une reconstruction DOM complète cinq secondes après une action. Une phrase secrète ou une ville déjà saisie pouvait disparaître.
- **Correction RC :** le toast est ajouté, mis à jour et supprimé sans toucher au formulaire ni au focus ; test de non-régression maintenant une phrase secrète pendant plus de cinq secondes.
- **À vérifier en conditions réelles :** Safari et clavier virtuel avec réseau lent.

### A-09 — P2 : exposition API météo en environnement public
- **Constat :** le relais météo accepte des lectures sans authentification (avec validation de requêtes et timeouts). Pas de mécanisme de rate limiting démontré.
- **À faire :** protection contre abus, contrôle des quotas et des conditions Open-Meteo/OSM avant diffusion large.

### A-10 — P2 : sécurité et dépendances
- **Constat :** headers HTTP défensifs en staging, tests clés invalides, scan AgentShield historique ciblant configurations seulement.
- **Limites :** scan AgentShield 100/100 ne remplace ni pentest de l'app, ni audit du code JS, ni analyse complète des dépendances et entrées externes.
- **À faire :** analyse des vulnérabilités, revue des permissions GitHub/Railway, audit logs, politique de mise à jour des dépendances, politique de données.

## 4. Matrice de recette réelle à compléter par l'utilisateur

| ID | Scénario | Attendu | État |
|---|---|---|---|
| U01 | Safari / écran d'accueil 320–430 px | Aucun zoom ou overflow, boutons navigables | À tester réellement |
| U02 | Recherche ville météo / clavier / fermeture | Écran reste à largeur iPhone | À tester réellement |
| U03 | Hevy Pro | 10–60 séances et séries cohérentes selon historique | À tester avec compte |
| U04 | Intervals.icu activités | Distances, heures, FC, catégories cohérentes | À tester avec compte |
| U05 | Une course avec GPS | Carte, D+/D−, tours, export GPX quand fournis | À tester sur sortie réelle |
| U06 | Publication séance fractionnée | Nom et répétitions identiques dans Intervals/Companion/Exercice | À tester sur montre |
| U07 | Après une course test | Activité visible dans KINTRA sans doublon, association correcte | À tester réellement |
| U08 | Musculation jambes puis fractionné | Information et proposition justifiées ; accepter/refuser | À tester réellement |
| U09 | Sauvegarde chiffrée | Fichier créé, mot de passe incorrect rejeté, restauration confirmée | À tester Safari/Fichiers |
| U10 | PWA hors ligne et reconnexion | Interface de base accessible ; échec API expliqué | À tester réellement |
| U11 | Batterie, veille, changement d'orientation | Pas de perte des choix ou rechargement bloquant | À tester réellement |
| U12 | Accès aux données personnelles | Clés jamais visibles dans liens ou journaux ; fond de carte consentement | À vérifier |

## 5. Livrables et décision finale

- **Cahier des charges** : \`docs/KINTRA_CAHIER_DES_CHARGES_FINAL_RC.md\`
- **Code candidat** : \`feat/kintra-final-rc-audit-20261028\`, après revue PR.
- **CI** : workflow \`.github/workflows/trainsync-v3-checks.yml\`.
- **URL de recette** : https://trainsync-staging-demo-staging.up.railway.app/
- **Backlog des manques identifiés** : issue GitHub #9.

**Go pour recette utilisateur seulement si tous les jobs CI de la PR sont verts et si le commit de la RC est effectivement déployé en staging.**  
**No-go production publique tant que U01–U12 et le cycle Apple Watch/Hevy/Intervals avec données réelles n'ont pas été documentés.**

Ce rapport doit être amendé avec les identifiants de commit/déploiement et les résultats du **dernier** workflow CI, pas ceux d'une version antérieure. L'utilisateur reviendra avec ses anomalies de détail ; elles seront tracées et corrigées par petites PR sans supprimer des fonctions existantes.
