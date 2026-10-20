'use strict';
/* Explicit graphical smoke test. Runs on GitHub Actions Windows, not during npm test.
 * Exercises the real packaged upstream script in a BrowserWindow iframe.
 */
const {app,BrowserWindow,protocol,session}=require('electron');
const path=require('node:path');
const {SCHEME,ORIGIN,registerWidgetProtocol}=require('../runtime/editor-widget-protocol.cjs');
protocol.registerSchemesAsPrivileged([{scheme:SCHEME,privileges:{standard:true,secure:true}}]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=12000){
 const end=Date.now()+timeout;
 while(Date.now()<end){
  const result=await fn();
  if(result)return result;
  await sleep(170);
 }
 throw Error('Contrôle graphique : '+label+' non obtenu dans le délai prévu.');
}
(async()=>{
 const watchdog=setTimeout(()=>{console.error('TEST GRAPHIQUE ÉCHOUÉ : durée limite globale.');app.exit(1);},45000);
 let win;
 try{
  await app.whenReady();
  registerWidgetProtocol(session.defaultSession.protocol);
  win=new BrowserWindow({show:false,width:900,height:500,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  await win.loadFile(path.join(__dirname,'smoke-widget-host.html'));
  await until(()=>win.webContents.mainFrame.frames.some(x=>x.url.startsWith(ORIGIN+'/official-editor-host.html')),
    'cadre dédié');
  const probe='a'.repeat(32);
  const init='b'.repeat(32);
  const evalParent=code=>win.webContents.executeJavaScript(code);
  async function messages(){return evalParent('window.__smokeMessages');}
  await until(async()=>{
    await evalParent(`document.getElementById('widget').contentWindow.postMessage({type:'h5p-widget-probe',protocol:2,probe:'${probe}'},'${ORIGIN}')`);
    const status=(await messages()).find(x=>x.type==='h5p-widget-health'&&x.probe===probe);
    if(status?.status==='error')throw Error('Chargement des ressources : '+JSON.stringify(status));
    return status?.status==='ready';
  },'réponse de chargement du widget');
  await evalParent(`document.getElementById('widget').contentWindow.postMessage({type:'h5p-widget-init',protocol:1,nonce:'${init}',field:{name:'tryAgain',type:'text',label:'Réessayer',maxLength:255},value:'avant'},'${ORIGIN}')`);
  await until(async()=>{
    const rows=await messages();
    const error=rows.find(x=>x.nonce===init&&x.type==='h5p-widget-error');
    if(error)throw Error('Montage du widget : '+error.message);
    return rows.find(x=>x.nonce===init&&x.type==='h5p-widget-mounted');
  },'montage de H5PEditor.Text');
  const child=win.webContents.mainFrame.frames.find(x=>x.url.startsWith(ORIGIN+'/official-editor-host.html'));
  if(!child)throw Error('Le cadre a disparu.');
  const domResult=await child.executeJavaScript(`(() => {
    const input=document.querySelector('input.h5peditor-text');
    if(!input)return 'champ introuvable';
    input.value='changement GUI';
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return input.value;
  })()`);
  if(domResult!=='changement GUI')throw Error('Champ non modifiable : '+domResult);
  await until(async()=>(await messages()).find(x=>x.type==='h5p-widget-value'&&x.nonce===init&&x.hasValue===true&&x.value==='changement GUI'),
    'transmission de la valeur');
  console.log('TEST GRAPHIQUE RÉUSSI : scripts chargés, H5PEditor.Text affiché et valeur transmise.');
  clearTimeout(watchdog);win.close();app.exit(0);
 }catch(error){
  console.error('TEST GRAPHIQUE ÉCHOUÉ : '+(error?.stack||error));
  clearTimeout(watchdog);if(win&&!win.isDestroyed())win.close();
  app.exit(1);
 }
})();
