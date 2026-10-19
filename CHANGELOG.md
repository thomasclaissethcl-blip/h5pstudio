# Historique des versions

## 0.5.21 : nettoyage et consolidation du dépôt

- Suppression de l'ancien workflow `build-game-map.yml`, encore présent à tort dans l'archive de la branche 0.5.2.
- Suppression des anciens guides de correctifs, des scripts locaux obsolètes, des copies racine des modules et tests, du workflow Windows racine et d'une copie de la licence JSZip.
- Un seul emplacement actif par module : `assets/`, `electron/`, `runtime/`, `scripts/` et `tests/`.
- Version 0.5.21 synchronisée dans le paquet Electron, l'interface et les artefacts GitHub Actions.
- Ajout des protections `.gitignore`, `.gitattributes` et de tests de propreté du dépôt.
- Documentation d'installation dans un dépôt GitHub neuf, en conservant `.github/workflows/` au chemin imposé par GitHub Actions.
- Le fonctionnement de la lecture H5P et des bibliothèques demeure celui de la 0.5.2.

## 0.5.2 : traçabilité et recettes

- Journal local des téléchargements de sources et installations depuis les releases, avec succès ou erreur, commit et horodatage.
- Retour immédiatement sous le bouton « Examiner cette révision », avec SHA-256.
- Ouverture du ZIP source dans l'Explorateur Windows et inventaire des sources du cœur.
- Workflow générique de compilation à recettes approuvées, première recette : Game Map.
- Sources récentes du cœur uniquement conservées : ni activation, ni compatibilité présumée.

## 0.5.1 et versions antérieures

- Importation de snapshots GitHub par commit.
- Gestionnaire de sources et releases officielles et tierces.
- Registre multiversion de bibliothèques, analyse de dépendances et rapports d'importation.
- Lecture et aperçu intégrés, export H5P et export HTML statique multifichier.
