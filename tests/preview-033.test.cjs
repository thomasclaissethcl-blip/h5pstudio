'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const http=require('node:http');
const fs=require('node:fs');
const fsp=fs.promises;
const os=require('node:os');
const path=require('node:path');
const ZIP=require('../assets/jszip.min.js');
const core=require('../assets/h5p-core.js');
const builder=require('../assets/static-builder.js');
const studio=require('../runtime/studio-site.cjs');

async function setup(fn){
 const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'h5p-033-'));
 try{
  const source=new ZIP();
  source.file('h5p.json',JSON.stringify({title:'Activité de test',mainLibrary:'H5P.Text',language:'fr',embedTypes:['div'],preloadedDependencies:[{machineName:'H5P.Text',majorVersion:'1',minorVersion:'1'}]}));
  source.file('content/content.json','{}');
  source.file('H5P.Text-1.1/library.json',JSON.stringify({machineName:'H5P.Text',majorVersion:1,minorVersion:1,patchVersion:0}));
  const archive=await source.generateAsync({type:'uint8array'});
  const project=await core.openArchive(archive,ZIP);
  const raw=new Uint8Array(await (await builder.build(project,JSON.stringify(project.metadata),JSON.stringify(project.content),ZIP)).arrayBuffer());
  const player=path.join(tmp,'player');
  await fsp.mkdir(path.join(player,'styles'),{recursive:true});
  for(const filename of ['main.bundle.js','frame.bundle.js','styles/h5p.css'])await fsp.writeFile(path.join(player,filename),'/* player fixture */');
  return await fn({raw,player,tmp});
 }finally{await fsp.rm(tmp,{recursive:true,force:true});}
}

function requestPath(base,requested){
 const u=new URL(base);
 return new Promise((resolve,reject)=>{
  http.get({hostname:'127.0.0.1',port:Number(u.port),path:requested,headers:{host:'127.0.0.1:'+u.port}},res=>{
   const arr=[];res.on('data',chunk=>arr.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(arr).toString('utf8')}));
  }).on('error',reject);
 });
}

test('regression exact //h5p.json: JSON instead of HTML index page',async()=>setup(async({raw,player,tmp})=>{
 const site=await studio.extractPreview(raw,player,path.join(tmp,'site'));
 const preview=await studio.startPreviewServer(site);
 try{
  for(const p of ['/h5p.json','//h5p.json','////h5p.json','//content/content.json']){
   const response=await requestPath(preview.url,p);
   assert.equal(response.status,200,p);
   assert.match(response.headers['content-type'],/application\/json/,p);
   assert.doesNotMatch(response.body,/<!doctype/i,p);
   assert.doesNotThrow(()=>JSON.parse(response.body),p);
  }
  const page=await requestPath(preview.url,'/');
  assert.match(page.headers['content-type'],/text\/html/);
 }finally{await new Promise(done=>preview.server.close(done));}
}));

test('static production ZIP includes no header/status panel, title or validation prose',async()=>setup(async({raw,player,tmp})=>{
 const target=path.join(tmp,'site.zip');
 await studio.exportStaticZip(raw,player,target);
 const zip=await ZIP.loadAsync(await fsp.readFile(target));
 const html=await zip.file('index.html').async('string');
 const bootstrap=await zip.file('viewer/bootstrap.js').async('string');
 const css=await zip.file('viewer/viewer.css').async('string');
 assert.doesNotMatch(html,/<header|id="siteTitle"|<h1/i);
 assert.doesNotMatch(html,/Lecteur initialisé|Vérifiez les interactions/i);
 assert.match(html,/<div id="h5p-container"><\/div>/);
 assert.match(html,/id="playerNote"[^>]*hidden/);
 assert.match(bootstrap,/document\.title=meta\.title/);
 assert.match(css,/#playerNote\[hidden\]/);
 const info=JSON.parse(await zip.file('studio-manifest.json').async('string'));
 assert.equal(info.generatorVersion,'0.3.4');
}));

test('bootstrap supplies slash-free directory URLs; production success hides status',async()=>{
 const code=builder.templates.BOOTSTRAP;
 assert.doesNotThrow(()=>new Function(code));
 let chosen=null;
 const note={hidden:true,textContent:''};
 const document={title:'Initial',getElementById(id){return id==='playerNote'?note:{}}};
 const base='https://moodle.example/pluginfile.php/7/mod_resource/content/0/';
 const window={fetch:async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify({title:'Titre en onglet'})}),addEventListener(){},H5PStandalone:{H5P:function(_element,opts){chosen=opts;return Promise.resolve();}}};
 vm.runInNewContext(code,{document,window,URL,location:{protocol:'https:',href:base+'index.html'},console});
 for(let i=0;i<30&&!chosen;i++)await new Promise(r=>setTimeout(r,2));
 assert.ok(chosen,'initialized');
 assert.equal(chosen.h5pJsonPath,base.slice(0,-1));
 assert.equal(chosen.contentJsonPath,base+'content');
 assert.equal(chosen.librariesPath,base.slice(0,-1));
 assert.equal(chosen.h5pJsonPath+'/h5p.json',base+'h5p.json');
 assert.equal(chosen.contentJsonPath+'/content.json',base+'content/content.json');
 assert.equal(document.title,'Titre en onglet');
 await new Promise(r=>setTimeout(r,5));
 assert.equal(note.hidden,true);
 assert.equal(note.textContent,'');
});
