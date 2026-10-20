'use strict';
/* One dedicated origin for the experimental editor widget.
 * Never serve project content, data/, arbitrary paths or bundled scripts.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const SCHEME='h5p-widget';
const ORIGIN=SCHEME+'://editor';
const FILES=Object.freeze({
 '/official-editor-host.html':['assets/official-editor-host.html','text/html; charset=utf-8'],
 '/official-widget-diagnostics.js':['assets/official-widget-diagnostics.js','text/javascript; charset=utf-8'],
 '/official-widget-bootstrap.js':['assets/official-widget-bootstrap.js','text/javascript; charset=utf-8'],
 '/official-widget-frame.js':['assets/official-widget-frame.js','text/javascript; charset=utf-8'],
 '/vendor/jquery.min.js':['assets/vendor/jquery.min.js','text/javascript; charset=utf-8'],
 '/vendor/h5peditor-text.js':['assets/vendor/h5peditor-text.js','text/javascript; charset=utf-8']
});
function resolveWidgetRequest(raw){
 let u;
 try{u=new URL(raw);}catch{return null;}
 if(u.protocol!==SCHEME+':'||u.host!=='editor'||u.username||u.password||u.port||u.search||u.hash)return null;
 const entry=FILES[u.pathname];
 return entry?{relative:entry[0],contentType:entry[1]}:null;
}
function registerWidgetProtocol(protocol,{root=path.resolve(__dirname,'..')}={}){
 protocol.handle(SCHEME,async request=>{
   if(request.method!=='GET')return new Response('Méthode interdite',{status:405});
   const allowed=resolveWidgetRequest(request.url);
   if(!allowed)return new Response('Ressource non autorisée',{status:404});
   try{
     const payload=await fs.readFile(path.join(root,allowed.relative));
     return new Response(payload,{status:200,headers:{'Content-Type':allowed.contentType,
       'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }catch{return new Response('Ressource du widget absente',{status:404});}
 });
}
module.exports={SCHEME,ORIGIN,FILES,resolveWidgetRequest,registerWidgetProtocol};
