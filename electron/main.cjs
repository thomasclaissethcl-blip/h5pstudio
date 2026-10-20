'use strict';
const {app,BrowserWindow,ipcMain,dialog,session,shell,protocol}=require('electron');
const fs=require('node:fs');const fsp=fs.promises;const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
const {ensureRuntime,adoptLocalPlayer,PLAYER_VERSION}=require('../runtime/player-manager.cjs');
const {extractPreview,exportStaticZip,startPreviewServer}=require('../runtime/studio-site.cjs');
const {portableRoot:resolvePortableRoot}=require('../runtime/portable-path.cjs');
const {fullscreenAllowed}=require('../runtime/fullscreen-permission.cjs');
const Registry=require('../runtime/library-registry.cjs');
const {assess}=require('../runtime/dependency-resolver.cjs');
const {evidence}=require('../runtime/core-evidence.cjs');
const UpdateSources=require('../runtime/update-sources.cjs');
const Catalog=require('../runtime/github-catalog.cjs');
const Snapshots=require('../runtime/source-snapshots.cjs');
const Journal=require('../runtime/operation-journal.cjs');
const CoreAdapters=require('../runtime/core-adapters.cjs');
const {saveH5pFile}=require('../runtime/h5p-file-export.cjs');
const APP_VERSION='0.6.2.1';
const EditorWidgetProtocol=require('../runtime/editor-widget-protocol.cjs');
// Registered before app readiness; relative resources resolve under a distinct origin.
protocol.registerSchemesAsPrivileged([{scheme:EditorWidgetProtocol.SCHEME,privileges:{standard:true,secure:true}}]);
// On packaged folder builds, __dirname belongs to resources/app.asar (read only).
// Data must live next to the real executable, never inside app.asar.
const portableRoot=resolvePortableRoot({portableDir:process.env.PORTABLE_EXECUTABLE_DIR,
  packaged:app.isPackaged,exePath:process.execPath,sourceDir:__dirname});
