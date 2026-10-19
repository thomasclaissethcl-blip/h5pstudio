'use strict';
/* Immutable upstream source snapshots. No downloaded JS is executed.
 * An extracted library is installed only when library.json assets exist already. */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const ZIP=require('../assets/jszip.min.js');
const {canonical}=require('./update-sources.cjs');
const SHA=/^[a-f0-9]{40}$/i;
const MAX_SOURCE=80*1024*1024;
const MAX_ENTRIES=7500;
const MAX_EXPANDED=550*1024*1024;
const idOf=(repo,sha)=>repo.replace('/','__')+'__'+sha.toLowerCase();
function correctPath(s){return typeof s==='string'&&s.length>0&&s.length<=1024&&!s.startsWith('/')&&!s.includes('\\')&&s.split('/').every(p=>p.length>0&&p!=='.'&&p!=='..'&&!/[<>:\u0000-\u001f|?*]/.test(p));}
async function inspectArchive(bytes){
 if(!Buffer.isBuffer(bytes)&&!(bytes instanceof Uint8Array))throw Error('Téléchargement invalide.');
 if(!bytes.length||bytes.length>MAX_SOURCE)throw Error('Archive source trop volumineuse.');
 const archive=await ZIP.loadAsync(bytes,{checkCRC32:true});
 const entries=Object.entries(archive.files).filter(([name,file])=>!file.dir);
 if(entries.length>MAX_ENTRIES)throw Error('Trop de fichiers dans le dépôt.');
 let expanded=0;
 const names=new Set();
 for(const [name,f] of entries){
  if(!correctPath(name))throw Error('Chemin suspect dans les sources : '+name);
  const low=name.toLowerCase();if(names.has(low))throw Error('Collision de chemins dans les sources : '+name);names.add(low);
  expanded+=Number(f._data?.uncompressedSize||0);
  if(expanded>MAX_EXPANDED)throw Error('Archive décompressée trop volumineuse.');
 }
 const manifestEntries=entries.filter(([name])=>/^[^/]+\/library\.json$/.test(name));
 if(manifestEntries.length!==1)return {kind:'source',machineName:null,version:null,buildRequired:false,reason:manifestEntries.length?'Plusieurs manifestes library.json':'Aucun library.json à la racine du projet'};
 const [filename,file]=manifestEntries[0];
 let manifest;
 try{const json=await file.async('string');if(json.length>3e6)throw Error('Manifeste trop volumineux.');manifest=JSON.parse(json);}catch(e){throw Error('library.json invalide : '+e.message);}
 if(typeof manifest.machineName!=='string'||!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(manifest.machineName))throw Error('Nom H5P de la bibliothèque invalide.');
 const ver=[manifest.majorVersion,manifest.minorVersion,manifest.patchVersion];
 if(ver.some(x=>!Number.isSafeInteger(Number(x))||Number(x)<0||String(x).trim()===''))throw Error('Versions de la bibliothèque invalides.');
 const prefix=filename.slice(0,-'library.json'.length);
 const required=[];
 for(const kind of ['preloadedJs','preloadedCss','editorJs','editorCss']){
  const list=manifest[kind];if(list===undefined)continue;
  if(!Array.isArray(list))throw Error(kind+' doit être une liste.');
  for(const item of list){if(!correctPath(item?.path))throw Error('Chemin de ressource invalide dans '+kind);required.push(item.path);}
 }
 const missing=required.filter(f=>!archive.file(prefix+f));
 return {kind:'library',machineName:manifest.machineName,version:ver.map(String).join('.'),buildRequired:missing.length>0,missing:missing.slice(0,20),reason:missing.length?'Ressources déclarées absentes (compilation requise).':'Bibliothèque contenant ses ressources déclarées.',prefix,archive};
}
async function packageReadyLibrary(bytes,inspected){
 if(inspected.kind!=='library'||inspected.buildRequired)throw Error('Bibliothèque non compilée.');
 const zip=new ZIP();
 const files=Object.entries(inspected.archive.files).filter(([name,f])=>!f.dir&&name.startsWith(inspected.prefix));
 for(const [name,file] of files){const relative=name.slice(inspected.prefix.length);if(correctPath(relative))zip.file(relative,await file.async('nodebuffer'));}
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:5}});
}
async function storeSnapshot(root,repo,sha,bytes,summary){
 const normalized=canonical(repo);
 if(!SHA.test(sha))throw Error('Commit Git invalide (40 caractères hexadécimaux attendus).');
 if(!Buffer.isBuffer(bytes))throw Error('Source non binaire.');
 if(bytes.length>MAX_SOURCE)throw Error('Source volumineuse interdite.');
 const digest=crypto.createHash('sha256').update(bytes).digest('hex');
 const dest=path.join(root,idOf(normalized,sha));
 await fs.mkdir(root,{recursive:true});
 const metadata={repo:normalized,commit:sha.toLowerCase(),sha256:digest,bytes:bytes.length,
  checkedAt:new Date().toISOString(),library:summary?.machineName||null,version:summary?.version||null,
  status:summary?.kind==='library'?(summary.buildRequired?'source-a-compiler':'bibliotheque-compilee'):'source-core-ou-repertoire',
  missingAssets:summary?.missing||[],note:summary?.reason||''};
 try {
  const old=JSON.parse(await fs.readFile(path.join(dest,'manifest.json'),'utf8'));
  if(old.sha256!==digest)throw Error('Commit déjà enregistré avec une archive différente.');
  return {...metadata,path:dest,reused:true};
 }catch(e){if(e.code!=='ENOENT')throw e;}
 const staging=await fs.mkdtemp(path.join(root,'.stage-'));
 try {
  await fs.writeFile(path.join(staging,'source.zip'),bytes,{flag:'wx'});
  await fs.writeFile(path.join(staging,'manifest.json'),JSON.stringify(metadata,null,2),{flag:'wx'});
  try{await fs.rename(staging,dest);}catch(e){if(e.code==='EEXIST'||e.code==='ENOTEMPTY')throw Error('Révision déjà déposée par un processus concurrent.');throw e;}
  return {...metadata,path:dest,reused:false};
 }finally {await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});}
}
module.exports={inspectArchive,packageReadyLibrary,storeSnapshot,idOf,SHA,MAX_SOURCE};
