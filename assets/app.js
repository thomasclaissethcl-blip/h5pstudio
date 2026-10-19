(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let project = null;
  let filename = '';
  let active = 'contenu';
  let dirty = false;
  let lastValidated = false;
  let importBytes=null,projectId=null,registryRows=[],registryChoices={},lastImportLoaded=false;
  let semanticSchema=null,previousEditTab='contenu';
  function text(id, value) { $(id).textContent = value; }
  function showAlert(message, kind='info') {
    const box = $('message'); box.textContent = message; box.dataset.kind = kind; box.hidden = false;
  }
  function clearAlert() { $('message').hidden = true; }
  function loading(enabled) { $('importBtn').disabled = enabled; $('saveBtn').disabled = enabled || !project; $('staticBtn').disabled = enabled || !project; $('viewBtn').disabled = enabled || !project; }
  function markDirty() { dirty = true; lastValidated=false; text('changeStatus','Modifications non exportées'); $('changeStatus').className = 'dirty'; }
  function librariesTable(libs) {
    const tbody = $('librariesTable'); tbody.replaceChildren();
    if (!libs.length) { const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=4; td.textContent='Aucune bibliothèque intégrée'; tr.append(td); tbody.append(tr); return; }
    for (const lib of libs.sort((a,b)=>a.machineName.localeCompare(b.machineName))) {
      const tr = document.createElement('tr');
      const cells = [lib.machineName, `${lib.majorVersion}.${lib.minorVersion}.${lib.patchVersion ?? 0}`,
        lib.coreApi ? `${lib.coreApi.majorVersion}.${lib.coreApi.minorVersion}` : 'Non indiquée', lib._folder];
      for (const c of cells) { const td=document.createElement('td'); td.textContent=c; tr.append(td); }
      tbody.append(tr);
    }
  }
  function setTab(tab) {
    if (tab==='visuel' && project) drawVisualEditor();
    if (tab==='preview' && (active==='visuel'||active==='contenu'||active==='metadata')) previousEditTab=active;
    active=tab;
    document.querySelectorAll('[data-tab]').forEach(el => el.classList.toggle('selected', el.dataset.tab===tab));
    document.querySelectorAll('[data-panel]').forEach(el => el.hidden=el.dataset.panel!==tab);
  }
  function updateReport() {
    if (!project) return;
    const warnings=project.warnings;
    const lines=[
      `Fichier : ${filename}`,
      `Titre : ${project.metadata.title}`,
      `Type principal : ${project.metadata.mainLibrary}`,
      `Langue : ${project.metadata.language}`,
      `Dépendances déclarées : ${Array.isArray(project.metadata.preloadedDependencies) ? project.metadata.preloadedDependencies.length : "non fournies sous forme de liste"}`,
      `Dépendances reconnues : ${project.dependencyStats.recognized} ; rejetées : ${project.dependencyStats.rejected}`,
      `Déclarations avec versions en chaînes numériques (tolérées) : ${project.dependencyStats.toleratedStringEntries}`,
      `État de la vérification : ${project.dependencyStatus === 'complet' ? 'COMPLET (contrôle statique uniquement)' : project.dependencyStatus === 'partiel' ? 'PARTIEL' : 'INDÉTERMINÉ'}`,
      `Entrées dans le ZIP : ${project.scan.entryCount}`,
      `Bibliothèques présentes : ${project.libraries.length}`,
      `Dépendances manquantes ou non embarquées : ${project.dependencyStatus === 'complet' ? String(project.missing.length) : 'INDÉTERMINÉ ('+project.missing.length+' manquante(s) parmi les dépendances analysables)'}`,
      '',
      'AVERTISSEMENTS (sur le fichier importé) :',
      ...(warnings.length ? warnings.map(w=>' • '+w) : [' Aucun avertissement structurel détecté.']),
      '',
      'IMPORTANT : les versions textuelles sont tolérées pour l’analyse, sans validation formelle de leur conformité H5P.',
      'Le diagnostic vérifie la structure et les dépendances.',
      'Il ne garantit pas la compatibilité avec une version du cœur H5P.',
      'Aucun script du fichier importé n’est exécuté ici.'
    ];
    text('reportText',lines.join('\n'));
  }
  function updateValidation() {
    if (!project) return;
    try {
      const {metadata,warnings}=H5PArchive.validateEditing($('metadataJson').value,$('contentJson').value);
      text('editedTitle',metadata.title || '(sans titre)');
      if (warnings.length) showAlert('JSON valides, mais '+warnings.length+' anomalie(s) de structure dans h5p.json : '+warnings.join(' '), 'warning');
      else showAlert('JSON valides, principaux champs h5p.json cohérents. La conformité H5P complète n’est pas vérifiée.', 'success');
      lastValidated=true;
    } catch(e) { lastValidated=false; showAlert(e.message,'error'); }
  }
  // First milestone: semantic forms are not H5PEditor and never execute editor widgets.
  // The raw JSON textareas remain the single source of truth for content changes.
  function drawVisualEditor() {
    if(!project)return;
    $('visualTitle').value='';
    const status=$('visualStatus');
    const host=$('visualFields');host.replaceChildren();
    if(!semanticSchema?.available){
      status.textContent=semanticSchema?.reason||'Schéma indisponible : utilisez les données avancées.';
      return;
    }
    let content,metadata;
    try{
      metadata=JSON.parse($('metadataJson').value);
      content=JSON.parse($('contentJson').value);
      if(!content||typeof content!=='object'||Array.isArray(content))throw Error('Le contenu JSON doit être un objet.');
      if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw Error('Métadonnées JSON invalides.');
    }catch(e){status.textContent='Le JSON actuel est invalide : '+e.message+' Corrigez-le en mode avancé.';return;}
    $('visualTitle').value=String(metadata.title||'');
    const stats=H5PSemanticEditor.statistics(semanticSchema.fields);
    status.textContent=`Bibliothèque ${semanticSchema.library} ${semanticSchema.version}. ${stats.supported} champ(s) simples disponibles, ${stats.unsupported} structure(s) non gérée(s). Aucune migration ni changement de version.`;
    try{
      H5PSemanticEditor.render(document,host,semanticSchema.fields,content,next=>{
        $('contentJson').value=JSON.stringify(next,null,2);markDirty();
      },e=>showAlert(e.message||String(e),'error'));
    }catch(e){host.replaceChildren();showAlert('Formulaire H5P indisponible : '+(e.message||e),'error');}
  }
  async function loadVisualSchema() {
    semanticSchema=null;
    $('visualTab').disabled=true;
    try{
      semanticSchema=await H5PSemanticEditor.readSemantics(project);
      if(!semanticSchema.available){$('visualStatus').textContent=semanticSchema.reason;return false;}
      if(H5PSemanticEditor.statistics(semanticSchema.fields).supported===0){
        $('visualStatus').textContent='Cette bibliothèque ne contient pas de champs simples éditables.';return false;
      }
      $('visualTab').disabled=false;
      return true;
    }catch(e){$('visualStatus').textContent='Édition guidée indisponible : '+(e.message||e);return false;}
  }
  function changeVisualTitle() {
    if(!project)return;
    try{
      const value=$('visualTitle').value.trim();
      if(!value)throw Error('Le titre ne peut pas être vide.');
      const meta=JSON.parse($('metadataJson').value);
      meta.title=value;$('metadataJson').value=JSON.stringify(meta,null,2);
      text('editedTitle',value);markDirty();
    }catch(e){showAlert('Impossible de modifier le titre : '+(e.message||e),'error');}
  }
  async function importFile(file) {
    if (!file) return;
    if (!/\.h5p$/i.test(file.name)) return showAlert('Veuillez sélectionner une archive portant l’extension .h5p.', 'error');
    loading(true); clearAlert(); text('appStatus','Lecture et analyse en cours…');
    try {
      const bytes = await file.arrayBuffer();
      const obj = await H5PArchive.openArchive(bytes,window.JSZip);
      project=obj; filename=file.name;importBytes=new Uint8Array(bytes);
      try {
        if(window.crypto?.subtle){const sha=await window.crypto.subtle.digest('SHA-256',bytes);projectId=[...new Uint8Array(sha)].map(x=>x.toString(16).padStart(2,'0')).join('');}
        else if(window.studioDesktop?.registryFingerprint)projectId=await window.studioDesktop.registryFingerprint(importBytes);
        else projectId=null;
      }catch{projectId=null;}
      $('metadataJson').value=JSON.stringify(obj.metadata,null,2);
      $('contentJson').value=JSON.stringify(obj.content,null,2);
      text('currentFilename',file.name);
      text('editedTitle',obj.metadata.title);
      text('mainLibrary',obj.metadata.mainLibrary);
      text('libraryCount',String(obj.libraries.length));
      text('warningCount',String(obj.warnings.length));
      text('currentSize',(file.size/1024/1024).toFixed(2)+' Mo');
      text('appStatus', 'Archive ouverte. Édition guidée proposée lorsqu’un schéma compatible est inclus.');
      $('workspace').hidden=false; $('emptyState').hidden=true; $('previewTab').disabled=false; $('shortcutStatic').disabled=false;
      librariesTable(obj.libraries); updateReport();
      const visualReady=await loadVisualSchema();setTab(visualReady?'visuel':'contenu');
      $('registryFromCurrentBtn').disabled=!window.studioDesktop?.isDesktop;
      $('registryResolveBtn').disabled=!window.studioDesktop?.isDesktop;
      await refreshRegistry();
      dirty=false; lastValidated=false;
      text('changeStatus','Aucune modification exportée'); $('changeStatus').className='';
      if (obj.warnings.length) showAlert(`${obj.warnings.length} avertissement(s) détecté(s). Consultez l’onglet Diagnostic.`, 'warning');
      else showAlert('Archive lue correctement. Les fichiers non modifiés seront conservés lors de l’export.', 'success');
    } catch (err) { text('appStatus','Échec de lecture'); showAlert(err.message || String(err), 'error'); }
    finally { loading(false); $('fileInput').value=''; }
  }
  function saveBlob(blob, name) {
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }
  async function exportH5P() {
    if (!project) return;
    loading(true); text('appStatus','Création du fichier H5P…');
    try {
      const edited=H5PArchive.validateEditing($('metadataJson').value,$('contentJson').value);
      const blob=await H5PArchive.saveArchive(project,$('metadataJson').value,$('contentJson').value,
        progress => text('appStatus',`Création du fichier H5P : ${progress} %`));
      const output=H5PArchive.exportName(edited.metadata.title);
      saveBlob(blob,output);
      text('appStatus','Export terminé : '+output);
      dirty=false; lastValidated=true;
      text('changeStatus','Export effectué : '+output); $('changeStatus').className='';
      if (edited.warnings.length) showAlert('Archive exportée avec '+edited.warnings.length+' anomalie(s) H5P signalée(s). Métadonnées préservées sans correction automatique. Vérifiez l’archive dans un éditeur H5P.', 'warning');
      else showAlert('Archive H5P générée. Vérifiez son ouverture dans Lumi ou Logiquiz avant toute publication.', 'success');
    } catch(e) {text('appStatus','Échec de l’export'); showAlert(e.message||String(e),'error');}
    finally {loading(false);}
  }

  // Registry preferences are stored separately. A selected version NEVER
  // rewrites library.json, upgrades H5P content or changes HTML export in V0.5.21.
  function registryStatus(msg) { text('registryStatus',msg); }
  function option(select,value,label) {
    const el=document.createElement('option');el.value=value;el.textContent=label;select.append(el);
  }
  function registryVersions(){
    const name=$('registryLibrarySelect').value;
    const select=$('registryVersionSelect');select.replaceChildren();
    const rows=registryRows.filter(l=>l.machineName===name);
    if(!rows.length)option(select,'','Aucune version installée');
    else for(const l of rows){
      option(select,l.id,`${l.majorVersion}.${l.minorVersion}.${l.patchVersion} | ${l.origin} | ${l.sha256.slice(0,8)}`);
    }
    if(registryChoices[name] && rows.some(x=>x.id===registryChoices[name]))select.value=registryChoices[name];
    $('registrySelectBtn').disabled=!projectId||!rows.length;
    registryChoiceMessage();
  }
  function registryChoiceMessage(){
    const name=$('registryLibrarySelect').value;
    if(!project){text('registryChoiceStatus','Ouvrez un H5P pour associer une préférence à son empreinte SHA-256.');return;}
    if(!projectId){text('registryChoiceStatus','Empreinte de projet indisponible. Aucun choix ne peut être enregistré.');return;}
    text('registryChoiceStatus',registryChoices[name]
      ? 'Préférence enregistrée pour ce projet. Non appliquée à l’édition, à la prévisualisation ni aux exports.'
      : 'Aucune préférence enregistrée. Le contenu H5P conserve ses propres bibliothèques.');
  }
  function registryRender(){
    const table=$('registryTable');table.replaceChildren();
    text('registryCount',String(registryRows.length));
    const names=[...new Set(registryRows.map(x=>x.machineName))].sort();
    text('registryNames',String(names.length));
    if(!registryRows.length){
      const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='Registre vide : importez un paquet H5P ou les bibliothèques de votre activité.';tr.append(td);table.append(tr);
    }
    for(const lib of registryRows){
      const tr=document.createElement('tr');
      const cells=[lib.machineName,`${lib.majorVersion}.${lib.minorVersion}.${lib.patchVersion}`,
        `${lib.origin} : ${lib.sourceName}`,
        lib.coreApi?`${lib.coreApi.majorVersion}.${lib.coreApi.minorVersion}`:'Non précisée',
        lib.sha256.slice(0,12)];
      cells.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});table.append(tr);
    }
    const select=$('registryLibrarySelect'),old=select.value;select.replaceChildren();
    const projectNames=project?project.libraries.map(x=>x.machineName):[];
    const all=[...new Set([...projectNames,...names])].sort();
    if(!all.length)option(select,'','Aucune bibliothèque');
    else all.forEach(x=>option(select,x,x));
    if(all.includes(old))select.value=old;
    else if(project?.metadata?.mainLibrary && all.includes(project.metadata.mainLibrary))select.value=project.metadata.mainLibrary;
    registryVersions();
  }
  async function refreshRegistry(){
    if(!window.studioDesktop?.registryList){registryStatus('Le registre nécessite l’application Windows compilée.');return;}
    try{
      registryRows=await window.studioDesktop.registryList();
      if(!lastImportLoaded && window.studioDesktop.registryLastImport){
        lastImportLoaded=true;
        try{const previous=await window.studioDesktop.registryLastImport();if(previous)renderImportReport(previous);}
        catch(e){text('registryImportReport','Impossible de relire le dernier rapport : '+(e.message||e));}
      }
      if(window.studioDesktop.registryCoreEvidence){const e=await window.studioDesktop.registryCoreEvidence();text('coreEvidenceStatus',`Lecteur ${e.playerVersion}. API du cœur : NON CERTIFIÉE. Source : ${e.origin?.source || 'métadonnées de provenance indisponibles'}. ${e.explanation}`);}
      registryChoices=projectId?await window.studioDesktop.registryChoices(projectId):{};
      registryRender();registryStatus(`${registryRows.length} variante(s) dans le registre local. Aucune mise à jour automatique.`);
    }catch(e){registryStatus('Échec de lecture du registre : '+(e.message||e));}
  }
  function renderImportReport(result){
    const rows=result.outcomes||[];
    const summary=[
      ...(result.date?[`Date : ${result.date}`]:[]),
      ...(result.sourceName?[`Source : ${result.sourceName}`]:[]),
      `Manifests library.json trouvés : ${result.totalFound}`, 
      `Nouvelles installations : ${result.installed?.length ?? result.counts?.installed ?? 0}`,
      `Déjà présentes dans le registre : ${result.skipped?.length ?? result.counts?.alreadyInstalled ?? 0}`,
      `Rejets : ${result.errors?.length ?? result.counts?.rejected ?? 0}`,
      '',
      result.notice||'Le total du registre inclut les imports précédents.',
      ...(result.reportWarning?['Attention : '+result.reportWarning]:[]),
      '',
      ...rows.map(r=>`${r.status==='installed'?'INSTALLÉE':r.status==='already-installed'?'DÉJÀ PRÉSENTE':'REJETÉE'} | ${r.manifest} | ${r.library||'?'} ${r.version||''}${r.reason?' | '+r.reason:''}`)
    ];
    text('registryImportReport',summary.join('\n'));
  }
  async function resolveRegistry(){
    if(!project||!projectId||!window.studioDesktop?.registryResolve)return;
    text('registryResolveReport','Analyse des dépendances installées en cours…');
    try{
      const roots=project.metadata?.preloadedDependencies;
      if(!Array.isArray(roots))throw Error('Le h5p.json ne fournit pas de tableau preloadedDependencies.');
      const r=await window.studioDesktop.registryResolve(projectId,roots);
      const lines=[
        `État : ${r.status.toUpperCase()} (contrôle statique uniquement)`,
        `Dépendances directes déclarées : ${r.rootCount}`,
        `Bibliothèques résolues : ${r.selection.length}`,
        `Exigence d’API maximale identifiée : ${r.requiredApi.majorVersion}.${r.requiredApi.minorVersion}`,
        `API du cœur Standalone : ${r.coreStatus==='non-certifie'?'NON CERTIFIÉE':r.actualCore.majorVersion+'.'+r.actualCore.minorVersion}`,
        `Problèmes détectés : ${r.problems.length}`,
        '', 'BIBLIOTHÈQUES RÉSOLUES :',
        ...r.selection.map(x=>` • ${x.machineName} ${x.version} [${x.sha256?.slice(0,12)||'?'}] (${x.origin||'origine inconnue'})`),
        '', 'PROBLÈMES ET AMBIGUÏTÉS :',
        ...(r.problems.length?r.problems.map(x=>' • '+JSON.stringify(x)):[' Aucun dans le graphe statique.']),
        '', 'Aucune migration et aucune substitution de bibliothèques ne sont effectuées.',
        'Un contrôle statique ne garantit pas l’exécution de l’activité ni la compatibilité de son éditeur.'
      ];
      text('registryResolveReport',lines.join('\n'));
    }catch(e){text('registryResolveReport','Résolution impossible : '+(e.message||e));}
  }
  async function importCurrentLibraries(){
    if(!project||!importBytes)return;
    if(!confirm('Installer les bibliothèques de cette archive dans le registre local ? Elles peuvent inclure du code JavaScript de tiers. Aucune bibliothèque ne sera exécutée pendant l’import.'))return;
    $('registryFromCurrentBtn').disabled=true;
    registryStatus('Analyse et copie des bibliothèques en cours…');
    try{
      const result=await window.studioDesktop.registryImportOpen(importBytes,filename);
      registryStatus(`Manifests trouvés : ${result.totalFound}. Nouvelles : ${result.installed.length}. Déjà présentes : ${result.skipped.length}. Rejets : ${result.errors.length}.`);
      renderImportReport(result);
      await refreshRegistry();
      if(result.errors.length)showAlert('Certaines bibliothèques n’ont pas été enregistrées : '+result.errors.slice(0,3).map(x=>x.library+' : '+x.reason).join(' ; '),'warning');
      else showAlert('Bibliothèques ajoutées au registre sans modifier le H5P ouvert.','success');
      setTab('registry');
    }catch(e){registryStatus('Import impossible : '+(e.message||e));showAlert(e.message||String(e),'error');}
    finally{$('registryFromCurrentBtn').disabled=false;}
  }
  async function importLocalLibraries(){
    if(!window.studioDesktop?.registryImportLocal)return;
    if(!confirm('Importer des bibliothèques provenant d’un paquet local ? Leur code pourra être exécuté ultérieurement par un lecteur H5P. N’utilisez que des sources fiables.'))return;
    try{
      registryStatus('Analyse du paquet sélectionné…');
      const result=await window.studioDesktop.registryImportLocal();
      if(result.cancelled){registryStatus('Import annulé.');return;}
      renderImportReport(result);
      await refreshRegistry();
      registryStatus(`Manifests trouvés : ${result.totalFound}, nouvelles : ${result.installed.length}, déjà présentes : ${result.skipped.length}, rejets : ${result.errors.length}.`);
      if(result.errors.length)showAlert(result.errors.slice(0,3).map(x=>x.library+' : '+x.reason).join(' ; '),'warning');
    }catch(e){registryStatus('Import impossible : '+(e.message||e));showAlert(e.message||String(e),'error');}
  }
  async function storeChoice(){
    if(!projectId)return;
    try{
      const name=$('registryLibrarySelect').value,variant=$('registryVersionSelect').value;
      await window.studioDesktop.registrySelect(projectId,name,variant);
      registryChoices[name]=variant;registryChoiceMessage();
      showAlert('Préférence enregistrée pour ce projet. Les fichiers de l’activité ne sont pas modifiés.','success');
    }catch(e){showAlert(e.message||String(e),'error');}
  }
  function canPreview() {
    if (!project) return false;
    if (project.dependencyStatus !== 'complet' || project.missing.length) {
      setTab('report');
      showAlert('Lecture impossible : dépendances incomplètes ou manquantes. Consultez le diagnostic.', 'error');
      return false;
    }
    if (!window.studioDesktop?.isDesktop) {
      showAlert('La prévisualisation intégrée et l’export autonome nécessitent la version Electron de H5P Studio.', 'error');
      return false;
    }
    return true;
  }
  async function siteBytes() {
    const metadata=$('metadataJson').value, content=$('contentJson').value;
    const zip=await H5PStaticBuilder.build(project,metadata,content,window.JSZip,
      p=>text('previewStatus','Préparation des ressources : '+p+' %'));
    return new Uint8Array(await zip.arrayBuffer());
  }
  async function doPreview() {
    if (!canPreview()) return;
    loading(true);clearAlert();setTab('preview');
    text('previewStatus','Préparation du lecteur et de l’activité…');
    $('previewContainer').hidden=true;
    $('readerFallback').hidden=true;
    try {
      const result=await window.studioDesktop.preview(await siteBytes());
      const frame=$('previewFrame'); frame.src=result.url;
      $('previewContainer').hidden=false;
      text('previewStatus','Lecture intégrée initialisée. '+result.reader+'. Vérifiez les interactions.');
    } catch(e) {
      text('previewStatus','Prévisualisation impossible.');
      const reason=e.message||String(e);
      $('readerFallback').hidden=!/(?:lecteur|npm|téléchargement|réseau|network|fetch|incomplet)/i.test(reason);
      showAlert('Erreur du moteur de prévisualisation : '+reason, 'error');
    }finally{loading(false);}
  }
  async function exportStaticPreview() {
    if (!canPreview())return;
    loading(true);clearAlert();setTab('preview');
    $('readerFallback').hidden=true;
    text('previewStatus','Création du site HTML autonome avec lecteur embarqué…');
    try {
      const meta=H5PArchive.validateEditing($('metadataJson').value,$('contentJson').value);
      const result=await window.studioDesktop.export(await siteBytes(),meta.metadata.title);
      if(result.cancelled){text('previewStatus','Export annulé.');return;}
      text('previewStatus','ZIP enregistré : '+result.path);
      $('revealExportBtn').hidden=false;
      showAlert('ZIP HTML autonome enregistré : '+result.path+'  Cliquez sur « Afficher le ZIP » pour le retrouver.', 'success');
    }catch(e){
      const reason=e.message||String(e);
      text('previewStatus','Échec de génération');showAlert(reason,'error');
      $('readerFallback').hidden=!/(?:lecteur|npm|téléchargement|réseau|network|fetch|incomplet)/i.test(reason);
    }
    finally{loading(false);}
  }
  async function doReset() {
    if (!project) return;
    if (dirty && !confirm('Revenir aux données JSON d’origine et perdre les modifications ?')) return;
    $('metadataJson').value=JSON.stringify(project.metadata,null,2);
    $('contentJson').value=JSON.stringify(project.content,null,2);
    dirty=false; text('changeStatus','Modifications réinitialisées'); $('changeStatus').className='';
    clearAlert();
  }
  // GitHub sources are read-only until a release asset is explicitly selected.
  // A library installed here remains separate from the active reader/editor.
  
  function catalogStatus(value){text('catalogStatus',value);}
  function localFeedback(row,message,isError=false){
    let el=row.querySelector('.operation-inline');
    if(!el){el=document.createElement('p');el.className='operation-inline';el.setAttribute('role','status');row.append(el);}
    el.textContent=message;el.style.color=isError?'#a13a36':'#315b89';
  }
  async function renderJournal(){
    const target=$('journalEntries');if(!target)return;
    target.replaceChildren();
    if(!window.studioDesktop?.journalList){target.textContent='Historique disponible dans l’application Windows.';return;}
    try{
      const rows=(await window.studioDesktop.journalList()).slice().reverse();
      if(!rows.length){target.textContent='Aucune opération enregistrée.';return;}
      for(const item of rows){
        const wrap=document.createElement('div');wrap.className='operation-item';wrap.dataset.status=item.status;
        const title=document.createElement('strong');title.textContent=(item.status==='success'?'Terminée':item.status==='error'?'Échec':'En cours')+' : '+item.repo+' @ '+String(item.reference||'').slice(0,12);
        const msg=document.createElement('p');msg.textContent=item.message||'';
        const date=document.createElement('small');date.textContent=item.updatedAt||item.createdAt||'';
        wrap.append(title,msg,date);
        if(item.snapshotId&&item.status==='success'&&window.studioDesktop.catalogRevealSource){
          const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Afficher les sources sur le disque';button.style.marginLeft='12px';
          button.addEventListener('click',async()=>{try{await window.studioDesktop.catalogRevealSource(item.repo,item.reference);}catch(e){msg.textContent='Dossier indisponible : '+e.message;}});
          wrap.append(button);
        }
        target.append(wrap);
      }
    }catch(e){target.textContent='Lecture de l’historique impossible : '+(e.message||e);}
  }
  async function renderCoreCandidates(){
    if(!window.studioDesktop?.coreCandidates)return;
    try{const rows=await window.studioDesktop.coreCandidates();
      text('coreCandidatesReport',rows.length?rows.map(x=>x.repo+' @ '+x.commit.slice(0,12)+' | téléchargé : '+(x.downloadedAt||'?')+' | Activation : NON DISPONIBLE. '+x.reason).join('\n'):'Aucune révision du cœur conservée.');
    }catch(e){text('coreCandidatesReport','Impossible de consulter les révisions : '+(e.message||e));}
  }
  $('journalRefreshBtn')?.addEventListener('click',renderJournal);
  $('coreRefreshBtn')?.addEventListener('click',renderCoreCandidates);
  async function renderSources(){
    const table=$('catalogSourcesTable');table.replaceChildren();
    if(!window.studioDesktop?.catalogSources){catalogStatus('Cette fonction nécessite H5P Studio Windows.');return;}
    try{
      const sources=await window.studioDesktop.catalogSources();
      for(const source of sources){
        const tr=document.createElement('tr');
        const name=document.createElement('td');name.textContent=source.repo+(source.official?' (officiel)':'');
        const kind=document.createElement('td');kind.textContent=({'core-view':'Cœur de lecture','core-editor':'Cœur d’édition','hub-client':'Client Hub','library':'Bibliothèque'})[source.kind]||source.kind;
        const actions=document.createElement('td');
        const check=document.createElement('button');check.className='secondary';check.type='button';check.textContent='Vérifier';
        check.addEventListener('click',()=>checkCatalog(source));actions.append(check);
        if(!source.official){
          const remove=document.createElement('button');remove.className='secondary';remove.type='button';remove.textContent='Retirer du suivi';
          remove.style.marginLeft='8px';remove.addEventListener('click',async()=>{
            if(!confirm('Retirer cette source du suivi ? Les bibliothèques déjà installées seront conservées.'))return;
            try{await window.studioDesktop.catalogRemove(source.repo);await renderSources();}
            catch(e){catalogStatus('Retrait impossible : '+(e.message||e));}
          });actions.append(remove);
        }
        tr.append(name,kind,actions);table.append(tr);
      }
      catalogStatus(sources.length+' source(s) suivie(s). Vérification sur demande, aucune mise à jour automatique.');
    }catch(e){catalogStatus('Impossible de lire les sources : '+(e.message||e));}
  }
  async function checkCatalog(source){
    $('catalogAssets').replaceChildren();$('catalogSourceRefs').replaceChildren();
    await renderJournal();await renderCoreCandidates();
    text('catalogReport','Consultation des publications GitHub…');
    catalogStatus('Vérification de '+source.repo+'…');
    try{
      const r=await window.studioDesktop.catalogCheck(source.repo);
      const lines=[
        'Source : '+r.repo,'Consultation : '+r.checkedAt,
        'Dernière release stable observée : '+(r.stable?.tag||'Non trouvée'),
        'Dernière release publiée observée : '+(r.latestRelease?.tag||'Non trouvée')+(r.latestRelease?.prerelease?' (préliminaire)':''),
        'Tags récents (ordre retourné par GitHub) : '+(r.tags.length?r.tags.join(', '):'aucun'),
        'Commit récent sur la branche par défaut : '+(r.latestCommit?.sha||'Indisponible'),
        'Date du commit : '+(r.latestCommit?.date||'Indisponible'),
        'Paquets .h5p/.zip en pièces jointes : '+r.assets.length,
        'Révisions source utilisables : '+(r.tagRefs?.length||0)+' tag(s), '+(r.latestCommit?.sha?'commit récent':'aucun'),
        ...(r.errors.length?['Limites de consultation : '+r.errors.join(' ; ')]:[]),
        '',
        source.kind==='library'?'Les bibliothèques compilées peuvent être importées. Une révision de code source non compilée est conservée sans installation.':'La révision du cœur peut être conservée localement, sans changer le moteur actif ni la version de son API.'
      ];
      text('catalogReport',lines.join('\n'));
      const assets=$('catalogAssets');assets.replaceChildren();
      if(source.kind==='library'){
        for(const asset of r.assets){
          const el=document.createElement('div');el.className='asset';
          const description=document.createElement('span');
          description.textContent=asset.name+' | '+asset.tag+(asset.prerelease?' (préliminaire)':'')+' | '+(asset.bytes/1024/1024).toFixed(1)+' Mo';
          const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Installer ce paquet';
          button.addEventListener('click',async()=>{
            if(!confirm('Installer le paquet '+asset.name+' provenant de '+source.repo+' ? Il peut contenir du JavaScript tiers. Les versions existantes seront conservées.'))return;
            button.disabled=true;catalogStatus('Téléchargement et contrôle du paquet '+asset.name+'…');
            try{
              const out=await window.studioDesktop.catalogInstall(source.repo,asset.id);
              const c=out.report.counts;
              catalogStatus(`Import terminé : ${c.installed} installée(s), ${c.alreadyInstalled} déjà présente(s), ${c.rejected} rejet(s).`);
              localFeedback(el,`Installation terminée : ${c.installed} nouvelle(s), ${c.alreadyInstalled} déjà présente(s), ${c.rejected} rejet(s).`);await renderJournal();
              if(c.rejected)showAlert('Certaines bibliothèques ont été rejetées. Consultez le rapport d’importation dans le registre.','warning');
              lastImportLoaded=false;await refreshRegistry();
            }catch(e){catalogStatus('Installation impossible : '+(e.message||e));localFeedback(el,'Échec : '+(e.message||e),true);await renderJournal();}
            finally{button.disabled=false;}
          });
          el.append(description,button);assets.append(el);
        }
        if(!r.assets.length){const hint=document.createElement('p');hint.className='muted';hint.textContent='Aucun fichier .h5p/.zip empaqueté en pièce jointe des releases consultées. Import local ou compilation du projet source nécessaire.';assets.append(hint);}
      }
      const sourceRefs=$('catalogSourceRefs');
      const uniqueRefs=new Map();
      if(r.latestCommit?.sha)uniqueRefs.set(r.latestCommit.sha,{sha:r.latestCommit.sha,label:'Dernier commit : '+r.latestCommit.sha.slice(0,12)});
      for(const t of r.tagRefs||[])if(!uniqueRefs.has(t.sha))uniqueRefs.set(t.sha,{sha:t.sha,label:'Tag '+t.tag+' : '+t.sha.slice(0,12)});
      if(uniqueRefs.size){
        const heading=document.createElement('h3');heading.textContent='Révisions exactes du code source';sourceRefs.append(heading);
        const intro=document.createElement('p');intro.className='muted';intro.textContent='Télécharger le code source à une révision précise. Une bibliothèque non compilée sera conservée sans être activée. Les sources du cœur ne modifient jamais le moteur actif.';sourceRefs.append(intro);
      }
      for(const ref of uniqueRefs.values()){
        const row=document.createElement('div');row.className='asset';
        const description=document.createElement('span');description.textContent=ref.label;
        const button=document.createElement('button');button.className='secondary';button.type='button';button.textContent='Examiner cette révision';
        button.addEventListener('click',async()=>{
          if(!confirm('Télécharger le code source '+source.repo+' à '+ref.sha.slice(0,12)+' ? Aucun code téléchargé ne sera exécuté. Une bibliothèque déjà compilée peut être ajoutée au registre.'))return;
          button.disabled=true;catalogStatus('Téléchargement du code à la révision '+ref.sha.slice(0,12)+'…');
          localFeedback(row,'Téléchargement et analyse en cours…');
          try{
            const res=await window.studioDesktop.catalogSnapshot(source.repo,ref.sha);
            const info=[`Révision ${ref.sha.slice(0,12)} : ${res.kind}.`,res.reason||'',`Source conservée dans data/source-snapshots. Empreinte ZIP SHA-256 : ${res.snapshot.sha256}.`,res.installed?'Bibliothèque prête ajoutée au registre.':'Aucune activation du cœur ni des bibliothèques.'].filter(Boolean).join(' ');
            catalogStatus(info);localFeedback(row,info);await renderJournal();await renderCoreCandidates();
            if(res.installed){lastImportLoaded=false;await refreshRegistry();}
          }catch(e){catalogStatus('Récupération des sources impossible : '+(e.message||e));localFeedback(row,'Échec : '+(e.message||e),true);await renderJournal();}
          finally{button.disabled=false;}
        });row.append(description,button);sourceRefs.append(row);
      }
      catalogStatus('Consultation terminée : '+r.repo+'.');
    }catch(e){text('catalogReport','Consultation impossible : '+(e.message||e));catalogStatus('Échec de consultation : '+source.repo);}
  }
  $('catalogRefreshBtn').addEventListener('click',async()=>{await renderSources();await renderJournal();await renderCoreCandidates();});
  renderJournal();renderCoreCandidates();
  $('catalogAddBtn').addEventListener('click',async()=>{
    const value=$('catalogRepoInput').value.trim();if(!value){catalogStatus('Indiquez un dépôt GitHub.');return;}
    try{
      const r=await window.studioDesktop.catalogAdd(value);
      $('catalogRepoInput').value='';await renderSources();
      catalogStatus(r.existing?'Source déjà suivie.':'Source ajoutée. Cliquez sur Vérifier pour consulter ses publications.');
    }catch(e){catalogStatus('Ajout impossible : '+(e.message||e));}
  });
  $('registryFromCurrentBtn').addEventListener('click',importCurrentLibraries);
  $('registryFromFileBtn').addEventListener('click',importLocalLibraries);
  $('refreshRegistryBtn').addEventListener('click',refreshRegistry);
  $('registryLibrarySelect').addEventListener('change',registryVersions);
  $('registrySelectBtn').addEventListener('click',storeChoice);
  $('registryResolveBtn').addEventListener('click',resolveRegistry);
  $('importBtn').addEventListener('click',()=> $('fileInput').click());
  $('fileInput').addEventListener('change',e=>importFile(e.target.files[0]));
  $('saveBtn').addEventListener('click',exportH5P);
  $('staticBtn').addEventListener('click',exportStaticPreview);
  $('revealExportBtn').addEventListener('click',async()=>{
    try{const result=await window.studioDesktop.revealExport();if(!result?.ok)showAlert('Aucun ZIP exporté à afficher.','warning');}
    catch(e){showAlert(e.message||String(e),'error');}
  });
  $('viewBtn').addEventListener('click',doPreview);
  $('returnEditBtn').addEventListener('click',()=>setTab(previousEditTab==='visuel'&&!$('visualTab').disabled?'visuel':previousEditTab));
  $('visualPreviewBtn').addEventListener('click',doPreview);
  $('visualPreviewBottomBtn').addEventListener('click',doPreview);
  $('visualSaveBtn').addEventListener('click',exportH5P);
  $('visualJsonBtn').addEventListener('click',()=>setTab('contenu'));
  $('visualTitle').addEventListener('change',changeVisualTitle);
  $('importReaderBtn').addEventListener('click',async()=>{
    if(!window.studioDesktop)return;
    try {const x=await window.studioDesktop.importPlayer();if(x?.ok){$('readerFallback').hidden=true;showAlert('Lecteur local enregistré. Vous pouvez relancer la prévisualisation.', 'success');}}
    catch(e){showAlert(e.message||String(e),'error');}
  });
  $('shortcutStatic').addEventListener('click',()=>setTab('preview'));
  $('resetBtn').addEventListener('click',doReset);
  $('validateBtn').addEventListener('click',updateValidation);
  $('metadataJson').addEventListener('input',markDirty);
  $('contentJson').addEventListener('input',markDirty);
  document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.tab)));
  const drop=$('dropZone');
  ['dragenter','dragover'].forEach(event=>drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('over');}));
  ['dragleave','drop'].forEach(event=>drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('over');}));
  drop.addEventListener('drop',e=>importFile(e.dataTransfer.files[0]));
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault(); e.returnValue='';}});
  text('runtimeVersion','Standalone '+H5PStaticBuilder.PLAYER_VERSION+' (lecteur géré par Electron ; compatibilité à valider)');
  $('desktopFallback').hidden=Boolean(window.studioDesktop?.isDesktop);
  if(!window.studioDesktop?.isDesktop){$('viewBtn').disabled=true;$('staticBtn').disabled=true;}
  else {window.studioDesktop.info().catch(()=>{});refreshRegistry();renderSources();}
})();