const requestedProfile=path.join(portableRoot,'data','electron-profile');
let dataRoot=portableRoot;
try{
 fs.mkdirSync(requestedProfile,{recursive:true});
 fs.accessSync(requestedProfile,fs.constants.W_OK);
 app.setPath('userData',requestedProfile);
}catch(e){
 // Read-only removable media or Windows directory: preserve a functioning application.
 // Explicitly identify the fallback, so users do not assume their data is portable.
 dataRoot=path.join(app.getPath('userData'),'H5P-Studio-Data');
 fs.mkdirSync(dataRoot,{recursive:true});
 console.warn('Données portables indisponibles ; repli dans le profil utilisateur : '+e.message);
}
app.setAppUserModelId('local.h5pstudio.portable');
let mainWindow=null, preview=null, workdir=null, playerPromise=null, lastExport=null, lastH5pExport=null;
const cacheDir=path.join(dataRoot,'data','runtime','standalone',PLAYER_VERSION);
const bundledDir=app.isPackaged?path.join(process.resourcesPath,'reader',PLAYER_VERSION):path.join(portableRoot,'runtime-bundled',PLAYER_VERSION);
const exportsDir=path.join(dataRoot,'exports');
const libraryDir=path.join(dataRoot,'data','libraries');
const sourceDir=path.join(dataRoot,'data','sources');
const snapshotDir=path.join(dataRoot,'data','source-snapshots');
const journalDir=path.join(dataRoot,'data','operation-journal');
const catalogCache=new Map();
function player(){
 if(!playerPromise){playerPromise=ensureRuntime({cacheDir,bundledDir}).catch(e=>{playerPromise=null;throw e;});}
 return playerPromise;
}
function checkCaller(e){
 if(!mainWindow||e.sender!==mainWindow.webContents||e.senderFrame!==mainWindow.webContents.mainFrame)throw Error('Origine non autorisée.');
}
function safeTitle(s){return String(s||'activite').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'activite';}
async function prepareBytes(bytes){
 if(!bytes||!Number.isInteger(bytes.length)||bytes.length<100||bytes.length>300*1024*1024)throw Error('Archive de site invalide ou trop volumineuse.');
 return Buffer.from(bytes);
}
async function closePreview(){
 if(preview){await new Promise(done=>preview.server.close(done));preview=null;}
 if(workdir){await fsp.rm(workdir,{recursive:true,force:true}).catch(()=>{});workdir=null;}
}
ipcMain.handle('desktop:status',async e=>{checkCaller(e);return {version:APP_VERSION,playerVersion:PLAYER_VERSION,portableRoot};});
// The registry is intentionally separate from the H5P player/editor. Merely
// importing or selecting a version never runs its JavaScript or rewrites content.
ipcMain.handle('registry:list',async e=>{checkCaller(e);return Registry.listLibraries(libraryDir);});
ipcMain.handle('registry:last-import',async e=>{checkCaller(e);return Registry.readLastImport(libraryDir);});
ipcMain.handle('registry:core-evidence',async e=>{checkCaller(e);return evidence({playerVersion:PLAYER_VERSION,bundledDir,cacheDir});});
ipcMain.handle('registry:resolve',async(e,projectId,roots)=>{
 checkCaller(e);
 if(!/^[a-f0-9]{64}$/.test(projectId||''))throw Error('Identifiant de projet invalide.');
 if(!Array.isArray(roots)||roots.length>100)throw Error('Déclarations de dépendances invalides ou trop nombreuses.');
 const choices=(await Registry.readChoices(libraryDir))[projectId]||{};
 // Core API is not attested by the current reader package, so it must not be guessed.
 return assess({libraries:await Registry.listLibraries(libraryDir),roots,choices,coreApi:null});
});
ipcMain.handle('registry:fingerprint',async(e,bytes)=>{checkCaller(e);return Registry.fingerprint(await prepareBytes(bytes));});
ipcMain.handle('registry:import-open',async(e,bytes,originalName)=>{
 checkCaller(e);const input=await prepareBytes(bytes);
 const result=await Registry.extractLibraries(input,libraryDir,{sourceName:originalName,origin:'archive-h5p'});
 try{await Registry.saveLastImport(libraryDir,result,originalName);}catch(err){result.reportWarning='Rapport non conservé : '+err.message;}
 return {...result,projectId:Registry.fingerprint(input)};
});
ipcMain.handle('registry:import-local',async e=>{
 checkCaller(e);
 const answer=await dialog.showOpenDialog(mainWindow,{title:'Installer des bibliothèques H5P depuis une archive locale',properties:['openFile'],filters:[{name:'Paquets H5P ou ZIP',extensions:['h5p','zip']}]});
 if(answer.canceled||!answer.filePaths.length)return {cancelled:true};
 const file=answer.filePaths[0],stat=await fsp.stat(file);
 if(!stat.isFile()||!stat.size||stat.size>250*1024*1024)throw Error('Fichier trop volumineux ou inaccessible.');
 const result=await Registry.extractLibraries(await fsp.readFile(file),libraryDir,{sourceName:path.basename(file),origin:'local'});
 try{await Registry.saveLastImport(libraryDir,result,path.basename(file));}catch(err){result.reportWarning='Rapport non conservé : '+err.message;}
 return result;
});
ipcMain.handle('registry:choices',async(e,projectId)=>{
 checkCaller(e);if(!/^[a-f0-9]{64}$/.test(projectId||''))throw Error('Identifiant de projet invalide.');
 return (await Registry.readChoices(libraryDir))[projectId]||{};
});
ipcMain.handle('registry:select',async(e,projectId,machineName,variantId)=>{
 checkCaller(e);return Registry.setChoice(libraryDir,projectId,machineName,variantId);
});

