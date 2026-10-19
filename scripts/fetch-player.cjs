const path=require('node:path');
const {fetchRuntime,PLAYER_VERSION}=require('../runtime/player-manager.cjs');
fetchRuntime(path.resolve(__dirname,'../runtime-bundled',PLAYER_VERSION))
.then(({dir})=>console.log('Lecteur vérifié et préparé :',dir))
.catch(e=>{console.error('Préparation du lecteur :',e.message);process.exitCode=1});
