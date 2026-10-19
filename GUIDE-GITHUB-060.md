# H5P Studio Portable 0.6.0 : installation et test du prototype d’édition

## Avant la mise à jour

Sauvegardez le dossier `data/` de votre distribution Windows, application fermée. Ne publiez pas ce dossier sur GitHub. Vous pouvez conserver la version 0.5.21 à côté de la nouvelle distribution.

## Mise à jour GitHub

**Option dépôt complet :** utilisez `H5P-Studio-Portable-0.6.0-GitHub-complet.zip`, en conservant l'arborescence. Ce ZIP contient `.github/workflows/`.

**Option interface web GitHub :** utilisez `H5P-Studio-Portable-0.6.0-upload-web.zip`. Ajoutez les fichiers courants, puis modifiez dans l'éditeur GitHub les deux fichiers déjà présents :

- `.github/workflows/windows-portable.yml`, à partir du fichier joint.
- `.github/workflows/build-h5p-libraries.yml` : inchangé fonctionnellement, fourni dans l'archive complète et séparément.

Les noms des dossiers commençant par un point sont imposés par GitHub Actions ; ne renommez pas `.github` en `github`.

Retirez si souhaité `GUIDE-GITHUB-0521.md` devenu historique. Les fichiers `.gitignore` et `.gitattributes` déjà présents restent valides.

Lancez **Actions > Compiler H5P Studio Windows DOSSIER > Run workflow**, récupérez l'artefact `H5P-Studio-Portable-0.6.0-Windows-DOSSIER`.

## Test ciblé

1. Démarrez l'application Windows DOSSIER et importez une activité `.h5p` qui contient le `semantics.json` de sa bibliothèque principale.
2. Ouvrez **Édition guidée (prototype)**, si ce bouton est activé. Modifiez un champ simple, par exemple du texte ou un choix ; changez aussi le titre.
3. Cliquez sur **Prévisualiser les modifications**. La prévisualisation utilise la version courante des données en mémoire, sans enregistrer de fichier.
4. Cliquez sur **Retour à l'édition** et vérifiez que les modifications sont toujours présentes.
5. Cliquez sur **Exporter le fichier .h5p**. Importez cette nouvelle archive pour vérifier que les modifications sont conservées. L'archive originale n'est pas modifiée.
6. Vérifiez le fonctionnement de l'export HTML avec l'activité de référence déjà validée.

**Si l'onglet Édition guidée est désactivé** : l'archive n'embarque peut-être pas `semantics.json`, ne contient que des champs complexes ou ne permet pas d'identifier sans ambiguïté la version de la bibliothèque principale. Continuez avec les **Données JSON avancées**. Ne modifiez pas les versions H5P pour forcer l'apparition du formulaire.

Le formulaire n'est pas l'éditeur officiel H5PEditor. Les médias, widgets spécifiques, HTML enrichi et bibliothèques imbriquées nécessitent une intégration supplémentaire. Les champs non pris en charge sont conservés dans le fichier.

Le lecteur actuel est encore Standalone 3.8.2. La compatibilité avec la dernière API H5P Core n'est pas certifiée, et aucun cœur officiel récemment téléchargé n'est encore activé.
