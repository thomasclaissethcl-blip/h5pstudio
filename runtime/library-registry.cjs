'use strict';
/* Registry for locally imported H5P libraries. Import is explicit, additive and
 * never runs library code or migrates content. Third-party packages are untrusted. */
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const ZIP = require('../assets/jszip.min.js');

const MAX_ZIP = 250 * 1024 * 1024;
const MAX_ENTRIES = 6000;
const MAX_EXPANDED = 950 * 1024 * 1024;
const MAX_JSON = 3 * 1024 * 1024;
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
const MACHINE = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const int = n => Number.isSafeInteger(n) && n >= 0 ? n :
  typeof n === 'string' && /^(0|[1-9]\d*)$/.test(n) && Number.isSafeInteger(Number(n)) ? Number(n) : null;
function cleanPart(p) {
  return !!p && p !== '.' && p !== '..' && !/[\\:\u0000-\u001f<>|?*]/.test(p) &&
    !/[. ]$/.test(p) && !RESERVED.test(p);
}
function safePath(input) {
  return typeof input === 'string' && input.length <= 1024 && !input.startsWith('/') &&
    input.split('/').every(cleanPart);
}
function sanitizeLabel(value){return String(value||'import local').slice(0,200).replace(/[\u0000-\u001f]/g,' ');}
function normalizeDep(v) {
  if (!isObject(v) || !MACHINE.test(v.machineName||'')) return null;
  const major=int(v.majorVersion),minor=int(v.minorVersion);
  return major===null||minor===null?null:{machineName:v.machineName,majorVersion:major,minorVersion:minor};
}
function normalizeLibrary(m) {
  if(!isObject(m)||!MACHINE.test(m.machineName||''))throw Error('library.json : machineName invalide.');
  const major=int(m.majorVersion),minor=int(m.minorVersion),patch=int(m.patchVersion);
  if(major===null||minor===null||patch===null)throw Error('library.json : version majeure, mineure ou corrective invalide.');
  const dependencies=[];const warnings=[];
  for(const kind of ['preloadedDependencies','dynamicDependencies','editorDependencies']){
    if(m[kind]===undefined)continue;
    if(!Array.isArray(m[kind])){warnings.push(kind+' non reconnu');continue;}
    for(const [i,dep] of m[kind].entries()){
      const item=normalizeDep(dep);
      if(!item)warnings.push(kind+'['+i+'] non reconnu');
      else dependencies.push({...item,kind});
    }
  }
  let coreApi=null;
  if(m.coreApi!==undefined){
    const a=int(m.coreApi?.majorVersion),b=int(m.coreApi?.minorVersion);
    if(a===null||b===null)warnings.push('coreApi non exploitable');
    else coreApi={majorVersion:a,minorVersion:b};
  }
  return {machineName:m.machineName, title:typeof m.title==='string'?m.title:m.machineName,
    majorVersion:major,minorVersion:minor,patchVersion:patch,
    runnable:m.runnable===1||m.runnable==='1',coreApi,dependencies,warnings};
}
const versionString= l => [l.majorVersion,l.minorVersion,l.patchVersion].join('.');
function pathOf(root,lib){return path.join(root,lib.machineName,versionString(lib));}
function ensureSafeRoot(root){if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Racine du registre invalide');}
async function readJsonLimited(f,max=MAX_JSON) {
  const raw=await f.async('nodebuffer');if(raw.length>max)throw Error('library.json trop volumineux');
  try{return JSON.parse(raw.toString('utf8'));}catch(e){throw Error('library.json invalide : '+e.message);}
}
// Commit a complete library with a ready marker. On Windows, anti-malware
// scanners can temporarily hold files/directories open and cause EPERM on
// directory rename. Retry, then use a marker-last copy fallback. Never replace
// a previously registered variant or a suspicious incomplete destination.
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function stateOfDestination(dest){
  let st;
  try{st=await fsp.lstat(dest);}catch(e){if(e.code==='ENOENT')return 'absent';throw e;}
  if(!st.isDirectory()||st.isSymbolicLink())return 'blocked';
  try{const marker=await fsp.lstat(path.join(dest,'.studio-library.json'));
    return marker.isFile()&&!marker.isSymbolicLink()?'complete':'incomplete';
  }catch(e){if(e.code==='ENOENT')return 'incomplete';throw e;}
}
async function commitStaging(staging,dest,{rename=fsp.rename,retryDelays=[150,400,800]}={}){
  await fsp.mkdir(path.dirname(dest),{recursive:true});
  const existing=await stateOfDestination(dest);
  if(existing==='complete')return {status:'already-installed',method:'existing'};
  if(existing!=='absent')throw Error('Destination existante mais incomplète ou non sûre : '+dest+' ; aucune donnée écrasée.');
  let lastError;
  for(let attempt=0;attempt<=retryDelays.length;attempt++){
    try {await rename(staging,dest);return {status:'installed',method:'rename'};}
    catch(e){
      lastError=e;
      const state=await stateOfDestination(dest);
      if(state==='complete')return {status:'already-installed',method:'existing'};
      if(state!=='absent')throw Error('Destination déjà présente ou incomplète : '+dest+' ; aucune donnée écrasée.');
      if(!['EPERM','EACCES','EBUSY'].includes(e.code))throw e;
      if(attempt<retryDelays.length)await pause(retryDelays[attempt]);
    }
  }
  // The fallback avoids directory rename altogether. Payload first, completion
  // marker last. List operations ignore any incomplete destination.
  try {await fsp.mkdir(dest);}
  catch(e){if(e.code==='EEXIST')throw Error('Destination créée simultanément ; import interrompu pour éviter un écrasement.');throw e;}
  try{
    await fsp.cp(path.join(staging,'payload'),path.join(dest,'payload'),{recursive:true,force:false,errorOnExist:true});
    await fsp.copyFile(path.join(staging,'.studio-library.json'),path.join(dest,'.studio-library.json'),fs.constants.COPYFILE_EXCL);
    return {status:'installed',method:'copy-fallback'};
  }catch(e){
    await fsp.rm(dest,{recursive:true,force:true}).catch(()=>{});
    throw Error('Déplacement refusé ('+(lastError?.code||'?')+') et copie de secours impossible ('+(e.code||e.message)+'). Vérifiez les droits du dossier et les protections Windows.');
  }
}
// Persist only diagnostic outcomes. Registry data and H5P content are not altered.
async function saveLastImport(root,result,sourceName){
  ensureSafeRoot(root);
  const payload={date:new Date().toISOString(),sourceName:sanitizeLabel(sourceName),
    totalFound:result.totalFound,counts:result.counts,outcomes:result.outcomes,
    notice:result.notice};
  await fsp.mkdir(root,{recursive:true});
  const tmp=path.join(root,'.last-import-'+crypto.randomUUID()+'.tmp');
  try{await fsp.writeFile(tmp,JSON.stringify(payload,null,2),'utf8');
    await fsp.rename(tmp,path.join(root,'last-import-report.json'));}
  finally{await fsp.rm(tmp,{force:true}).catch(()=>{});}
}
async function readLastImport(root){
  ensureSafeRoot(root);
  try {const raw=await fsp.readFile(path.join(root,'last-import-report.json'),'utf8');
    if(raw.length>2000000)throw Error('Rapport d’importation trop volumineux.');
    const parsed=JSON.parse(raw);return isObject(parsed)&&Array.isArray(parsed.outcomes)?parsed:null;
  }catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function extractLibraries(source,root,{sourceName='import local',origin='local'}={}) {
  ensureSafeRoot(root);
  if(!Buffer.isBuffer(source)&&!(source instanceof Uint8Array))throw Error('Archive absente.');
  if(source.length===0||source.length>MAX_ZIP)throw Error('Archive trop volumineuse ou vide.');
  const zip=await ZIP.loadAsync(source,{checkCRC32:true});
  let n=0,expanded=0;const known=new Set();
  for(const [name,f] of Object.entries(zip.files)){
    if(f.dir)continue;
    if(!safePath(name))throw Error('Chemin interdit dans l’archive : '+name);
    const folded=name.toLowerCase();if(known.has(folded))throw Error('Collision de noms Windows : '+name);known.add(folded);
    if(++n>MAX_ENTRIES)throw Error('Trop de fichiers dans l’archive.');
    const size=f._data?.uncompressedSize;
    if(typeof size==='number')expanded+=size;
    if(expanded>MAX_EXPANDED)throw Error('Archive décompressée trop volumineuse.');
  }
  // Library packs can contain one top-level library.json; .h5p archives often
  // contain many named folders at the top level.
  const manifests=Object.entries(zip.files).filter(([p,f])=>!f.dir && (p==='library.json'||/^[^/]+\/library\.json$/.test(p)));
  if(!manifests.length)throw Error('Aucune bibliothèque avec library.json trouvée dans l’archive.');
  const installed=[],skipped=[],errors=[],outcomes=[];
  for(const [manifestPath,manifestFile] of manifests){
    let staging=null;
    try{
      const info=normalizeLibrary(await readJsonLimited(manifestFile));
      const prefix=manifestPath==='library.json'?'':manifestPath.slice(0,-'library.json'.length);
      const entries=Object.entries(zip.files).filter(([n,f])=>!f.dir && n.startsWith(prefix) && (!prefix||n!=='h5p.json'));
      const digest=crypto.createHash('sha256');
      const contentFiles=[];
      // All files are read BEFORE any library is committed, so conflicting
      // archives cannot partly replace a library already installed.
      for(const [name,file] of entries.sort(([a],[b])=>a.localeCompare(b,'en'))){
        const relative=name.slice(prefix.length);if(!safePath(relative))throw Error('Fichier de bibliothèque invalide : '+relative);
        const bytes=await file.async('nodebuffer');
        digest.update(relative+'\0');digest.update(bytes);digest.update('\0');
        contentFiles.push({relative,bytes});
      }
      const hash=digest.digest('hex');
      const variantId=info.machineName+'@'+versionString(info)+'#'+hash.slice(0,16);
      const dest=path.join(pathOf(root,info),hash);
      const meta={...info,id:variantId,sha256:hash,origin,sourceName:sanitizeLabel(sourceName),
        importedAt:new Date().toISOString(),files:contentFiles.length};
      if(fs.existsSync(path.join(dest,'.studio-library.json'))){skipped.push(meta);outcomes.push({manifest:manifestPath,status:'already-installed',library:info.machineName,version:versionString(info),id:variantId,reason:'Variante identique déjà présente'});continue;}
      const stageRoot=path.join(root,'.stage');await fsp.mkdir(stageRoot,{recursive:true});
      staging=await fsp.mkdtemp(path.join(stageRoot,'library-'));
      await fsp.mkdir(path.join(staging,'payload'),{recursive:true});
      for(const {relative,bytes} of contentFiles){
        const final=path.resolve(staging,'payload',...relative.split('/'));
        const base=path.resolve(staging,'payload');
        if(!final.startsWith(base+path.sep))throw Error('Chemin bibliothèque non sûr.');
        await fsp.mkdir(path.dirname(final),{recursive:true});await fsp.writeFile(final,bytes);
      }
      await fsp.writeFile(path.join(staging,'.studio-library.json'),JSON.stringify(meta,null,2),'utf8');
      await fsp.mkdir(path.dirname(dest),{recursive:true});
      // No replacement of an existing variant, including incomplete folders.
      const commit=await commitStaging(staging,dest);
      if(commit.method==='rename')staging=null; // moved, no cleanup necessary
      if(commit.status==='installed'){
        installed.push(meta);
        outcomes.push({manifest:manifestPath,status:'installed',library:info.machineName,version:versionString(info),id:variantId,
          reason:commit.method==='copy-fallback'?'Copie de secours après verrouillage Windows du déplacement':undefined});
      }else{
        skipped.push(meta);
        outcomes.push({manifest:manifestPath,status:'already-installed',library:info.machineName,version:versionString(info),id:variantId,reason:'Variante existante'});
      }
    }catch(e){const reason=String(e.message||e).slice(0,500);errors.push({library:manifestPath,reason});outcomes.push({manifest:manifestPath,status:'rejected',reason});}
    finally{if(staging)await fsp.rm(staging,{recursive:true,force:true}).catch(()=>{});}
  }
  return {installed,skipped,errors,totalFound:manifests.length,
    outcomes,counts:{manifests:manifests.length,installed:installed.length,alreadyInstalled:skipped.length,rejected:errors.length},
    notice:'Le total du registre comprend les imports antérieurs. Le bilan ci-dessus porte uniquement sur cette archive.'};
}
async function listLibraries(root){
  ensureSafeRoot(root);if(!fs.existsSync(root))return [];
  const result=[];
  for(const machine of await fsp.readdir(root,{withFileTypes:true})){
    if(!machine.isDirectory()||!MACHINE.test(machine.name)||machine.name==='.stage')continue;
    const base=path.join(root,machine.name);
    for(const version of await fsp.readdir(base,{withFileTypes:true})){
      if(!version.isDirectory()||!/^\d+\.\d+\.\d+$/.test(version.name))continue;
      for(const variant of await fsp.readdir(path.join(base,version.name),{withFileTypes:true})){
        if(!variant.isDirectory()||!/^[a-f0-9]{64}$/.test(variant.name))continue;
        try{
          const file=path.join(base,version.name,variant.name,'.studio-library.json');
          const raw=await fsp.readFile(file,'utf8');if(raw.length>200000)continue;
          const meta=JSON.parse(raw);
          if(meta.machineName===machine.name&&versionString(meta)===version.name&&meta.sha256===variant.name)result.push(meta);
        }catch{}
      }
    }
  }
  return result.sort((a,b)=>a.machineName.localeCompare(b.machineName)||b.majorVersion-a.majorVersion||b.minorVersion-a.minorVersion||b.patchVersion-a.patchVersion||a.id.localeCompare(b.id));
}
const KEY=/^[a-f0-9]{64}$/;
async function readChoices(root){
  const p=path.join(root,'project-choices.json');
  try{const raw=await fsp.readFile(p,'utf8');if(raw.length>1000000)throw Error('Registre trop volumineux');
    const c=JSON.parse(raw);return isObject(c)?c:{};
  }catch(e){if(e.code==='ENOENT')return {};throw e;}
}
async function setChoice(root,projectId,machineName,variantId){
  ensureSafeRoot(root);
  if(!KEY.test(projectId)||!MACHINE.test(machineName))throw Error('Projet ou bibliothèque invalide.');
  const library=(await listLibraries(root)).find(x=>x.id===variantId&&x.machineName===machineName);
  if(!library)throw Error('Version sélectionnée absente du registre.');
  await fsp.mkdir(root,{recursive:true});
  const previous=await readChoices(root);
  const current=isObject(previous[projectId])?previous[projectId]:{};
  const next={...previous,[projectId]:{...current,[machineName]:variantId}};
  const tmp=path.join(root,'.choices-'+crypto.randomUUID()+'.tmp');
  await fsp.writeFile(tmp,JSON.stringify(next,null,2),'utf8');
  try{await fsp.rename(tmp,path.join(root,'project-choices.json'));}
  catch(e){await fsp.rm(tmp,{force:true});throw e;}
  return {projectId,machineName,variantId};
}
const fingerprint = bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
module.exports={extractLibraries,listLibraries,setChoice,readChoices,fingerprint,normalizeLibrary,normalizeDep,versionString,safePath,
  commitStaging,saveLastImport,readLastImport};
