# Jalon 0.6.2 : exécution isolée du véritable widget H5PEditor.Text

## Ce qui est développé

Le dossier `assets/official-editor-host.html` charge le composant JavaScript officiel `h5peditor-text.js` et jQuery 3.7.1, préparés par `scripts/prepare-editor.cjs` lors du build GitHub Actions. Le fichier source officiel **n'est pas réécrit** par Studio. Son constructeur `H5PEditor.Text`, sa validation et son traitement du changement de valeur sont utilisés. Une adaptation locale limitée (`assets/official-widget-bootstrap.js`) fournit les quelques fonctions du contexte H5PEditor dont ce widget a besoin.

`assets/official-editor-bridge.js` sélectionne exclusivement les champs `text` simples, sans liste de balises HTML ni widget spécifique. Le schéma provient de la version exacte de la bibliothèque du paquet importé. Le chargement se fait dans une iframe sans `allow-same-origin`, sans `nodeIntegration` et sans API IPC. Des messages `postMessage` accompagnés d'un jeton aléatoire synchronisent uniquement la valeur du champ choisi. Les messages sont vérifiés par type, protocole, fenêtre émettrice et jeton. Le contenu courant est modifié de façon immuable : les données inconnues, les images et les versions du paquet sont conservées. L'enregistrement, l'export HTML et la prévisualisation utilisent les composants existants de la version 0.6.1.

L'interface affiche distinctement le widget expérimental et le formulaire `semantics.json` préexistant. Un échec du widget ne doit pas bloquer l'édition JSON.

## Provenance et compilation

Dépôt officiel : https://github.com/h5p/h5p-editor-php-library

Commit de référence choisi pour ce **premier widget uniquement** : `53dc7bdc57b17f5a0d55a8871a36d1b1bd631e70` (révision stable connue, **non présentée comme dernière version officielle**).

Fichier téléchargé à la compilation : `scripts/h5peditor-text.js`.

La préparation conserve `assets/vendor/provenance.json` avec la révision Git et les empreintes SHA-256 calculées des ressources embarquées. Le contrôle `npm run verify:editor` vérifie l'empreinte du fichier et charge le constructeur JavaScript dans une VM Node. Cette vérification ne prouve pas que le widget fonctionne dans Electron.

Les scripts du dépôt de l'éditeur sont indiqués sous licence MIT dans son README. La licence jQuery est copiée depuis sa distribution npm. Aucun code PHP n'est embarqué dans ce prototype. À la publication d'un éditeur plus étendu, les avis de licence des composants additionnels devront être vérifiés séparément.

`assets/vendor/` est créé à la compilation, ignoré sur GitHub et intégré au dossier Windows. Le téléchargement des ressources officielles se déroule **sur GitHub Actions**, pas au lancement de l'application.

## Limites et prochaine étape

- Les champs `text` avec édition riche (`tags`) et les champs utilisant d'autres widgets sont exclus.
- Aucun moteur complet `H5PEditor.Editor`, aucun service PHP et aucun `H5PFrameworkInterface` sont implémentés à ce stade.
- Les bibliothèques imbriquées, les médias, les téléchargements, les traductions intégrales et les bibliothèques tierces complexes n'utilisent pas ce nouvel onglet.
- Le caractère embarqué des ressources officielles est vérifié seulement après préparation distante, et le fonctionnement graphique doit être testé sur Windows.
- Le lecteur reste H5P Standalone 3.8.2. Il n'y a ni mise à jour implicite du cœur ni migration de paquet.

Le jalon suivant peut élargir le même mécanisme aux autres widgets officiels et introduire, séparément, les services demandés par `H5PEditor.Editor`, avec tests de compatibilité et modèles H5P représentatifs. Cette extension devra conserver le cloisonnement établi ici.
