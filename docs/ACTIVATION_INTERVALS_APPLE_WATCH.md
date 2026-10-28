# TrainSync Coach — Activation réelle Intervals.icu et Apple Watch Ultra 3
**État : 28 octobre 2026.** Version réelle déployée séparément sur Railway. L'ancienne production Cloudflare / GitHub Pages n'a pas été écrasée.

## L'application
- **Version active (sans données fictives) :** https://trainsync-staging-demo-staging.up.railway.app/runna-next/index.html
- **Ancienne démonstration facultative :** https://trainsync-staging-demo-staging.up.railway.app/runna-next/index.html?demo=1
- L'ouverture de la racine du domaine renvoie désormais à la **version active**.
- Le nom du domaine Railway contient encore « staging-demo », mais **l'URL sans `?demo=1` ne simule plus l'envoi**, et la connexion est réellement effectuée avec Intervals.icu.

## Configuration initiale (à faire sur ton iPhone)
1. Ouvre **https://intervals.icu/settings**, connecte-toi, descends vers **Developer Settings** et génère ou affiche ta **clé API personnelle**. Il s'agit d'une donnée aussi sensible qu'un mot de passe. Ne la partage ni dans le chat ni sur GitHub.
2. Ouvre la version active de TrainSync, va dans **Profil → Mes connexions → Connecter Intervals.icu**.
3. Colle ta clé personnelle. Tu peux saisir une **phrase secrète d'au moins 10 caractères** si tu veux enregistrer la clé **chiffrée uniquement dans le navigateur sur ton iPhone**. Si tu laisses ce champ vide, elle n'est conservée qu'en mémoire et devra être ressaisie après un rechargement.
4. Appuie sur **Connecter mon compte**. TrainSync vérifie la clé contre Intervals.icu et affiche alors ton historique réel dans **Activités**.
5. Si tu as enregistré la clé chiffrée, aux prochaines ouvertures : **Profil → Mes connexions → Déverrouiller ma connexion** et saisis ta phrase secrète.
6. Installe la PWA depuis Safari : Partager → **Sur l'écran d'accueil**. Pour remplacer l'ancienne application installée, ajoute cette nouvelle URL distincte; l'ancienne n'est pas effacée automatiquement.

## Envoyer un fractionné à ton Apple Watch Ultra 3
1. Dans **TrainSync**, depuis **Aujourd'hui → + Séance libre → Fractionné** ou une **fiche d'entraînement du programme**, appuie sur **Préparer pour l'Apple Watch**.
2. Choisis la date de demain (ou un autre jour futur), six répétitions et **800 mètres**.
3. Appuie sur **Vérifier le fractionné**. La séance structurée doit présenter échauffement 12 min, **6 × 800 m** avec récupération **2 min**, retour au calme 8 min. Les cibles Z2/Z4 sont des **zones**, non des allures fixes.
4. Vérifie auparavant dans Intervals.icu les **zones d'allure course à pied** et ton **allure au seuil**, sans quoi les cibles peuvent ne pas être converties correctement.
5. Appuie sur **Confirmer et publier**. Cette action écrit réellement dans ton calendrier Intervals.icu. Elle demande une confirmation et utilise une clé externe stable pour réduire le risque de doublons.
6. Ouvre **Intervals.icu** pour vérifier que l'événement est bien structuré, avec toutes les étapes et les répétitions.
7. Sur iPhone, installe et ouvre **Intervals.icu Companion** (<https://apps.apple.com/fr/app/intervals-icu-companion/id6739638454>). Dans **More → Workout Settings**, active **Automatically Sync Planned Workouts to Apple Watch**. Ouvre l'écran de synchronisation des entraînements au besoin.
8. Sur ton **Apple Watch Ultra 3**, ouvre **Exercice**, recherche la séance programmée et contrôle les étapes avant de la lancer. **Un événement Intervals créé ne prouve pas l'arrivée sur la montre**; il faut ce contrôle visuel.
9. Après ta course, autorise dans Companion la synchronisation **Apple Santé → Intervals.icu**, puis reviens dans TrainSync → **Profil → Actualiser mes activités**. Ne multiplie pas les sources Strava/Apple Santé pour éviter les doublons.

## Architecture et confidentialité
- La PWA reste gratuite à développer/installer, sans licence Apple Developer; Railway consomme potentiellement le crédit de ton forfait.
- **Les clés API ne sont pas présentes dans GitHub ou en variable Railway** et ne sont pas stockées par le serveur. Elles transitent uniquement via HTTPS, en en-tête privé de chaque requête vers ton backend Railway, puis via Basic Auth vers Intervals.icu. Railway héberge le proxy mais ne conserve pas la clé dans une base ni dans les logs applicatifs.
- La sauvegarde facultative par phrase secrète utilise **PBKDF2/SHA-256 (240 000 itérations) + AES-GCM**, sel et nonce aléatoires; **le mot de passe n'est jamais stocké**.
- Le cache PWA ne contient que les fichiers HTML/JS/CSS/manifest; aucune réponse sportive privée, ni clé, n'est mise en cache.
- Les données du programme dans le navigateur sont propres à cet appareil; changement d'iPhone ou réinstallation peut nécessiter une nouvelle connexion.
- La PWA **n'a aucun accès direct à WorkoutKit ni HealthKit**. Le transfert vers la montre et le retour des entraînements dépendent de l'application Companion, avec ses autorisations iOS.
- **Hevy et les scores propriétaires Bevel ne sont pas encore automatiquement connectés dans la nouvelle version active.** Ne pas supposer une source qui n'a pas été autorisée.
- Intervals.icu applique ses propres limitations de taux, droits d'accès et règles de disponibilité des données (notamment certaines activités provenant de sources tierces).

## Sources
- API Intervals.icu : https://www.intervals.icu/features/open-api/
- Paramètres et clé : https://forum.intervals.icu/t/api-access-to-intervals-icu/609
- Publication officielle d'entraînements : https://forum.intervals.icu/t/uploading-planned-workouts-to-intervals-icu/63624
- Syntaxe de séance : https://forum.intervals.icu/t/workout-builder-syntax-quick-guide/123701
- Intervals.icu Companion : https://apps.apple.com/fr/app/intervals-icu-companion/id6739638454
