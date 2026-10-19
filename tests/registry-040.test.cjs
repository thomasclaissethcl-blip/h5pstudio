'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const ZIP=require('../assets/jszip.min.js');const R=require('../runtime/library-registry.cjs');
async function fixture(fn){const base=await fs.mkdtemp(path.join(os.tmpdir(),'h5p-studio-reg-'));try{return await fn(base);}finally{await fs.rm(base,{recursive:true,force:true});}}
async function sample({version=[1,2,0],bytes='old',name='H5P.Sample',custom=false}={}){
  const z=new ZIP(); const prefix=name+'-'+version.slice(0,2).join('.')+'/';
  z.file(prefix+'library.json',JSON.stringify({machineName:name,title:name,majorVersion:String(version[0]),minorVersion:version[1],patchVersion:version[2],runnable:1,
    coreApi:{majorVersion:'1',minorVersion:'27'},preloadedDependencies:[{machineName:'H5P.Question',majorVersion:1,minorVersion:5}],editorDependencies:[{machineName:'H5P.Editor',majorVersion:1,minorVersion:0}]}));
  z.file(prefix+'scripts/content.js',bytes);z.file('h5p.json','{}');
  if(custom)z.file('content/content.json','{}');
  return z.generateAsync({type:'nodebuffer'});
}
test('import d’une archive H5P : versions texte, API et provenance',async()=>fixture(async root=>{
  const r=await R.extractLibraries(await sample(),root,{sourceName:'cours Moodle.h5p',origin:'archive-h5p'});
  assert.equal(r.installed.length,1);assert.equal(r.errors.length,0);
  const libs=await R.listLibraries(root);assert.equal(libs.length,1);
  assert.equal(libs[0].machineName,'H5P.Sample');assert.equal(libs[0].patchVersion,0);
  assert.deepEqual(libs[0].coreApi,{majorVersion:1,minorVersion:27});
  assert.equal(libs[0].dependencies.length,2);
  assert.equal(libs[0].sourceName,'cours Moodle.h5p');
  const js=await fs.readFile(path.join(root,'H5P.Sample','1.2.0',libs[0].sha256,'payload','scripts','content.js'),'utf8');
  assert.equal(js,'old');
}));
test('installation additive et idempotente : plusieurs versions et variantes de même version',async()=>fixture(async root=>{
  for(const x of [{version:[1,2,0],bytes:'old'},{version:[1,2,1],bytes:'patch'},{version:[1,2,0],bytes:'build tierce'}]){
    const r=await R.extractLibraries(await sample(x),root,{sourceName:'tiers.h5p'});assert.equal(r.installed.length,1);
  }
  const skip=await R.extractLibraries(await sample({version:[1,2,0],bytes:'old'}),root);
  assert.equal(skip.skipped.length,1);
  const l=await R.listLibraries(root);assert.equal(l.length,3);
  const orig=l.find(x=>x.patchVersion===0&&x.sourceName==='tiers.h5p'&&x.sha256!==skip.skipped[0].sha256);
  assert.ok(orig);
  const unchanged=await fs.readFile(path.join(root,'H5P.Sample','1.2.0',skip.skipped[0].sha256,'payload','scripts','content.js'),'utf8');assert.equal(unchanged,'old');
}));
test('choix par empreinte de projet : persistance et absence de mutation des fichiers',async()=>fixture(async root=>{
  const source=await sample();const oldHash=R.fingerprint(source);assert.match(oldHash,/^[a-f0-9]{64}$/);
  const r=await R.extractLibraries(source,root);
  await R.setChoice(root,oldHash,'H5P.Sample',r.installed[0].id);
  assert.equal((await R.readChoices(root))[oldHash]['H5P.Sample'],r.installed[0].id);
  assert.deepEqual((await R.readChoices(root))['f'.repeat(64)]||{},{});
  await assert.rejects(R.setChoice(root,oldHash,'H5P.Sample','inconnu'),/absente/);
  await assert.rejects(R.setChoice(root,'not-an-hash','H5P.Sample',r.installed[0].id),/invalide/);
}));
test('un ZIP sans library.json est refusé',async()=>fixture(async root=>{
 const z=new ZIP();z.file('h5p.json','{}');await assert.rejects(R.extractLibraries(await z.generateAsync({type:'nodebuffer'}),root),/Aucune bibliothèque/);
}));
test('un manifest invalide produit une erreur locale sans corrompre les bibliothèques valides',async()=>fixture(async root=>{
 const z=new ZIP();z.file('H5P.Good-1.0/library.json',JSON.stringify({machineName:'H5P.Good',majorVersion:1,minorVersion:0,patchVersion:0}));
 z.file('H5P.Bad-1.0/library.json',JSON.stringify({machineName:'../Bad',majorVersion:1,minorVersion:0,patchVersion:0}));
 const r=await R.extractLibraries(await z.generateAsync({type:'nodebuffer'}),root);assert.equal(r.installed.length,1);assert.equal(r.errors.length,1);assert.equal((await R.listLibraries(root)).length,1);
}));
test('détection des chemins Windows risqués et versions hors format',()=>{
 for(const f of ['../bad','/root','C:/test','dir/../x','a\\b','lib/CON','name.','a//b','..','l:b'])assert.equal(R.safePath(f),false,f);
 for(const n of ['1.2',-1,'1e3','01',1.1])assert.equal(R.normalizeDep({machineName:'H5P.Question',majorVersion:n,minorVersion:2}),null);
 const m=R.normalizeLibrary({machineName:'H5P.BranchingScenario',majorVersion:'1',minorVersion:'11',patchVersion:'3',coreApi:{majorVersion:1,minorVersion:28}});
 assert.equal(R.versionString(m),'1.11.3');
});
test('un ZIP avec collisions de noms insensibles à la casse est rejeté',async()=>fixture(async root=>{
 const z=new ZIP();z.file('H5P.Test-1.0/library.json','{}');z.file('H5P.Test-1.0/A.js','a');z.file('H5P.Test-1.0/a.js','b');
 await assert.rejects(R.extractLibraries(await z.generateAsync({type:'nodebuffer'}),root),/Collision/);
}));
test('le registre ne réécrit jamais le fichier d’origine',async()=>fixture(async root=>{
 const original=await sample({bytes:'const X = 123;'});
 const copy=Buffer.from(original);
 await R.extractLibraries(original,root);
 assert.deepEqual(original,copy);
}));
