/* Studio 0.6.2. Contrat de transfert minimal pour le widget officiel H5PEditor.Text.
 * Aucun champ complexe n'est modifié. Compatible avec les tests Node sans DOM.
 */
(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.H5POfficialBridge=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  const MAX=4096;
  const safeName=name=>typeof name==='string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/.test(name) && !['__proto__','prototype','constructor'].includes(name);
  const object=x=>x!==null && typeof x==='object' && !Array.isArray(x);
  function eligible(field){
    return object(field) && safeName(field.name) && field.type==='text' &&
      // Rich text and all custom widgets require the actual full editor.
      (field.widget===undefined || field.widget==='text') &&
      (!Array.isArray(field.tags)||field.tags.length===0) &&
      (field.maxLength===undefined||(Number.isInteger(field.maxLength)&&field.maxLength>=1&&field.maxLength<=MAX)) &&
      (!field.regexp || (object(field.regexp) && typeof field.regexp.pattern==='string' && field.regexp.pattern.length<=256 &&
        (field.regexp.modifiers===undefined||/^[gimsuy]{0,6}$/.test(field.regexp.modifiers)))) &&
      (field.label===undefined || typeof field.label==='string') &&
      (field.description===undefined || typeof field.description==='string');
  }
  function fields(schema){return Array.isArray(schema)?schema.filter(eligible).slice(0,60):[];}
  function safeField(field){
    if(!eligible(field))throw Error('Champ non compatible avec ce widget officiel.');
    // Avoid arbitrary properties or multi-megabyte strings crossing the sandbox.
    return {name:field.name,type:'text',label:String(field.label||field.name).slice(0,500),
      optional:field.optional===true,maxLength:field.maxLength??255,
      placeholder:typeof field.placeholder==='string'?field.placeholder.slice(0,300):undefined,
      description:typeof field.description==='string'?field.description.slice(0,1500):undefined,
      regexp:field.regexp?{pattern:field.regexp.pattern,modifiers:field.regexp.modifiers||''}:undefined};
  }
  function validateChange(field,value,hasValue){
    if(!eligible(field))throw Error('Champ texte inconnu.');
    if(hasValue===false){
      if(field.optional!==true)throw Error('Le champ texte obligatoire ne peut pas être supprimé.');
      return undefined;
    }
    if(typeof value!=='string'||value.length>Math.min(field.maxLength??255,MAX)*6){
      // Escaping HTML entities can expand strings in the official widget.
      throw Error('Valeur trop longue ou incompatible.');
    }
    // The widget performs its own semantic validation before publishing changes.
    return value;
  }
  function updateContent(content,field,value,hasValue){
    if(!object(content))throw Error('Les paramètres de l’activité ne sont pas un objet.');
    const v=validateChange(field,value,hasValue);
    const copy=JSON.parse(JSON.stringify(content));
    if(hasValue===false) delete copy[field.name];
    else copy[field.name]=v;
    return copy;
  }
  function acceptableMessage(event,frame,nonce,type,origin){
    const data=event?.data;
    return typeof nonce==='string' && /^[a-f0-9]{32}$/.test(nonce) && !!frame && event.source===frame.contentWindow && (!origin||event.origin===origin) && object(data) &&
      data.type===type && data.protocol===1 && data.nonce===nonce;
  }
  return {fields,safeField,eligible,validateChange,updateContent,acceptableMessage,MAX};
});
