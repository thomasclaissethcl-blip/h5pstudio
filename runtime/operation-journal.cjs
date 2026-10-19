'use strict';
// Bounded, local, append/update journal. No renderer-controlled file paths.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const MAX=120;
let queue=Promise.resolve();
const trim=(x,n=400)=>String(x??'').slice(0,n);
function serialize(root,fn){
 const next=queue.catch(()=>{}).then(()=>fn());queue=next.catch(()=>{});return next;
}
async function read(root){
 try{
  const raw=await fs.readFile(path.join(root,'operations.json'),'utf8');
  if(raw.length>300000)throw Error('Journal trop volumineux.');
  const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error('Format du journal invalide.');
  return rows.slice(-MAX).filter(x=>x&&typeof x==='object');
 }catch(e){if(e.code==='ENOENT')return [];throw e;}
}
async function write(root,rows){
 await fs.mkdir(root,{recursive:true});
 const target=path.join(root,'operations.json');
 const tmp=path.join(root,'.operations-'+crypto.randomUUID()+'.json');
 try{await fs.writeFile(tmp,JSON.stringify(rows.slice(-MAX),null,2),{flag:'wx'});await fs.rename(tmp,target);}
 finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
}
async function begin(root,{type,repo,reference,description}){
 const id=crypto.randomUUID();
 const record={id,type:trim(type,40),repo:trim(repo,120),reference:trim(reference,100),description:trim(description,180),
  status:'running',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),message:'Opération lancée',snapshotId:null};
 await serialize(root,async()=>{const entries=await read(root);entries.push(record);await write(root,entries);});
 return id;
}
async function finish(root,id,{status,message,snapshotId}={}){
 if(!['success','error'].includes(status))throw Error('Statut de journal invalide.');
 return serialize(root,async()=>{
  const entries=await read(root),entry=entries.find(x=>x.id===id);
  if(!entry)throw Error('Opération inconnue.');
  entry.status=status;entry.message=trim(message,500);entry.updatedAt=new Date().toISOString();
  if(snapshotId&&/^[A-Za-z0-9_.-]{5,180}$/.test(snapshotId))entry.snapshotId=snapshotId;
  await write(root,entries);return entry;
 });
}
module.exports={read,begin,finish,MAX};
