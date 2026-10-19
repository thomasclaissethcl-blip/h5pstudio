'use strict';
/* Metadata-only discovery. HTTPS requests are restricted to GitHub's public
 * REST API; downloads only use known release asset URLs, not source archives. */
const https=require('node:https');
const Sources=require('./update-sources.cjs');
const MAX_METADATA=3*1024*1024;
const MAX_PACKAGE=250*1024*1024;
const SOURCE_HOSTS=new Set(['codeload.github.com']);
const DOWNLOAD_HOSTS=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
function getBuffer(url,{limit=MAX_METADATA,timeout=16000,allowedHosts=new Set(['api.github.com']),redirects=0,headers={}}={}){
 return new Promise((resolve,reject)=>{
  let parsed;try{parsed=new URL(url);}catch{return reject(Error('Adresse incorrecte.'));}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!allowedHosts.has(parsed.hostname.toLowerCase()))return reject(Error('Adresse de téléchargement non autorisée : '+parsed.hostname));
  const req=https.get(parsed,{headers:{'User-Agent':'H5P-Studio-Portable/0.5.0','Accept':'application/vnd.github+json',...headers},timeout},res=>{
   const status=res.statusCode||0;
   if([301,302,303,307,308].includes(status)){
    const next=res.headers.location;res.resume();
    if(redirects>=4||!next)return reject(Error('Trop de redirections.'));
    return resolve(getBuffer(new URL(next,parsed).toString(),{limit,timeout,allowedHosts,redirects:redirects+1,headers}));
   }
   if(status!==200){res.resume();return reject(Error(`GitHub : HTTP ${status}`+(status===403?' (quota API ou autorisation limitée)':'')));}
   if(Number(res.headers['content-length']||0)>limit){res.destroy();return reject(Error('Réponse trop volumineuse.'));}
   const chunks=[];let size=0;res.on('data',chunk=>{
    size+=chunk.length;if(size>limit){res.destroy();reject(Error('Téléchargement supérieur à la limite autorisée.'));return;}
    chunks.push(chunk);
   });res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
  });req.on('timeout',()=>req.destroy(Error('Connexion expirée.')));req.on('error',reject);
 });
}
async function apiJson(route,request=getBuffer){
 const raw=await request('https://api.github.com'+route,{limit:MAX_METADATA,allowedHosts:new Set(['api.github.com'])});
 try{return JSON.parse(raw.toString('utf8'));}catch{throw Error('Réponse GitHub JSON invalide.');}
}
function releaseAssets(releases){
 const all=[];for(const r of Array.isArray(releases)?releases:[]){
  if(r.draft)continue;
  for(const a of r.assets||[]){
   if(!/\.(?:h5p|zip)$/i.test(a.name||'')||!Number.isSafeInteger(a.id))continue;
   if(!Number.isFinite(a.size)||a.size<1||a.size>MAX_PACKAGE)continue;
   let u;try{u=new URL(a.browser_download_url);}catch{continue;}
   if(u.protocol!=='https:'||u.hostname.toLowerCase()!=='github.com')continue;
   all.push({id:a.id,name:String(a.name).slice(0,180),bytes:a.size,tag:String(r.tag_name||'').slice(0,100),url:u.toString(),prerelease:Boolean(r.prerelease),publishedAt:r.published_at||null});
  }
 }
 return all.slice(0,40);
}
async function checkRepo(repo,request=apiJson){
 const normalized=Sources.canonical(repo);const p='/repos/'+normalized;
 // Individual request errors are isolated so that a repository without
 // releases can still expose recent tags and development commits.
 const [releases,tags,commits]=await Promise.allSettled([
  request(p+'/releases?per_page=8'),request(p+'/tags?per_page=8'),request(p+'/commits?per_page=1')
 ]);
 const r=releases.status==='fulfilled'&&Array.isArray(releases.value)?releases.value:[];
 const t=tags.status==='fulfilled'&&Array.isArray(tags.value)?tags.value:[];
 const c=commits.status==='fulfilled'&&Array.isArray(commits.value)?commits.value:[];
 const errors=[];
 for(const [type,obj] of [['releases',releases],['tags',tags],['commits',commits]])if(obj.status==='rejected')errors.push(type+' : '+String(obj.reason?.message||obj.reason).slice(0,180));
 if(errors.length===3)throw Error('Source inaccessible : '+errors.join(' ; '));
 const stable=r.find(x=>!x.draft&&!x.prerelease)||null;
 const newest=r.find(x=>!x.draft)||null;
 const commit=c[0]||null;
 return {repo:normalized,checkedAt:new Date().toISOString(),stable:stable?{tag:stable.tag_name,date:stable.published_at}:null,
  latestRelease:newest?{tag:newest.tag_name,date:newest.published_at,prerelease:!!newest.prerelease}:null,
  tags:t.filter(x=>typeof x.name==='string').map(x=>x.name).slice(0,8),
  tagRefs:t.filter(x=>typeof x.name==='string'&&/^[a-f0-9]{40}$/i.test(x.commit?.sha||'')).map(x=>({tag:x.name,sha:x.commit.sha})).slice(0,8),
  latestCommit:commit?.sha?{sha:commit.sha,date:commit.commit?.committer?.date||null}:null,
  assets:releaseAssets(r),errors};
}
async function downloadAsset(asset,request=getBuffer){
 if(!asset||!Number.isSafeInteger(asset.id)||!/^https:\/\/github\.com\//i.test(asset.url||''))throw Error('Fichier de release invalide.');
 if(!/\.(h5p|zip)$/i.test(asset.name)||asset.bytes>MAX_PACKAGE)throw Error('Format de paquet non autorisé.');
 const bytes=await request(asset.url,{limit:MAX_PACKAGE,timeout:60000,allowedHosts:DOWNLOAD_HOSTS,
  headers:{'Accept':'application/octet-stream'}});
 if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('Ce fichier de release n’est pas une archive ZIP/H5P valide.');
 return bytes;
}
async function downloadSource(repo,sha,request=getBuffer){
 const normalized=Sources.canonical(repo);
 if(!/^[a-f0-9]{40}$/i.test(sha||''))throw Error('Révision Git non résolue.');
 const url='https://codeload.github.com/'+normalized+'/zip/'+sha.toLowerCase();
 const bytes=await request(url,{limit:80*1024*1024,timeout:60000,allowedHosts:SOURCE_HOSTS,headers:{'Accept':'application/zip'}});
 if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('Archive GitHub invalide.');
 return bytes;
}
module.exports={getBuffer,apiJson,releaseAssets,checkRepo,downloadAsset,downloadSource,DOWNLOAD_HOSTS,SOURCE_HOSTS};
