# Backend TrainSync

Le Worker Cloudflare réunit les données Hevy et Garmin puis fournit le contexte détaillé au coach.

## Architecture

- Hevy -> API officielle Hevy -> `GET /sync`
- Garmin Connect -> Intervals.icu -> API Intervals.icu -> `GET /sync`
- `POST /recommend` recharge les mêmes données avant de générer les 3 prochaines séances.
- `GET /health` indique uniquement quelles intégrations sont configurées, sans exposer les secrets.

## Secrets / variables Cloudflare

Configurer dans le Worker :

- `HEVY_API_KEY` : clé développeur Hevy (Hevy Pro requis par l'API officielle).
- `INTERVALS_API_KEY` : clé API personnelle Intervals.icu.
- `INTERVALS_ATHLETE_ID` : identifiant athlète Intervals.icu (par exemple `i123456`).
- `OPENAI_API_KEY` : clé OpenAI utilisée uniquement côté serveur.
- `APP_TOKEN` : secret personnel facultatif mais recommandé pour protéger `/sync` et `/recommend`.
- `OPENAI_MODEL` : facultatif, défaut `gpt-5.6-luna`.
- `OPENAI_REASONING` : facultatif, défaut `low`.
- `SYNC_DAYS` : facultatif, historique importé par défaut 120 jours.
- `COACH_HISTORY_DAYS` : facultatif, historique analysé par défaut 120 jours.

Ne jamais mettre ces valeurs dans GitHub ou dans `web/app.js`.

## Connecter Garmin gratuitement

1. Créer un compte Intervals.icu.
2. Dans les intégrations Intervals.icu, connecter le compte Garmin afin que les nouvelles activités Garmin soient importées automatiquement.
3. Dans les réglages développeur Intervals.icu, générer la clé API personnelle et relever l'identifiant athlète.
4. Ajouter ces deux valeurs au Worker sous `INTERVALS_API_KEY` et `INTERVALS_ATHLETE_ID`.

Quand Hevy est aussi configuré, les activités de musculation provenant d'Intervals.icu sont ignorées pour éviter les doublons : Hevy reste la source de référence pour les exercices, séries, répétitions, charges et RPE.

## Connecter la PWA

Une fois le Worker déployé, renseigner dans TrainSync > Réglages :

- Synchronisation : `https://<worker>/sync`
- Coach : `https://<worker>/recommend`
- Jeton du relais : la même valeur que `APP_TOKEN`

La PWA appelle déjà `/sync` automatiquement à son ouverture lorsqu'une URL de synchronisation est enregistrée.

## Logique du coach

### Musculation

Le backend transmet au modèle les quatre dernières occurrences de chaque exercice avec les séries de travail, charges, répétitions, RPE et volume. Le coach doit privilégier une progression mesurable et prudente : petite hausse de répétitions ou de charge lorsque la marge est suffisante, maintien ou réduction lorsque le RPE est très élevé ou que la performance baisse.

### Course

Le backend calcule notamment le kilométrage sur 7 et 28 jours, la plus longue sortie récente et transmet les dix dernières courses avec distance, durée, allure, fréquence cardiaque, dénivelé, charge et RPE lorsqu'ils sont disponibles. Le coach doit organiser les séances entre endurance facile, qualité et sortie longue tout en évitant les hausses brusques de volume et les séances difficiles consécutives.

## Endpoints

### `GET /health`

Retourne l'état de configuration sans secrets.

### `GET /sync`

Retourne :

```json
{
  "sessions": [],
  "sources": ["Hevy", "Garmin via Intervals.icu"],
  "warnings": []
}
```

Paramètre facultatif : `?days=120` (7 à 365 jours).

### `POST /recommend`

Corps attendu :

```json
{
  "goal": "Équilibre",
  "sessions": []
}
```

Le backend recharge d'abord les données Hevy/Garmin configurées, puis les combine aux éventuelles séances locales avant de générer trois suggestions.
