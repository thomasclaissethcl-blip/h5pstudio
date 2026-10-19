'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const ZIP=require('../assets/jszip.min.js');
const Snap=require('../runtime/source-snapshots.cjs');
const GH=require('../runtime/github-catalog.cjs');
const Registry=require('../runtime/library-registry.cjs');
const Packer=require('../scripts/pack-built-library.cjs');
const tmp=async cb=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'h5p-051-'));try{return await cb(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}};
const sha='a'.repeat(40);
const manifest={machineName:'H5P.Demo',majorVersion:1,minorVersion:9,patchVersion:8,
 coreApi:{majorVersion:1,minorVersion:28},preloadedJs:[{path:'dist/main.js'}],preloadedCss:[{path:'dist/main.css'}]};
async function source(files){const z=new ZIP();for(const [name,value] of Object.entries(files))z.file('author-h5p-demo-'+sha+'/'+name,value);return z.generateAsync({type:'nodebuffer'});}
test('sources GitHub sans les fichiers JS générés restent non installables',async()=>{
 const src=await source({'library.json':JSON.stringify(manifest),'src/main.js':'source code'});
 const report=await Snap.inspectArchive(src);
 assert.equal(report.kind,'library');assert.equal(report.version,'1.9.8');assert.equal(report.buildRequired,true);
 assert.deepEqual(report.missing,['dist/main.js','dist/main.css']);
});
test('sources compilées peuvent être empaquetées et ajoutées sans modification',()=>tmp(async dir=>{
 const src=await source({'library.json':JSON.stringify(manifest),'dist/main.js':'alert(1);','dist/main.css':'body{}'});
 const report=await Snap.inspectArchive(src);
 assert.equal(report.buildRequired,false);
 const zip=await Snap.packageReadyLibrary(src,report);
 const installed=await Registry.extractLibraries(zip,path.join(dir,'registry'),{origin:'github-source-compiled'});
 assert.equal(installed.counts.installed,1);
 const again=await Registry.extractLibraries(zip,path.join(dir,'registry'),{origin:'github-source-compiled'});
 assert.equal(again.counts.alreadyInstalled,1);
}));
test('sources officielles sans manifeste peuvent être conservées en snapshot, sans activation',()=>tmp(async dir=>{
 const src=await source({'composer.json':'{}','h5p-php-library.js':'foo'});
 const report=await Snap.inspectArchive(src);assert.equal(report.kind,'source');
 const first=await Snap.storeSnapshot(dir,'h5p/h5p-php-library',sha,src,report);
 assert.equal(first.reused,false);assert.equal(first.status,'source-core-ou-repertoire');
 const again=await Snap.storeSnapshot(dir,'h5p/h5p-php-library',sha,src,report);
 assert.equal(again.reused,true);
 const record=JSON.parse(await fs.readFile(path.join(first.path,'manifest.json'),'utf8'));
 assert.equal(record.commit,sha);assert.equal(record.sha256,first.sha256);
}));
test('aucun téléchargement arbitraire : SHA, hôte et dépôt sont limités',async()=>{
 await assert.rejects(GH.downloadSource('user/repo','master'),/révision/i);
 await assert.rejects(GH.downloadSource('bad/repo/extra',sha),/dépôt/i);
 const bytes=await GH.downloadSource('otacke/h5p-game-map',sha,async(url,params)=>{
  assert.equal(url,`https://codeload.github.com/otacke/h5p-game-map/zip/${sha}`);
  assert.equal(params.allowedHosts.has('codeload.github.com'),true);
  return Buffer.from('PK\x03\x04','binary');
 });assert.equal(bytes.length,4);
});
test('chemins hostiles de sources bloqués',async()=>{
 const z=new ZIP();z.file('repo/library.json',JSON.stringify(manifest));z.file('repo/C:/evil.txt','bad');
 await assert.rejects(Snap.inspectArchive(await z.generateAsync({type:'nodebuffer'})),/chemin/i);
});
test('un zip de bibliothèque construite contient les chemins attendus',()=>tmp(async dir=>{
 await fs.mkdir(path.join(dir,'dist'));await fs.mkdir(path.join(dir,'src'));
 await fs.writeFile(path.join(dir,'library.json'),JSON.stringify(manifest));
 await fs.writeFile(path.join(dir,'dist/main.js'),'compiled');
 await fs.writeFile(path.join(dir,'dist/main.css'),'compiled');
 await fs.writeFile(path.join(dir,'src/main.js'),'uncompiled');
 const output=path.join(dir,'export.zip');const meta=await Packer.pack(dir,output);
 assert.equal(meta.machineName,'H5P.Demo');
 const archive=await ZIP.loadAsync(await fs.readFile(output));
 assert.equal(!!archive.file('dist/main.js'),true);
 assert.equal(!!archive.file('src/main.js'),false);
 assert.equal(!!archive.file('library.json'),true);
}));
test('compilation impossible si le manifeste référence un fichier absent',()=>tmp(async dir=>{
 await fs.writeFile(path.join(dir,'library.json'),JSON.stringify(manifest));
 await assert.rejects(Packer.collectBuiltLibrary(dir),/absentes/i);
}));
test('l’interface dispose des actions de snapshots et du workflow de recettes',async()=>{
 const preload=await fs.readFile(path.join(__dirname,'../electron/preload.cjs'),'utf8');
 const app=await fs.readFile(path.join(__dirname,'../assets/app.js'),'utf8');
 const workflow=await fs.readFile(path.join(__dirname,'../.github/workflows/build-h5p-libraries.yml'),'utf8');
 assert.match(preload,/catalogSnapshot/);assert.match(app,/Examiner cette révision/);
 assert.match(workflow,/build-recipes\.cjs/);assert.match(workflow,/upload-artifact/);
});
