'use strict';
/* Read-only assessment of an installed H5P library graph. It never modifies
 * original content, installed libraries, editor assets or export options. */
const validDep=require('./library-registry.cjs').normalizeDep;
const api=(v)=>v&&Number.isSafeInteger(v.majorVersion)&&Number.isSafeInteger(v.minorVersion)&&v.majorVersion>=0&&v.minorVersion>=0?{majorVersion:v.majorVersion,minorVersion:v.minorVersion}:null;
const key=d=>`${d.machineName}@${d.majorVersion}.${d.minorVersion}`;
const ver=x=>`${x.majorVersion}.${x.minorVersion}.${x.patchVersion}`;
const cmp=(a,b)=>a.majorVersion-b.majorVersion||a.minorVersion-b.minorVersion;
function assess({libraries,roots,choices={},coreApi=null,includeEditor=false}={}) {
 if(!Array.isArray(libraries)||!Array.isArray(roots)||!choices||typeof choices!=='object'||Array.isArray(choices))throw Error('Paramètres de résolution invalides.');
 const installed=libraries.filter(x=>x&&typeof x.machineName==='string'&&Number.isInteger(x.majorVersion)&&Number.isInteger(x.minorVersion)&&Number.isInteger(x.patchVersion)&&typeof x.id==='string');
 const problems=[],requirements=[],selected=new Map(),seen=new Set(),queue=[],rootInvalid=[];
 for(const [i,r] of roots.entries()){
  const d=validDep(r);
  if(!d)rootInvalid.push({index:i,reason:'Déclaration de dépendance invalide'});
  else queue.push({...d,via:'h5p.json',kind:'direct'});
 }
 const requirementsByName=new Map();
 while(queue.length){
  if(requirements.length>2500){problems.push({code:'limit',reason:'Trop de dépendances à analyser'});break;}
  const current=queue.shift();const requirement=key(current);
  requirements.push(current);
  const previous=requirementsByName.get(current.machineName);
  if(previous&&previous!==requirement){
   problems.push({code:'version-conflict',library:current.machineName,required:requirement,existing:previous,via:current.via});
   continue;
  }
  requirementsByName.set(current.machineName,requirement);
  if(seen.has(requirement))continue;
  seen.add(requirement);
  const eligible=installed.filter(x=>x.machineName===current.machineName && x.majorVersion===current.majorVersion&&x.minorVersion===current.minorVersion);
  if(!eligible.length){problems.push({code:'missing',library:current.machineName,required:requirement,via:current.via});continue;}
  const chosenId=Object.prototype.hasOwnProperty.call(choices,current.machineName)?choices[current.machineName]:null;
  let chosen;
  if(chosenId){
   chosen=eligible.find(x=>x.id===chosenId);
   if(!chosen){problems.push({code:'preference-incompatible',library:current.machineName,required:requirement,chosenId});continue;}
  }else{
   const patch=Math.max(...eligible.map(x=>x.patchVersion));
   const highest=eligible.filter(x=>x.patchVersion===patch);
   if(highest.length>1){problems.push({code:'ambiguous-variant',library:current.machineName,required:requirement,patchVersion:patch,variants:highest.map(x=>x.id)});continue;}
   chosen=highest[0];
  }
  selected.set(current.machineName,chosen);
  for(const d of chosen.dependencies||[]){
   if(!d||(!includeEditor&&d.kind==='editorDependencies'))continue;
   const dep=validDep(d);
   if(!dep){problems.push({code:'invalid-library-dependency',library:chosen.machineName,kind:d?.kind||'?'});continue;}
   queue.push({...dep,via:`${chosen.machineName} ${ver(chosen)}`,kind:d.kind||'preloadedDependencies'});
  }
  for(const w of chosen.warnings||[])problems.push({code:'manifest-warning',library:chosen.machineName,reason:w});
 }
 if(rootInvalid.length)problems.push(...rootInvalid.map(x=>({...x,code:'invalid-root'})));
 let requiredApi={majorVersion:1,minorVersion:0};
 for(const lib of selected.values()){
  const requirement=api(lib.coreApi)||{majorVersion:1,minorVersion:0};
  if(cmp(requirement,requiredApi)>0)requiredApi=requirement;
 }
 const actualCore=api(coreApi);
 const coreStatus=actualCore===null?'non-certifie':cmp(requiredApi,actualCore)>0?'insuffisant':'compatible-sur-api-declaree';
 if(coreStatus==='insuffisant')problems.push({code:'core-too-old',requiredApi,actualCore});
 // No claim of runtime compatibility even when the declared core API is met.
 return {status:problems.length?'incomplet':coreStatus==='non-certifie'?'non-certifie':'controle-statique-satisfait',
  coreStatus,requiredApi,actualCore,selection:[...selected.values()].map(x=>({id:x.id,machineName:x.machineName,version:ver(x),sha256:x.sha256,origin:x.origin})),
  requirements,problems,rootCount:roots.length,includeEditor};
}
module.exports={assess};
