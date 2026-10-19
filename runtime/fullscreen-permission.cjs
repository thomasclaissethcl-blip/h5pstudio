'use strict';
// Narrow permission policy: fullscreen of a local preview only, never automatic-fullscreen.
// Some H5P libraries use nested about:blank frames whose origin is inherited from
// the preview document. Allow about:blank only while our own preview is active.
function fullscreenAllowed({permission,previewUrl,isAppWindow,requestingUrl}) {
 if(permission!=='fullscreen'||!isAppWindow||!previewUrl)return false;
 let p;
 try{p=new URL(previewUrl);}catch{return false;}
 if(p.protocol!=='http:'||p.hostname!=='127.0.0.1'||!p.port)return false;
 if(!requestingUrl||requestingUrl==='about:blank')return true;
 try{
  const u=new URL(requestingUrl);
  return u.origin===p.origin;
 }catch{return false;}
}
module.exports={fullscreenAllowed};
