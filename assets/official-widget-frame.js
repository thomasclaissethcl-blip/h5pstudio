/* Sandbox transport. No IPC bridge, no network, and no reference to app state. */
(function(){
 'use strict';
 const parentWindow=window.parent;
 let nonce=null,instance=null,fieldName=null;
 const send=(type,extra={})=>parentWindow.postMessage({type,protocol:1,nonce,...extra},'*');
 window.addEventListener('message',event=>{
   if(event.source!==parentWindow)return;
   const data=event.data;
   if(!data||data.type!=='h5p-widget-init'||data.protocol!==1||
      typeof data.nonce!=='string'||!/^[a-f0-9]{32}$/.test(data.nonce))return;
   nonce=data.nonce;
   try{
     if(!window.H5PEditor?.widgets?.text)throw Error('Ressource officielle H5PEditor.Text absente du paquet Windows.');
     const f=data.field;
     if(!f||f.type!=='text'||typeof f.name!=='string'||!(/^[A-Za-z][\w-]{0,99}$/).test(f.name))throw Error('Champ invalide.');
     if(data.value!==undefined && (typeof data.value!=='string'||data.value.length>24576))throw Error('Valeur invalide.');
     fieldName=f.name;
     if(instance){instance.remove();instance=null;}
     const host=window.jQuery('#officialWidget');host.empty();
     instance=new window.H5PEditor.widgets.text(null,f,data.value,(field,value)=>{
       if(field.name!==fieldName)return;
       send('h5p-widget-value',value===undefined?{hasValue:false}:{hasValue:true,value});
     });
     instance.appendTo(host);
     send('h5p-widget-mounted',{widget:'H5PEditor.Text',fieldName});
   }catch(e){send('h5p-widget-error',{message:String(e.message||e).slice(0,300)});}
 });
 document.addEventListener('DOMContentLoaded',()=>send('h5p-widget-ready'));
})();
