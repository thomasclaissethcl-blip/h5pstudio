'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const Sources=require('../runtime/update-sources.cjs');
const Catalog=require('../runtime/github-catalog.cjs');
const ZIP=require('../assets/jszip.min.js');
const Registry=require('../runtime/library-registry.cjs');
const dirFn=async cb=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'h5p-catalog-'));try{return await cb(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}};
test('sources officielles toujours visibles et non supprimables',()=>dirFn(async dir=>{
 const list=await Sources.readSources(dir);assert.equal(list.length,3);
 assert.equal(list[0].repo,'h5p/h5p-php-library');
 await assert.rejects(Sources.removeSource(dir,list[0].repo),/officielles/);
}));
test('sources GitHub tierces ajoutées de manière explicite et persistante',()=>dirFn(async dir=>{
 const r=await Sources.addSource(dir,'https://github.com/Exemple/H5P-MonProjet.git');
 assert.equal(r.existing,false);assert.equal((await Sources.readSources(dir)).length,4);
 const again=await Sources.addSource(dir,'Exemple/H5P-MonProjet');assert.equal(again.existing,true);
 const next=await Sources.removeSource(dir,'Exemple/H5P-MonProjet');assert.equal(next.length,3);
}));
test('sources non GitHub, chemins supplémentaires et types abusifs sont rejetés',()=>dirFn(async dir=>{
 for(const s of ['https://github.com.evil.com/a/b','http://github.com/a/b','a/b/extra','../repo','https://github.com/a/b?token=s']){
  await assert.rejects(Sources.addSource(dir,s));
 }
 await assert.rejects(Sources.addSource(dir,'a/b','core-view'),/bibliothèques/);
}));
test('releases filtrent les fichiers non installables, les archives trop lourdes et les liens externes',()=>{
 const assets=Catalog.releaseAssets([
  {draft:false,tag_name:'v2',published_at:'2026-10-01',assets:[
   {id:1,name:'pack.h5p',size:800,browser_download_url:'https://github.com/a/b/releases/download/v2/pack.h5p'},
   {id:2,name:'source.tgz',size:400,browser_download_url:'https://github.com/a/b/releases/download/v2/source.tgz'},
   {id:3,name:'bad.zip',size:100,browser_download_url:'https://evil.example/f.zip'},
   {id:4,name:'huge.zip',size:300*1024*1024,browser_download_url:'https://github.com/a/b/releases/download/v2/huge.zip'}]}
 ]);
 assert.equal(assets.length,1);assert.equal(assets[0].id,1);
});
test('métadonnées du cœur ne prétendent pas attester la compatibilité',async()=>{
 const calls=[];
 const result=await Catalog.checkRepo('h5p/h5p-php-library',async route=>{
  calls.push(route);
  if(route.includes('/releases'))return [{tag_name:'v1.28',published_at:'2026-09-01',draft:false,prerelease:false,assets:[]}];
  if(route.includes('/tags'))return [{name:'v1.28'}];
  return [{sha:'a'.repeat(40),commit:{committer:{date:'2026-10-17T00:00:00Z'}}}];
 });
 assert.equal(result.stable.tag,'v1.28');assert.equal(result.latestCommit.sha.length,40);
 assert.equal(calls.length,3);assert.equal(result.assets.length,0);
});
test('releases absentes autorisent malgré tout le suivi des derniers commits',async()=>{
 const result=await Catalog.checkRepo('owner/repo',async route=>{
  if(route.includes('/releases'))throw Error('404');
  if(route.includes('/tags'))return [];
  return [{sha:'b'.repeat(40)}];
 });
 assert.equal(result.latestCommit.sha,'b'.repeat(40));assert.equal(result.errors.length,1);
});
test('un paquet de release est contrôlé puis installé sans écraser les bibliothèques existantes',()=>dirFn(async dir=>{
 const zip=new ZIP();zip.file('H5P.Demo-1.1/library.json',JSON.stringify({machineName:'H5P.Demo',majorVersion:1,minorVersion:1,patchVersion:4}));
 zip.file('H5P.Demo-1.1/main.js','console.log(1)');
 const bytes=await zip.generateAsync({type:'nodebuffer'});
 const asset={id:9,name:'demo.h5p',url:'https://github.com/a/b/releases/download/v1/demo.h5p',bytes:bytes.length};
 const received=await Catalog.downloadAsset(asset,async(_url,opts)=>{assert.equal(opts.limit,250*1024*1024);return bytes;});
 const installed=await Registry.extractLibraries(received,dir,{origin:'github-release',sourceName:'a/b@v1'});
 assert.equal(installed.installed.length,1);assert.equal(installed.errors.length,0);
 const again=await Registry.extractLibraries(received,dir,{origin:'github-release',sourceName:'a/b@v1'});
 assert.equal(again.skipped.length,1);assert.equal((await Registry.listLibraries(dir)).length,1);
}));
test('le téléchargement refuse une adresse hors de GitHub et les données non ZIP',async()=>{
 await assert.rejects(Catalog.downloadAsset({id:1,name:'a.h5p',bytes:1,url:'https://other.example/abc'},async()=>Buffer.from('PKhi')),/invalide/);
 await assert.rejects(Catalog.downloadAsset({id:1,name:'a.h5p',bytes:4,url:'https://github.com/a/b/releases/download/v1/a.h5p'},async()=>Buffer.from('not zip')),/ZIP/);
});
test('interface utilise seulement IPC restreint, sans accès réseau dans le renderer',async()=>{
 const main=await fs.readFile(path.join(__dirname,'../electron/main.cjs'),'utf8');
 const preload=await fs.readFile(path.join(__dirname,'../electron/preload.cjs'),'utf8');
 const html=await fs.readFile(path.join(__dirname,'../index.html'),'utf8');
 assert.match(main,/catalogCache\.get\(id\)/);
 assert.match(main,/source\.kind!=='library'/);
 assert.match(main,/Registry\.extractLibraries\(bytes,libraryDir/);
 assert.match(preload,/catalogCheck:/);
 assert.match(html,/data-panel="updates"/);
 assert.equal((html.match(/id="catalogReport"/g)||[]).length,1);
});
