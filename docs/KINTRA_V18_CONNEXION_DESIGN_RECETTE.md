# KINTRA v18 — Connexion persistante et refonte iPhone

Date : 29 octobre 2026. Branche : `feat/kintra-persistent-device-session-design-v18-20261029`.

## Défaillance signalée et solution

Avant cette version, `state.apiToken` était uniquement en mémoire après saisie de la clé Intervals.icu. Le coffre facultatif avec phrase secrète était enregistré dans localStorage mais **n'était pas déverrouillé automatiquement après rechargement**. La fonction `start()` ne restaurait pas la session, donc `state.activities`, `wellness` et `planned` repartaient à vide.

La v18 ajoute :
- Une **option cochée par défaut, clairement indiquée** : « Rester connecté sur cet appareil », dans le panneau Intervals.icu. Elle utilise **une clé AES-GCM non exportable conservée par IndexedDB**, sans stocker la clé API en clair ni la phrase secrète en localStorage.
- **Reprise automatique** lors d'un rechargement ou d'une ouverture de la PWA installée, avec vérification de `/v3/status` et mise à jour de `/v3/dashboard`.
- Une **copie chiffrée locale du dernier tableau de bord**, conservée au maximum 14 jours avec un plafond de 750 kB de données JSON avant chiffrement. État « dernière copie locale, données à actualiser » visible quand la synchronisation est impossible ; le GPS n'est pas ajouté au cache.
- Option identique pour Hevy Pro, qui reste indépendant d'Intervals.icu.
- Le coffre précédent par phrase secrète reste lisible : le déverrouiller une fois puis cocher « Rester connecté ensuite » pour migrer vers la reprise automatique.
- Le bouton **« Se déconnecter et supprimer les données locales »** confirme la suppression de la clé Intervals.icu et du cache sportif associé ; les programmes locaux sont conservés. Fermer l'application **n'est pas une déconnexion**.

### Ce qui reste impossible à garantir

Sur iOS, vider les données des sites, utiliser la navigation privée, changer de téléphone, restaurer certains profils Safari ou passer entre **Safari et une PWA aux stockages distincts** peut effacer les clés chiffrées ou empêcher leur lecture. Une reconnexion manuelle sera alors nécessaire. Le chiffrement local ne remplace pas une identité serveur et ne protège pas contre un code hostile exécuté sur la même origine ou un téléphone déjà déverrouillé. KINTRA ne possède pas de session serveur permanente : ses données se mettent à jour **à l'ouverture/en reprise avec réseau**, pas en continu en arrière-plan.

L'utilisateur fournit la **clé API personnelle Intervals.icu**, et non son mot de passe de connexion. Aucune clé ni mot de passe ne doit être envoyé dans le chat ou GitHub.

## Refonte esthétique de la planche fournie

- **Aujourd'hui** : logo en en-tête, jour sous le titre, anneau de préparation sans score fictif, sommeil, séance bordeaux, deux tuiles course/Hevy, météo. Plan et calendrier disponibles par ouverture de « Mon programme et ma semaine » afin de rapprocher la densité des tuiles de la maquette.
- **Coach** : flèche retour et titre centré, segment événement/maintien, champs de paramètres en cartes blanches et conseil rosé.
- **Séance** : titre centré, métriques sobres, conseil de contexte, étapes numérotées, bouton Apple Watch visible à la suite et informations post-course.
- **Progression** : onglets segmentés, séance réelle mise en avant, six indicateurs dans la carte de résultat, volume et analyses. Les fractions détaillées restent accessibles après sélection de la séance.
- **Plus** : connexions, profils et sauvegardes dans les mêmes cartes blanches. Les données absentes restent « — » ; pas de 82/100 ni de fractions inventées.

## Recette utilisateur

1. Ouvrir la **version active en préproduction** dans Safari puis dans la PWA installée (ne pas utiliser `?demo=1` pour les vraies données).
2. Plus → Intervals.icu → coller sa clé API réelle **dans l'application** ; vérifier la coche « Rester connecté sur cet appareil ». Si une clé était déjà sauvegardée, la déverrouiller puis activer la nouvelle coche.
3. Vérifier Progression, terminer ou recharger l'application, puis vérifier que les activités sont chargées automatiquement.
4. Couper temporairement Internet *après une première synchronisation réussie*, rouvrir : dernière copie locale chiffrée affichée, avec son horodatage. Reconnecter le réseau : actualisation et disparition de l'alerte.
5. Tester le même parcours pour Hevy Pro si connecté. Vérifier les quatre onglets en portrait, surtout la météo et l'écran de séance.
6. **Ne pas toucher à « Se déconnecter et supprimer les données locales »** pour simplement fermer l'application ; cette action supprime volontairement l'accès chiffré au compte et le cache.
7. Pour chaque défaut : capture de l'onglet, action réalisée, attendu/obtenu et heure. Ne fournir aucune clé personnelle.

## Conditions de sortie

La mise à jour peut être placée sur Railway **staging uniquement** après CI verte sur la dernière révision, y compris les tests du moteur WebKit Safari simulé, du stockage chiffré et du retour hors ligne. **Ne pas déployer en production** sans validation de l'utilisateur sur vrai Safari et Apple Watch.
