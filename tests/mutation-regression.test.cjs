'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const JSZip=require('../assets/jszip.min.js');
const core=require('../assets/h5p-core.js');const builder=require('../assets/static-builder.js');

async function example(){
 const zip=new JSZip();
 const meta={title:'Branches',mainLibrary:'H5P.BranchingScenario',language:'fr',embedTypes:['div'],preloadedDependencies:[{machineName:'H5P.BranchingScenario',majorVersion:'1',minorVersion:'11'}]};
 zip.file('h5p.json',JSON.stringify(meta));zip.file('content/content.json',JSON.stringify({branchingScenario:{content:[]}}));
 zip.file('H5P.BranchingScenario-1.11/library.json',JSON.stringify({machineName:'H5P.BranchingScenario',majorVersion:1,minorVersion:11,patchVersion:0,coreApi:{majorVersion:1,minorVersion:27}}));
 zip.file('content/image.png',new Uint8Array([137,80,78,71,1,2,3]));
 return core.openArchive(await zip.generateAsync({type:'uint8array'}),JSZip);
}
test('régression : deux prévisualisations successives ne modifient pas la source H5P',async()=>{
 const p=await example(), before=Object.keys(p.zip.files).sort();
 for(let i=0;i<3;i++){
  const b=await builder.build(p,JSON.stringify(p.metadata),JSON.stringify(p.content),JSZip);
  const z=await JSZip.loadAsync(await b.arrayBuffer());
  assert.ok(z.file('index.html'));assert.ok(z.file('viewer/bootstrap.js'));
  assert.deepEqual(Object.keys(p.zip.files).sort(),before,'Le site HTML ne doit pas se retrouver dans l’archive originale');
  assert.equal(p.zip.file('index.html'),null);
 }
});
test('régression : export H5P après prévisualisation ne contient aucun fichier HTML ajouté',async()=>{
 const p=await example();
 await builder.build(p,JSON.stringify(p.metadata),JSON.stringify(p.content),JSZip);
 const out=await core.saveArchive(p,JSON.stringify(p.metadata),JSON.stringify(p.content));
 const z=await JSZip.loadAsync(await out.arrayBuffer());
 assert.equal(z.file('index.html'),null);assert.equal(z.file('viewer/bootstrap.js'),null);
 assert.deepEqual(Array.from(await z.file('content/image.png').async('uint8array')),[137,80,78,71,1,2,3]);
});
test('régression : export H5P ne réécrit pas les fichiers de projet en mémoire',async()=>{
 const p=await example();
 const original=await p.zip.file('h5p.json').async('string');
 const edited=JSON.stringify({...p.metadata,title:'Modifié'});
 await core.saveArchive(p,edited,JSON.stringify(p.content));
 assert.equal(await p.zip.file('h5p.json').async('string'),original);
});
