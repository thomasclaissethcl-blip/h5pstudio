# H5P Studio Portable 0.6.2 : premier widget officiel expérimental

Cette version reprend intégralement les fonctionnalités validées en **0.6.1** et ajoute un onglet **Widget H5P officiel (essai)**, destiné aux champs de texte simples contenus dans les bibliothèques importées. Cet onglet utilise le fichier JavaScript officiel `H5PEditor.Text`, préparé au moment de la compilation sur GitHub Actions, et l’exécute dans un cadre isolé. Les modifications rejoignent les données courantes de l’activité ; le bouton **Enregistrer sous… (.h5p)** produit toujours le fichier sur disque et la prévisualisation emploie toujours H5P Standalone 3.8.2.

**État technique :** démonstrateur d’un widget officiel, pas intégration de l’éditeur H5P complet. Les médias, l’enrichissement de texte, les widgets personnalisés, les bibliothèques imbriquées et la création vierge ne sont pas disponibles dans ce nouvel onglet. La source officielle est épinglée à un commit Git, sans téléchargement au démarrage de l’application. Voir **[docs/EDITOR-TEXTE-OFFICIEL.md](docs/EDITOR-TEXTE-OFFICIEL.md)** pour les limites et la recette de vérification.

**Pour mettre à jour GitHub ou compiler sur Windows**, consulter **[GUIDE-GITHUB-062.md](GUIDE-GITHUB-062.md)**. Aucun Node.js ni droit administrateur n’est nécessaire sur le PC de l’utilisateur.

---

# Historique : prototype 0.6.1 : édition guidée et prévisualisation

L’édition guidée utilise le fichier `semantics.json` inclus dans une archive `.h5p`.
Elle permet de modifier les champs simples : texte, nombre, case à cocher, choix, groupes et certaines listes.
Les champs et composants non pris en charge sont conservés sans modification. Les champs HTML sont affichés sous forme de texte source, sans éditeur de mise en forme.

Le formulaire guidé de la 0.6.1 n’est **pas le véritable éditeur H5PEditor**. Le nouvel onglet 0.6.2 utilise un widget officiel isolé, sans moteur complet. Les widgets H5P (médias, bibliothèques imbriquées, bibliothèques H5PEditor, ressources distantes) et la création sans archive modèle restent à développer. Les révisions du cœur officiel ne sont pas encore activables.

Le bouton **Prévisualiser** utilise les données en cours et le lecteur existant ; il ne sauvegarde pas le `.h5p` sur disque. Pour conserver les modifications, utilisez **Enregistrer sous… (.h5p)** et choisissez le dossier de destination. L’activité originale n’est pas modifiée.

# Socle historique H5P Studio Portable 0.6.1

Application Windows 11 portable (**distribution DOSSIER**) permettant l'importation, l'analyse, la prévisualisation et l'exportation de contenus H5P en HTML statique multifichier.

Cette version reprend le socle propre 0.5.21 et ajoute un premier formulaire d’édition guidée à partir des `semantics.json`. Les mécanismes de lecture, de registre et d’export préexistants ne sont pas remplacés.

## Installation dans un dépôt GitHub neuf

Lire **[GUIDE-GITHUB-062.md](GUIDE-GITHUB-062.md)** avant d'importer les sources. Deux chemins existent : dépôt Git complet avec `.github/workflows/` ou téléversement par navigateur en créant ensuite les deux workflows à leur chemin obligatoire. **Renommer `.github` en `github` empêcherait GitHub Actions de détecter les workflows.**

## Compiler sans Node.js local

Dans GitHub, ouvrir **Actions > Compiler H5P Studio Windows DOSSIER > Run workflow**, sur la branche par défaut. Télécharger l'artefact `H5P-Studio-Portable-0.6.2-Windows-DOSSIER` et extraire les fichiers. Le workflow exécute les tests avant l'empaquetage et récupère H5P Standalone 3.8.2 comme lecteur de transition.

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
- `docs/CORE-INTEGRATION.md` : inventaire des composants officiels nécessaires à un véritable éditeur H5P.

## Fonctionnement actuel et limites

Le moteur actif reste **H5P Standalone 3.8.2**. Le téléchargement des sources récentes du cœur officiel **ne les rend pas actives** ; leur compatibilité n'est pas certifiée. L’activation des nouveaux cœurs et l’éditeur officiel H5PEditor restent à développer. Le formulaire guidé de cette version est volontairement limité. L'export HTML doit être hébergé sous HTTP(S), pas ouvert comme un fichier local.

Les données locales `data/` ne doivent jamais être publiées sur GitHub ; les sauvegarder et les recopier dans la nouvelle distribution, application fermée. Les versions des bibliothèques existantes sont préservées.

## Tests et dépendances

Avec Node.js 22 dans un environnement de développement : `npm test`.

`package.json` fixe les deux dépendances directes. **Aucun `package-lock.json` n'est fourni ici**, car l'environnement de préparation n'a pas accès au registre npm ; aucun lockfile approximatif n'a été inventé. Le workflow utilise `npm install` en son absence, ou `npm ci` s'il est ensuite ajouté au dépôt. Voir le guide pour récupérer le lockfile généré par GitHub Actions. Les dépendances transitives ne sont donc pas encore figées dans cette première livraison.

La construction de bibliothèques tierces exécute du code dans un runner GitHub : n'ajouter que des recettes et des révisions préalablement examinées. Ne pas injecter de secrets dans ces jobs.

Licences : `LICENSE` (projet) et `LICENSE-JSZip.md` (bibliothèque JavaScript conservée).

## Enregistrement des activités (.h5p)

Un unique bouton **Enregistrer sous… (.h5p)** ouvre désormais la boîte de dialogue Windows.
L’application n’affiche un succès qu’après écriture et vérification de la taille du fichier.
Le chemin complet apparaît sous le bouton, et **Afficher le fichier dans son dossier** l’ouvre dans l’Explorateur.
En cas d’annulation ou d’échec, aucune réussite n’est annoncée et les modifications restent dans l’éditeur.
Le bouton **Exporter HTML multifichier** utilise une autre boîte de dialogue, indépendante de celle du `.h5p`.
