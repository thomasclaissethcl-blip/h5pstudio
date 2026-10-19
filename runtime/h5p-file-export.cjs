'use strict';
// Pure, testable save orchestration. The Electron shell/UI are injected by main.cjs.
// A renderer-side browser download is not evidence that a file was saved.
const path=require('node:path');
const fsp=require('node:fs/promises');
const MAX_H5P=300*1024*1024;
function fileName(value){
 const leaf=String(value||'activite').replace(/\\/g,'/').split('/').pop().replace(/\.h5p$/i,'');
 const safe=leaf.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w.\- ]/g,'-').replace(/^[.\- ]+|[.\- ]+$/g,'').slice(0,90)||'activite';
 return safe+'.h5p';
}
function zipBuffer(bytes){
 if(!(bytes instanceof Uint8Array)&&!Array.isArray(bytes))throw Error('Données H5P incorrectes.');
 const data=Buffer.from(bytes);
 if(data.length<100||data.length>MAX_H5P||data.subarray(0,4).toString('latin1')!=='PK\x03\x04')throw Error('Archive H5P absente, corrompue ou trop volumineuse.');
 return data;
}
async function saveH5pFile({bytes,requestedName,defaultDir,showSaveDialog,writeFile=fsp.writeFile,stat=fsp.stat,mkdir=fsp.mkdir}){
 const data=zipBuffer(bytes);
 if(typeof showSaveDialog!=='function')throw Error('Sélecteur de fichier indisponible.');
 await mkdir(defaultDir,{recursive:true});
 const choice=await showSaveDialog({
  title:'Enregistrer l’activité H5P',
  defaultPath:path.join(defaultDir,fileName(requestedName)),
  buttonLabel:'Enregistrer le fichier H5P',
  filters:[{name:'Activités H5P',extensions:['h5p']}],
  properties:['showOverwriteConfirmation']
 });
 if(choice?.canceled||!choice?.filePath)return {cancelled:true};
 const dest=/\.h5p$/i.test(choice.filePath)?choice.filePath:choice.filePath+'.h5p';
 await writeFile(dest,data);
 const result=await stat(dest);
 if(!result.isFile()||result.size!==data.length)throw Error('L’enregistrement du fichier H5P est incomplet.');
 return {ok:true,name:path.basename(dest),path:dest,size:result.size};
}
module.exports={fileName,zipBuffer,saveH5pFile};
