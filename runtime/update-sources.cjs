'use strict';
/* Source preferences contain no executable payload. GitHub repositories are
 * explicit and do not grant trust to downloaded library code. */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const REPO=/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/;
const CORE=[
 {repo:'h5p/h5p-php-library',kind:'core-view',label:'H5P Core : lecture',official:true},
 {repo:'h5p/h5p-editor-php-library',kind:'core-editor',label:'H5P Core : édition',official:true},
 {repo:'h5p/h5p-hub-client',kind:'hub-client',label:'H5P Hub client',official:true}
];
const KINDS=new Set(['library','core-view','core-editor','hub-client']);
function canonical(repo){
 if(typeof repo!=='string')throw Error('Dépôt GitHub invalide. Utilisez propriétaire/dépôt.');
 let s=repo.trim();
 if(/^https:\/\/github\.com\//i.test(s))s=s.replace(/^https:\/\/github\.com\//i,'').replace(/\.git\/?$/i,'').replace(/\/$/,'');
 if(!REPO.test(s)||s.includes('..'))throw Error('Dépôt invalide. Format accepté : propriétaire/dépôt, sans chemin supplémentaire.');
 return s;
}
const key=repo=>canonical(repo).toLowerCase();
const dataFile=root=>path.join(root,'github-sources.json');
async function readSources(root){
 let rows=[];
 try{
  const s=await fs.readFile(dataFile(root),'utf8');
  if(s.length>300000)throw Error('Catalogue de sources trop volumineux.');
  const j=JSON.parse(s);if(!Array.isArray(j))throw Error('Catalogue de sources endommagé.');rows=j;
 }catch(e){if(e.code!=='ENOENT')throw e;}
 const official=CORE.map(s=>({...s,id:key(s.repo)}));
 const seen=new Set(official.map(s=>s.id));
 const cleaned=[];
 for(const s of rows){
  try{
   const id=key(s.repo);
   if(seen.has(id)||!KINDS.has(s.kind))continue;
   seen.add(id);cleaned.push({repo:canonical(s.repo),kind:s.kind,label:String(s.label||s.repo).slice(0,100),official:false,id});
  }catch{}
 }
 return [...official,...cleaned];
}
async function save(root,list){
 await fs.mkdir(root,{recursive:true});
 const file=dataFile(root),temp=path.join(root,'.sources-'+crypto.randomUUID()+'.json');
 try{
  await fs.writeFile(temp,JSON.stringify(list.filter(s=>!s.official).map(({repo,kind,label})=>({repo,kind,label})),null,2),'utf8');
  await fs.rename(temp,file);
 }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
}
async function addSource(root,repo,kind='library'){
 const normalized=canonical(repo),id=key(normalized);
 if(!KINDS.has(kind)||kind!=='library')throw Error('Les sources personnalisées doivent être des dépôts de bibliothèques.');
 const existing=await readSources(root);
 if(existing.some(s=>s.id===id))return {existing:true,sources:existing};
 if(existing.length>=40)throw Error('40 sources au maximum.');
 const rows=[...existing,{repo:normalized,kind:'library',label:normalized,official:false,id}];
 await save(root,rows);
 return {existing:false,sources:rows};
}
async function removeSource(root,repo){
 const id=key(repo),rows=await readSources(root);
 if(rows.some(s=>s.id===id&&s.official))throw Error('Les sources officielles restent référencées.');
 await save(root,rows.filter(s=>s.id!==id));
 return readSources(root);
}
module.exports={CORE,canonical,key,readSources,addSource,removeSource};
