'use strict';
const fs=require('node:fs');const fsp=fs.promises;const path=require('node:path');
const http=require('node:http');const os=require('node:os');const crypto=require('node:crypto');
const ZIP=require('../assets/jszip.min.js');
const {pathWithin}=require('./player-manager.cjs');
const MAX_ARCHIVE=300*1024*1024;const MAX_FILES=5500;const MAX_EXPANDED=950*1024*1024;
const STRIP=new Set(['INSTALLER-LECTEUR.cmd','PREVISUALISER.cmd','GUIDE-PREVISUALISATION.txt','player/AJOUTER-LECTEUR-ICI.txt','scripts/install-player.ps1','scripts/serve.ps1']);
function assertSafeFile(name){
 if(!name||name.startsWith('/')||name.includes('\\')||/^[A-Za-z]:/.test(name)||/[\u0000-\u001f]/.test(name)||name.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Chemin ZIP non autorisé : '+name);
}
async function readSourceZip(bytes) {
 if(!bytes || bytes.length>MAX_ARCHIVE)throw Error('Archive trop volumineuse.');
 const zip=await ZIP.loadAsync(bytes,{checkCRC32:true});let expanded=0,count=0;
 for(const [name,f] of Object.entries(zip.files)){
  if(f.dir)continue;
  assertSafeFile(name);if(++count>MAX_FILES)throw Error('Nombre excessif de fichiers ZIP.');
  const size=f._data&&f._data.uncompressedSize;
  if(typeof size==='number')expanded+=size;
  if(expanded>MAX_EXPANDED)throw Error('Contenu ZIP décompressé excessif.');
 }
 if(!zip.file('index.html')||!zip.file('h5p.json'))throw Error('Le site généré est incomplet.');
 for(const x of STRIP)zip.remove(x);
 return zip;
}
async function visitFiles(root,cb,rel=''){
 for(const item of await fsp.readdir(path.join(root,rel),{withFileTypes:true})){
  if(item.isSymbolicLink())continue;
  const name=rel ? rel+'/'+item.name:item.name;
  if(item.isDirectory())await visitFiles(root,cb,name);
  else if(item.isFile())await cb(name,path.join(root,name));
 }
}
async function assembleZip(raw,playerDir) {
 const z=await readSourceZip(raw);
 z.remove('player');
 await visitFiles(playerDir,async(rel,absolute)=>{
  assertSafeFile(rel);z.file('player/'+rel,await fsp.readFile(absolute));
 });
 z.file('LIRE-AVANT-OUVERTURE.txt',
  'SITE H5P STATIQUE\n\nCe ZIP contient un site HTML multifichier.\n'+
  'Il doit etre publie sur un serveur HTTP(S), notamment via la ressource Fichier de Moodle.\n'+
  'Ne pas ouvrir index.html directement avec un navigateur depuis un disque (file://) :\n'+
  'les navigateurs bloquent les requetes JSON necessaires au lecteur H5P.\n'+
  'Pour verifier le rendu avant publication, utiliser la previsualisation integree H5P Studio.\n');
 const manifest=JSON.parse(await z.file('studio-manifest.json').async('string'));
 manifest.generatorVersion='0.3.4';
 manifest.runtime.included=true;manifest.runtime.downloadRequired=false;
 manifest.limitations=['Exécution locale testée manuellement selon le contenu','Compatibilité avec Moodle à valider sur votre instance'];
 z.file('studio-manifest.json',JSON.stringify(manifest,null,2));
 return z;
}
async function exportStaticZip(raw,playerDir,target) {
 const z=await assembleZip(raw,playerDir);
 const bytes=await z.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
 await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.writeFile(target,bytes);
 return {path:target,size:bytes.length};
}
async function extractPreview(raw,playerDir,target) {
 const z=await readSourceZip(raw);
 await fsp.mkdir(target,{recursive:true});
 const entries=Object.entries(z.files).filter(([name,f])=>!f.dir);
 for(let i=0;i<entries.length;i+=12){
  await Promise.all(entries.slice(i,i+12).map(async([name,f])=>{
   const out=pathWithin(target,name);await fsp.mkdir(path.dirname(out),{recursive:true});
   await fsp.writeFile(out,await f.async('nodebuffer'));
  }));
 }
 const manifest=JSON.parse(await z.file('studio-manifest.json').async('string'));
 manifest.generatorVersion='0.3.4';manifest.runtime.included=true;manifest.runtime.downloadRequired=false;
 await fsp.writeFile(path.join(target,'studio-manifest.json'),JSON.stringify(manifest,null,2));
 // Fail before launching a broken preview when critical JSON is missing or HTML.
 for(const rel of ['h5p.json','content/content.json']){
  const jsonText=await fsp.readFile(path.join(target,rel),'utf8');
  try{JSON.parse(jsonText)}catch(e){throw Error('JSON invalide dans '+rel+' : '+e.message)}
 }
 return {folder:target,playerDir};
}
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.gif':'image/gif','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.pdf':'application/pdf','.vtt':'text/vtt'};
function startPreviewServer(site,opts={}) {
 let port=0;
 const server=http.createServer(async(req,res)=>{
  const requestHost=req.headers.host||'';
  if(requestHost!=='127.0.0.1:'+port){res.writeHead(403).end('Hôte refusé');return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  try {
   // HTTP requests for //h5p.json are still local paths, not protocol-relative URLs.
   // new URL('//h5p.json', base) would otherwise reinterpret h5p.json as a hostname
   // and serve index.html instead of the JSON metadata.
   if(typeof req.url!=='string'||!req.url.startsWith('/')||req.url.startsWith('/\\'))throw Error('Chemin HTTP invalide');
   const normalizedTarget=req.url.replace(/^\/+/, '/');
   const u=new URL(normalizedTarget,'http://127.0.0.1:'+port);
   const pathname=decodeURIComponent(u.pathname);
   if(pathname.includes('\\')||pathname.includes('\0')||/[\u0000-\u001f]/.test(pathname))throw Error('Chemin interdit');
   const relative=pathname.replace(/^\/+/, '')||'index.html';
   assertSafeFile(relative);
   const isPlayer=relative.startsWith('player/');
   const root=isPlayer?site.playerDir:site.folder;
   const local=isPlayer?relative.slice(7):relative;
   assertSafeFile(local);
   const file=pathWithin(root,local);
   const stat=await fsp.lstat(file);
   if(!stat.isFile()||stat.isSymbolicLink())throw Error('Fichier inaccessible');
   // Protect against symbolic links in parent segments too.
   let cursor=path.dirname(file);const rootResolved=path.resolve(root);
   while(cursor!==rootResolved){const s=await fsp.lstat(cursor);if(s.isSymbolicLink())throw Error('Lien non autorisé');cursor=path.dirname(cursor);}
   res.writeHead(200,{
    'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream',
    'Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':'http://127.0.0.1:'+port,
    'Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline' data:; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' data: blob:; media-src 'self' data: blob:; object-src 'none'"
   });
   if(req.method==='HEAD'){res.end();return;}
   fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch(e){res.writeHead(e.code==='ENOENT'?404:400,{'Content-Type':'text/plain; charset=utf-8'}).end('Fichier introuvable ou chemin interdit');}
 });
 return new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
   port=server.address().port;resolve({server,url:'http://127.0.0.1:'+port+'/'});
  });
 });
}
module.exports={readSourceZip,assembleZip,exportStaticZip,extractPreview,startPreviewServer,assertSafeFile};
