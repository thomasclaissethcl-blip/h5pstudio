# H5P Studio Portable 0.5.21

Application Windows 11 portable (**distribution DOSSIER**) permettant l'importation, l'analyse, la prévisualisation et l'exportation de contenus H5P en HTML statique multifichier.

Cette version est une **consolidation du code 0.5.2** : nettoyage du dépôt, suppression des doublons historiques et des anciens workflows, synchronisation des numéros de version, documentation unifiée et contrôles de structure. Elle n'ajoute pas de nouveau lecteur ni d'éditeur visuel.

## Installation dans un dépôt GitHub neuf

Lire **[GUIDE-GITHUB-0521.md](GUIDE-GITHUB-0521.md)** avant d'importer les sources. Deux chemins existent : dépôt Git complet avec `.github/workflows/` ou téléversement par navigateur en créant ensuite les deux workflows à leur chemin obligatoire. **Renommer `.github` en `github` empêcherait GitHub Actions de détecter les workflows.**

## Compiler sans Node.js local

Dans GitHub, ouvrir **Actions > Compiler H5P Studio Windows DOSSIER > Run workflow**, sur la branche par défaut. Télécharger l'artefact `H5P-Studio-Portable-0.5.21-Windows-DOSSIER` et extraire les fichiers. Le workflow exécute les tests avant l'empaquetage et récupère H5P Standalone 3.8.2 comme lecteur de transition.

Le workflow **Construire des bibliothèques H5P (recettes)** compile à distance les recettes inscrites dans `recipes/`. La recette Game Map est un cas de validation, pas une dépendance de l'application. Son installation dans le registre ne modifie pas automatiquement les activités H5P ouvertes.

## Répertoires actifs

- `assets/` : interface et modules JavaScript côté rendu.
- `electron/` : processus principal et préchargement sécurisé.
- `runtime/` : registre, lecteur, consultation GitHub, snapshots et journaux.
- `scripts/` : préparation du lecteur et empaquetage distant.
- `recipes/` : recettes de compilation approuvées ; seule Game Map est fournie actuellement.
- `tests/` : suite de non-régression, y compris les tests historiques utiles.
- `.github/workflows/` : les deux workflows nécessaires, à cet emplacement exact.
- `docs/ROADMAP.md` : priorités à venir.

## Fonctionnement actuel et limites

Le moteur actif reste **H5P Standalone 3.8.2**. Le téléchargement des sources récentes du cœur officiel **ne les rend pas actives** ; leur compatibilité n'est pas certifiée. L'intégration des nouveaux cœurs et l'éditeur visuel sont encore à développer. L'export HTML doit être hébergé sous HTTP(S), pas ouvert comme un fichier local.

Les données locales `data/` ne doivent jamais être publiées sur GitHub ; les sauvegarder et les recopier dans la nouvelle distribution, application fermée. Les versions des bibliothèques existantes sont préservées.

## Tests et dépendances

Avec Node.js 22 dans un environnement de développement : `npm test`.

`package.json` fixe les deux dépendances directes. **Aucun `package-lock.json` n'est fourni ici**, car l'environnement de préparation n'a pas accès au registre npm ; aucun lockfile approximatif n'a été inventé. Le workflow utilise `npm install` en son absence, ou `npm ci` s'il est ensuite ajouté au dépôt. Voir le guide pour récupérer le lockfile généré par GitHub Actions. Les dépendances transitives ne sont donc pas encore figées dans cette première livraison.

La construction de bibliothèques tierces exécute du code dans un runner GitHub : n'ajouter que des recettes et des révisions préalablement examinées. Ne pas injecter de secrets dans ces jobs.

Licences : `LICENSE` (projet) et `LICENSE-JSZip.md` (bibliothèque JavaScript conservée).
