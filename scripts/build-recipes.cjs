'use strict';
// Reviewed, repository-owned build recipes only. No arbitrary repo, shell, or build command from UI.
const path=require('node:path');
const fs=require('node:fs/promises');
const {execFileSync}=require('node:child_process');
const SOURCE=path.resolve(__dirname,'../recipes');
const VALID_ID=/^[a-z][a-z0-9-]{0,49}$/;
const VALID_REF=/^(?!-)(?!.*\.\.)(?!.*@\{)(?!.*[~^:?*\[\\\s])[A-Za-z0-9_./-]{1,110}$/;
const VALID_REPO=/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/;
async function recipe(id){
 if(!VALID_ID.test(id))throw Error('Identifiant de recette invalide.');
 const config=JSON.parse(await fs.readFile(path.join(SOURCE,id+'.json'),'utf8'));
 if(config.id!==id||!Array.isArray(config.modules)||config.modules.length<1||config.modules.length>4)throw Error('Recette non conforme.');
 for(const m of config.modules){
  if(!VALID_ID.test(m.id)||!VALID_REPO.test(m.repo)||!VALID_REF.test(m.defaultRef)||m.node!=='22'||m.install!=='ci'||m.build!=='build'||
    !/^[A-Za-z][A-Za-z0-9_.-]+$/.test(m.expectedMachineName))throw Error('Recette non autorisée.');
 }
 return config;
}
function ref(input,defaultRef){const value=input||defaultRef;if(!VALID_REF.test(value)||value.includes('//')||value.endsWith('/'))throw Error('Tag ou commit invalide.');return value;}
function run(program,args,cwd){execFileSync(program,args,{cwd,stdio:'inherit',timeout:12*60*1000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',HUSKY:'0'}});}
async function build({id,refs,workspace}){
 const cfg=await recipe(id),out=path.resolve(workspace,'output');await fs.mkdir(out,{recursive:true});
 const packer=require('./pack-built-library.cjs');const manifest=[];
 for(const m of cfg.modules){
  const revision=ref(refs[m.id],m.defaultRef),dest=path.resolve(workspace,'source-'+m.id);
  await fs.mkdir(dest,{recursive:true});
  run('git',['init','-q'],dest);
  run('git',['remote','add','origin','https://github.com/'+m.repo+'.git'],dest);
  run('git',['-c','protocol.file.allow=never','fetch','--depth','1','origin',revision],dest);
  run('git',['checkout','-q','--detach','FETCH_HEAD'],dest);
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:dest,encoding:'utf8'}).trim();
  run('npm',['ci','--no-audit','--no-fund'],dest);
  run('npm',['run',m.build],dest);
  const name=m.expectedMachineName+'.zip';
  const {metadata}=await packer.pack(dest,path.join(out,name));
  if(metadata.machineName!==m.expectedMachineName)throw Error('Identité de bibliothèque inattendue : '+metadata.machineName);
  manifest.push({repo:m.repo,ref:revision,commit,library:metadata.machineName,version:metadata.version,files:metadata.files,sha256:metadata.sha256,artifact:name});
 }
 await fs.writeFile(path.join(out,'build-manifest.json'),JSON.stringify({recipe:cfg.id,createdAt:new Date().toISOString(),libraries:manifest},null,2));
 return manifest;
}
if(require.main===module){
 const [id,primary='',secondary='']=process.argv.slice(2);
 build({id,refs:{reader:primary,editor:secondary},workspace:process.cwd()}).then(x=>console.log(JSON.stringify(x,null,2)))
  .catch(e=>{console.error('Construction interrompue : '+e.message);process.exitCode=1;});
}
module.exports={recipe,ref,build,VALID_REF};
