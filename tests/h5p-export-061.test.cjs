'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const ZIP=require('../assets/jszip.min.js');
const Archive=require('../assets/h5p-core.js');
const {fileName,zipBuffer,saveH5pFile}=require('../runtime/h5p-file-export.cjs');
async function bytes(){
 const z=new ZIP();z.file('h5p.json',JSON.stringify({title:'Bingo Test',mainLibrary:'H5P.Bingo',preloadedDependencies:[]}));z.file('content/content.json','{}');
 return z.generateAsync({type:'uint8array'});
}
async function tempDir(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'h5p-export-'));try{return await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('le nom suggéré conserve .h5p et neutralise les chemins fournis par le rendu',()=>{
 assert.equal(fileName('Éléments + Bingo.h5p'),'Elements - Bingo.h5p');
 assert.equal(fileName('../../a.h5p'),'a.h5p');
 assert.equal(fileName('..\\..\\x.h5p'),'x.h5p');
});
test('le navigateur de fichiers est présenté et la confirmation contient le vrai chemin enregistré',()=>tempDir(async dir=>{
 const input=await bytes();let opts=null;
 const result=await saveH5pFile({bytes:input,requestedName:'Bingo.h5p',defaultDir:dir,
  showSaveDialog:async options=>{opts=options;return {filePath:path.join(dir,'Activité 1')}}});
 assert.equal(opts.filters[0].extensions[0],'h5p');
 assert.equal(path.basename(opts.defaultPath),'Bingo.h5p');
 assert.deepEqual({ok:result.ok,size:result.size},{ok:true,size:input.length});
 assert.equal(result.path,path.join(dir,'Activité 1.h5p'));
 const stored=await fs.readFile(result.path);
 const zip=await ZIP.loadAsync(stored);
 assert.ok(zip.file('h5p.json'));assert.ok(zip.file('content/content.json'));
}));
test('annulation du sélecteur ne crée aucun fichier ni résultat de succès',()=>tempDir(async dir=>{
 const result=await saveH5pFile({bytes:await bytes(),requestedName:'Bingo',defaultDir:dir,
  showSaveDialog:async()=>({canceled:true})});
 assert.deepEqual(result,{cancelled:true});assert.deepEqual(await fs.readdir(dir),[]);
}));
test('une erreur d écriture est remontée au lieu d annoncer un export terminé',()=>tempDir(async dir=>{
 await assert.rejects(saveH5pFile({bytes:await bytes(),requestedName:'Bingo',defaultDir:dir,
  showSaveDialog:async()=>({filePath:path.join(dir,'no-write.h5p')}),
  writeFile:async()=>{throw new Error('DISQUE_PLEIN');}}),/DISQUE_PLEIN/);
}));
test('une écriture tronquée ne peut pas être qualifiée de réussite',()=>tempDir(async dir=>{
 await assert.rejects(saveH5pFile({bytes:await bytes(),requestedName:'Bingo',defaultDir:dir,
  showSaveDialog:async()=>({filePath:path.join(dir,'partial.h5p')}),
  writeFile:async(p,d)=>fs.writeFile(p,d.subarray(0,20))}),/incomplet/);
}));
test('les fichiers qui ne sont pas des ZIP et les archives sans données sont rejetés',async()=>{
 assert.throws(()=>zipBuffer(new Uint8Array(101)),/Archive H5P/);
 assert.throws(()=>zipBuffer(new Uint8Array(0)),/Archive H5P/);
});
test('un seul bouton Enregistrer sous .h5p est présenté et l interface attend la réponse Electron',()=>{
 const html=require('node:fs').readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const js=require('node:fs').readFileSync(path.join(__dirname,'..','assets/app.js'),'utf8');
 const main=require('node:fs').readFileSync(path.join(__dirname,'..','electron/main.cjs'),'utf8');
 const preload=require('node:fs').readFileSync(path.join(__dirname,'..','electron/preload.cjs'),'utf8');
 assert.equal((html.match(/id="saveBtn"/g)||[]).length,1);
 assert.doesNotMatch(html,/id="visualSaveBtn"/);
 assert.match(html,/id="revealH5pBtn"/);
 assert.match(js,/await window\.studioDesktop\.saveH5p/);
 assert.match(preload,/desktop:save-h5p/);
 assert.match(main,/ipcMain\.handle\('desktop:save-h5p'/);
 assert.match(main,/event\.preventDefault\(\)/);
});
