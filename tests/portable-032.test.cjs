'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');
const path=require('node:path');
const {portableRoot}=require('../runtime/portable-path.cjs');
const builder=require('../assets/static-builder.js');

test('Windows DOSSIER: data outside resources/app.asar',()=>{
 const p=portableRoot({packaged:true,exePath:'/Windows/Downloads/win-unpacked/H5P Studio Portable.exe',sourceDir:'/Windows/ignore/resources/app.asar/electron'});
 assert.equal(p,path.resolve('/Windows/Downloads/win-unpacked'));
 assert.ok(!p.includes('app.asar'));
});
test('Windows EXE: PORTABLE_EXECUTABLE_DIR takes precedence',()=>{
 const p=portableRoot({portableDir:'/portable-root',packaged:true,exePath:'/temp/unpacked.exe',sourceDir:'ignored'});
 assert.equal(p,path.resolve('/portable-root'));
});
test('Unpackaged development: project folder',()=>{
 const p=portableRoot({packaged:false,exePath:'ignored',sourceDir:'/repo/electron'});
 assert.equal(p,path.resolve('/repo'));
});
test('Bootstrap validates executable code, uses absolute document-derived paths, and rejects file protocol',async()=>{
 const code=builder.templates.BOOTSTRAP;
 assert.doesNotThrow(()=>new Function(code));
 assert.match(code,/new URL\('h5p.json',location.href\)/);
 assert.match(code,/location.protocol==='file:'/);
 assert.match(code,/const contentDirectory=new URL\('content',location.href\)/);
 const elem={textContent:'',hidden:true};
 const ctx={document:{getElementById:()=>elem},window:{fetch:async()=>{throw Error('must not fetch file protocol')},addEventListener(){}}, location:{protocol:'file:',href:'file:///C:/site/index.html'}, URL, console};
 vm.runInNewContext(code,ctx);
 assert.match(elem.textContent,/HTTP\(S\)/);
});
test('Bootstrap diagnostic: reject HTML as JSON with explicit file path',async()=>{
 const code=builder.templates.BOOTSTRAP;
 const note={textContent:'',hidden:true};
 const ctx={
   document:{title:'',getElementById:()=>note},
   window:{fetch:async()=>({ok:true,status:200,headers:{get:()=> 'text/html'},text:async()=> '<!doctype html><title>index</title>'}),addEventListener(){}},
   location:{protocol:'http:',href:'http://127.0.0.1:8080/index.html'},URL,console
 };
 vm.runInNewContext(code,ctx);
 for(let i=0;i<15&&!note.textContent.includes('HTML');i++)await new Promise(r=>setTimeout(r,1));
 assert.match(note.textContent,/h5p.json a renvoyé du HTML/);
});
test('Bootstrap success: library root and content URLs remain under a Moodle subdirectory',async()=>{
 const code=builder.templates.BOOTSTRAP;
 const note={textContent:'',hidden:true};
 let observed;
 const pathBase='https://moodle.example/pluginfile.php/42/mod_resource/content/0/';
 const ctx={
  document:{title:'',getElementById:()=>note},
  window:{
   fetch:async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=> JSON.stringify({title:'Démo'})}),
   addEventListener(){},
   H5PStandalone:{H5P:function(element,opts){observed=opts;return Promise.resolve();}}
  },
  location:{protocol:'https:',href:pathBase+'index.html'},URL,console
 };
 vm.runInNewContext(code,ctx);
 for(let i=0;i<15&&!observed;i++)await new Promise(r=>setTimeout(r,1));
 assert.equal(observed.h5pJsonPath,pathBase.slice(0,-1));
 assert.equal(observed.contentJsonPath,pathBase+'content');
 assert.equal(observed.librariesPath,pathBase.slice(0,-1));
 assert.equal(observed.frameJs,pathBase+'player/frame.bundle.js');
 assert.equal(note.hidden,true,'No production banner on successful initialization');
 assert.equal(note.textContent,'','No production status message');
});
