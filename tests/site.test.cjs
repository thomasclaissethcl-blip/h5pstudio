'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ZIP=require('../assets/jszip.min.js');
const studio=require('../assets/h5p-core.js');
const builder=require('../assets/static-builder.js');

async function project(options={}){
 const z=new ZIP();
 const meta={title:'Branching Scenario de test',mainLibrary:'H5P.BranchingScenario',language:'fr',embedTypes:['div'],preloadedDependencies:[{machineName:'H5P.BranchingScenario',majorVersion:'1',minorVersion:'11'}]};
 z.file('h5p.json',JSON.stringify(meta));
 z.file('content/content.json',JSON.stringify({startScreen:{title:'Départ'},content:[]}));
 z.file('content/images/image.bin',new Uint8Array([0,255,3,2,34,1,0]));
 if(!options.missing)z.file('H5P.BranchingScenario-1.11/library.json',JSON.stringify({machineName:'H5P.BranchingScenario',majorVersion:1,minorVersion:11,patchVersion:0}));
 if(options.reserved)z.file('viewer/bootstrap.js','intrus');
 return studio.openArchive(await z.generateAsync({type:'uint8array'}),ZIP);
}

test('site statique : conserve ressources, données et bibliothèques',async()=>{
 const p=await project();
 const file=await builder.build(p,JSON.stringify(p.metadata),JSON.stringify(p.content),ZIP);
 const z=await ZIP.loadAsync(await file.arrayBuffer());
 for(const item of ['index.html','viewer/bootstrap.js','viewer/viewer.css','content/content.json','h5p.json','content/images/image.bin','H5P.BranchingScenario-1.11/library.json','scripts/install-player.ps1','scripts/serve.ps1','INSTALLER-LECTEUR.cmd','PREVISUALISER.cmd','studio-manifest.json','GUIDE-PREVISUALISATION.txt']){
  assert.ok(z.file(item),item);
 }
 assert.deepEqual([...await z.file('content/images/image.bin').async('uint8array')],[0,255,3,2,34,1,0]);
 assert.equal(JSON.parse(await z.file('h5p.json').async('string')).preloadedDependencies[0].minorVersion,'11');
 const m=JSON.parse(await z.file('studio-manifest.json').async('string'));
 assert.equal(m.runtime.version,'3.8.2');
 assert.equal(m.runtime.included,false);
 assert.ok(!z.file('player/main.bundle.js'));
});
test('site statique : conserve les modifications JSON',async()=>{
 const p=await project();
 const meta={...p.metadata,title:'Nouvelle mission'};
 const c={...p.content,startScreen:{title:'Bonjour'}};
 const blob=await builder.build(p,JSON.stringify(meta),JSON.stringify(c),ZIP);
 const z=await ZIP.loadAsync(await blob.arrayBuffer());
 assert.equal(JSON.parse(await z.file('h5p.json').async('string')).title,'Nouvelle mission');
 assert.equal(JSON.parse(await z.file('content/content.json').async('string')).startScreen.title,'Bonjour');
 assert.equal(p.metadata.title,'Branching Scenario de test');
});
test('site statique : refuse si bibliothèques manquantes',async()=>{
 const p=await project({missing:true});
 await assert.rejects(builder.build(p,JSON.stringify(p.metadata),JSON.stringify(p.content),ZIP),/Bibliothèques absentes/);
});
test('site statique : refuse les chemins réservés',async()=>{
 const p=await project({reserved:true});
 await assert.rejects(builder.build(p,JSON.stringify(p.metadata),JSON.stringify(p.content),ZIP),/chemin réservé/);
});
test('scripts : serveur limité à loopback et GET',()=>{
 const s=builder.templates.SERVER_PS;
 assert.match(s,/IPAddress\]::Loopback/);
 assert.match(s,/-ne 'GET'/);
 assert.match(s,/StartsWith/);
 assert.ok(!s.includes('\x00'));
 const d=builder.templates.INSTALL_PS;
 assert.match(d,/3\.8\.2/);
 assert.match(d,/registry\.npmjs\.org/);
});

test('scripts Windows : chemins resolus depuis PSScriptRoot sans passage -Root',async()=>{
  const p=await project();
  const blob=await builder.build(p,JSON.stringify(p.metadata),JSON.stringify(p.content),ZIP);
  const z=await ZIP.loadAsync(await blob.arrayBuffer());
  const installBat=await z.file('INSTALLER-LECTEUR.cmd').async('string');
  const previewBat=await z.file('PREVISUALISER.cmd').async('string');
  const installPs=await z.file('scripts/install-player.ps1').async('string');
  const serverPs=await z.file('scripts/serve.ps1').async('string');
  for(const bat of [installBat,previewBat]){
    assert.doesNotMatch(bat,/\s-Root\s/,'Do not forward an unsafe path with trailing backslash');
    assert.match(bat,/-File "%~dp0scripts\\(?:install-player|serve)\.ps1"/);
  }
  for(const script of [installPs,serverPs]){
    assert.match(script,/\$PSScriptRoot/);
    assert.match(script,/Join-Path -Path \$PSScriptRoot -ChildPath '\.\.'/);
    assert.doesNotMatch(script,/param\(\[Parameter\(Mandatory=\$true\)\]\[string\]\$Root\)/);
    assert.doesNotMatch(script,/GetFullPath\(\$Root\)/);
  }
});

test('manifest : version de generateur mise a jour, lecteur inchange',async()=>{
 const p=await project();
 const blob=await builder.build(p,JSON.stringify(p.metadata),JSON.stringify(p.content),ZIP);
 const z=await ZIP.loadAsync(await blob.arrayBuffer());
 const manifest=JSON.parse(await z.file('studio-manifest.json').async('string'));
 assert.equal(manifest.generatorVersion,'0.3.3');
 assert.equal(manifest.runtime.version,'3.8.2');
});
