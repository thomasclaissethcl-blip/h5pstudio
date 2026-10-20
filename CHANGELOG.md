## 0.6.2.1 (correctif expérimental à valider sur Windows)

- Version npm : `0.6.2-hotfix.1` (notation SemVer valide) ; numéro affiché et nom des archives : `0.6.2.1`.
- Chargement du widget de texte H5P via le protocole local dédié `h5p-widget://editor/`, sans recours direct à `file:` dans son iframe.
- Maintien de la séparation d'origine entre l'application et le widget, ressources servies à partir d'une liste fixe.
- Suppression de la fausse confirmation de chargement liée au seul événement `iframe.load`.
- Vérification active des scripts et du montage, identification des ressources manquantes, délais de 8 secondes et diagnostic lisible.
- Bouton « Réessayer le chargement » et bloc de diagnostic accessible.
- Ajout de 7 tests Node (140 au total) et d'un test graphique Electron à exécuter dans GitHub Actions Windows.
- Aucun changement volontaire du lecteur H5P Standalone 3.8.2, des exports, du registre ou des données utilisateurs.
- Validation locale : tests Node uniquement. Validation graphique et compilation Windows à confirmer.

# 0.6.2 : premier pont expérimental vers H5PEditor.Text

- Conservation du socle 0.6.1 et de son lecteur Standalone 3.8.2.
- Onglet expérimental affichant **le script officiel** du widget de saisie `H5PEditor.Text`, dans une iframe à origine isolée et sans API Electron.
- Sélection seulement des champs texte simples, à la version exacte contenue dans l’archive H5P importée. Les champs riches, personnalisés et complexes restent dans le formulaire guidé / JSON, sans modification automatique.
- Transmission contrôlée des changements vers `content/content.json` en cours, réutilisant l’enregistrement `.h5p` existant, la prévisualisation et l’export HTML.
- Préparation du script officiel depuis un **commit Git fixé**, et de jQuery 3.7.1, à la compilation distante. Empreintes SHA256 et provenance inscrites dans le paquet construit.
- Nouveaux contrôles de passerelle, d’isolation, de conservation des contenus et de cohérence de distribution.
- **Limites :** aucun H5PEditor complet ; pas de build Windows réalisé localement, ni de validation sur l’ordinateur de l’utilisateur. L’intégration graphique effective du widget doit être contrôlée après la compilation GitHub Actions.

---

# 0.6.1 : correction de l'enregistrement .h5p

- Un seul bouton d'enregistrement `.h5p`, accessible en tête du projet.
- Boîte de dialogue Windows **Enregistrer sous** ; la destination est choisie par l'utilisateur.
- Confirmation uniquement après écriture sur disque et vérification de la taille.
- Affichage du chemin réel et commande « Afficher le fichier dans son dossier ».
- Annulation et erreurs traitées sans signaler une réussite à tort.
- L'export HTML ZIP reste séparé et inchangé.
- Tests de sauvegarde, d'annulation, d'erreur d'écriture et de vérification du fichier.
- Édition guidée inchangée ; le véritable éditeur H5PEditor reste à intégrer.

# 0.6.0 : premier prototype d’édition guidée

- Nouveau panneau d’édition guidée piloté par `semantics.json`, disponible uniquement lorsque ce schéma est présent dans l’archive importée.
- Champs pris en charge : texte, nombre, booléen, liste déroulante, groupes et listes simples. Valeurs préexistantes et champs non pris en charge préservés.
- Prévisualisation directe des modifications en cours et bouton de retour à l’édition.
- Titre modifiable sans toucher au JSON, édition avancée toujours accessible.
- Aucun changement du moteur de lecture, des bibliothèques embarquées ou des versions de cœur.
- Premier prototype limité : aucune prise en charge du widget d’édition officiel, de l’envoi de médias ou de la création entièrement vierge.

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
