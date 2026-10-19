'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const exists=p=>fs.existsSync(path.join(ROOT,p));
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

test('dépôt consolidé : un workflow générique et un workflow Windows, aucun ancien',()=>{
 const actual=fs.readdirSync(path.join(ROOT,'.github/workflows')).sort();
 assert.deepEqual(actual,['build-h5p-libraries.yml','windows-portable.yml']);
 assert.equal(exists('windows-portable.yml'),false);
 assert.match(read('.github/workflows/windows-portable.yml'),/dist\/win-unpacked\//);
 assert.match(read('.github/workflows/build-h5p-libraries.yml'),/build-recipes\.cjs/);
});

test('les modules et tests actifs n’existent qu’à leur emplacement canonique',()=>{
 for(const name of ['app.js','h5p-core.js','static-builder.js','style.css','jszip.min.js']){
  assert.equal(exists(name),false,name);
  assert.equal(exists('assets/'+name),true,name);
 }
 for(const name of ['main.cjs','preload.cjs'])assert.equal(exists(name),false,name);
 for(const name of ['player-manager.cjs','studio-site.cjs'])assert.equal(exists(name),false,name);
 for(const name of ['archive.test.cjs','branching-regression.test.cjs','integration.test.cjs','site.test.cjs']){
  assert.equal(exists(name),false,name);
  assert.equal(exists('tests/'+name),true,name);
 }
});

test('version synchronisée dans la distribution et dans l’interface',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.6.0');
 assert.equal(pkg.main,'electron/main.cjs');
 assert.match(read('electron/main.cjs'),/APP_VERSION='0\.6\.0'/);
 assert.match(read('index.html'),/V0\.6\.0/);
 assert.match(read('.github/workflows/windows-portable.yml'),/0\.6\.0-Windows-DOSSIER/);
});

test('aucun ancien guide ni script Windows obsolète dans le dépôt',()=>{
 for(const p of ['CONSTRUIRE-WINDOWS.cmd','GUIDE-052.md','GUIDE-051.md','GUIDE-GITHUB.md','CORRECTIF-GITHUB.md','DEMARRAGE-SANS-NODE.md','ROADMAP.md'])assert.equal(exists(p),false,p);
 assert.equal(exists('GUIDE-GITHUB-060.md'),true);
 assert.equal(exists('docs/ROADMAP.md'),true);
 assert.equal(exists('LICENSE-JSZip.md'),true);
 assert.equal(exists('assets/LICENSE-JSZip.md'),false);
});

test('les données et sorties de compilation ne doivent pas être versionnées',()=>{
 const gitignore=read('.gitignore');
 for(const entry of ['/data/','/node_modules/','/dist/','/runtime-bundled/'])assert.ok(gitignore.includes(entry),entry);
 const pkg=JSON.parse(read('package.json'));
 assert.deepEqual(pkg.build.extraResources.map(x=>x.to),['reader/3.8.2']);
 assert.ok(pkg.scripts['build:win'].includes('--dir'));
});

test('le workflow supporte npm ci seulement après la création d’un lockfile réel',()=>{
 const text=read('.github/workflows/windows-portable.yml');
 assert.match(text,/Test-Path package-lock\.json/);
 assert.match(text,/npm ci --no-audit --no-fund/);
 assert.match(text,/npm install --no-audit --no-fund/);
 assert.match(text,/name: H5P-Studio-0\.6\.0-package-lock/);
});
