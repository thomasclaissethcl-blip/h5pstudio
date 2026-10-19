# Feuille de route : H5P Studio Portable

## Validations acquises

- 0.3.4 : aperçu H5P et export HTML statique multifichier validés sur Windows et Moodle ; distribution DOSSIER.
- 0.4.2 : registre de bibliothèques multiversion, analyse des dépendances, installation additive validés.
- 0.5.1 : suivi de sources GitHub, compilation distante Game Map et importation des bibliothèques validés sur le poste de l'utilisateur.
- 0.5.2 : journal d'opérations, recettes de compilation et inventaire des révisions du cœur livrés, validation Windows encore à réaliser.
- 0.5.21 : nettoyage du dépôt, suppression des doublons et des workflows obsolètes, documentation d'installation sur dépôt neuf ; aucun changement fonctionnel majeur.

- 0.5.21 : six contrôles Windows validés par l’utilisateur, 109 tests automatisés réussis.
- 0.6.0 : prototype d’édition guidée depuis `semantics.json`, retour à l’édition après prévisualisation. Tests Windows en attente.

## Chantiers prioritaires

1. Valider sous Windows l’édition guidée, la prévisualisation sans enregistrement et l’export, puis conserver la suite de non-régression.
2. Concevoir une installation et une activation **réelles** des différentes versions du cœur H5P, avec adaptateurs indépendants du lecteur Standalone et validation technique des API serveur/navigateur.
3. Intégrer l’éditeur officiel H5PEditor avec son cœur d’édition, les widgets et bibliothèques multiversions. Prévoir la création d’une activité sans modèle existant.
4. Generaliser la construction distante de bibliothèques par recettes relues et lancer les workflows depuis l'application après autorisation.
5. Ajouter une migration explicite, vérifiable et réversible des contenus lorsque les versions de bibliothèques évoluent.
6. Maintenir profils stable/expérimental, provenance des commits, signatures ou empreintes d'artefacts, audits des dépendances et lockfile reproductible.

**Limitation actuelle :** la récupération d'une révision officielle H5P ne l'active pas. Le moteur actif reste H5P Standalone 3.8.2 ; aucune équivalence d'API cœur n'est affirmée.
