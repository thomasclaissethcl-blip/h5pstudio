'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const JSZip=require('../assets/jszip.min.js');
const R=require('../runtime/library-registry.cjs');
const {assess}=require('../runtime/dependency-resolver.cjs');
const {evidence}=require('../runtime/core-evidence.cjs');
const lib=(name,major,minor,patch=0,deps=[],extra={})=>({id:name+'@'+major+'.'+minor+'.'+patch+'#'+String(patch).repeat(16),sha256:'a'.repeat(64),
 machineName:name,majorVersion:major,minorVersion:minor,patchVersion:patch,dependencies:deps,coreApi:null,origin:'local',...extra});
const dep=(name,major=1,minor=0,kind='preloadedDependencies')=>({machineName:name,majorVersion:major,minorVersion:minor,kind});
const root=name=>({machineName:name,majorVersion:'1',minorVersion:'0'});
async function temp(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'h5p-reg-041-'));try{return await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('résolution transitive sans exécution ni changement de versions',()=>{
 const libs=[lib('H5P.Main',1,0,0,[dep('H5P.Child')]),lib('H5P.Child',1,0,3,[dep('H5P.Base')]),lib('H5P.Base',1,0,1)];
 const original=JSON.stringify(libs);
 const r=assess({libraries:libs,roots:[root('H5P.Main')]});
 assert.equal(r.problems.length,0);assert.equal(r.coreStatus,'non-certifie');assert.equal(r.status,'non-certifie');
 assert.equal(r.selection.length,3);assert.equal(JSON.stringify(libs),original);
 assert.equal(r.selection.find(x=>x.machineName==='H5P.Child').version,'1.0.3');
});
test('une dépendance absente est signalée avec sa provenance',()=>{
 const r=assess({libraries:[lib('H5P.Main',1,0,0,[dep('H5P.Absent')])],roots:[root('H5P.Main')]});
 assert.equal(r.status,'incomplet');assert.equal(r.problems[0].code,'missing');assert.match(r.problems[0].via,/H5P.Main/);
});
test('deux variantes de même version corrective exigent un choix explicite',()=>{
 const a=lib('H5P.Main',1,0,2),b={...a,id:'autre-variant',sha256:'b'.repeat(64)};
 const ambiguous=assess({libraries:[a,b],roots:[root('H5P.Main')]});
 assert.equal(ambiguous.problems[0].code,'ambiguous-variant');
 const resolved=assess({libraries:[a,b],roots:[root('H5P.Main')],choices:{'H5P.Main':'autre-variant'}});
 assert.equal(resolved.selection[0].id,'autre-variant');assert.equal(resolved.problems.length,0);
});
test('une préférence de version majeure incompatible bloque le diagnostic',()=>{
 const r=assess({libraries:[lib('H5P.Main',1,0),lib('H5P.Main',2,0)],roots:[root('H5P.Main')],choices:{'H5P.Main':'H5P.Main@2.0.0#0000000000000000'}});
 assert.equal(r.problems[0].code,'preference-incompatible');
});
test('versions majeures/mineures incompatibles imposées à une même bibliothèque',()=>{
 const libs=[lib('H5P.A',1,0,0,[dep('H5P.Shared',1,0),dep('H5P.B',1,0)]),lib('H5P.B',1,0,0,[dep('H5P.Shared',1,1)]),lib('H5P.Shared',1,0),lib('H5P.Shared',1,1)];
 const r=assess({libraries:libs,roots:[root('H5P.A')]});
 assert.ok(r.problems.some(x=>x.code==='version-conflict'));
});
test('dépendance éditeur exclue par défaut, activée sur demande',()=>{
 const libs=[lib('H5P.Main',1,0,0,[dep('H5PEditor.X',1,0,'editorDependencies')])];
 assert.equal(assess({libraries:libs,roots:[root('H5P.Main')]}).problems.length,0);
 assert.equal(assess({libraries:libs,roots:[root('H5P.Main')],includeEditor:true}).problems[0].code,'missing');
});
test('API maximale exigée : inconnue pour le lecteur, insuffisante si version attestée trop basse',()=>{
 const libs=[lib('H5P.Main',1,0,0,[],{coreApi:{majorVersion:1,minorVersion:28}})];
 const a=assess({libraries:libs,roots:[root('H5P.Main')]});
 assert.equal(a.coreStatus,'non-certifie');assert.deepEqual(a.requiredApi,{majorVersion:1,minorVersion:28});
 const b=assess({libraries:libs,roots:[root('H5P.Main')],coreApi:{majorVersion:1,minorVersion:27}});
 assert.ok(b.problems.some(x=>x.code==='core-too-old'));
 const c=assess({libraries:libs,roots:[root('H5P.Main')],coreApi:{majorVersion:1,minorVersion:28}});
 assert.equal(c.coreStatus,'compatible-sur-api-declaree');
});
test('absence coreApi vaut exigence 1.0 selon spécification, pas version du lecteur',()=>{
 const r=assess({libraries:[lib('H5P.Main',1,0)],roots:[root('H5P.Main')]});
 assert.deepEqual(r.requiredApi,{majorVersion:1,minorVersion:0});assert.equal(r.coreStatus,'non-certifie');
});
test('cycles de dépendances terminent sans boucle infinie',()=>{
 const r=assess({libraries:[lib('H5P.Main',1,0,0,[dep('H5P.B')]),lib('H5P.B',1,0,0,[dep('H5P.Main')])],roots:[root('H5P.Main')]});
 assert.equal(r.selection.length,2);assert.equal(r.problems.length,0);
});
test('import : rapport distinct par manifest, installation / déjà présent / rejet',()=>temp(async dir=>{
 const zip=new JSZip();zip.file('H5P.One-1.0/library.json',JSON.stringify({machineName:'H5P.One',title:'One',majorVersion:'1',minorVersion:'0',patchVersion:'0'}));
 zip.file('H5P.Bad-1.0/library.json',JSON.stringify({machineName:'H5P.Bad',majorVersion:'1',minorVersion:'0'}));
 const bytes=await zip.generateAsync({type:'nodebuffer'});
 const one=await R.extractLibraries(bytes,dir);assert.deepEqual(one.counts,{manifests:2,installed:1,alreadyInstalled:0,rejected:1});
 assert.deepEqual(one.outcomes.map(x=>x.status),['installed','rejected']);assert.match(one.outcomes[1].reason,/version/);
 const two=await R.extractLibraries(bytes,dir);assert.deepEqual(two.outcomes.map(x=>x.status),['already-installed','rejected']);
}));
test('provenance du lecteur : empreinte npm attestée ne certifie pas API H5P core',()=>temp(async dir=>{
 const b=path.join(dir,'reader'),c=path.join(dir,'cache');await fs.mkdir(b);
 await fs.writeFile(path.join(b,'runtime-source.json'),JSON.stringify({name:'h5p-standalone',version:'3.8.2',sha512:'sha512-TEST',source:'https://registry.npmjs.org/h5p-standalone/-/h5p-standalone-3.8.2.tgz'}));
 const r=await evidence({playerVersion:'3.8.2',bundledDir:b,cacheDir:c});
 assert.equal(r.origin.location,'embarqué');assert.equal(r.coreApi,null);assert.equal(r.apiStatus,'non-certifiee');
}));
