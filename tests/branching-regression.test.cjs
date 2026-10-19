'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const ZIP = require('../assets/jszip.min.js');
const studio = require('../assets/h5p-core.js');

const branches = [
  ['H5P.AdvancedText',1], ['H5P.CoursePresentation',27], ['FontAwesome',5],
  ['H5P.FontIcons',0], ['H5P.JoubelUI',3], ['H5P.Transition',0],
  ['H5P.Components',0], ['jQuery.ui',10], ['H5P.BranchingQuestion',0],
  ['H5P.MultiChoice',16], ['H5P.Question',5], ['H5P.DragQuestion',15],
  ['H5P.DragText',10], ['H5P.Summary',10], ['H5P.SingleChoiceSet',11],
  ['H5P.Image',1], ['H5P.Shape',0], ['H5P.ContinuousText',2],
  ['H5P.Text',1], ['H5P.ImageHotspots',11], ['H5P.Table',2],
  ['H5P.BranchingScenario',11]
];
async function syntheticBranching() {
  const zip = new ZIP();
  const deps = branches.map(([machineName,minorVersion])=>({machineName,majorVersion:'1',minorVersion:String(minorVersion)}));
  // FontAwesome actually needs 4.5. Reproduce the real library identity.
  deps[2].majorVersion='4';
  zip.file('h5p.json',JSON.stringify({title:'Comment maîtriser les risques ?',mainLibrary:'H5P.BranchingScenario',language:'und',embedTypes:['div'],preloadedDependencies:deps}));
  zip.file('content/content.json',JSON.stringify({branchingScenario:{content:[]}}));
  branches.forEach(([machineName,minorVersion],i)=>{
    const major = machineName==='FontAwesome'?4:1;
    const lib = {title:machineName,machineName,majorVersion:major,minorVersion,patchVersion:0,
      preloadedDependencies:i===21?[{machineName:'H5P.AdvancedText',majorVersion:'1',minorVersion:'1'}]:[]};
    zip.file(`${machineName}-${major}.${minorVersion}/library.json`,JSON.stringify(lib));
  });
  for (let i=0;i<50;i++) zip.file(`H5P.Extra${i}-1.0/library.json`,JSON.stringify({machineName:`H5P.Extra${i}`,majorVersion:'1',minorVersion:'0'}));
  const oldMedia = Uint8Array.from([0,1,2,128,255]);
  zip.file('content/media/graph.bin',oldMedia);
  return {bytes:await zip.generateAsync({type:'uint8array'}), oldMedia, deps};
}

test('cas représentatif des 22 déclarations et 72 bibliothèques du Branching Scenario utilisateur', async()=>{
  const {bytes,deps}=await syntheticBranching();
  const p=await studio.openArchive(bytes,ZIP);
  assert.equal(p.libraries.length,72);
  assert.equal(p.dependencyStatus,'complet');
  assert.deepEqual(p.dependencyStats,{declared:22,recognized:22,rejected:0,toleratedStringEntries:22,complete:true});
  assert.equal(p.warnings.length,0);
  assert.deepEqual(p.missing,[]);
  assert.equal(p.metadata.preloadedDependencies[0].majorVersion,'1'); // JSON untouched
  const blob=await studio.saveArchive(p,JSON.stringify(p.metadata),JSON.stringify(p.content));
  const regenerated=await ZIP.loadAsync(await blob.arrayBuffer());
  assert.deepEqual(JSON.parse(await regenerated.file('h5p.json').async('string')).preloadedDependencies,deps);
  assert.deepEqual([...await regenerated.file('content/media/graph.bin').async('uint8array')],[0,1,2,128,255]);
});

test('chaîne de version invalide reste rejetée avec diagnostic explicite', async()=>{
 const zip = new ZIP();
 zip.file('h5p.json',JSON.stringify({title:'A',mainLibrary:'H5P.A',language:'und',embedTypes:['div'],preloadedDependencies:[{machineName:'H5P.A',majorVersion:'1.0',minorVersion:'0'}]}));
 zip.file('content/content.json','{}');
 const p=await studio.openArchive(await zip.generateAsync({type:'uint8array'}),ZIP);
 assert.equal(p.dependencyStatus,'indetermine');
 assert.equal(p.dependencyStats.rejected,1);
 assert.ok(p.warnings.some(w=>w.includes('majorVersion="1.0" (string)')));
});

test('dépendance imbriquée avec chaîne et library.json à versions textuelles', async()=>{
 const zip = new ZIP();
 zip.file('h5p.json',JSON.stringify({title:'A',mainLibrary:'H5P.A',language:'und',embedTypes:['div'],preloadedDependencies:[{machineName:'H5P.A',majorVersion:'1',minorVersion:'0'}]}));
 zip.file('content/content.json','{}');
 zip.file('H5P.A-1.0/library.json',JSON.stringify({machineName:'H5P.A',majorVersion:'1',minorVersion:'0',preloadedDependencies:[{machineName:'H5P.B',majorVersion:'1',minorVersion:'0'}]}));
 zip.file('H5P.B-1.0/library.json',JSON.stringify({machineName:'H5P.B',majorVersion:1,minorVersion:0}));
 const p=await studio.openArchive(await zip.generateAsync({type:'uint8array'}),ZIP);
 assert.equal(p.libraries.length,2);
 assert.equal(p.dependencyStatus,'complet');
 assert.deepEqual(p.missing,[]);
});

test('valeurs infinies et nombres non entiers impossibles à valider', async()=>{
 const zip = new ZIP();
 zip.file('h5p.json',JSON.stringify({title:'A',mainLibrary:'H5P.A',language:'und',embedTypes:['div'],preloadedDependencies:[
  {machineName:'H5P.A',majorVersion:'9007199254740993',minorVersion:0},
  {machineName:'H5P.B',majorVersion:-1,minorVersion:0},
  {machineName:'H5P.C',majorVersion:1.5,minorVersion:0},
  {machineName:'H5P.D',majorVersion:'1e2',minorVersion:0}
 ]}));
 zip.file('content/content.json','{}');
 const p=await studio.openArchive(await zip.generateAsync({type:'uint8array'}),ZIP);
 assert.equal(p.dependencyStats.rejected,4);
 assert.equal(p.dependencyStatus,'indetermine');
});
