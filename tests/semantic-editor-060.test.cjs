'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ZIP=require('../assets/jszip.min.js');
const Archive=require('../assets/h5p-core.js');
const Visual=require('../assets/semantic-editor.js');
async function fixture(opts={}) {
 const zip=new ZIP();
 const dep={machineName:'H5P.TrueFalse',majorVersion:1,minorVersion:8};
 zip.file('h5p.json',JSON.stringify({title:'Ancien titre',language:'fr',mainLibrary:'H5P.TrueFalse',embedTypes:['div'],preloadedDependencies:[dep]}));
 zip.file('content/content.json',JSON.stringify({question:'<p>Avant</p>',correct:'true',score:5,extra:{keep:'value'}, answers:['un']}));
 zip.file('H5P.TrueFalse-1.8/library.json',JSON.stringify({machineName:'H5P.TrueFalse',majorVersion:1,minorVersion:8,patchVersion:0}));
 if(!opts.omitSemantics)zip.file('H5P.TrueFalse-1.8/semantics.json',JSON.stringify(opts.fields||[
  {name:'question',type:'text',label:'Question',tags:['p','strong']},
  {name:'correct',type:'select',label:'Réponse correcte',options:[{label:'Vrai',value:'true'},{label:'Faux',value:'false'}]},
  {name:'score',type:'number',label:'Score',min:0,max:10},
  {name:'answers',type:'list',label:'Réponses',field:{type:'text'},min:0,max:4},
  {name:'extra',type:'group',label:'Plus',fields:[{name:'keep',type:'text',label:'Conserver'}]},
  {name:'media',type:'file',label:'Média'}
 ]));
 zip.file('content/images/a.bin',Uint8Array.from([1,3,7,9]));
 if(opts.duplicate){
  zip.file('H5P.TrueFalse-1.7/library.json',JSON.stringify({machineName:'H5P.TrueFalse',majorVersion:1,minorVersion:7,patchVersion:5}));
  zip.file('H5P.TrueFalse-1.7/semantics.json','[{"name":"other","type":"text"}]');
 }
 return Archive.openArchive(await zip.generateAsync({type:'uint8array'}),ZIP);
}
test('charge le schéma correspondant exactement à la dépendance active (versions parallèles)',async()=>{
 const project=await fixture({duplicate:true});
 const schema=await Visual.readSemantics(project);
 assert.equal(schema.available,true);
 assert.equal(schema.version,'1.8.0');
 assert.deepEqual(Visual.statistics(schema.fields),{supported:5,unsupported:1});
});
test('absence de semantics : repli explicite en JSON, aucune prétention de formulaire',async()=>{
 const schema=await Visual.readSemantics(await fixture({omitSemantics:true}));
 assert.equal(schema.available,false);
 assert.match(schema.reason,/semantics\.json/);
});
test('édition immuable : les champs inconnus et les médias survivent à export et réouverture',async()=>{
 const project=await fixture();
 let c=Visual.updated(project.content,['question'],'<p>Après</p>');
 c=Visual.updated(c,['correct'],'false');
 c=Visual.updated(c,['extra','keep'],'nouveau');
 assert.equal(project.content.question,'<p>Avant</p>');
 assert.equal(c.correct,'false');assert.equal(c.extra.keep,'nouveau');
 assert.deepEqual(c.answers,['un']);
 const blob=await Archive.saveArchive(project,JSON.stringify({...project.metadata,title:'Nouveau titre'}),JSON.stringify(c));
 const after=await Archive.openArchive(new Uint8Array(await blob.arrayBuffer()),ZIP);
 assert.deepEqual(after.content.extra,{keep:'nouveau'});
 assert.equal(after.metadata.title,'Nouveau titre');
 assert.deepEqual([...await after.zip.file('content/images/a.bin').async('uint8array')],[1,3,7,9]);
 assert.equal(after.content.question,'<p>Après</p>');
});
test('liste guidée : ajouter ou supprimer sans modifier la source importée',async()=>{
 const p=await fixture();const sch=await Visual.readSemantics(p);
 const f=sch.fields.find(x=>x.name==='answers');
 const plus=Visual.addItem(p.content,['answers'],f);
 assert.deepEqual(plus.answers,['un','']);assert.deepEqual(p.content.answers,['un']);
 assert.deepEqual(Visual.removeItem(plus,['answers'],0,f).answers,['']);
 assert.throws(()=>Visual.removeItem(plus,['answers'],99,f),/introuvable/);
 assert.throws(()=>Visual.addItem({...p.content,answers:['1','2','3','4']},['answers'],f),/maximal/);
});
test('ne permet aucune pollution du prototype par champs ou chemins de schéma',()=>{
 assert.throws(()=>Visual.normalizeFields([{name:'__proto__',type:'text'}]),/incorrect/);
 assert.throws(()=>Visual.updated({},['__proto__','polluted'],true),/autorisé/);
 assert.equal({}.polluted,undefined);
 assert.throws(()=>Visual.normalizeFields([{name:'a',type:'group',fields:[{name:'constructor',type:'text'}]}]),/incorrect/);
});
test('les champs complexes restent non modifiables, les valeurs par défaut sont définies',()=>{
 const schema=Visual.normalizeFields([{name:'library',type:'library'}, {name:'list',type:'list',field:{type:'library'}}]);
 assert.equal(Visual.statistics(schema).unsupported,2);
 assert.deepEqual(Visual.defaultValue({type:'group'}),{});
 assert.equal(Visual.defaultValue({type:'boolean'}),false);
});
test('limites de taille et de profondeur des schemas',()=>{
 assert.throws(()=>Visual.normalizeFields(Array.from({length:501},(_,i)=>({name:'field'+i,type:'text'}))),/trop volumineux/);
 let f={name:'leaf',type:'text'};
 for(let i=0;i<14;i++)f={name:'group'+i,type:'group',fields:[f]};
 assert.throws(()=>Visual.normalizeFields([f]),/incompatible/);
});
test('formulaire et prévisualisation partagent les données courantes dans l’interface',()=>{
 const fs=require('node:fs'), path=require('node:path');const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
 assert.match(html,/data-panel="visuel"/);
 assert.match(html,/id="returnEditBtn"/);
 assert.match(html,/assets\/semantic-editor\.js/);
 assert.match(app,/studioDesktop\.preview\(await siteBytes\(\)\)/);
 assert.match(app,/contentJson'\)\.value=JSON\.stringify\(next/);
});
class FakeElement {
 constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.classList={add:(v)=>{this.className=(this.className||'')+' '+v;}};this.textContent='';this.value='';this.disabled=false;}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 addEventListener(name,fn){this.listeners[name]=fn;}
 querySelector(cls){const search=(node)=>{if((node.className||'').split(' ').includes(cls.slice(1)))return node;for(const c of node.children){const f=search(c);if(f)return f;}return null;};return search(this);}
 find(tag){if(this.tagName===tag)return this;for(const c of this.children){const x=c.find(tag);if(x)return x;}return null;}
 findAll(tag){return [...(this.tagName===tag?[this]:[]),...this.children.flatMap(x=>x.findAll(tag))];}
}
test('le formulaire émet une mise à jour au changement de texte sans perdre les champs inconnus',()=>{
 const fields=Visual.normalizeFields([{name:'question',type:'text',label:'Question'},{name:'unsupported',type:'image'}]);
 const host=new FakeElement('div');
 let value={question:'Avant',inconnue:{foo:'bar'}};
 Visual.render({createElement:tag=>new FakeElement(tag)},host,fields,value,next=>{value=next;},err=>{throw err;});
 const control=host.find('textarea');
 assert.ok(control);control.value='Après';control.listeners.input();
 assert.equal(value.question,'Après');assert.deepEqual(value.inconnue,{foo:'bar'});
 assert.equal(host.findAll('textarea').length,1);
});
test('une sélection conserve le type natif des valeurs du schéma',()=>{
 const fields=Visual.normalizeFields([{name:'correct',type:'select',label:'Correct',options:[{value:true,label:'Vrai'},{value:false,label:'Faux'}]}]);
 const host=new FakeElement('div');let value={correct:true};
 Visual.render({createElement:tag=>new FakeElement(tag)},host,fields,value,next=>{value=next;});
 const select=host.find('select');assert.ok(select);select.value='false';select.listeners.change();
 assert.equal(value.correct,false);
});
