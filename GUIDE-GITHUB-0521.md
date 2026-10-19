# Installation de H5P Studio Portable 0.5.21 dans un nouveau dépôt GitHub

## Pourquoi le dossier `.github` ne peut pas être renommé

**GitHub Actions exige `.github/workflows/*.yml`.** Un répertoire `github`, `github-workflows` ou `workflows` placé à la racine n'est **pas reconnu** comme emplacement des workflows. Le point initial est obligatoire. GitHub accepte ce nom de répertoire ; certaines méthodes de sélection de fichiers dans le navigateur ne l'affichent simplement pas.

Deux archives sont fournies pour faciliter un démarrage propre.

### Méthode A : Git / GitHub Desktop (recommandée si disponible)

1. Créer un dépôt GitHub neuf, sans importer d'anciens fichiers.
2. Extraire **H5P-Studio-Portable-0.5.21-GitHub-complet.zip**.
3. Mettre les fichiers extraits à la **racine** du dépôt ; conserver `.github/workflows/` à son emplacement exact.
4. Publier les modifications avec Git ou GitHub Desktop, sans transférer `data/`, `node_modules/`, `dist/` ni `runtime-bundled/`.
5. Dans l'onglet **Actions**, lancer « Compiler H5P Studio Windows DOSSIER ».

### Méthode B : interface web GitHub uniquement, sans Git local

1. Créer un **nouveau dépôt** sur GitHub (branche par défaut `main`).
2. Extraire **H5P-Studio-Portable-0.5.21-upload-web.zip**. Cette archive ne contient volontairement pas de dossier commençant par un point.
3. Utiliser **Add file > Upload files** pour envoyer à la racine du dépôt les répertoires `assets`, `electron`, `runtime`, `scripts`, `recipes`, `tests`, `docs` et les fichiers ordinaires extraits. Vérifier que `package.json`, `index.html`, `README.md` et `.gitignore` sont bien présents. Si le sélecteur masque `.gitignore`, le créer à part ou l'omettre temporairement ; ce n'est pas bloquant pour la compilation.
4. Ouvrir **Add file > Create new file** et saisir exactement `.github/workflows/windows-portable.yml` dans la zone « Name your file ». GitHub créera les répertoires intermédiaires. Copier-coller tout le contenu du fichier `windows-portable.yml` fourni séparément avec la livraison (ou depuis l'archive complète).
5. Refaire **Add file > Create new file** pour `.github/workflows/build-h5p-libraries.yml`, en copiant son contenu depuis le fichier homonyme fourni séparément.
6. Vérifier dans l'onglet **Code** que les deux fichiers se trouvent sous `.github/workflows/`. Il ne doit pas y avoir de `build-game-map.yml`.
7. Ouvrir **Actions > Compiler H5P Studio Windows DOSSIER > Run workflow**. La compilation peut également se déclencher après la publication des deux workflows suivant la configuration de la branche.
8. Télécharger l'artefact `H5P-Studio-Portable-0.5.21-Windows-DOSSIER`, décompresser intégralement et lancer l'exécutable depuis le dossier obtenu.

### Pourquoi ne pas placer les workflows à la racine ?

Le fichier `windows-portable.yml` placé à la racine (comme dans les anciennes versions) est ignoré par GitHub Actions. Il n'en faut donc **aucune copie à la racine du dépôt final**. Les fichiers `.yml` fournis séparément servent seulement au copier-coller de la méthode B.

## `package-lock.json` : à ajouter après la première compilation

La préparation hors ligne ne permettait pas de générer un vrai fichier de verrouillage. Le workflow produit temporairement `package-lock.json` lors de son `npm install` et le publie dans un **artefact distinct** `H5P-Studio-0.5.21-package-lock` (à vérifier après la première compilation réussie). Télécharger ce fichier et le placer à la racine du dépôt, puis valider la modification. Aux compilations suivantes, le workflow utilisera automatiquement `npm ci`.

L'ajout d'un lockfile ne garantit pas qu'il n'existe aucune vulnérabilité. Le workflow lance aussi un audit npm informatif.

## Données personnelles et bibliothèques existantes

- Ne jamais transférer `data/` sur GitHub.
- Les anciennes installations H5P peuvent être conservées : application fermée, copier l'ancien dossier local `data/` dans le dossier de la nouvelle distribution Windows.
- Les téléchargements de sources officielles restent inactifs tant qu'aucun adaptateur n'a été testé et validé.
- Le dépôt nouveau peut être créé sans aucun historique de correctif ; les tests de régression restent nécessaires.

## Vérifications après compilation

1. H5P Studio 0.5.21 démarre depuis la distribution DOSSIER.
2. L'import H5P, l'aperçu en plein écran et l'export HTML fonctionnent toujours.
3. Le registre retrouve les bibliothèques existantes si `data/` a été copié.
4. Les vérifications GitHub, l'historique des opérations et le suivi des révisions du cœur restent utilisables.
5. Le workflow « Construire des bibliothèques H5P (recettes) » propose Game Map et son éditeur. Il n'existe plus de workflow spécifique à Game Map.

**La livraison a été testée avec Node.js sur les sources.** La construction Electron et son résultat Windows doivent être validés par GitHub Actions ; aucun binaire Windows n'est livré ici.
