/* H5P Studio 0.6.0: limited, data-preserving semantics form.
 * Not the official H5P Editor. Unsupported semantics are NEVER rewritten.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.H5PSemanticEditor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_SCHEMA_BYTES = 1024 * 1024;
  const MAX_FIELDS = 500;
  const MAX_DEPTH = 12;
  const MAX_LIST = 100;
  const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
  const PRIMITIVE = new Set(['text', 'number', 'boolean', 'select']);
  const VALID_TYPES = new Set([...PRIMITIVE, 'group', 'list']);
  const own = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  function safeKey(k) { return typeof k === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(k) && !FORBIDDEN.has(k); }
  function plainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function schemaFields(value) { return Array.isArray(value) && value.every(x => plainObject(x)) ? value : null; }
  function normalizeFields(fields, depth=0, counter={count:0}) {
    if (depth > MAX_DEPTH || !schemaFields(fields)) throw Error('Structure de champs H5P incompatible.');
    return fields.map(f => {
      counter.count++;
      if (counter.count > MAX_FIELDS) throw Error('Schéma H5P trop volumineux pour cet éditeur.');
      if (!safeKey(f.name) || typeof f.type !== 'string') throw Error('Champ de bibliothèque incorrect ou non sûr.');
      const result={...f, _supported:VALID_TYPES.has(f.type)};
      if (f.type === 'group') {
        if (!schemaFields(f.fields)) result._supported=false;
        else result.fields=normalizeFields(f.fields,depth+1,counter);
      }
      if (f.type === 'list') {
        if (!plainObject(f.field) || typeof f.field.type !== 'string') result._supported=false;
        else {
          // List items do not always have a name. Add a safe internal name only.
          const inner={...f.field,name:safeKey(f.field.name)?f.field.name:'item'};
          result.field=normalizeFields([inner],depth+1,counter)[0];
          if (!result.field._supported || inner.type === 'list') result._supported=false;
        }
      }
      if (f.type === 'select' && !Array.isArray(f.options)) result._supported=false;
      return result;
    });
  }
  function textLabel(field) { return typeof field.label === 'string' && field.label.trim() ? field.label : field.name; }
  function defaultValue(f) {
    if (own(f,'default')) return clone(f.default);
    if (f.type==='text') return '';
    if (f.type==='number') return 0;
    if (f.type==='boolean') return false;
    if (f.type==='select') return f.options?.[0]?.value ?? '';
    if (f.type==='group') return {};
    if (f.type==='list') return [];
    return null;
  }
  function at(root,path){let v=root;for(const k of path){if(v==null||!own(v,k))return undefined;v=v[k];}return v;}
  function updated(root,path,value) {
    if(!plainObject(root)||!Array.isArray(path)||!path.length||path.length>MAX_DEPTH*3)throw Error('Chemin de champ invalide.');
    const result=clone(root); let item=result;
    path.forEach((key,i)=>{
      if(typeof key === 'string' ? !safeKey(key) : !Number.isSafeInteger(key)||key<0)throw Error('Chemin non autorisé.');
      if(Array.isArray(item)){if(typeof key!=='number'||key>=item.length)throw Error('Index introuvable.');}
      else if(!plainObject(item)||typeof key!=='string')throw Error('Chemin incompatible.');
      if(i===path.length-1){item[key]=value;return;}
      const next=path[i+1];
      if(item[key]===undefined)item[key]=typeof next==='number'?[]:{};
      if(!plainObject(item[key])&&!Array.isArray(item[key]))throw Error('Contenu incompatible avec le champ.');
      item=item[key];
    });
    return result;
  }
  function addItem(root,path,field) {
    const arr=at(root,path); if(arr!==undefined&&!Array.isArray(arr))throw Error('Cette liste H5P n’est pas valide.');
    const list=arr?clone(arr):[];
    const maximum=Number.isInteger(field.max)?Math.min(field.max,MAX_LIST):MAX_LIST;
    if(list.length>=maximum)throw Error('Nombre maximal d’éléments atteint.');
    list.push(defaultValue(field.field));return updated(root,path,list);
  }
  function removeItem(root,path,index,field){
    const arr=at(root,path);if(!Array.isArray(arr)||index<0||index>=arr.length)throw Error('Élément introuvable.');
    const min=Number.isInteger(field.min)?Math.max(0,field.min):0;
    if(arr.length<=min)throw Error('Nombre minimal d’éléments atteint.');
    const list=clone(arr);list.splice(index,1);return updated(root,path,list);
  }
  async function readSemantics(project) {
    if(!project?.zip||!Array.isArray(project.libraries))throw Error('Aucune activité importée.');
    const main=project.metadata?.mainLibrary;
    const candidates=project.libraries.filter(x=>x.machineName===main && typeof x._folder==='string');
    const roots=Array.isArray(project.metadata?.preloadedDependencies)?project.metadata.preloadedDependencies:[];
    const declared=roots.find(x=>x?.machineName===main);
    const matches=declared?candidates.filter(x=>Number(x.majorVersion)===Number(declared.majorVersion)&&Number(x.minorVersion)===Number(declared.minorVersion)):candidates;
    if(matches.length!==1)return {available:false,reason:matches.length?'Plusieurs versions possibles de la bibliothèque principale. Utilisez le JSON avancé.':'Bibliothèque principale ou version déclarée introuvable dans l’archive.'};
    const lib=matches[0];
    const entry=project.zip.file(lib._folder+'/semantics.json');
    if(!entry)return {available:false,reason:'Cette archive ne contient pas le fichier semantics.json de la bibliothèque principale.'};
    const size=entry._data?.uncompressedSize;
    if(typeof size==='number' && size>MAX_SCHEMA_BYTES)throw Error('Semantics H5P trop volumineuses.');
    const raw=await entry.async('string');
    if(new TextEncoder().encode(raw).byteLength>MAX_SCHEMA_BYTES)throw Error('Semantics H5P trop volumineuses.');
    let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('Le fichier semantics.json est invalide.');}
    const fields=normalizeFields(parsed);
    return {available:true,library:lib.machineName,version:`${lib.majorVersion}.${lib.minorVersion}.${lib.patchVersion||0}`,fields};
  }
  function statistics(fields) {
    let supported=0,unsupported=0;
    function walk(fs){for(const f of fs){if(!f._supported){unsupported++;continue;}if(f.type==='group')walk(f.fields);else {supported++;if(f.type==='list'&&f.field.type==='group')walk(f.field.fields);}}}
    walk(fields);return {supported,unsupported};
  }
  function render(document, host, fields, sourceContent, onChange, onError) {
    if(!host||!document)throw Error('Conteneur de formulaire manquant.');
    let content=sourceContent;
    host.replaceChildren();
    const node=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!=null)el.textContent=String(txt);return el;};
    const fail=e=>{if(typeof onError==='function')onError(e);};
    const mutate=(path,value,redraw)=>{
      try{const next=updated(content,path,value);onChange(next);content=next;if(redraw)render(document,host,fields,content,onChange,onError);}
      catch(e){fail(e);}
    };
    const listMutate=(path,f,method,index)=>{
      try{const next=method==='add'?addItem(content,path,f):removeItem(content,path,index,f);
        onChange(next);content=next;render(document,host,fields,content,onChange,onError);}
      catch(e){fail(e);}
    };
    function draw(fs,parent,path,depth) {
      if(depth>MAX_DEPTH){parent.append(node('p','form-note','Profondeur maximale atteinte.'));return;}
      fs.forEach(f=>{
        const loc=[...path,f.name];
        const section=node('div','semantic-field');
        const label=node('label','semantic-label',textLabel(f));section.append(label);
        if(!f._supported){section.append(node('p','form-note','Ce champ nécessite l’éditeur H5P complet. Ses données sont conservées, sans modification.'));parent.append(section);return;}
        const val=at(content,loc);
        if(f.type==='group'){
          const group=node('fieldset','semantic-group');const legend=node('legend',null,textLabel(f));group.append(legend);
          // Avoid moving structural children into an invalid label.
          section.replaceChildren();
          if(val!==undefined&&!plainObject(val)){group.append(node('p','form-note','Structure de groupe non reconnue : contenu conservé.'));}
          else draw(f.fields,group,loc,depth+1);
          section.append(group);
        } else if(f.type==='list'){
          if(val!==undefined&&!Array.isArray(val))section.append(node('p','form-note','Structure de liste non reconnue : contenu conservé.'));
          else {
            const items=Array.isArray(val)?val:[];
            items.slice(0,MAX_LIST).forEach((v,i)=>{
              const item=node('fieldset','semantic-group');item.append(node('legend',null,`${textLabel(f)} ${i+1}`));
              if(f.field.type==='group') {
                if(plainObject(v))draw(f.field.fields,item,[...loc,i],depth+1);
                else item.append(node('p','form-note','Élément complexe non reconnu : valeur conservée.'));
              } else {
                const proxy={...f.field,name:String(i)};
                drawListItem(item,proxy,[...loc,i],v);
              }
              const del=node('button','secondary semantic-small','Supprimer cet élément');del.type='button';
              del.disabled=items.length<=(Number.isInteger(f.min)?f.min:0);
              del.addEventListener('click',()=>listMutate(loc,f,'remove',i));item.append(del);section.append(item);
            });
            if(items.length>MAX_LIST)section.append(node('p','form-note','Liste trop longue : affichage limité.'));
            const add=node('button','secondary semantic-small','Ajouter un élément');add.type='button';
            add.disabled=items.length>=Math.min(Number.isInteger(f.max)?f.max:MAX_LIST,MAX_LIST);
            add.addEventListener('click',()=>listMutate(loc,f,'add'));section.append(add);
          }
        } else drawListItem(section,f,loc,val);
        parent.append(section);
      });
    }
    function drawListItem(section,f,loc,val){
      let ctrl;const label=section.querySelector?.('.semantic-label');
      if(f.type==='boolean'){
        ctrl=node('input');ctrl.type='checkbox';ctrl.checked=val===undefined?Boolean(defaultValue(f)):Boolean(val);
        ctrl.addEventListener('change',()=>mutate(loc,ctrl.checked,false));
      }else if(f.type==='select'){
        ctrl=node('select');const options=f.options||[];
        for(const x of options){if(!plainObject(x)||!own(x,'value'))continue;
          const opt=node('option',null,typeof x.label==='string'?x.label:String(x.value));
          opt.value=String(x.value);ctrl.append(opt);
        }
        const current=val===undefined?defaultValue(f):val;
        ctrl.value=String(current);
        ctrl.addEventListener('change',()=>{
          const match=options.find(x=>String(x.value)===ctrl.value);if(match)mutate(loc,match.value,false);
        });
      }else if(f.type==='number'){
        ctrl=node('input');ctrl.type='number';
        if(typeof f.min==='number')ctrl.min=String(f.min);if(typeof f.max==='number')ctrl.max=String(f.max);
        if(typeof f.step==='number'&&f.step>0)ctrl.step=String(f.step);
        ctrl.value=val===undefined?'':String(val);
        ctrl.addEventListener('change',()=>{
          if(ctrl.value===''){fail(Error('Veuillez saisir un nombre ou utiliser les données avancées.'));return;}
          const n=Number(ctrl.value);if(!Number.isFinite(n)||!ctrl.checkValidity()){fail(Error('Nombre invalide pour '+textLabel(f)));return;}
          mutate(loc,n,false);
        });
      }else if(f.type==='text'){
        const rich=Array.isArray(f.tags)&&f.tags.length>0;
        ctrl=node('textarea');ctrl.rows=rich?5:3;ctrl.value=val===undefined?'':String(val);
        if(rich)section.append(node('p','form-note','Texte enrichi : les éventuelles balises HTML sont affichées telles quelles. Aucun formatage n’est modifié automatiquement.'));
        ctrl.addEventListener('input',()=>mutate(loc,ctrl.value,false));
      }
      if(ctrl){ctrl.classList.add('semantic-control');section.append(ctrl);}
      if(typeof f.description==='string'&&f.description.length<1500)section.append(node('p','form-note',f.description));
    }
    draw(fields,host,[],0);
    return {fieldCount:statistics(fields)};
  }
  return {readSemantics,normalizeFields,statistics,defaultValue,at,updated,addItem,removeItem,render,MAX_SCHEMA_BYTES};
});
