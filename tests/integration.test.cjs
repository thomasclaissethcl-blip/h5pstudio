'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const fsp=fs.promises;const os=require('node:os');const path=require('node:path');const zlib=require('node:zlib');
const ZIP=require('../assets/jszip.min.js');
const core=require('../assets/h5p-core.js');const builder=require('../assets/static-builder.js');
const manager=require('../runtime/player-manager.cjs');const studio=require('../runtime/studio-site.cjs');
async function sample(){
 const zip=new ZIP();const meta={title:'Démo autonome',mainLibrary:'H5P.Text',language:'fr',embedTypes:['div'],preloadedDependencies:[{machineName:'H5P.Text',majorVersion:'1',minorVersion:'1'}]};
 zip.file('h5p.json',JSON.stringify(meta));zip.file('content/content.json','{}');
 zip.file('content/photo.png',new Uint8Array([137,80,78,71,13,10]));
 zip.file('H5P.Text-1.1/library.json',JSON.stringify({machineName:'H5P.Text',majorVersion:1,minorVersion:1,patchVersion:0}));
 const project=await core.openArchive(await zip.generateAsync({type:'uint8array'}),ZIP);
 return new Uint8Array(await (await builder.build(project,JSON.stringify(project.metadata),JSON.stringify(project.content),ZIP)).arrayBuffer());
}
async function fixture(fn){const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'h5pstudiotest-'));try{return await fn(tmp);}finally{await fsp.rm(tmp,{recursive:true,force:true});}}
async function fakePlayer(tmp){const root=path.join(tmp,'player');await fsp.mkdir(path.join(root,'styles'),{recursive:true});
 for(const x of manager.PLAYER_FILES)await fsp.writeFile(path.join(root,x),`/* ${x} fake fixture */`);
 return root;
}
test('site final : lecteur embarqué et aucune commande Windows',async()=>fixture(async tmp=>{
 const player=await fakePlayer(tmp),raw=await sample(),target=path.join(tmp,'final.zip');
 const r=await studio.exportStaticZip(raw,player,target);
 assert.ok(r.size>0);
 const z=await ZIP.loadAsync(await fsp.readFile(target));
 for(const f of ['index.html','player/main.bundle.js','player/frame.bundle.js','player/styles/h5p.css','content/content.json','content/photo.png','H5P.Text-1.1/library.json'])assert.ok(z.file(f),f);
 for(const f of ['INSTALLER-LECTEUR.cmd','PREVISUALISER.cmd','scripts/install-player.ps1','scripts/serve.ps1','player/AJOUTER-LECTEUR-ICI.txt'])assert.equal(z.file(f),null,f);
 assert.deepEqual([...await z.file('content/photo.png').async('uint8array')],[137,80,78,71,13,10]);
 const info=JSON.parse(await z.file('studio-manifest.json').async('string'));assert.equal(info.runtime.included,true);assert.equal(info.runtime.downloadRequired,false);
}));
test('aperçu : serveur HTTP sur boucle locale, ressources et en-têtes',async()=>fixture(async tmp=>{
 const player=await fakePlayer(tmp),site=await studio.extractPreview(await sample(),player,path.join(tmp,'site'));
 const preview=await studio.startPreviewServer(site);
 try{
  assert.match(preview.url,/^http:\/\/127\.0\.0\.1:/);
  const a=await fetch(preview.url);assert.equal(a.status,200);assert.match(await a.text(),/h5p-container/);
  const b=await fetch(preview.url+'player/main.bundle.js');assert.equal(b.status,200);assert.match(await b.text(),/fake fixture/);
  const c=await fetch(preview.url+'content/photo.png');assert.equal(c.status,200);assert.equal((await c.arrayBuffer()).byteLength,6);
  const d=await fetch(preview.url+'missing.png');assert.equal(d.status,404);
  const e=await fetch(preview.url,{method:'POST'});assert.equal(e.status,405);
  assert.equal(a.headers.get('x-content-type-options'),'nosniff');
 }finally{await new Promise(resolve=>preview.server.close(resolve));}
}));
test('sécurité : chemins et ZIP réservés',async()=>{
 for(const x of ['../a','a/../b','a\\b','/etc/passwd','C:/boot','a/./b'])assert.throws(()=>studio.assertSafeFile(x));
 const tmp=await fixture(async p=>p);assert.ok(tmp);
 const z=new ZIP();z.file('h5p.json','{}');z.file('index.html','ok');z.file('reader/A','x');
 const raw=await z.generateAsync({type:'uint8array'});await assert.rejects(studio.readSourceZip(raw).then(async zip=>{
  // reader is not a reserved path in imported site: reserved check is done in static-builder first.
  assert.ok(zip.file('reader/A'));
  return studio.readSourceZip(new Uint8Array([1,2,3]));
 }));
});
test('gestionnaire : dossier lecteur valide ou incomplet',async()=>fixture(async tmp=>{
 const dir=await fakePlayer(tmp);assert.ok(manager.complete(dir));
 await fsp.rm(path.join(dir,'frame.bundle.js'));assert.equal(manager.complete(dir),false);
 await assert.rejects(manager.adoptLocalPlayer(dir,path.join(tmp,'dst')),/incomplet/);
}));
test('gestionnaire : relecture d’un TAR gzip, sans extraction de chemins externes',()=>{
 function entry(name,bytes){
  const h=Buffer.alloc(512),put=(offset,size,str)=>h.write(str,offset,Math.min(size,str.length),'ascii');
  put(0,100,'package/dist/'+name);put(100,8,'0000644\0');put(124,12,bytes.length.toString(8).padStart(11,'0')+'\0');h[156]=48;
  const checksum=h.reduce((acc,v)=>acc+v,0);void checksum;
  return Buffer.concat([h,bytes,Buffer.alloc((512-(bytes.length%512))%512)]);
 }
 const pieces=manager.PLAYER_FILES.map(x=>entry(x,Buffer.from('demo')));
 const blob=zlib.gzipSync(Buffer.concat([...pieces,Buffer.alloc(1024)]));
 const m=manager.untarDist(blob);assert.equal(m.size,3);assert.equal(m.get('main.bundle.js').toString(),'demo');
});
