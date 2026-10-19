# Passage de H5P Studio Portable 0.6.0 à 0.6.1

Cette livraison corrige l'export `.h5p` sous Electron, sans modifier les fonctions validées d’import, d’édition ou de prévisualisation.

**Pour GitHub Web :** conservez `.gitignore` et `.gitattributes` déjà présents dans le dépôt.
Si vous souhaitez une arborescence sans anciennes notices, supprimez l'ancien `GUIDE-GITHUB-060.md` après installation du nouveau guide.

**Pour GitHub Web :** téléversez les fichiers extraits de l’archive `H5P-Studio-Portable-0.6.1-upload-web.zip` à la racine du dépôt en remplacement des anciens fichiers de même chemin. Ensuite, dans GitHub, actualisez uniquement `.github/workflows/windows-portable.yml` avec le contenu fourni dans le dossier `WORKFLOWS-GITHUB-A-CREER`. Le workflow de compilation des bibliothèques ne change pas.

**Pour Git :** l'archive `H5P-Studio-Portable-0.6.1-GitHub-complet.zip` contient la structure complète avec `.github/workflows/`.

Gardez une copie de votre ancienne distribution et de `data/` avant toute mise à jour. Ne téléversez pas le répertoire `data/` sur GitHub.

**Test demandé :** importer Bingo ou une autre activité ; modifier un champ ; cliquer sur `Enregistrer sous… (.h5p)` ; choisir un dossier et un nom ; vérifier le message avec le chemin ; cliquer sur `Afficher le fichier dans son dossier` ; ouvrir l’archive enregistrée et vérifier la modification et la prévisualisation. Réessayer avec `Annuler` et vérifier qu’aucun message de réussite n’est affiché. Puis vérifier l’export HTML multifichier.

Le lecteur H5P n’est pas remplacé par cette mise à jour. L’éditeur officiel H5PEditor reste à intégrer.
