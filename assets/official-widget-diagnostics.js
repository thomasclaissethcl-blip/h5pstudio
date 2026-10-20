/* Loads before all vendor resources, to report failed scripts without any dependency. */
(function(){
 'use strict';
 const parentWindow=window.parent;
 const failures=[];
 const safe=value=>String(value||'inconnue').slice(0,240);
 function record(stage,message){
   if(failures.length>=5)return;
   failures.push({stage:safe(stage),message:safe(message)});
 }
 window.addEventListener('error',event=>{
   const resource=event.target && event.target!==window && event.target.src;
   if(resource){record('ressource',resource.split('/').pop()+' non chargée');return;}
   record('script',event.message||'Erreur JavaScript non identifiée');
 },true);
 window.addEventListener('unhandledrejection',event=>record('promesse',event.reason?.message||event.reason));
 window.addEventListener('securitypolicyviolation',event=>record('sécurité',event.violatedDirective));
 window.addEventListener('message',event=>{
   if(event.source!==parentWindow)return;
   const data=event.data;
   if(!data||data.type!=='h5p-widget-probe'||data.protocol!==2||
      typeof data.probe!=='string'||!(/^[a-f0-9]{32}$/).test(data.probe))return;
   const loaded=typeof window.H5PEditor?.widgets?.text==='function' &&
     !!window.jQuery && window.__officialFrameBooted===true;
   const complete=document.readyState==='complete';
   const status=loaded?'ready':complete?'error':'loading';
   const missing=[];
   if(!window.jQuery)missing.push('jquery.min.js');
   if(!window.H5PEditor)missing.push('official-widget-bootstrap.js');
   if(typeof window.H5PEditor?.widgets?.text!=='function')missing.push('h5peditor-text.js');
   if(!window.__officialFrameBooted)missing.push('official-widget-frame.js');
   parentWindow.postMessage({type:'h5p-widget-health',protocol:2,probe:data.probe,
     status,missing,failures:failures.slice(0,5)},'*');
 });
})();
