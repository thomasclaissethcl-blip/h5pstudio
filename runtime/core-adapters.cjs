'use strict';
// Adapter readiness is deliberately conservative. Downloaded source != installed core.
const fs=require('node:fs/promises');
const path=require('node:path');
const {CORE}=require('./update-sources.cjs');
const ids=new Set(CORE.filter(x=>x.kind==='core-view'||x.kind==='core-editor').map(x=>x.repo.toLowerCase()));
async function inspect(snapshotRoot){
 const results=[];let dirs=[];
 try{dirs=await fs.readdir(snapshotRoot,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return results;throw e;}
 for(const d of dirs){
  if(!d.isDirectory()||d.name.startsWith('.'))continue;
  try{
   const raw=await fs.readFile(path.join(snapshotRoot,d.name,'manifest.json'),'utf8');
   if(raw.length>15000)continue;
   const m=JSON.parse(raw);
   if(!ids.has(String(m.repo||'').toLowerCase())||!/^[a-f\d]{40}$/i.test(m.commit||''))continue;
   results.push({repo:m.repo,commit:m.commit,downloadedAt:m.checkedAt||null,sha256:m.sha256||null,
    sourceSaved:true,adapterAvailable:false,apiCertified:false,status:'source-only',
    reason:'Source conservée, mais aucun adaptateur validé pour l’activer. Le moteur actuel reste inchangé.'});
  }catch{/* An unreadable record is not an installed core. */}
 }
 return results.sort((a,b)=>String(b.downloadedAt).localeCompare(String(a.downloadedAt))).slice(0,30);
}
module.exports={inspect};