// Version tracking is read-only until the user explicitly installs a release asset.
// A cached asset ID is required: the renderer cannot provide arbitrary URLs.
ipcMain.handle('journal:list',async e=>{checkCaller(e);return Journal.read(journalDir);});
ipcMain.handle('core:candidates',async e=>{checkCaller(e);return CoreAdapters.inspect(snapshotDir);});
ipcMain.handle('catalog:reveal-source',async(e,repo,sha)=>{
 checkCaller(e);
 const known=(await UpdateSources.readSources(sourceDir)).some(x=>x.repo.toLowerCase()===String(repo).toLowerCase());
 if(!known||!Snapshots.SHA.test(sha||''))throw Error('Source non autorisée.');
 const location=path.join(snapshotDir,Snapshots.idOf(UpdateSources.canonical(repo),sha),'source.zip');
 if(!(await fsp.stat(location).catch(()=>null))?.isFile())throw Error('Archive source introuvable.');
 shell.showItemInFolder(location);return {ok:true};
});
ipcMain.handle('catalog:sources',async e=>{checkCaller(e);return UpdateSources.readSources(sourceDir);});
ipcMain.handle('catalog:add',async(e,repo)=>{checkCaller(e);return UpdateSources.addSource(sourceDir,repo);});
ipcMain.handle('catalog:remove',async(e,repo)=>{checkCaller(e);return UpdateSources.removeSource(sourceDir,repo);});
ipcMain.handle('catalog:check',async(e,repo)=>{
 checkCaller(e);
 const id=UpdateSources.key(repo);
 const sources=await UpdateSources.readSources(sourceDir);
 const tracked=sources.find(x=>x.id===id);
 if(!tracked)throw Error('Source non enregistrée.');
 const result=await Catalog.checkRepo(tracked.repo);
 catalogCache.set(id,{at:Date.now(),assets:result.assets,commits:[result.latestCommit?.sha,...(result.tagRefs||[]).map(x=>x.sha)].filter(x=>/^[a-f0-9]{40}$/i.test(x||''))});
 return result;
});
ipcMain.handle('catalog:install',async(e,repo,assetId)=>{
 checkCaller(e);
 if(!Number.isSafeInteger(assetId)||assetId<1)throw Error('Fichier de release invalide.');
 const id=UpdateSources.key(repo);
 const source=(await UpdateSources.readSources(sourceDir)).find(x=>x.id===id);
 if(!source||source.kind!=='library')throw Error('Installation permise uniquement pour une source de bibliothèque enregistrée.');
 const entry=catalogCache.get(id);
 if(!entry||Date.now()-entry.at>20*60*1000)throw Error('Vérifiez à nouveau les publications de cette source.');
 const asset=entry.assets.find(a=>a.id===assetId);
 if(!asset)throw Error('Fichier absent de la publication vérifiée.');
 const op=await Journal.begin(journalDir,{type:'installation',repo:source.repo,reference:asset.tag,description:asset.name});
 try{
  const bytes=await Catalog.downloadAsset(asset);
  const report=await Registry.extractLibraries(bytes,libraryDir,{sourceName:source.repo+'@'+asset.tag+' / '+asset.name,origin:'github-release'});
  await Registry.saveLastImport(libraryDir,report,source.repo+' / '+asset.name);
  const c=report.counts;
  await Journal.finish(journalDir,op,{status:'success',message:`Installées : ${c.installed}, déjà présentes : ${c.alreadyInstalled}, rejetées : ${c.rejected}`});
  return {report,source:source.repo,asset:asset.name};
 }catch(error){await Journal.finish(journalDir,op,{status:'error',message:error.message}).catch(()=>{});throw error;}
});

// Upstream sources are saved at a Git commit, never executed. A library is
// imported only if all manifest-declared JS and CSS assets already exist.
ipcMain.handle('catalog:source-snapshot',async(e,repo,sha)=>{
 checkCaller(e);
 const id=UpdateSources.key(repo);
 const source=(await UpdateSources.readSources(sourceDir)).find(x=>x.id===id);
 if(!source)throw Error('Source non enregistrée.');
 const entry=catalogCache.get(id);
 if(!entry||Date.now()-entry.at>20*60*1000||!entry.commits.includes(sha))throw Error('Révision non vérifiée. Cliquez sur Vérifier.');
 const op=await Journal.begin(journalDir,{type:'source',repo:source.repo,reference:sha,description:'Récupération de sources à un commit précis'});
 try{
  const bytes=await Catalog.downloadSource(source.repo,sha);
  const inspected=await Snapshots.inspectArchive(bytes);
  const snapshot=await Snapshots.storeSnapshot(snapshotDir,source.repo,sha,Buffer.from(bytes),inspected);
  let result;
  if(source.kind!=='library')result={kind:'core-source',snapshot,installed:false,reason:'Révision officielle conservée, non activée dans le moteur.'};
  else if(inspected.kind!=='library')result={kind:'unpackaged',snapshot,installed:false,reason:inspected.reason};
  else if(inspected.buildRequired)result={kind:'requires-build',snapshot,installed:false,reason:inspected.reason,missing:inspected.missing};
  else {
   const ready=await Snapshots.packageReadyLibrary(bytes,inspected);
   const report=await Registry.extractLibraries(ready,libraryDir,{sourceName:source.repo+'@'+sha.slice(0,12),origin:'github-source-compiled'});
   await Registry.saveLastImport(libraryDir,report,source.repo+'@'+sha.slice(0,12));
   result={kind:'installed',snapshot,installed:report.counts.installed>0||report.counts.alreadyInstalled>0,report,library:inspected.machineName,version:inspected.version};
  }
  await Journal.finish(journalDir,op,{status:'success',message:result.kind+' : '+(result.reason||result.library||'Révision conservée')+'; SHA-256 '+snapshot.sha256.slice(0,12),snapshotId:Snapshots.idOf(source.repo,sha)});
  return result;
 }catch(error){await Journal.finish(journalDir,op,{status:'error',message:error.message}).catch(()=>{});throw error;}
});

