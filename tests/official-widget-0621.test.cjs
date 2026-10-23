'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const os=require('node:os');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const WidgetProtocol=require('../runtime/editor-widget-protocol.cjs');
const Bridge=require('../assets/official-editor-bridge.js');

test('protocole du widget : une origine distincte et des fichiers strictement autorisés',()=>{
 assert.equal(WidgetProtocol.ORIGIN,'h5p-widget://editor');
 assert.equal(WidgetProtocol.resolveWidgetRequest('h5p-widget://editor/vendor/h5peditor-text.js').relative,'assets/vendor/h5peditor-text.js');
 for(const url of [
  'h5p-widget://other/official-editor-host.html','h5p-widget://editor/data/private.json',
  'h5p-widget://editor/../../data/private.json','file:///assets/official-editor-host.html',
  'h5p-widget://editor/vendor/jquery.min.js?fake=1','h5p-widget://editor/%2e%2e/secrets.txt',
  'h5p-widget://editor/assets/app.js','h5p-widget://editor/official-editor-host.html#section']){
   assert.equal(WidgetProtocol.resolveWidgetRequest(url),null,url);
 }
});

test('serveur isolé : ressource autorisée, ressources inconnues et méthode rejetées',async()=>{
 let handler;WidgetProtocol.registerWidgetProtocol({handle:(scheme,fn)=>{assert.equal(scheme,'h5p-widget');handler=fn;}},{root});
 const js=await handler({method:'GET',url:'h5p-widget://editor/official-widget-diagnostics.js'});
 assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);
 assert.match(await js.text(),/h5p-widget-health/);
 const bad=await handler({method:'GET',url:'h5p-widget://editor/data/secret'});
 assert.equal(bad.status,404);
 const post=await handler({method:'POST',url:'h5p-widget://editor/official-editor-host.html'});
 assert.equal(post.status,405);
 // Le workflow lance prepare:editor avant npm test : les fichiers vendor
 // existent normalement sous GitHub Actions. Utiliser un dossier temporaire
 // pour vérifier séparément les deux cas, quel que soit l'état de la build.
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'h5p-widget-protocol-'));
 try{
  let fixtureHandler;
  WidgetProtocol.registerWidgetProtocol({handle:(_scheme,fn)=>{fixtureHandler=fn;}},{root:fixture});
  const vendorUrl='h5p-widget://editor/vendor/jquery.min.js';
  const missing=await fixtureHandler({method:'GET',url:vendorUrl});
  assert.equal(missing.status,404,'Une ressource autorisée mais absente renvoie 404.');
  fs.mkdirSync(path.join(fixture,'assets','vendor'),{recursive:true});
  fs.writeFileSync(path.join(fixture,'assets','vendor','jquery.min.js'),'/* fixture de test */');
  const present=await fixtureHandler({method:'GET',url:vendorUrl});
  assert.equal(present.status,200,'Une ressource autorisée et présente renvoie 200.');
  assert.equal(await present.text(),'/* fixture de test */');
  assert.match(present.headers.get('content-type'),/javascript/);
  fs.mkdirSync(path.join(fixture,'data'),{recursive:true});
  fs.writeFileSync(path.join(fixture,'data','private.json'),'secret de test');
  const forbidden=await fixtureHandler({method:'GET',url:'h5p-widget://editor/data/private.json'});
  assert.equal(forbidden.status,404,'Même si elle existe, une URL hors liste reste interdite.');
  const badMethod=await fixtureHandler({method:'POST',url:vendorUrl});
  assert.equal(badMethod.status,405,'Seule la méthode GET est permise.');
 }finally{fs.rmSync(fixture,{recursive:true,force:true});}
});

test('chargement du cadre : aucun statut ready déduit de load, handshake et délais obligatoires',()=>{
 const app=read('assets/app.js');
 assert.doesNotMatch(app,/addEventListener\('load',\(\)=>\{officialReady=true/);
 assert.match(app,/type:'h5p-widget-probe',protocol:2/);
 assert.match(app,/event\.origin!==OFFICIAL_ORIGIN/);
 assert.match(app,/data\.status==='ready'/);
 assert.match(app,/data\.status==='error'/);
 assert.match(app,/clearTimeout\(officialMountDeadline\)/);
 assert.match(app,/8000/);
 assert.match(app,/officialDiagnostic\('Le widget officiel ne répond pas/);
});

test('diagnostic sans dépendances : réponse à la sonde lorsque les ressources manquent',()=>{
 const listeners={};const replies=[];
 const parent={postMessage:x=>replies.push(x)};
 const context={window:{parent,addEventListener:(type,fn)=>{listeners[type]=fn;},
   H5PEditor:undefined},document:{readyState:'complete'},String,Array,RegExp};
 vm.runInNewContext(read('assets/official-widget-diagnostics.js'),context,{timeout:300});
 listeners.message({source:parent,data:{type:'h5p-widget-probe',protocol:2,probe:'a'.repeat(32)}});
 assert.equal(replies[0].type,'h5p-widget-health');
 assert.equal(replies[0].status,'error');
 assert.equal(Array.from(replies[0].missing).includes('h5peditor-text.js'),true);
 listeners.message({source:{},data:{type:'h5p-widget-probe',protocol:2,probe:'a'.repeat(32)}});
 assert.equal(replies.length,1);
});

test('messages du widget : identité de fenêtre, nonce et origine exacte exigées',()=>{
 const frame={contentWindow:{}};
 const event={source:frame.contentWindow,origin:WidgetProtocol.ORIGIN,
  data:{type:'h5p-widget-mounted',protocol:1,nonce:'a'.repeat(32)}};
 assert.equal(Bridge.acceptableMessage(event,frame,'a'.repeat(32),'h5p-widget-mounted',WidgetProtocol.ORIGIN),true);
 assert.equal(Bridge.acceptableMessage({...event,origin:'null'},frame,'a'.repeat(32),'h5p-widget-mounted',WidgetProtocol.ORIGIN),false);
 assert.equal(Bridge.acceptableMessage({...event,origin:'file://'},frame,'a'.repeat(32),'h5p-widget-mounted',WidgetProtocol.ORIGIN),false);
});

test('interface : l’iframe possède une origine dédiée et un diagnostic copiable',()=>{
 const html=read('index.html');
 assert.match(html,/id="officialFrame"[^>]*sandbox="allow-scripts allow-same-origin"[^>]*src="h5p-widget:\/\/editor\/official-editor-host.html"/);
 assert.match(html,/id="officialDiagnostic"/);
 assert.match(html,/id="officialRetryBtn"/);
 const host=read('assets/official-editor-host.html');
 assert.match(host,/official-widget-diagnostics\.js/);
 assert.doesNotMatch(host,/script-src[^"']*file:/);
 assert.match(read('electron/main.cjs'),/registerWidgetProtocol\(session\.defaultSession\.protocol\)/);
 assert.match(read('electron/main.cjs'),/standard:true,secure:true/);
});

test('compilation : lancement d’un vrai test graphique Electron sur Windows',()=>{
 const pkg=JSON.parse(read('package.json'));assert.equal(pkg.version,'0.6.2-hotfix.1');
 assert.match(pkg.scripts['test:widget-ui'],/smoke-widget-electron\.cjs/);
 const smoke=read('scripts/smoke-widget-electron.cjs');
 assert.match(smoke,/mainFrame\.frames/);
 assert.match(smoke,/executeJavaScript/);
 assert.match(smoke,/h5p-widget-value/);
 assert.match(read('.github/workflows/windows-portable.yml'),/npm run test:widget-ui/);
});
