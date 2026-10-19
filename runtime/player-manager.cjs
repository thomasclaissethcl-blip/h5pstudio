'use strict';
// Only a pinned, integrity-checked runtime can be fetched automatically.
// Package metadata and tarball are both resolved from registry.npmjs.org.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const PLAYER_NAME = 'h5p-standalone';
const PLAYER_VERSION = '3.8.2';
const PLAYER_FILES = ['main.bundle.js', 'frame.bundle.js', 'styles/h5p.css'];
const BASE_URL = 'https://registry.npmjs.org/h5p-standalone';
const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024;
const MAX_TAR_BYTES = 220 * 1024 * 1024;

function pathWithin(parent, filename) {
  const root = path.resolve(parent);
  const candidate = path.resolve(parent, filename);
  if (candidate === root || !candidate.startsWith(root + path.sep)) throw Error('Chemin de lecteur interdit.');
  return candidate;
}
function complete(dir) { return PLAYER_FILES.every(file => fs.existsSync(path.join(dir,file))); }
async function boundedResponse(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.hostname !== 'registry.npmjs.org') throw Error('Provenance npm interdite : '+url);
  const res = await fetch(u, {signal:AbortSignal.timeout(90000), redirect:'error'});
  if (!res.ok) throw Error('Téléchargement npm impossible : HTTP '+res.status);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_DOWNLOAD_BYTES) throw Error('Téléchargement trop volumineux.');
  const chunks=[];let n=0;
  for await(const c of res.body) { n+=c.length; if(n>MAX_DOWNLOAD_BYTES)throw Error('Limite de téléchargement dépassée.');chunks.push(Buffer.from(c)); }
  return Buffer.concat(chunks);
}
function decodePax(data) {
  // PAX record: <decimal byte count><space><key>=<value><newline>.
  // The byte count, not the number of characters, defines the record boundary.
  const result = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space < 0 || space - offset > 15) throw Error('En-tête PAX invalide (longueur).');
    const lengthString = data.toString('ascii', offset, space);
    if (!/^[1-9][0-9]*$/.test(lengthString)) throw Error('En-tête PAX invalide (taille).');
    const length = Number(lengthString);
    const finish = offset + length;
    if (!Number.isSafeInteger(length) || finish > data.length || finish <= space + 2 || data[finish - 1] !== 0x0a) {
      throw Error('En-tête PAX incomplet.');
    }
    const eq = data.indexOf(0x3d, space + 1);
    if (eq < space + 2 || eq >= finish - 1) throw Error('En-tête PAX invalide (clé).');
    const key = data.toString('utf8', space + 1, eq);
    const value = data.toString('utf8', eq + 1, finish - 1);
    if (key === 'path' || key === 'size') result[key] = value;
    offset = finish;
  }
  return result;
}
function tarEntrySize(header, overrides) {
  const sizeOct = header.toString('ascii', 124, 136).replace(/\0.*$/s, '').trim();
  if (sizeOct && !/^[0-7]+$/.test(sizeOct)) throw Error('TAR invalide (taille octale).');
  const rawSize = sizeOct ? parseInt(sizeOct, 8) : 0;
  const size = overrides && overrides.size !== undefined ? Number(overrides.size) : rawSize;
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_TAR_BYTES ||
      (overrides && overrides.size !== undefined && !/^(0|[1-9][0-9]*)$/.test(overrides.size))) {
    throw Error('TAR invalide (taille).');
  }
  return size;
}
function untarDist(tgz) {
  const tar = zlib.gunzipSync(tgz, {maxOutputLength:MAX_TAR_BYTES});
  const result = new Map();
  let nextPax = null;
  let globalPax = {};
  let gnuLongName = null;
  let entries = 0;
  for (let offset = 0; offset + 512 <= tar.length;) {
    if (++entries > 100000) throw Error('TAR trop volumineux (nombre de fichiers).');
    const header = tar.subarray(offset, offset + 512);
    if (header.every(x => x === 0)) break;
    const field = (start, length) => header.toString('utf8', start, start + length).replace(/\0.*$/s, '');
    const type = field(156, 1) || '0';
    // Metadata records are sized by their own header, not by a prior PAX file size.
    const overrides = ['x','g','L','K'].includes(type) ? null : {...globalPax, ...(nextPax || {})};
    const size = tarEntrySize(header, overrides);
    const start = offset + 512, end = start + size;
    if (end > tar.length) throw Error('TAR incomplet.');
    const payload = tar.subarray(start, end);
    if (type === 'x') {
      nextPax = {...(nextPax || {}), ...decodePax(payload)};
    } else if (type === 'g') {
      globalPax = {...globalPax, ...decodePax(payload)};
    } else if (type === 'L') {
      gnuLongName = payload.toString('utf8').replace(/\0.*$/s,'').replace(/\n$/,'');
    } else if (type === 'K') {
      // GNU long link targets are irrelevant; only regular files are extracted.
    } else {
      const fullName = field(0, 100), prefix = field(345, 155);
      const headerName = prefix ? prefix + '/' + fullName : fullName;
      // Modern npm TAR archives use PAX `path` when a long filename does not
      // fit in the 100-byte field. Ignoring it causes false duplicate names.
      const name = nextPax?.path || gnuLongName || globalPax.path || headerName;
      nextPax = null;
      gnuLongName = null;
      if (name.startsWith('package/dist/') && (type === '0' || type === '')) {
        const rel = name.slice('package/dist/'.length);
        if (!rel || rel.startsWith('/') || rel.includes('\\') ||
            rel.split('/').some(s => !s || s === '..' || s === '.') || /[\x00-\x1f]/.test(rel) ||
            rel.includes(':')) throw Error('Chemin TAR interdit.');
        if (result.has(rel)) throw Error('Entrée TAR réellement dupliquée : ' + rel);
        result.set(rel, Buffer.from(payload));
      }
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  for (const name of PLAYER_FILES) if (!result.has(name)) throw Error('Lecteur npm incomplet : ' + name);
  return result;
}
async function fetchRuntime(destination) {
  const meta=JSON.parse((await boundedResponse(BASE_URL+'/'+PLAYER_VERSION)).toString('utf8'));
  const dist=meta.dist||{};
  const tarball=BASE_URL+'/-/h5p-standalone-'+PLAYER_VERSION+'.tgz';
  if(dist.tarball!==tarball || !/^sha512-[A-Za-z0-9+/]+=*$/.test(dist.integrity||''))throw Error('Métadonnées de distribution npm invalides.');
  const tgz=await boundedResponse(tarball);
  const actual=crypto.createHash('sha512').update(tgz).digest('base64');
  if('sha512-'+actual!==dist.integrity)throw Error('Contrôle SHA-512 du lecteur échoué. Aucun fichier installé.');
  const files=untarDist(tgz);
  const parent=path.dirname(destination);await fsp.mkdir(parent,{recursive:true});
  const staging=path.join(parent,'.runtime-'+crypto.randomUUID());await fsp.mkdir(staging);
  try {
    for(const [relative,bytes] of files){const filename=pathWithin(staging,relative);await fsp.mkdir(path.dirname(filename),{recursive:true});await fsp.writeFile(filename,bytes);}
    if(!complete(staging))throw Error('Lecteur téléchargé incomplet.');
    await fsp.writeFile(path.join(staging,'runtime-source.json'),JSON.stringify({name:PLAYER_NAME,version:PLAYER_VERSION,sha512:dist.integrity,source:tarball},null,2));
    if(fs.existsSync(destination))await fsp.rm(destination,{recursive:true,force:true});
    await fsp.rename(staging,destination);
  } finally {await fsp.rm(staging,{recursive:true,force:true}).catch(()=>{});}
  return {dir:destination,source:'npm SHA-512 vérifié'};
}
async function ensureRuntime({bundledDir,cacheDir}) {
  if(bundledDir && complete(bundledDir))return {dir:bundledDir,source:'Lecteur inclus dans le logiciel'};
  if(complete(cacheDir))return {dir:cacheDir,source:'Cache portable'};
  return fetchRuntime(cacheDir);
}
async function adoptLocalPlayer(source, destination) {
  const src=path.resolve(source);if(!complete(src))throw Error('Dossier lecteur incomplet. Sélectionnez le dossier player contenant main.bundle.js.');
  if(src===path.resolve(destination)) return {dir:destination,source:'Lecteur existant'};
  await fsp.mkdir(path.dirname(destination),{recursive:true});
  const tmp=destination+'-'+crypto.randomUUID();
  try {
    await fsp.cp(src,tmp,{recursive:true,force:false,errorOnExist:true,filter:(from)=>{
      const rel=path.relative(src,from);return rel===''||(!rel.startsWith('..') && !path.isAbsolute(rel));
    }});
    if(!complete(tmp))throw Error('Copie incomplète du lecteur.');
    if(fs.existsSync(destination))await fsp.rm(destination,{recursive:true,force:true});
    await fsp.rename(tmp,destination);
  }finally{await fsp.rm(tmp,{recursive:true,force:true}).catch(()=>{});}
  return {dir:destination,source:'Lecteur local importé (provenance à confirmer)'};
}
module.exports={PLAYER_NAME,PLAYER_VERSION,PLAYER_FILES,complete,fetchRuntime,ensureRuntime,adoptLocalPlayer,untarDist,pathWithin};