ipcMain.handle('desktop:import-player',async e=>{
 checkCaller(e);const selected=await dialog.showOpenDialog(mainWindow,{title:'Sélectionner le dossier player du lecteur H5P',properties:['openDirectory']});
 if(selected.canceled||!selected.filePaths.length)return {cancelled:true};
 const result=await adoptLocalPlayer(selected.filePaths[0],cacheDir);playerPromise=Promise.resolve(result);
 return {ok:true,source:result.source};
});
ipcMain.handle('desktop:preview',async(e,bytes)=>{
 checkCaller(e);
 const input=await prepareBytes(bytes);
 const runtime=await player();
 await closePreview();
 workdir=await fsp.mkdtemp(path.join(os.tmpdir(),'h5p-studio-preview-'));
 try {
  const site=await extractPreview(input,runtime.dir,workdir);
  preview=await startPreviewServer(site);
  return {url:preview.url,reader:runtime.source};
 }catch(error){await closePreview();throw error;}
});
// Unlike browser downloads, this waits for an explicit Windows Save As and a
// completed filesystem write before acknowledging success to the renderer.
ipcMain.handle('desktop:save-h5p',async(e,bytes,name)=>{
 checkCaller(e);
 const content=await prepareBytes(bytes);
 const saved=await saveH5pFile({
  bytes:content,requestedName:name,defaultDir:exportsDir,
  showSaveDialog:options=>dialog.showSaveDialog(mainWindow,options)
 });
 if(saved.ok)lastH5pExport=saved.path;
 return saved;
});
ipcMain.handle('desktop:reveal-h5p',async e=>{
 checkCaller(e);
 if(!lastH5pExport||!(await fsp.stat(lastH5pExport).catch(()=>null))?.isFile())return {ok:false};
 shell.showItemInFolder(lastH5pExport);
 return {ok:true};
});
ipcMain.handle('desktop:export',async(e,bytes,title)=>{
 checkCaller(e);
 const input=await prepareBytes(bytes);
 const filename='h5p-site-'+safeTitle(title)+'-'+Date.now()+'.zip';
 await fsp.mkdir(exportsDir,{recursive:true});
 const save=await dialog.showSaveDialog(mainWindow,{
   title:'Enregistrer le site H5P autonome',
   defaultPath:path.join(exportsDir,filename),
   buttonLabel:'Enregistrer le ZIP',
   filters:[{name:'Archives ZIP',extensions:['zip']}],
   properties:['showOverwriteConfirmation']
 });
 if(save.canceled||!save.filePath)return {cancelled:true};
 const runtime=await player();
 const result=await exportStaticZip(input,runtime.dir,save.filePath);
 lastExport=result.path;
 return {...result,name:path.basename(result.path),reader:runtime.source};
});
ipcMain.handle('desktop:reveal-export',async(e)=>{
 checkCaller(e);
 if(!lastExport||!fs.existsSync(lastExport))return {ok:false};
 shell.showItemInFolder(lastExport);
 return {ok:true};
});
function createWindow(){
 mainWindow=new BrowserWindow({
  title:'H5P Studio Portable 0.6.2.1',width:1400,height:930,minWidth:920,minHeight:650,
  backgroundColor:'#f5f7fa',show:true,
  webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,
   preload:path.join(__dirname,'preload.cjs')}
 });
 mainWindow.removeMenu();
 mainWindow.loadFile(path.join(__dirname,'..','index.html')).catch(err=>{
  console.error('Impossible de charger l’interface',err);
  dialog.showErrorBox('H5P Studio : interface non chargée',String(err.message||err));
 });
 mainWindow.webContents.on('render-process-gone',(_event,details)=>{
  console.error('Processus de rendu interrompu :',details.reason);
 });
 mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 mainWindow.webContents.on('will-navigate',e=>e.preventDefault());
 mainWindow.webContents.on('will-attach-webview',e=>e.preventDefault());
}
app.whenReady().then(async()=>{
 EditorWidgetProtocol.registerWidgetProtocol(session.defaultSession.protocol);
 await fsp.mkdir(exportsDir,{recursive:true});
 // Fullscreen is the only permission permitted, and only for our active local preview.
 // All other web permissions remain denied (camera, microphone, geolocation, etc.).
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>{
  callback(fullscreenAllowed({permission,previewUrl:preview?.url,
   isAppWindow:!!mainWindow && contents===mainWindow.webContents,
   requestingUrl:details?.requestingUrl||''}));
 });
 session.defaultSession.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>
  fullscreenAllowed({permission,previewUrl:preview?.url,
   isAppWindow:!!mainWindow && contents===mainWindow.webContents,
   requestingUrl:details?.requestingUrl||requestingOrigin||''}));
 session.defaultSession.on('will-download',(event)=>{
  // Electron exports are created only by explicit Save As dialogs, never silently.
  event.preventDefault();
 });
 createWindow();
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
}).catch(e=>{console.error('Démarrage impossible',e);dialog.showErrorBox('H5P Studio : démarrage impossible',String(e.message||e));app.quit();});
app.on('before-quit',()=>{if(preview)preview.server.close();if(workdir)fsp.rm(workdir,{recursive:true,force:true}).catch(()=>{});});
app.on('window-all-closed',()=>app.quit());
