'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const ZIP=require('../assets/jszip.min.js');
const Archive=require('../assets/h5p-core.js');
const Semantic=require('../assets/semantic-editor.js');
const Bridge=require('../assets/official-editor-bridge.js');
const Vendor=require('../scripts/prepare-editor.cjs');
const ROOT=path.resolve(__dirname,'..');
const read=x=>fs.readFileSync(path.join(ROOT,x),'utf8');

test('widget officiel : sélection restrictive des seuls champs texte simples',()=>{
 const list=Bridge.fields([
  {name:'title',type:'text',label:'Titre',maxLength:300},
  {name:'rich',type:'text',tags:['p','strong']},
  {name:'custom',type:'text',widget:'ckeditor'},
  {name:'file',type:'file'},
  {name:'group',type:'group',fields:[{name:'nested',type:'text'}]},
  {name:'__proto__',type:'text'},
  {name:'oversize',type:'text',maxLength:100000},
  {name:'unsafe',type:'text',regexp:{pattern:'.'.repeat(270)}},
  {name:'intro',type:'text',optional:true}
 ]);
 assert.deepEqual(list.map(x=>x.name),['title','intro']);
 assert.deepEqual(Bridge.safeField(list[0]),{name:'title',type:'text',label:'Titre',optional:false,maxLength:300,
  placeholder:undefined,description:undefined,regexp:undefined});
 assert.equal(Bridge.safeField(list[1]).maxLength,255);
});

test('widget officiel : modifications immuables et champs complexes préservés',()=>{
 const source={title:'ancien',options:{one:'oui'},a:['x'],other:{path:'images/a.png'},_future:{keep:true}};
 const field={name:'title',type:'text',maxLength:255};
 const next=Bridge.updateContent(source,field,'Texte corrigé',true);
 assert.equal(source.title,'ancien');assert.equal(next.title,'Texte corrigé');
 assert.deepEqual(next.options,source.options);assert.deepEqual(next._future,source._future);
 assert.throws(()=>Bridge.updateContent(source,{name:'options',type:'group'},'écrasement',true),/Champ texte inconnu/);
 assert.throws(()=>Bridge.updateContent(source,field,{},true),/incompatible/);
 assert.throws(()=>Bridge.updateContent(source,field,'X'.repeat(1600),true),/longue/);
});

test('widget officiel : effacement possible seulement pour un champ optionnel',()=>{
 const optional={name:'title',type:'text',optional:true};
 const result=Bridge.updateContent({title:'a',extra:3},optional,undefined,false);
 assert.equal(Object.hasOwn(result,'title'),false);assert.equal(result.extra,3);
 assert.throws(()=>Bridge.updateContent({title:'a'},{name:'title',type:'text'},undefined,false),/obligatoire/);
});

test('messages iframe : origine de la fenêtre et nonce attendus, aucun accès IPC',()=>{
 const frame={contentWindow:{}};const valid={source:frame.contentWindow,data:{type:'h5p-widget-value',protocol:1,nonce:'a'.repeat(32)}};
 assert.equal(Bridge.acceptableMessage(valid,frame,'a'.repeat(32),'h5p-widget-value'),true);
 assert.equal(Bridge.acceptableMessage(valid,frame,'b'.repeat(32),'h5p-widget-value'),false);
 assert.equal(Bridge.acceptableMessage({...valid,source:{}},frame,'a'.repeat(32),'h5p-widget-value'),false);
 assert.equal(Bridge.acceptableMessage({...valid,data:{...valid.data,protocol:2}},frame,'a'.repeat(32),'h5p-widget-value'),false);
 const html=read('index.html');
 assert.match(html,/id="officialFrame"[^>]*sandbox="allow-scripts allow-same-origin"/);
 assert.match(html,/id="officialFrame"[^>]*src="h5p-widget:\/\/editor\/official-editor-host.html"/);
 assert.doesNotMatch(read('assets/official-editor-host.html'),/https:\/\//);
 assert.match(read('electron/preload.cjs'),/if\(process\.isMainFrame\)/);
});

test('source officielle : provenance Git immuable et contrôle de la source exigés',()=>{
 assert.match(Vendor.upstream,/^[a-f0-9]{40}$/);
 assert.equal(Vendor.url.includes(Vendor.upstream),true);
 assert.equal(Vendor.valid(Buffer.from('fake')),false);
 const fixture=Buffer.from('x'.repeat(1200)+'\nns.Text = function () {}\nns.widgets.text = ns.Text;');
 assert.equal(Vendor.valid(fixture),true);
 assert.equal(Vendor.sha256(Buffer.from('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.match(read('scripts/verify-editor.cjs'),/new ns\.widgets\.text/);
});

test('interface et compilation : parcours expérimental et sortie DOSSIER conservée',()=>{
 const html=read('index.html'),app=read('assets/app.js'),pkg=JSON.parse(read('package.json'));
 assert.match(html,/data-tab="officiel"/);
 assert.match(app,/H5POfficialBridge\.updateContent/);
 assert.match(app,/\('contentJson'\)\.value=JSON\.stringify\(next,null,2\)/);
 assert.match(pkg.scripts['build:win'],/prepare:editor/);
 assert.match(pkg.scripts['build:win'],/--dir/);
 assert.equal(pkg.dependencies.jquery,'3.7.1');
 assert.match(read('.github/workflows/windows-portable.yml'),/npm run verify:editor/);
 assert.match(read('.gitignore'),/\/assets\/vendor\//);
});

test('aller-retour .h5p après une édition par le pont officiel, ressources inchangées',async()=>{
 const zip=new ZIP();
 zip.file('h5p.json',JSON.stringify({title:'Exemple',mainLibrary:'H5P.Sample',language:'fr',preloadedDependencies:[{machineName:'H5P.Sample',majorVersion:1,minorVersion:0}]}));
 zip.file('content/content.json',JSON.stringify({title:'avant',other:{preserved:true},media:{path:'images/a.jpg'}}));
 zip.file('content/images/a.jpg',Uint8Array.from([1,3,5,7]));
 zip.file('H5P.Sample-1.0/library.json',JSON.stringify({machineName:'H5P.Sample',majorVersion:1,minorVersion:0,patchVersion:0}));
 zip.file('H5P.Sample-1.0/semantics.json',JSON.stringify([{name:'title',type:'text',maxLength:100},{name:'media',type:'image'}]));
 const archive=await Archive.openArchive(await zip.generateAsync({type:'uint8array'}),ZIP);
 const schema=await Semantic.readSemantics(archive);
 assert.deepEqual(Bridge.fields(schema.fields).map(x=>x.name),['title']);
 const content=Bridge.updateContent(archive.content,schema.fields[0],'après',true);
 const blob=await Archive.saveArchive(archive,JSON.stringify(archive.metadata),JSON.stringify(content));
 const after=await Archive.openArchive(await blob.arrayBuffer(),ZIP);
 assert.equal(after.content.title,'après');assert.deepEqual(after.content.other,{preserved:true});
 assert.deepEqual([...await after.zip.file('content/images/a.jpg').async('uint8array')],[1,3,5,7]);
 assert.equal(after.libraries[0].majorVersion,1);
});
