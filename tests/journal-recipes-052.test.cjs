'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Journal=require('../runtime/operation-journal.cjs');
const Core=require('../runtime/core-adapters.cjs');
const Build=require('../scripts/build-recipes.cjs');
const tmp=async fn=>{const d=await fs.mkdtemp(path.join(os.tmpdir(),'h5p052-'));try{await fn(d);}finally{await fs.rm(d,{force:true,recursive:true});}};
test('les opérations sont persistantes, limitées et marquées après exécution',()=>tmp(async dir=>{
 const id=await Journal.begin(dir,{type:'source',repo:'otacke/h5p-game-map',reference:'a'.repeat(40),description:'Test'});
 let rows=await Journal.read(dir);assert.equal(rows.length,1);assert.equal(rows[0].status,'running');
 await Journal.finish(dir,id,{status:'success',message:'Sources téléchargées',snapshotId:'otacke__h5p-game-map__'+'a'.repeat(40)});
 rows=await Journal.read(dir);assert.equal(rows[0].status,'success');assert.equal(rows[0].message,'Sources téléchargées');
}));
test('le journal ne doit pas accepter des statuts arbitraires',()=>tmp(async dir=>{
 const id=await Journal.begin(dir,{type:'source'});
 await assert.rejects(Journal.finish(dir,id,{status:'evil',message:'x'}),/statut/i);
}));
test('écritures concurrentes du journal préservées',()=>tmp(async dir=>{
 await Promise.all(Array.from({length:13},(_,i)=>Journal.begin(dir,{repo:'r'+i,type:'source'})));
 assert.equal((await Journal.read(dir)).length,13);
}));
test('un cœur enregistré dans les snapshots ne devient pas un cœur actif',()=>tmp(async dir=>{
 const d=path.join(dir,'h5p__h5p-php-library__'+'a'.repeat(40));
 await fs.mkdir(d,{recursive:true});
 await fs.writeFile(path.join(d,'manifest.json'),JSON.stringify({repo:'h5p/h5p-php-library',commit:'a'.repeat(40),checkedAt:'2026-10-19T00:00:00Z'}));
 const profiles=await Core.inspect(dir);
 assert.equal(profiles.length,1);assert.equal(profiles[0].adapterAvailable,false);assert.equal(profiles[0].apiCertified,false);
}));
test('recette approuvée Game Map, modules lecture et éditeur',async()=>{
 const recipe=await Build.recipe('game-map');
 assert.deepEqual(recipe.modules.map(x=>x.expectedMachineName),['H5P.GameMap','H5PEditor.GameMap']);
});
test('références externes potentiellement injectables rejetées',()=>{
 for(const input of ['-evil','../master','main;echo BAD','tag\nexit','some tag','refs/heads/master^{}']){
  assert.throws(()=>Build.ref(input,'master'),/invalide/i);
 }
 assert.equal(Build.ref('1.9.8','master'),'1.9.8');
 assert.equal(Build.ref('a'.repeat(40),'master'),'a'.repeat(40));
});
test('aucune recette arbitraire n’est acceptée',async()=>{
 await assert.rejects(Build.recipe('../anything'),/invalide/i);
 await assert.rejects(Build.recipe('unknown'),/ENOENT/);
});
test('workflow remplacé, permissions minimales et pas de scripts arbitraires d’entrée',async()=>{
 const workflow=await fs.readFile(path.join(__dirname,'../.github/workflows/build-h5p-libraries.yml'),'utf8');
 assert.match(workflow,/permissions:\s*\n\s*contents: read/);
 assert.match(workflow,/build-recipes\.cjs/);
 assert.doesNotMatch(workflow,/build-game-map\.yml/);
 await assert.rejects(fs.stat(path.join(__dirname,'../.github/workflows/build-game-map.yml')),/ENOENT/);
});
test('interface présente journal et contrôle explicite du cœur',async()=>{
 const html=await fs.readFile(path.join(__dirname,'../index.html'),'utf8');
 const preload=await fs.readFile(path.join(__dirname,'../electron/preload.cjs'),'utf8');
 assert.match(html,/journalEntries/);assert.match(html,/coreCandidatesReport/);
 assert.match(preload,/journalList/);assert.match(preload,/coreCandidates/);
});
