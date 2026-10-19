'use strict';
/* Build-time-only upstream vendor fetch. Pinned Git SHA, no runtime internet.
 * Only one unchanged official JavaScript widget is included in this milestone.
 */
const fs=require('node:fs');const fsp=fs.promises;
const path=require('node:path');const https=require('node:https');const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const vendor=path.join(root,'assets','vendor');
const upstream='53dc7bdc57b17f5a0d55a8871a36d1b1bd631e70';
const asset='h5peditor-text.js';
const url=`https://raw.githubusercontent.com/h5p/h5p-editor-php-library/${upstream}/scripts/${asset}`;
const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');
async function fetchHttps(link,redirects=0){
 if(redirects>3)throw Error('Trop de redirections HTTPS.');
 return new Promise((resolve,reject)=>{
  const req=https.get(link,{timeout:20000,headers:{'User-Agent':'H5PStudio-build/0.6.2'}},response=>{
    if([301,302,307,308].includes(response.statusCode)){
      const next=new URL(response.headers.location,link);
      response.resume();if(next.protocol!=='https:'||!['raw.githubusercontent.com'].includes(next.hostname))reject(Error('Redirection non autorisée.'));
      else fetchHttps(next.href,redirects+1).then(resolve,reject);
      return;
    }
    if(response.statusCode!==200){response.resume();reject(Error('Source H5P HTTP '+response.statusCode));return;}
    let size=0;const chunks=[];
    response.on('data',part=>{size+=part.length;if(size>100000){req.destroy(Error('Widget H5P trop volumineux.'));return;}chunks.push(part);});
    response.on('end',()=>resolve(Buffer.concat(chunks)));
    response.on('error',reject);
  });
  req.on('timeout',()=>req.destroy(Error('Délai de téléchargement H5P dépassé.')));
  req.on('error',reject);
 });
}
async function prepare({download=fetchHttps,modules=path.join(root,'node_modules')}={}){
 const jq=path.join(modules,'jquery','dist','jquery.min.js');
 const license=path.join(modules,'jquery','LICENSE.txt');
 const jqBytes=await fsp.readFile(jq).catch(()=>{throw Error('jQuery 3.7.1 absent : lancez npm install sur GitHub Actions.');});
 if(!jqBytes.toString('utf8',0,140).includes('jQuery v3.7.1'))throw Error('Version de jQuery non vérifiée.');
 const copyright=await fsp.readFile(license);
 const existing=path.join(vendor,asset);
 let official=await fsp.readFile(existing).catch(()=>null);
 if(!official||!valid(official))official=await download(url);
 if(!valid(official))throw Error('La source téléchargée ne correspond pas au widget texte officiel attendu.');
 await fsp.mkdir(vendor,{recursive:true});
 await fsp.writeFile(existing,official);
 await fsp.writeFile(path.join(vendor,'jquery.min.js'),jqBytes);
 await fsp.writeFile(path.join(vendor,'LICENSE-jQuery.txt'),copyright);
 const manifest={component:'H5PEditor.Text',scope:'widget-uniquement',repository:'h5p/h5p-editor-php-library',commit:upstream,
  officialFile:'scripts/'+asset,officialSha256:sha256(official),jqueryVersion:'3.7.1',jquerySha256:sha256(jqBytes),
  downloadedAt:new Date().toISOString()};
 await fsp.writeFile(path.join(vendor,'provenance.json'),JSON.stringify(manifest,null,2)+'\n');
 return manifest;
}
function valid(bytes){
 const script=bytes.toString('utf8');
 return bytes.length>1000&&bytes.length<100000&&script.includes('ns.Text = function')&&script.includes('ns.widgets.text = ns.Text');
}
if(require.main===module)prepare().then(x=>console.log(`Widget officiel préparé : ${x.commit}, SHA256 ${x.officialSha256}`)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={prepare,valid,sha256,upstream,url};
