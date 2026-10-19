'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const Registry=require('../runtime/library-registry.cjs');
const ZIP=require('../assets/jszip.min.js');
const appPath=path.join(__dirname,'..');
const err=code=>Object.assign(new Error(code),{code});
async function temp(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'h5p-042-'));try{return await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
async function stageIn(dir){
 const stage=path.join(dir,'stage');await fs.mkdir(path.join(stage,'payload'),{recursive:true});
 await fs.writeFile(path.join(stage,'payload','library.json'),'{}');
 await fs.writeFile(path.join(stage,'.studio-library.json'),'{"machineName":"H5P.Test"}');
 return stage;
}
test('une erreur EPERM temporaire sur rename déclenche une nouvelle tentative, sans dupliquer le contenu',()=>temp(async dir=>{
 const stage=await stageIn(dir),dest=path.join(dir,'libraries','H5P.Test','1.0.0','a'.repeat(64));
 let attempt=0;
 const result=await Registry.commitStaging(stage,dest,{retryDelays:[0],rename:async(a,b)=>{
  if(attempt++===0)throw err('EPERM');return fs.rename(a,b);
 }});
 assert.equal(result.status,'installed');assert.equal(result.method,'rename');assert.equal(attempt,2);
 assert.equal(await fs.readFile(path.join(dest,'payload','library.json'),'utf8'),'{}');
 await assert.rejects(fs.access(stage));
}));
test('un EPERM persistant est compensé par la copie avec marqueur final',()=>temp(async dir=>{
 const stage=await stageIn(dir),dest=path.join(dir,'libs','H5P.Test','1.0.0','b'.repeat(64));
 const result=await Registry.commitStaging(stage,dest,{retryDelays:[0],rename:async()=>{throw err('EPERM');}});
 assert.equal(result.method,'copy-fallback');
 assert.equal(await fs.readFile(path.join(dest,'.studio-library.json'),'utf8'),'{"machineName":"H5P.Test"}');
 assert.equal(await fs.readFile(path.join(dest,'payload','library.json'),'utf8'),'{}');
}));
test('un dossier destination partiellement créé ne doit jamais être écrasé',()=>temp(async dir=>{
 const stage=await stageIn(dir),dest=path.join(dir,'libs','H5P.Test','1.0.0','c'.repeat(64));
 await fs.mkdir(dest,{recursive:true});await fs.writeFile(path.join(dest,'owned.bin'),'intouchable');
 await assert.rejects(Registry.commitStaging(stage,dest,{retryDelays:[]}),/incomplète|incomplet/);
 assert.equal(await fs.readFile(path.join(dest,'owned.bin'),'utf8'),'intouchable');
}));
test('le bilan d’importation est conservé et peut être relu',()=>temp(async dir=>{
 const report={totalFound:2,counts:{manifests:2,installed:1,alreadyInstalled:0,rejected:1},outcomes:[
  {manifest:'H5P.One/library.json',status:'installed'},{manifest:'H5P.Two/library.json',status:'rejected',reason:'Windows EPERM'}],notice:'test'};
 await Registry.saveLastImport(dir,report,'activité.h5p');
 const stored=await Registry.readLastImport(dir);
 assert.equal(stored.sourceName,'activité.h5p');assert.equal(stored.outcomes[1].reason,'Windows EPERM');
 assert.ok(stored.date);
}));
test('les contrôles d’importation et de résolution n’ont chacun qu’un identifiant HTML',async()=>{
 const html=await fs.readFile(path.join(appPath,'index.html'),'utf8');
 for(const id of ['registryImportReport','registryResolveBtn','registryResolveReport','coreEvidenceStatus']){
  assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
 }
 assert.match(html,/data-panel="registry"[\s\S]*id="registryResolveBtn"/);
});
test('interface : le contrôle des dépendances est réactivé après import',async()=>{
 const script=await fs.readFile(path.join(appPath,'assets','app.js'),'utf8');
 assert.match(script,/\$\('registryResolveBtn'\)\.disabled=!window\.studioDesktop\?\.isDesktop/);
 assert.match(script,/registryLastImport\(\)/);
 assert.match(script,/result\.counts\?\.installed/); // saved report has counts, not installed array
});
test('réimporter une archive déjà partiellement inscrite garde les données présentes',()=>temp(async dir=>{
 const zip=new ZIP();
 for(const name of ['H5P.First','H5P.Second']){
  zip.file(name+'-1.0/library.json',JSON.stringify({machineName:name,majorVersion:1,minorVersion:0,patchVersion:0}));
  zip.file(name+'-1.0/file.js','example');
 }
 const bytes=await zip.generateAsync({type:'nodebuffer'});
 const initial=await Registry.extractLibraries(bytes,dir);
 assert.equal(initial.installed.length,2);
 const next=await Registry.extractLibraries(bytes,dir);
 assert.equal(next.skipped.length,2);assert.equal(next.errors.length,0);
 assert.equal((await Registry.listLibraries(dir)).length,2);
}));
