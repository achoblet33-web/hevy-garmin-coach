# TrainSync Coach — Retour de séance Apple Watch et bilan post-course

## Test utilisateur validé
Le 28 octobre 2026, l'utilisateur a retrouvé sa séance **TrainSync · Fractionné 6 × 800 m** dans l'application **Exercice** de son Apple Watch Ultra 3, après publication vers Intervals.icu et synchronisation de **Intervals.icu Companion**. La visibilité sur la montre est donc confirmée par l'utilisateur ; cela **ne prouve pas encore** que les alertes, les allures ciblées ni le retour d'activité fonctionnent après une course complète.

## Étape suivante : boucle complète
1. Avant de courir, dans Exercice sur l'Apple Watch, ouvrir **TrainSync · Fractionné** et vérifier les 6 efforts de 800 m, 2 min de récupération et les cibles Z2/Z4. Si la séance ne convient pas, ne pas la lancer à pleine intensité.
2. Lorsque l'athlète est prêt et selon sa récupération, réaliser l'entraînement ou une séance facile distincte pour vérifier l'enregistrement. Une courte séance facile suffit pour tester le **flux de retour**, mais ne confirme pas l'exactitude du 6 × 800 m.
3. Après la séance, ouvrir Intervals.icu Companion sur iPhone, vérifier les autorisations Apple Santé et synchroniser **activité terminée → Intervals.icu**. Ne pas réimporter la même sortie via plusieurs sources.
4. Dans TrainSync actif, ouvrir **Activités → Actualiser depuis Intervals.icu**. Le nouveau panneau **Bilan de tes entraînements** doit afficher la sortie réelle (distance, durée, allure, fréquence cardiaque et charge si disponibles).
5. Ouvrir cette course. TrainSync charge les **tours et fractions analysés par Intervals.icu** à la demande, sans imposer la précision de l'analyse si la source ne retourne aucun segment.
6. Saisir facultativement son **ressenti RPE 1–10**, commentaires et conditions; ces retours restent **localement dans le navigateur**. Ils ne sont pas transmis à Intervals.icu et ne recalculent pas le programme automatiquement.
7. Le statut d'association à l'entraînement planifié est **confirmé uniquement** si Intervals.icu retourne `paired_event_id` ou `paired_activity_id`. Le même jour et la même distance ne suffisent pas. Une course non associée est affichée comme **association à vérifier**, non pas « séance planifiée terminée ».
8. L'API d'analyse est `GET /v3/activities/{id}/intervals` et lit `/api/v1/activity/{id}/intervals` sur Intervals.icu à l'aide de la clé fournie uniquement en mémoire. Le résultat dépend du fournisseur; les valeurs indisponibles restent inconnues, sans fabrication.

## État du développement
- ✅ Synchronisation prévue vers la montre confirmée par l'utilisateur (capture « Sent to Apple Watch » et visualisation dans Exercice).
- ✅ Backend actif pour lecture des activités, calendrier, wellness et publication de séances, avec vérification des structures.
- ✅ Reconciliation conservatrice sur ID associé, absence de doublon local dans le total.
- ✅ Nouveau bilan de course et retour RPE, avec écran de fractions provenant de l'API.
- ✅ Tests unitaires et tests de navigateur mobile sur données fictives.
- ⏳ Course réelle avec chronométrage, enregistrement de 6 × 800 m et alertes validés physiquement.
- ⏳ Réconciliation réelle et analyse fractions d'une séance Apple Watch réelle après transmission Companion.
- ⏳ Réévaluation adaptative des allures/répartition de charge sur historique validé, avec autorisation avant modification.

## Références
- <https://forum.intervals.icu/t/paired-event-id/40322>
- <https://forum.intervals.icu/t/api-access-to-intervals-icu/609?page=9>
- <https://www.intervals.icu/features/open-api/>
- <https://apps.apple.com/fr/app/intervals-icu-companion/id6739638454>

## Sécurité
Pas de clé personnelle dans GitHub ni dans les logs applicatifs; aucune modification de l'ancienne production Cloudflare. La démo conserve des tours fictifs étiquetés comme tels, accessibles avec `?demo=1`. Les vraies données personnelles ne sont affichées que dans l'application active après connexion de l'utilisateur.
