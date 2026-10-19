# Intégration du cœur H5P et de H5PEditor : état du projet 0.6.0

## Ce que nous utilisons aujourd'hui

- **Archive H5P** : lecteur et écrivain ZIP local ; `h5p.json`, `content/content.json`, `library.json` et `semantics.json` sont analysés sans faire exécuter les scripts de bibliothèques à l'importation.
- **Premier formulaire guidé** : les champs simples sont obtenus des `semantics.json` inclus dans les paquets, selon la version exacte de la bibliothèque principale déclarée dans `h5p.json`. Ce formulaire est développé par H5P Studio, **ce n'est pas H5PEditor**.
- **Prévisualisation/HTML** : lecteur tiers H5P Standalone 3.8.2 fourni à titre transitoire. Le niveau exact de l'API core n'est pas certifié.
- **Mises à jour** : les commits officiels du cœur et de l'éditeur peuvent être repérés et archivés, pas activés. Les bibliothèques multiversions sont conservées sans migration implicite.

## Ce qu'exige le vrai H5PEditor

| Élément officiel | Besoin d'intégration | État |
| --- | --- | --- |
| `h5p/h5p-php-library` | API lecteur, assets JS, stockage, récupération des bibliothèques, endpoints et traitement de contenus | Sources suivies, aucun adaptateur actif |
| `h5p/h5p-editor-php-library` | Scripts de l'éditeur H5PEditor, widgets, services de fichiers et traductions | Sources suivies, aucun adaptateur actif |
| `H5PEditor.*` contenus dans les bibliothèques | Widgets propres aux types (texte enrichi, médias, contenus imbriqués, etc.) | Registre multiversion, non exécutés comme éditeur |
| Couche d'intégration de plateforme | Implémenter services serveur et contrat de stockage, ou fournir un hôte contrôlé compatible | À concevoir et tester |
| Adaptateurs de versions | Préparer, contrôler puis activer des révisions officielles après tests d'API | À développer |

Références H5P : https://h5p.org/technical-overview ; https://h5p.org/creating-your-own-h5p-plugin ; https://h5p.org/node/2468 ; https://h5p.org/documentation/developers/h5p-specification

## Stratégie de compatibilité

1. Obtenir et inventorier les sources officielles du cœur navigateur/serveur et de H5PEditor, avec commit SHA complet.
2. Définir les fonctionnalités serveur attendues (`H5PFrameworkInterface`, stockage et services éditoriaux), sans supposer qu'une bibliothèque PHP devient exécutable dans Electron sans couche serveur.
3. Concevoir un adaptateur isolé, versionné et testable ; aucune substitution non testée sur le profil stable.
4. Vérifier les compatibilités et dépendances des bibliothèques, leur interface de création, le traitement des médias et l'export avec plusieurs versions de cœur.
5. Fournir un profil stable et un profil expérimental avec retour arrière.

La capacité de télécharger le dernier commit ne signifie pas qu'il peut être activé : elle est un prérequis, pas un critère de certification.
