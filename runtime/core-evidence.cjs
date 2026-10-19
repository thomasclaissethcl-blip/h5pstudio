'use strict';
/* Standalone release version is NOT an attestation of the H5P Core API. */
const fs=require('node:fs/promises');
const path=require('node:path');
async function evidence({playerVersion,bundledDir,cacheDir}={}){
 let origin=null;
 for(const dir of [bundledDir,cacheDir].filter(Boolean)){
  try{
   const raw=await fs.readFile(path.join(dir,'runtime-source.json'),'utf8');
   if(raw.length>8192)continue;
   const json=JSON.parse(raw);
   if(json?.name==='h5p-standalone'&&json.version===playerVersion){
    origin={package:json.name,version:json.version,sha512:typeof json.sha512==='string'?json.sha512:null,
     source:typeof json.source==='string'?json.source:null,location:dir===bundledDir?'embarqué':'cache'};
    break;
   }
  }catch{}
 }
 return {playerName:'h5p-standalone',playerVersion,origin,
  coreApi:null,apiStatus:'non-certifiee',
  explanation:'La version du lecteur ne prouve pas la version de l’API H5P Core embarquée. Une vérification de provenance du cœur ou des tests ciblés est nécessaire.'};
}
module.exports={evidence};
