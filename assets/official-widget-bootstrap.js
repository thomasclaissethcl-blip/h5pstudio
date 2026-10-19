/* Minimal H5PEditor host API, limited to the upstream H5PEditor.Text widget.
 * Not the H5PEditor engine, nor an implementation of H5PFrameworkInterface.
 */
(function(){
  'use strict';
  const $=window.jQuery;
  if(!$)throw Error('jQuery manquant dans le composant H5P officiel.');
  const ns=window.ns=window.H5PEditor={$: $,widgets:{}};
  window.H5P={trim:value=>String(value??'').trim()};
  const html=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  ns.htmlspecialchars=value=>String(value).replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#039;').replace(/"/g,'&quot;');
  ns.getNextFieldId=()=> 'official-field';
  ns.getDescriptionId=id=>id+'-description';
  ns.createText=(value,maxLength,placeholder,id,describedby)=>
    `<input class="h5peditor-text" type="text" id="${html(id)}" maxlength="${maxLength??255}"`+
      (describedby?` aria-describedby="${html(describedby)}"`:'')+
      ` value="${value===undefined?'':html(value)}" placeholder="${html(placeholder||'')}" />`;
  ns.createFieldMarkup=(field,input,id)=>
    `<div class="h5peditor-field"><label for="${html(id)}">${html(field.label||field.name)}${field.optional?'':' *'}</label>`+
    input+(field.description?`<p id="${html(ns.getDescriptionId(id))}">${html(field.description)}</p>`:'')+
    `<div class="h5p-errors" aria-live="polite"></div></div>`;
  ns.t=(_scope,key,vars)=>{
    const names={requiredProperty:'Ce champ est obligatoire.',textField:'texte',tooLong:'Texte trop long (limite : :max).',invalidFormat:'Format de texte invalide.'};
    let result=names[key]||key;
    for(const [k,v] of Object.entries(vars||{}))result=result.replaceAll(k,String(v));
    return result;
  };
  ns.createError=message=>$('<span/>',{class:'h5peditor-error'}).text(message);
  ns.checkErrors=($errors,$input,value)=>{
    if($errors.children().length){
      $input.one('input',()=>{$errors.empty();$input.removeClass('error');});
      return false;
    }
    return value;
  };
})();
