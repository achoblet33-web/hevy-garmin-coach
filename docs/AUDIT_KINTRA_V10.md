# Audit KINTRA — interface, coaching, données, intégrations, confidentialité

**Date : 28 octobre 2026.** Périmètre audité : `web/runna-next/`, `preview/`, `Backend/`, `tests/`, workflows GitHub et déploiement Railway de la branche `feat/trainsync-3-intervals-hub`.

**Méthode :** revue des fichiers, contrôles structurels et tests Node 22 / Chromium mobile / smoke HTTPS. Le service autonome « ECC » (si cela désigne Everything Claude Code) n'est pas relié à cet environnement ; le document ne prétend pas être une exécution ECC. Le code original Runna/Garmin, privé et propriétaire, n'a pas été copié.

## Principales constatations et correctifs appliqués

| Gravité | Constat | Correction / statut |
|---|---|---|
| Haute — fiabilité sportive | L'ancienne carte de « préparation » montrait seulement `3/5 mesures`, pouvant être confondue avec un score de performance. | **Corrigé :** état expliqué (« dynamique favorable », « récupération à surveiller », « tendance à confirmer » ou « données insuffisantes »), basé sur les données récentes et un minimum de référence personnelle. Aucun score artificiel sur 100. |
| Haute — qualité des sources | Les valeurs d'Intervals.icu pouvaient être anciennes sans être datées dans la tuile. | **Corrigé :** la donnée utilisée doit dater de moins de deux jours; date et nombre de nuits de référence visibles. |
| Moyenne — ergonomie | Sommeil confondu avec l'état général. | **Corrigé :** tuile sommeil distincte, durée et score uniquement s'ils sont retournés par Intervals.icu. |
| Moyenne — accueil | La tuile course affichait les kilomètres au lieu du **nombre d'entraînements**. | **Corrigé :** deux tuiles côte à côte, course et musculation Hevy, sur sept jours ; kilométrage conservé en complément. |
| Moyenne — météo | GPS uniquement, aucun changement manuel de ville, pas de suivi horaire. | **Corrigé :** recherche d'une ville, sélection explicite, GPS approximatif facultatif, 12 h de température ressentie / pluie / vent / humidité / UV, suggestion indicative de créneau de jour. |
| Haute — risque de surinterprétation | « Meilleure météo » et « prêt à performer » pouvaient suggérer une garantie. | **Corrigé :** recommandations explicables, seuils prudents et avertissements, pas de certification de sécurité. |
| Moyenne — coaching | Le « maintien endurance » et le « maintien équilibre » n'étaient pas suffisamment différenciés. | **Corrigé :** le mode endurance élimine les séances de qualité obligatoires et alloue davantage de volume à la sortie longue; le mode vitesse varie les fractions contrôlées. |
| Moyenne — progression | Pas de comparaison explicite de deux semaines ni de conseils fondés sur les répétitions. | **Corrigé :** volumes/ séances hebdomadaires et comparaison sous condition de données suffisantes ; retour sur la régularité des fractions et RPE observé. |
| Haute — continuité | La séance Apple Watch doit rester envoyée par Intervals.icu Companion. | **Préservé :** création de séances structurées, publication confirmée par l'utilisateur sur Ultra 3, lectures d'activités et de segments. Aucune API Apple HealthKit fictive. |
| Moyenne — Hevy | Page initiale limitée à 10 séances. | **Corrigé antérieurement :** pagination bornée à 60 séances, API personnelle en lecture seule, clé non enregistrée côté serveur. |
| Sécurité — données locales | Les données RPE et les programmes sont enregistrés en localStorage non chiffré. | **Risque connu :** reste à sécuriser dans une phase avec gestion de compte / synchronisation multi-appareils ; aucune donnée RPE n'est envoyée au backend de coaching. |
| Sécurité — credentials | Clés utilisateur potentiellement sensibles. | **Préservé :** saisie dans KINTRA, en-tête HTTPS, clé Hevy/Intervals uniquement en mémoire serveur, coffre local AES-GCM optionnel déverrouillé par phrase secrète. |
| Disponibilité | Railway staging peut être en veille selon configuration ; la disponibilité n'est pas contractuelle. | **À surveiller** après tests et connexion personnelle. |

## Parcours fonctionnels à valider sur vrai compte
1. Connexion Intervals.icu ; lecture des 7–21 jours de wellness pour établir une référence.
2. Connexion Hevy Pro depuis Plus (ne jamais coller la clé dans GitHub ou une conversation).
3. Vérifier en accueil les séances de musculation sur sept jours.
4. Recherche de lieu météo, choix de ville et prévisions d'heure en heure sur iPhone.
5. Objectif événement vs maintien (équilibre / endurance / vitesse).
6. Séance structurée via Companion → Apple Watch Ultra 3, puis retour d'activité enregistrée.
7. Progression : bilan, fractions issues de la source, analyse comparable et ressenti.
8. PWA sur l'écran d'accueil : rafraîchissement de l'icône et du cache.

## Restrictions de méthode
- Les tests automatisés utilisent des **données fictives clairement étiquetées**, sans clés ni santé personnelle de l'utilisateur.
- L'évaluation de la récupération est un **indicateur sportif non médical** : sommeil, HRV, FC de repos et charges sont sujets à variabilité.
- Un volume hebdomadaire accru ne prouve pas une amélioration de capacité ; les recommandations restent indicatives et le plan ne change pas sans confirmation.
- Hevy Pro et Intervals.icu restent des API tierces : qualité, complétude et historique varient.
- Les contraintes légales/licences d'Open-Meteo doivent être examinées avant un lancement commercial.
- Ne pas supprimer l'ancien site ni fusionner `main` avant recette réelle.

## Principales sources
- Intervals.icu API : https://www.intervals.icu/features/open-api/
- Open-Meteo forecast API : https://open-meteo.com/en/docs
- Open-Meteo geocoding : https://open-meteo.com/en/docs/geocoding-api
- Hevy Pro developer API : https://api.hevyapp.com/docs/
