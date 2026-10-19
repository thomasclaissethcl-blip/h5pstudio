/* H5P Studio Portable, archive analysis and safe JSON round-trip, v0.1.3.
 * Independent of the H5P runtime: NO preview and NO semantics-driven visual editor.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.H5PArchive = factory();
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';
  const MAX_FILE_COUNT = 3000;
  const MAX_ZIP_BYTES = 250 * 1024 * 1024;
  const MAX_EXPANDED_BYTES = 900 * 1024 * 1024;
  const MAX_JSON_BYTES = 12 * 1024 * 1024;
  const utf8 = new TextEncoder();

  function own(obj, name) { return Object.prototype.hasOwnProperty.call(obj, name); }
  function ensureObject(v, name) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(name + ' doit contenir un objet JSON.');
  }
  function parseJSON(text, name) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { throw new Error('JSON invalide dans ' + name + ' : ' + e.message); }
    ensureObject(parsed, name);
    return parsed;
  }
  function safeName(n) {
    if (typeof n !== 'string' || !n || n.indexOf('\\') !== -1 || n.startsWith('/') || /^[a-z]:/i.test(n)) return false;
    return !n.split('/').some(p => p === '..' || p === '.' || p === '');
  }
  function depKey(dep) { return [dep.machineName, dep.majorVersion, dep.minorVersion].join('@'); }
  // H5P documentation illustrates JSON integers, while some export tools
  // serialize majorVersion/minorVersion as decimal strings. Accept the latter
  // ONLY for internal inspection and dependency matching. Do not rewrite
  // imported JSON or promise conformance with a strict H5P validator.
  function parseVersion(value) {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
    return null;
  }
  function normalizeDependency(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d) ||
        typeof d.machineName !== 'string' || !d.machineName.trim()) return null;
    const major = parseVersion(d.majorVersion);
    const minor = parseVersion(d.minorVersion);
    return major === null || minor === null ? null :
      {...d, majorVersion:major, minorVersion:minor};
  }
  // Render the fields needed to explain genuinely unrecognised declarations.
  function dependencyDescription(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      return `entrée=${String(d)} (type ${Array.isArray(d) ? 'tableau' : d === null ? 'null' : typeof d})`;
    }
    return ['machineName', 'majorVersion', 'minorVersion'].map(field => {
      const value = d[field];
      const display = value === undefined ? '(absent)' : JSON.stringify(value);
      const type = value === undefined ? 'absent' : value === null ? 'null' : Array.isArray(value) ? 'tableau' : typeof value;
      return `${field}=${String(display).slice(0,120)} (${type})`;
    }).join('; ');
  }
  // This is deliberately a NON-BLOCKING diagnostic, not a silent repair.
  // H5P requires versioned preloadedDependencies, but we want to inspect even
  // malformed or variant packages and preserve their original metadata.
  function inspectMetadata(m) {
    ensureObject(m, 'h5p.json');
    const warnings = [];
    for (const k of ['title', 'mainLibrary', 'language']) {
      if (typeof m[k] !== 'string' || !m[k].trim())
        warnings.push('h5p.json : champ requis absent ou invalide : ' + k + '.');
    }
    if (!Array.isArray(m.embedTypes) || !m.embedTypes.length ||
        m.embedTypes.some(v => v !== 'div' && v !== 'iframe')) {
      warnings.push('h5p.json : « embedTypes » devrait être une liste contenant « div » et/ou « iframe ».');
    }
    const dependencies = [];
    let toleratedStringEntries = 0;
    const hasList = Array.isArray(m.preloadedDependencies);
    const declared = hasList ? m.preloadedDependencies.length : 0;
    if (!hasList) {
      warnings.push('h5p.json : « preloadedDependencies » est absent ou n’est pas un tableau. Analyse des dépendances indéterminée ; aucune modification automatique.');
    } else {
      m.preloadedDependencies.forEach((d, i) => {
        const normalized = normalizeDependency(d);
        if (normalized) {
          dependencies.push(normalized);
          if (typeof d.majorVersion === 'string' || typeof d.minorVersion === 'string') toleratedStringEntries++;
        } else warnings.push(`h5p.json : preloadedDependencies[${i}] rejetée : ${dependencyDescription(d)}. Attendu : machineName non vide, versions majeures/mineures sous forme d'entiers ou de chaînes décimales positives. Entrée préservée, non analysée.`);
      });
      if (declared === 0) {
        warnings.push('h5p.json : « preloadedDependencies » est vide : la bibliothèque principale devrait y figurer.');
      }
      if (typeof m.mainLibrary === 'string' && m.mainLibrary.trim() &&
          !dependencies.some(d => d.machineName === m.mainLibrary)) {
        warnings.push(declared !== dependencies.length
          ? 'h5p.json : impossible de vérifier la bibliothèque principale « ' + m.mainLibrary + ' » : certaines dépendances ont été rejetées.'
          : 'h5p.json : la bibliothèque principale « ' + m.mainLibrary + ' » est absente des dépendances versionnées reconnues.');
      }
    }
    return {warnings, dependencies, dependencyStats: {
      declared, recognized: dependencies.length, rejected: declared - dependencies.length,
      toleratedStringEntries,
      complete: hasList && declared > 0 && declared === dependencies.length
    }};
  }
  async function readJsonEntry(zip, path) {
    const f = zip.file(path);
    if (!f) throw new Error('Fichier obligatoire manquant : ' + path);
    const estimated = f._data && f._data.uncompressedSize;
    if (typeof estimated === 'number' && estimated > MAX_JSON_BYTES) throw new Error('JSON trop volumineux : ' + path);
    const raw = await f.async('string');
    if (utf8.encode(raw).byteLength > MAX_JSON_BYTES) throw new Error('JSON trop volumineux : ' + path);
    return {text: raw, object: parseJSON(raw, path)};
  }
  function scanZip(zip) {
    const entries = Object.values(zip.files);
    if (entries.length > MAX_FILE_COUNT) throw new Error('Archive trop volumineuse en nombre de fichiers.');
    let declaredExpanded = 0;
    for (const f of entries) {
      const original = f.unsafeOriginalName || f.name;
      const name = String(original).replace(/\/$/, '');
      if (!safeName(name)) throw new Error('Chemin non sûr dans l’archive : ' + original);
      const uncompressed = f._data && f._data.uncompressedSize;
      if (typeof uncompressed === 'number') declaredExpanded += uncompressed;
      if (declaredExpanded > MAX_EXPANDED_BYTES) throw new Error('Taille décompressée déclarée excessive.');
    }
    return {entryCount: entries.length, declaredExpanded};
  }
  function compareLibrary(dep, installed) {
    return installed.find(l => l.machineName === dep.machineName && l.majorVersion === dep.majorVersion && l.minorVersion === dep.minorVersion);
  }
  function analyseDependencies(meta, libraries, warnings=[]) {
    const missing = [];
    const queue = inspectMetadata(meta).dependencies.slice();
    const seen = new Set();
    while (queue.length) {
      const d = queue.shift();
      const key = depKey(d);
      if (seen.has(key)) continue;
      seen.add(key);
      const lib = compareLibrary(d, libraries);
      if (!lib) { missing.push(key); continue; }
      // editorDependencies concern the authoring interface, not the runtime.
      for (const dependencyType of ['preloadedDependencies','dynamicDependencies']) {
        const entries = lib[dependencyType];
        if (entries == null) continue;
        if (!Array.isArray(entries)) {
          warnings.push(`${lib.machineName} : « ${dependencyType} » devrait être une liste. Diagnostic partiel.`);
          continue;
        }
        entries.forEach((child, i) => {
          const normalized = normalizeDependency(child);
          if (normalized) queue.push(normalized);
          else warnings.push(`${lib.machineName} : ${dependencyType}[${i}] est invalide (${dependencyDescription(child)}). Diagnostic partiel.`);
        });
      }
    }
    return [...new Set(missing)].sort();
  }
  async function openArchive(bytes, ZIP) {
    if (!ZIP) throw new Error('JSZip est introuvable.');
    if (!bytes || !bytes.byteLength) throw new Error('Le fichier est vide.');
    if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error('Archive de plus de 250 Mo, refusée par prudence.');
    const zip = await ZIP.loadAsync(bytes, {checkCRC32: false});
    const scan = scanZip(zip);
    const metadata = await readJsonEntry(zip, 'h5p.json');
    const content = await readJsonEntry(zip, 'content/content.json');
    const metaInspection = inspectMetadata(metadata.object);
    const libraryEntries = Object.keys(zip.files).filter(f => /^[^/]+\/library\.json$/.test(f));
    const libraries = [];
    const warnings = metaInspection.warnings.slice();
    for (const key of libraryEntries) {
      try {
        const lib = (await readJsonEntry(zip, key)).object;
        if (typeof lib.machineName !== 'string' || !lib.machineName.trim() ||
            parseVersion(lib.majorVersion) === null || parseVersion(lib.minorVersion) === null) {
          warnings.push('Manifest de bibliothèque non exploitable : ' + key);
          continue;
        }
        // Only the in-memory inventory uses normalized numbers; ZIP JSON stays intact.
        libraries.push({...lib, majorVersion:parseVersion(lib.majorVersion),
          minorVersion:parseVersion(lib.minorVersion), _folder: key.split('/')[0]});
      } catch (e) { warnings.push(e.message); }
    }
    const missing = analyseDependencies(metadata.object, libraries, warnings);
    const dependencyStatus = !metaInspection.dependencyStats.complete ? 'indetermine' :
      warnings.some(w => w.includes('Diagnostic partiel.')) ? 'partiel' : 'complet';
    if (missing.length) warnings.push('Dépendances non embarquées dans l’archive (parmi celles analysées) : ' + missing.join(', '));
    if (!libraries.length) warnings.push('Aucune bibliothèque H5P embarquée dans cette archive.');
    const declaredMain = metadata.object.mainLibrary;
    if (typeof declaredMain === 'string' && declaredMain && !libraries.some(l => l.machineName === declaredMain))
      warnings.push('Bibliothèque principale absente des dossiers de l’archive : ' + declaredMain);
    return {zip, originalMetadataText:metadata.text, originalContentText:content.text,
      metadata:metadata.object, content:content.object, libraries, warnings, missing, scan,
      dependencyStats:metaInspection.dependencyStats, dependencyStatus};
  }
  function validateEditing(metadataText, contentText) {
    if (utf8.encode(metadataText).byteLength > MAX_JSON_BYTES || utf8.encode(contentText).byteLength > MAX_JSON_BYTES)
      throw new Error('JSON trop volumineux.');
    const metadata = parseJSON(metadataText,'h5p.json');
    const inspection = inspectMetadata(metadata);
    const content = parseJSON(contentText,'content/content.json');
    return {metadata, content, warnings:inspection.warnings};
  }
  async function saveArchive(project, metadataText, contentText, onProgress) {
    if (!project || !project.zip) throw new Error('Aucun fichier H5P chargé.');
    const checked = validateEditing(metadataText, contentText);
    // JSZip.clone() actually SHARES the files registry. Detach before writing.
    const output = project.zip.clone();
    output.files = {...project.zip.files};
    output.file('h5p.json', JSON.stringify(checked.metadata,null,2));
    output.file('content/content.json', JSON.stringify(checked.content,null,2));
    const blob = await output.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:6}},
      m => { if (typeof onProgress === 'function') onProgress(Math.round(m.percent)); });
    return blob;
  }
  function exportName(title) {
    let safe = String(title || 'activite').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70);
    return (safe || 'activite') + '.h5p';
  }
  return {openArchive, validateEditing, saveArchive, exportName, analyseDependencies, inspectMetadata, safeName};
});
