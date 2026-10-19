'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fullscreenAllowed}=require('../runtime/fullscreen-permission.cjs');
const base={permission:'fullscreen',previewUrl:'http://127.0.0.1:54699/',isAppWindow:true,requestingUrl:'http://127.0.0.1:54699/index.html'};
test('local H5P preview is permitted to request fullscreen',()=>{
 assert.equal(fullscreenAllowed(base),true);
 assert.equal(fullscreenAllowed({...base,requestingUrl:'about:blank'}),true);
});
test('untrusted and non-preview fullscreen denied',()=>{
 for(const change of [
  {permission:'automatic-fullscreen'},{permission:'media'},{permission:'geolocation'},
  {previewUrl:null},{isAppWindow:false},
  {requestingUrl:'https://example.com/evil'},{requestingUrl:'http://127.0.0.1:54700/'},
  {requestingUrl:'file:///C:/'}
 ]) assert.equal(fullscreenAllowed({...base,...change}),false,JSON.stringify(change));
});
test('editor preview iframe authorizes Fullscreen API explicitly',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/id="previewFrame"[^>]*allow="fullscreen"[^>]*allowfullscreen/);
});
test('standalone configuration exposes fullscreen support without toolbar',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../assets/static-builder.js'),'utf8');
 assert.match(src,/frame:false,fullScreen:true,export:false/);
});
test('GitHub Actions only publishes the folder build',()=>{
 const yml=fs.readFileSync(path.join(__dirname,'../.github/workflows/windows-portable.yml'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'),'utf8'));
 assert.match(yml,/dist\/win-unpacked\//);
 assert.doesNotMatch(yml,/Windows-EXE|dist\/\*\.exe/);
 assert.match(pkg.scripts['build:win'],/--dir/);
 assert.ok(!pkg.scripts['build:win'].includes('portable'));
});
