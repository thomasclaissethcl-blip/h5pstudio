'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const ZIP = require('../assets/jszip.min.js');
const studio = require('../assets/h5p-core.js');

async function fixture(missingLibrary=false) {
 const zip=new ZIP();
 const meta={title:'Cours de test',mainLibrary:'H5P.Sample',language:'fr',embedTypes:['div'],
   preloadedDependencies:[{machineName:'H5P.Sample',majorVersion:1,minorVersion:0}]};
 zip.file('h5p.json',JSON.stringify(meta));
 zip.file('content/content.json',JSON.stringify({question:'Question initiale',answer:42}));
 zip.file('content/media/picture.bin',new Uint8Array([0,1,2,255,31]));
 if (!missingLibrary) zip.file('H5P.Sample-1.0/library.json',JSON.stringify({machineName:'H5P.Sample',majorVersion:1,minorVersion:0,patchVersion:4,coreApi:{majorVersion:1,minorVersion:28}}));
 return zip.generateAsync({type:'uint8array'});
}

test('archive valide : diagnostics et bibliothèque', async()=>{
 const p=await studio.openArchive(await fixture(),ZIP);
 assert.equal(p.metadata.title,'Cours de test');
 assert.equal(p.libraries.length,1);
 assert.deepEqual(p.missing,[]);
 assert.equal(p.warnings.length,0);
});
test('export : remplacement JSON et conservation binaire', async()=>{
 const p=await studio.openArchive(await fixture(),ZIP);
 const metadata=JSON.stringify({...p.metadata,title:'Nouvelle activité'});
 const content=JSON.stringify({...p.content,question:'Nouvelle question'});
 const blob=await studio.saveArchive(p,metadata,content);
 const output=await ZIP.loadAsync(await blob.arrayBuffer());
 assert.equal(JSON.parse(await output.file('h5p.json').async('string')).title,'Nouvelle activité');
 assert.equal(JSON.parse(await output.file('content/content.json').async('string')).question,'Nouvelle question');
 assert.deepEqual([...await output.file('content/media/picture.bin').async('uint8array')],[0,1,2,255,31]);
 assert.ok(output.file('H5P.Sample-1.0/library.json'));
});
test('bibliothèque manquante : avertissement, pas de compatibilité inventée',async()=>{
 const p=await studio.openArchive(await fixture(true),ZIP);
 assert.ok(p.missing.includes('H5P.Sample@1@0'));
 assert.ok(p.warnings.some(w=>w.includes('Bibliothèque principale')));
});
test('édition d’un manifest JSON invalide rejetée',()=>{
 assert.throws(()=>studio.validateEditing('{bad}', '{}'),/JSON invalide/);
});
test('liste de dépendances vide : diagnostic non bloquant',()=>{
 const checked=studio.validateEditing(JSON.stringify({title:'A',mainLibrary:'H5P.A',language:'fr',preloadedDependencies:[],embedTypes:['div']}),'{}');
 assert.ok(checked.warnings.some(w=>w.includes('bibliothèque principale')));
});
test('chemins suspects rejetés',()=>{
 assert.equal(studio.safeName('../outside.txt'),false);
 assert.equal(studio.safeName('C:\\outside.txt'),false);
 assert.equal(studio.safeName('content/content.json'),true);
});

