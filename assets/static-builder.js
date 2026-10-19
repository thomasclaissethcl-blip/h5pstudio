/* H5P Studio Portable : experimental static site package generator, v0.2.1.
   Creates a portable package; H5P Standalone player assets need independent installation.
   No claims about H5P runtime compatibility are made at conversion time. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.H5PStaticBuilder=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  const PLAYER_VERSION='3.8.2';
  const LIMIT_FILES=3000;
  const UTF8=new TextEncoder();
  const HELP=`H5P STUDIO PORTABLE - EXPORT DE PREVISUALISATION 0.2.1\n\n`+
`Ce dossier contient les données H5P extraites et un lecteur web à fournir.\n\n`+
`1. Sur Windows 11, ouvrez INSTALLER-LECTEUR.cmd (connexion Internet nécessaire pour ce premier téléchargement).\n`+
`2. Lancez PREVISUALISER.cmd. Cela ouvre un site sur 127.0.0.1 sans installation de serveur.\n`+
`3. Conservez cette fenêtre ouverte durant le test. Ctrl+C pour arrêter le serveur.\n\n`+
`Si vous avez déjà les fichiers dist/ de h5p-standalone compatibles, copiez-les dans player/.\n`+
`Le site fonctionne hors connexion lorsque player/ contient le lecteur et toutes les ressources H5P sont locales.\n\n`+
`Les scripts et bibliothèques contenus dans le .h5p s'exécutent alors dans le navigateur.\n`+
`N'utilisez cette prévisualisation qu'avec des H5P de confiance.\n`+
`Ce ZIP n'est pas une preuve de compatibilité avec Moodle ou une version H5P.\n`+
`Le lecteur est épinglé à la version ${PLAYER_VERSION} jusqu'à validation d'un autre adaptateur.\n`+
`Documentation : https://github.com/tunapanda/h5p-standalone\n`;
  const VIEWER_HTML=`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Activité H5P</title><link rel="stylesheet" href="viewer/viewer.css"><link rel="stylesheet" href="player/styles/h5p.css">
</head><body><main><div id="h5p-container"></div><div id="playerNote" role="alert" hidden></div></main>
<script src="player/main.bundle.js"></script><script src="viewer/bootstrap.js"></script></body></html>`;
  const BOOTSTRAP=String.raw`(function(){
'use strict';
const note=document.getElementById('playerNote');
function status(t,error){note.textContent=error?t:'';note.hidden=!error;}
const errors=[];
const nativeFetch=window.fetch.bind(window);
// Observe unexpected HTML responses while retaining native fetch behavior.
window.fetch=async function(resource,options){
 const response=await nativeFetch(resource,options);
 const url=String(typeof resource==='string'?resource:resource&&resource.url||'');
 const type=response.headers.get('content-type')||'';
 if((/\.json(?:[?#]|$)/i.test(url) || (/text\/html/i.test(type) && !/\.(?:html|htm)(?:[?#]|$)/i.test(url))) &&
    (!response.ok || /text\/html/i.test(type))){
  errors.push('URL '+url+' : HTTP '+response.status+', type '+type);
 }
 return response;
};
window.addEventListener('error',event=>{
 if(event.filename&&event.filename.includes('/player/'))status('Erreur de chargement du lecteur : '+event.message,true);
});
if(location.protocol==='file:'){
 status('Ce site multifichier doit être consulté par HTTP(S) (Moodle ou serveur web). L’ouverture directe du fichier index.html est bloquée par les navigateurs.',true);
 return;
}
async function getMetadata(){
 const url=new URL('h5p.json',location.href);
 const response=await nativeFetch(url.href,{cache:'no-store'});
 if(!response.ok)throw Error('h5p.json : HTTP '+response.status+' ('+url.pathname+')');
 const body=await response.text();
 if(body.trimStart().startsWith('<'))throw Error('h5p.json a renvoyé du HTML à la place du JSON ('+url.pathname+').');
 try{return JSON.parse(body);}catch(e){throw Error('h5p.json invalide : '+e.message);}
}
async function init(){
 const meta=await getMetadata();
 document.title=meta.title||'Activité H5P';
 if(!window.H5PStandalone||typeof window.H5PStandalone.H5P!=='function')throw Error('Lecteur H5P absent ou incomplet dans player/.');
 // Standalone appends /h5p.json and /content.json to the supplied directories.
 // Strip the trailing slash to prevent //h5p.json on the local HTTP server.
 const directory=new URL('.',location.href).href.replace(/\/+$/,'');
 const contentDirectory=new URL('content',location.href).href.replace(/\/+$/,'');
 return new window.H5PStandalone.H5P(document.getElementById('h5p-container'),{
  h5pJsonPath:directory,contentJsonPath:contentDirectory,
  librariesPath:directory,
  frameJs:new URL('player/frame.bundle.js',location.href).href,
  frameCss:new URL('player/styles/h5p.css',location.href).href,
  frame:false,fullScreen:true,export:false,reportingIsEnabled:false,saveFreq:0
 });
}
init().then(()=>status('',false))
.catch(e=>{
 console.error(e);const detail=errors.length?' Requêtes suspectes : '+errors.slice(-3).join(' ; '):'';
 status('Prévisualisation impossible : '+(e&&e.message?e.message:String(e))+detail,true);
});
})();`;
  const VIEWER_CSS=`:root{font-family:Segoe UI,Arial,sans-serif;color:#172335;background:#fff}*{box-sizing:border-box}body{margin:0}main{width:100%;max-width:1200px;margin:0 auto;padding:0}#h5p-container{min-height:80px}#playerNote:not([hidden]){margin:12px;padding:14px;border:1px solid #dba3a3;border-radius:6px;background:#fff6f6;color:#991b1b;font-size:14px;line-height:1.5}#playerNote[hidden]{display:none}`;
  // No -Root argument: %%~dp0 from cmd.exe ends with a backslash, and its closing quote
  // can reach PowerShell as a literal character, breaking Path.GetFullPath().
  // Each PowerShell script derives the package root from $PSScriptRoot.
  const INSTALL_BAT=`@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\install-player.ps1"\r\nif errorlevel 1 (echo Echec du telechargement. & pause & exit /b 1)\r\necho Lecteur pret.\r\npause\r\n`;
  const PREVIEW_BAT=`@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nif not exist "%~dp0player\\main.bundle.js" (echo Lecteur absent : lancez INSTALLER-LECTEUR.cmd & pause & exit /b 1)\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\serve.ps1"\r\nif errorlevel 1 pause\r\n`;
  const INSTALL_PS=`$ErrorActionPreference='Stop'
# Derived from this script's directory, not from a possibly malformed CMD argument.
$rootFull=[System.IO.Path]::GetFullPath((Join-Path -Path $PSScriptRoot -ChildPath '..'))
$ver='3.8.2' # changer seulement apres tests de compatibilite
$uri="https://registry.npmjs.org/h5p-standalone/-/h5p-standalone-$ver.tgz"
$player=Join-Path $rootFull 'player'
if(Test-Path -LiteralPath (Join-Path $player 'main.bundle.js')){
 Write-Host 'Lecteur deja present. Pour changer de version, effectuez une sauvegarde puis remplacez player/ manuellement.'
 exit 0
}
$tmp=Join-Path ([System.IO.Path]::GetTempPath()) ('h5p-studio-player-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try{
 $tgz=Join-Path $tmp 'player.tgz'; Write-Host "Telechargement H5P Standalone v$ver depuis npm..."
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 Invoke-WebRequest -Uri $uri -OutFile $tgz -UseBasicParsing
 & tar.exe -xzf $tgz -C $tmp
 if($LASTEXITCODE -ne 0){throw 'Extraction du package npm impossible (tar.exe indisponible ou archive invalide).'}
 $dist=Join-Path $tmp 'package\\dist'
 foreach($f in @('main.bundle.js','frame.bundle.js','styles\\h5p.css')){
  if(!(Test-Path -LiteralPath (Join-Path $dist $f))){throw "Ressource absente du lecteur telecharge : $f"}
 }
 if(Test-Path $player){Remove-Item -LiteralPath $player -Recurse -Force}
 Copy-Item -LiteralPath $dist -Destination $player -Recurse
 Write-Host "H5P Standalone $ver copie dans player/."
 Write-Host 'Origine : npmjs.org ; version epinglee. Test de compatibilite fonctionnelle toujours necessaire.'
}catch{Write-Error $_.Exception.Message;exit 1}
finally{Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue}
`;
  const SERVER_PS=`$ErrorActionPreference='Stop'
# Resolve the site root from scripts/serve.ps1 itself; no -Root argument required.
$rootFull=[System.IO.Path]::GetFullPath((Join-Path -Path $PSScriptRoot -ChildPath '..')).TrimEnd([char]'\\',[char]'/')
if(!(Test-Path (Join-Path $rootFull 'index.html'))){throw 'index.html introuvable.'}
# Lie uniquement l'interface locale, sans URLACL ni droits administrateur.
$listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$listener.Start()
$port=([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$base="http://127.0.0.1:$port/"
Write-Host "Previsualisation locale : $base"; Write-Host 'Ctrl+C pour arreter.'
Start-Process $base
function SendText($stream,[int]$code,[string]$message){
 $body=[Text.Encoding]::UTF8.GetBytes($message)
 $label=if($code -eq 404){'Not Found'}elseif($code -eq 405){'Method Not Allowed'}else{'Bad Request'}
 $head=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $code $label\x60r\x60nContent-Type: text/plain; charset=utf-8\x60r\x60nContent-Length: $($body.Length)\x60r\x60nConnection: close\x60r\x60nX-Content-Type-Options: nosniff\x60r\x60n\x60r\x60n")
 $stream.Write($head,0,$head.Length);$stream.Write($body,0,$body.Length)
}
function Mime([string]$ext){switch($ext.ToLowerInvariant()){
 '.html'{'text/html; charset=utf-8'} '.js'{'application/javascript; charset=utf-8'}
 '.css'{'text/css; charset=utf-8'} '.json'{'application/json; charset=utf-8'}
 '.svg'{'image/svg+xml'} '.png'{'image/png'} '.jpg'{'image/jpeg'} '.jpeg'{'image/jpeg'}
 '.gif'{'image/gif'} '.webp'{'image/webp'} '.ico'{'image/x-icon'}
 '.mp4'{'video/mp4'} '.webm'{'video/webm'} '.mp3'{'audio/mpeg'} '.wav'{'audio/wav'}
 '.ogg'{'audio/ogg'} '.woff'{'font/woff'} '.woff2'{'font/woff2'} '.ttf'{'font/ttf'}
 '.pdf'{'application/pdf'} default{'application/octet-stream'}
}}
try{while($true){
 $client=$listener.AcceptTcpClient();$client.ReceiveTimeout=10000;$client.SendTimeout=15000
 try{
  $stream=$client.GetStream()
  $reader=[IO.StreamReader]::new($stream,[Text.Encoding]::ASCII,$false,4096,$true)
  $line=$reader.ReadLine()
  if(!$line){continue}
  $parts=$line.Split(' ')
  if($parts.Count -lt 2 -or $parts[0] -ne 'GET'){SendText $stream 405 'Seules les requetes GET sont acceptees.';continue}
  $n=0;do{$h=$reader.ReadLine();$n++;if($n -gt 100){break}}while($h -ne $null -and $h -ne '')
  $uriPath=($parts[1] -split '[?#]')[0]
  try{$decoded=[uri]::UnescapeDataString($uriPath)}catch{SendText $stream 400 'Chemin invalide';continue}
  if($decoded.Contains([char]92) -or $decoded.Contains([char]0) -or $decoded.Contains([char]10) -or $decoded.Contains([char]13) -or $decoded.Contains(':')){SendText $stream 400 'Chemin interdit';continue}
  $rel=$decoded.TrimStart('/').Replace('/',[IO.Path]::DirectorySeparatorChar)
  if([string]::IsNullOrEmpty($rel)){$rel='index.html'}
  $full=[IO.Path]::GetFullPath((Join-Path $rootFull $rel))
  if(!$full.StartsWith($rootFull+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){
   SendText $stream 400 'Chemin interdit';continue
  }
  if(!(Test-Path -LiteralPath $full -PathType Leaf)){SendText $stream 404 'Fichier non trouve';continue}
  $file=[IO.File]::OpenRead($full)
  try{
   $mime=Mime ([IO.Path]::GetExtension($full))
   $head=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK\x60r\x60nContent-Type: $mime\x60r\x60nContent-Length: $($file.Length)\x60r\x60nCache-Control: no-store\x60r\x60nX-Content-Type-Options: nosniff\x60r\x60nConnection: close\x60r\x60n\x60r\x60n")
   $stream.Write($head,0,$head.Length)
   $file.CopyTo($stream)
  }finally{$file.Dispose()}
 }catch{Write-Warning $_.Exception.Message}
 finally{$client.Dispose()}
}}finally{$listener.Stop()}
`;
  function ensureProject(project, metadataText, contentText){
    if(!project||!project.zip)throw Error('Aucune archive importée.');
    if(project.dependencyStatus!=='complet')throw Error('Diagnostic des dépendances incomplet. Corrigez ou examinez le rapport avant l’export statique.');
    if(project.missing.length)throw Error('Bibliothèques absentes de l’archive : '+project.missing.slice(0,4).join(', '));
    if(!project.libraries.length)throw Error('Aucune bibliothèque H5P incluse dans cette archive.');
    const edited=globalThis.H5PArchive?globalThis.H5PArchive.validateEditing(metadataText,contentText):require('./h5p-core.js').validateEditing(metadataText,contentText);
    if(edited.warnings.length)throw Error('Métadonnées modifiées : '+edited.warnings.join(' '));
    return edited;
  }
  function reportManifest(project, edited){return {format:'h5p-studio-static-preview',generator:'H5P Studio Portable',generatorVersion:'0.3.3',
    runtime:{adapter:'h5p-standalone',version:PLAYER_VERSION,included:false,downloadRequired:true},
    activity:{title:edited.metadata.title,mainLibrary:edited.metadata.mainLibrary,libraryCount:project.libraries.length,dependencyCount:project.dependencyStats.recognized},
    limitations:['Exécution non vérifiée automatiquement','Compatibilité Moodle non testée','Lecteur à installer localement dans player/']};}
  async function build(project,metadataText,contentText,ZIP,onProgress){
    if(!ZIP)throw Error('JSZip est introuvable.');
    const edited=ensureProject(project,metadataText,contentText);
    // Clone the ZIP registry instead of inflating thousands of files in memory.
    const files=Object.entries(project.zip.files).filter(([name,file])=>!file.dir);
    if(files.length>LIMIT_FILES)throw Error('Archive trop volumineuse en nombre de fichiers.');
    const reserved=/^(?:index\.html|studio-manifest\.json|GUIDE-PREVISUALISATION\.txt|INSTALLER-LECTEUR\.cmd|PREVISUALISER\.cmd|viewer\/|scripts\/|player\/)/i;
    for(const [name] of files){
      if(name.includes('\\')||name.startsWith('/')||name.split('/').some(s=>s==='..'||s==='.'||!s))throw Error('Chemin dangereux : '+name);
      if(reserved.test(name))throw Error('Archive contient un chemin réservé au lecteur : '+name);
    }
    // JSZip.clone() shares its files registry with the source ZIP. Detach it.
    // Otherwise generating a static site contaminates the imported H5P in memory
    // (index.html, viewer/ etc.) and every subsequent operation fails.
    const output=project.zip.clone();
    output.files={...project.zip.files};
    if(onProgress)onProgress(5);
    output.file('h5p.json',JSON.stringify(edited.metadata,null,2));
    output.file('content/content.json',JSON.stringify(edited.content,null,2));
    output.file('index.html',VIEWER_HTML);
    output.file('viewer/bootstrap.js',BOOTSTRAP);
    output.file('viewer/viewer.css',VIEWER_CSS);
    output.file('INSTALLER-LECTEUR.cmd',INSTALL_BAT);
    output.file('PREVISUALISER.cmd',PREVIEW_BAT);
    output.file('scripts/install-player.ps1',INSTALL_PS);
    output.file('scripts/serve.ps1',SERVER_PS);
    output.file('GUIDE-PREVISUALISATION.txt',HELP);
    output.file('studio-manifest.json',JSON.stringify(reportManifest(project,edited),null,2));
    output.file('player/AJOUTER-LECTEUR-ICI.txt','Copier ici l’integralite du dossier dist/ de H5P Standalone 3.8.2, ou lancer INSTALLER-LECTEUR.cmd.');
    const bytes=await output.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}},m=>onProgress&&onProgress(5+Math.round(m.percent*.95)));
    return bytes;
  }
  return {build, PLAYER_VERSION, templates:{VIEWER_HTML,BOOTSTRAP,SERVER_PS,INSTALL_PS}, reportManifest};
});
