# TrainSync 3.0 — Test réel de la passerelle Apple Watch en préproduction

**Production intacte** : la branche de test est `feat/trainsync-3-intervals-hub` et la PR est #1.
- Démo publique **avec données inventées** : https://trainsync-staging-demo-staging.up.railway.app/?demo=1
- Le projet Railway est isolé : `trainsync-v3-staging` (environnement `staging`), sans variables API.
- La préproduction Cloudflare est un *Preview* du Worker actuel : ses secrets et son adresse sont séparés.
- Ne jamais utiliser `wrangler deploy` pour cette recette; seulement `wrangler preview`.

## Étape 1 — Préparer Intervals.icu
1. Connecter Apple Santé à **Intervals.icu Companion** depuis l'iPhone, selon les autorisations réellement proposées.
2. Dans Intervals.icu, vérifier la définition du sport **Run** et les zones d'allure / zones cardiaques. Une zone non définie peut rendre les cibles inexploitables.
3. Dans Intervals.icu > Settings > Developer Settings, obtenir une clé API personnelle. Ne pas la déposer dans GitHub ni dans ChatGPT.
4. Pour les clés personnelles, l'identifiant d'athlète **0** désigne généralement l'utilisateur authentifié selon la documentation officielle; il peut être utilisé si l'API le confirme.

## Étape 2 — Activer Cloudflare Preview, sans modifier la production
Sur ton Mac, avec Git installé et Node.js récent :

```bash
git clone -b feat/trainsync-3-intervals-hub https://github.com/achoblet33-web/hevy-garmin-coach.git
cd hevy-garmin-coach/Backend
npx --yes wrangler@latest login
npx --yes wrangler@latest preview --name trainsync-v3-staging --config wrangler.jsonc
```

Si Cloudflare exige de préparer **Previews Base**, suivre l'assistant dans le tableau de bord. Les Previews ne reprennent pas automatiquement les secrets de production.

Configurer les secrets de la préproduction au prompt sécurisé de Wrangler :

```bash
npx --yes wrangler@latest preview secret put APP_TOKEN --name trainsync-v3-staging --config wrangler.jsonc
npx --yes wrangler@latest preview secret put INTERVALS_API_KEY --name trainsync-v3-staging --config wrangler.jsonc
npx --yes wrangler@latest preview secret put INTERVALS_ATHLETE_ID --name trainsync-v3-staging --config wrangler.jsonc
```

Renseigner `INTERVALS_ATHLETE_ID=0` si confirmé pour la clé personnelle. Pour un historique de musculation enrichi, ajouter éventuellement `HEVY_API_KEY` au même Preview.

Générer un `APP_TOKEN` long et aléatoire, **différent** du jeton de production. Conserver ce token dans un gestionnaire de mots de passe, jamais dans un fichier du dépôt. Ne pas transmettre ces valeurs dans cette conversation.

**Documentation Cloudflare :**
- https://developers.cloudflare.com/workers/previews/
- https://developers.cloudflare.com/workers/previews/get-started/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/

## Étape 3 — Tester TrainSync depuis l'iPhone
1. Ouvrir https://trainsync-staging-demo-staging.up.railway.app/?demo=1
2. Dans l'onglet **Performance**, section **Connexion au Preview Cloudflare**, entrer l'URL `https://...workers.dev` indiquée par Wrangler (URL **Preview**, pas URL production), puis le `APP_TOKEN` du Preview.
3. Cliquer **Connecter la préproduction**. Le navigateur contacte directement Cloudflare; Railway ne reçoit pas le token.
4. Vérifier **Intervals connecté (préproduction)** et le détail des sources. Les mesures affichées sont alors celles du compte Intervals.icu — ne pas confondre avec le mode Démo.
5. Créer la séance `Fractionné`, `6 × 800 m`, prévue pour **demain ou un autre jour futur**. Choisir **Prévisualiser**, puis **Publier dans Intervals.icu**. Cela écrit effectivement une séance sur TON calendrier Intervals.icu après confirmation.
6. Ouvrir Intervals.icu et vérifier que l'événement comporte bien l'échauffement, 6 répétitions, les récupérations et le retour au calme. Si la réponse TrainSync indique « structure non confirmée », vérifier avant d'aller plus loin.
7. Sur iPhone, ouvrir **Intervals.icu Companion** et synchroniser les séances planifiées vers l'Apple Watch. La disponibilité des alertes peut varier selon l'implémentation Companion et les réglages de l'app Exercice.
8. Sur la Watch Ultra 3, ouvrir **Exercice**, retrouver le fractionné, vérifier distance/répétitions/récupération **sans nécessairement lancer un entraînement intense pour cette vérification**.
9. Après une courte course d'essai, vérifier la remontée via Apple Santé → Companion → Intervals.icu → TrainSync, puis l'absence de doublon.

### Séance test exacte
```text
Échauffement
- 12m Z2 Pace

6x
- 800mtr Z4 Pace
- 2m Z2 Pace

Retour au calme
- 8m Z2 Pace
```

La **zone 4 n'est pas une allure chiffrée recommandée** tant que le seuil et les zones ne sont pas calibrés. C'est un test de la structure de transfert, pas une prescription d'effort.

## Barrières de sécurité
- Mode **Démo** : public, entièrement fictif, aucune clé ni écriture externe.
- Mode **Cloudflare Preview connecté** : API Intervals réelle; le jeton n'est conservé qu'en mémoire du navigateur, effacé au rechargement. La publication réelle exige une confirmation.
- Cloudflare **production** : application et Worker existants **inchangés**.
- La prépublication n'est pas une preuve de réception sur la montre. Une validation visuelle sur l'Ultra 3 est indispensable.
- Un test en production n'est envisagé qu'après approbation de la PR, des tests CI et du transfert Watch.

## CI & automatisation
- `npm test` : structure de séances, dates, sécurité d'authentification, API simulée, anti-doublons.
- `npx wrangler deploy --dry-run --config Backend/wrangler.jsonc` : vérifie le paquet Cloudflare sans le publier.
- GitHub Actions : workflows `TrainSync v3 checks`, avec un contrôle HTTPS du mode démo, et diagnostic **GET /health** en lecture seule de l'ancien Worker.
