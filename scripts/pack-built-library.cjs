'use strict';
/* Package an already built H5P library as a local REGISTRY IMPORT archive.
 * Do not call this .h5p: it is not a standalone activity package. */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const ZIP=require('../assets/jszip.min.js');
const MAX_FILES=2500,MAX_SIZE=180*1024*1024;
const blockedDirs=new Set(['.git','.github','node_modules','tests','test','src','coverage','.next','.cache']);
const blockedFiles=new Set(['package-lock.json','yarn.lock','pnpm-lock.yaml','.npmrc','.gitignore','.h5pignore']);
const allowedName=name=>!name.startsWith('.')&&!name.includes('\\')&&!name.includes('\0')&& !/^[A-Za-z]:/.test(name) && !name.split('/').includes('..');
async function collectBuiltLibrary(root){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'library.json'),'utf8'));
 if(!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(manifest.machineName||''))throw Error('library.json : machineName invalide.');
 const required=new Set(['library.json']);
 for(const field of ['preloadedJs','preloadedCss','editorJs','editorCss']){
  if(manifest[field]===undefined)continue;
  if(!Array.isArray(manifest[field]))throw Error(field+' invalide.');
  for(const entry of manifest[field]){
   const p=entry?.path;
   if(typeof p!=='string'||!allowedName(p)||p.startsWith('/'))throw Error('Chemin déclaré dangereux dans '+field);
   required.add(p);
  }
 }
 const zip=new ZIP(),listed=[],hash=crypto.createHash('sha256');let size=0;
 async function walk(dir,prefix=''){
  for(const e of await fs.readdir(dir,{withFileTypes:true})){
   if(e.isSymbolicLink())throw Error('Lien symbolique interdit : '+prefix+e.name);
   if(e.isDirectory()){
    if(blockedDirs.has(e.name))continue;
    await walk(path.join(dir,e.name),prefix+e.name+'/');continue;
   }
   if(!e.isFile()||blockedFiles.has(e.name)||!allowedName(prefix+e.name))continue;
   const name=prefix+e.name;
   const bytes=await fs.readFile(path.join(dir,e.name));size+=bytes.length;
   if(size>MAX_SIZE||listed.length>=MAX_FILES)throw Error('Bibliothèque trop volumineuse.');
   zip.file(name,bytes);listed.push(name);hash.update(name+'\0');hash.update(bytes);
  }
 }
 await walk(root);
 const missing=[...required].filter(x=>!listed.includes(x));
 if(missing.length)throw Error('Ressources requises absentes après build : '+missing.join(', '));
 return {zip,metadata:{machineName:manifest.machineName,version:[manifest.majorVersion,manifest.minorVersion,manifest.patchVersion].join('.'),files:listed.length,sha256:hash.digest('hex')}};
}
async function pack(source,target){
 const {zip,metadata}=await collectBuiltLibrary(path.resolve(source));
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
 await fs.mkdir(path.dirname(path.resolve(target)),{recursive:true});
 await fs.writeFile(target,bytes,{flag:'wx'});
 return metadata;
}
if(require.main===module){
 if(process.argv.length!==4){console.error('Usage : node scripts/pack-built-library.cjs <source-built> <output.zip>');process.exitCode=2;}
 else pack(process.argv[2],process.argv[3]).then(meta=>console.log(JSON.stringify(meta))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={collectBuiltLibrary,pack};
