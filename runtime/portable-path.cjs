'use strict';
const path=require('node:path');
function portableRoot({portableDir,packaged,exePath,sourceDir}){
 return path.resolve(portableDir || (packaged ? path.dirname(exePath) : path.join(sourceDir,'..')));
}
module.exports={portableRoot};