async function unusualFixture(preloadedDependencies, includeField=true) {
 const zip=new ZIP();
 const metadata={title:'Parcours Branching Scenario',mainLibrary:'H5P.BranchingScenario',language:'fr',embedTypes:['div']};
 if (includeField) metadata.preloadedDependencies=preloadedDependencies;
 zip.file('h5p.json',JSON.stringify(metadata));
 zip.file('content/content.json',JSON.stringify({branchingScenario:{content:[]},startScreen:{}}));
 zip.file('H5P.BranchingScenario-1.9/library.json',JSON.stringify({machineName:'H5P.BranchingScenario',majorVersion:1,minorVersion:9,patchVersion:0}));
 zip.file('content/assets/illustration.bin',new Uint8Array([11,22,33,44]));
 return zip.generateAsync({type:'uint8array'});
}
test('champ de dépendances absent : import, diagnostic, export et préservation', async()=>{
 const p=await studio.openArchive(await unusualFixture(undefined,false),ZIP);
 assert.equal(p.metadata.mainLibrary,'H5P.BranchingScenario');
 assert.ok(p.warnings.some(w=>w.includes('preloadedDependencies')));
 assert.deepEqual(p.missing,[]); // Indéterminé, pas « aucune dépendance nécessaire ».
 const blob=await studio.saveArchive(p, JSON.stringify(p.metadata), JSON.stringify(p.content));
 const zip=await ZIP.loadAsync(await blob.arrayBuffer());
 const exported=JSON.parse(await zip.file('h5p.json').async('string'));
 assert.equal(Object.hasOwn(exported,'preloadedDependencies'),false);
 assert.deepEqual([...await zip.file('content/assets/illustration.bin').async('uint8array')],[11,22,33,44]);
});
test('versions sous forme de chaînes : reconnues pour le diagnostic',async()=>{
 const p=await studio.openArchive(await unusualFixture([{machineName:'H5P.BranchingScenario',majorVersion:'1',minorVersion:9}]),ZIP);
 assert.equal(p.warnings.length,0);
 assert.equal(p.dependencyStats.recognized,1);
 assert.equal(p.dependencyStats.toleratedStringEntries,1);
 assert.equal(p.dependencyStatus,'complet');
 assert.deepEqual(p.missing,[]);
});
test('dépendances sous forme d’objet : import et export restent possibles',async()=>{
 const p=await studio.openArchive(await unusualFixture({machineName:'H5P.BranchingScenario',majorVersion:1,minorVersion:9}),ZIP);
 assert.ok(p.warnings.some(w=>w.includes('n’est pas un tableau')));
 const saved=await studio.saveArchive(p,JSON.stringify(p.metadata),JSON.stringify(p.content));
 const output=await ZIP.loadAsync(await saved.arrayBuffer());
 assert.deepEqual(JSON.parse(await output.file('h5p.json').async('string')).preloadedDependencies, p.metadata.preloadedDependencies);
});
test('dépendances de bibliothèque inattendues : analyse partielle plutôt que plantage',async()=>{
 const bytes=await fixture(); const zip=await ZIP.loadAsync(bytes);
 const lib=JSON.parse(await zip.file('H5P.Sample-1.0/library.json').async('string'));
 lib.preloadedDependencies={machineName:'H5P.Secondary',majorVersion:1,minorVersion:0};
 zip.file('H5P.Sample-1.0/library.json',JSON.stringify(lib));
 const p=await studio.openArchive(await zip.generateAsync({type:'uint8array'}),ZIP);
 assert.ok(p.warnings.some(w=>w.includes('H5P.Sample') && w.includes('preloadedDependencies')));
});

test('diagnostic détaillé : versions numériques sous forme de chaînes', async()=>{
 const p=await studio.openArchive(await unusualFixture([
   {machineName:'H5P.BranchingScenario',majorVersion:'1',minorVersion:'9'}
 ]),ZIP);
 assert.equal(p.dependencyStatus,'complet');
 assert.deepEqual(p.dependencyStats,{declared:1, recognized:1, rejected:0, toleratedStringEntries:1,complete:true});
 assert.equal(p.missing.length,0);
 assert.ok(!p.warnings.some(w=>w.includes('majorVersion')));
});
test('dépendances mixtes : normalisation puis vraie vérification des manquantes',async()=>{
 const p=await studio.openArchive(await unusualFixture([
    {machineName:'H5P.BranchingScenario',majorVersion:1,minorVersion:9},
    {machineName:'H5P.Secondary',majorVersion:'1',minorVersion:0}
 ]),ZIP);
 assert.deepEqual(p.dependencyStats,{declared:2, recognized:2, rejected:0, toleratedStringEntries:1, complete:true});
 assert.equal(p.dependencyStatus,'complet');
 assert.deepEqual(p.missing,['H5P.Secondary@1@0']);
});
test('dépendances réservées à l’éditeur non comptées comme manquantes à la lecture',async()=>{
 const bytes=await fixture(); const zip=await ZIP.loadAsync(bytes);
 const lib=JSON.parse(await zip.file('H5P.Sample-1.0/library.json').async('string'));
 lib.editorDependencies=[{machineName:'H5PEditor.Unknown',majorVersion:1,minorVersion:0}];
 zip.file('H5P.Sample-1.0/library.json',JSON.stringify(lib));
 const p=await studio.openArchive(await zip.generateAsync({type:'uint8array'}),ZIP);
 assert.deepEqual(p.missing,[]);
 assert.equal(p.dependencyStatus,'complet');
});
