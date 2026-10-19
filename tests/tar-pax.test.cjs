'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const {untarDist, PLAYER_FILES} = require('../runtime/player-manager.cjs');

function tarEntry(name, bytes, type='0') {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  const head = Buffer.alloc(512);
  head.write(name.slice(0,100), 0, 100, 'utf8');
  head.write('0000644\0',100,'ascii');
  head.write(content.length.toString(8).padStart(11,'0')+'\0',124,'ascii');
  head.write(type,156,1,'ascii');
  head.write('ustar\0',257,'ascii');
  return Buffer.concat([head,content,Buffer.alloc((512-content.length%512)%512)]);
}
function paxRecord(key,value) {
  const text=` ${key}=${value}\n`;
  let length=Buffer.byteLength(text)+1;
  while (length !== Buffer.byteLength(text)+String(length).length) length=Buffer.byteLength(text)+String(length).length;
  return `${length}${text}`;
}
function fixture(extras=[]) {
  return zlib.gzipSync(Buffer.concat([
    ...PLAYER_FILES.map(f=>tarEntry('package/dist/'+f,`asset:${f}`)),
    ...extras,
    Buffer.alloc(1024)
  ]));
}

test('PAX long paths: distinct font files with identical first 100 header bytes',()=>{
  const prefix='package/dist/fonts/open-sans/open-sans-v40-cyrillic_cyrillic-ext_greek_greek-ext_hebrew_latin_latin-ext_math_symbols_vietnamese-';
  const one=prefix+'regular.woff2',two=prefix+'italic.woff2';
  assert.equal(one.slice(0,100),two.slice(0,100));
  const data=fixture([
    tarEntry('PaxHeader/long1',paxRecord('path',one),'x'),
    tarEntry(one,'font1'),
    tarEntry('PaxHeader/long2',paxRecord('path',two),'x'),
    tarEntry(two,'font2')
  ]);
  const result=untarDist(data);
  assert.equal(result.get(one.slice('package/dist/'.length)).toString(),'font1');
  assert.equal(result.get(two.slice('package/dist/'.length)).toString(),'font2');
  assert.equal(result.size,PLAYER_FILES.length+2);
});
test('GNU longname extension is supported',()=>{
  const long='package/dist/fonts/'+('x'.repeat(132))+'.woff';
  const data=fixture([tarEntry('././@LongLink',long+'\0','L'),tarEntry(long,'font')]);
  assert.equal(untarDist(data).get(long.slice('package/dist/'.length)).toString(),'font');
});
test('PAX path traversal is rejected',()=>{
  const data=fixture([tarEntry('PaxHeader/traversal',paxRecord('path','package/dist/../../escape.txt'),'x'),tarEntry('package/dist/safe.txt','payload')]);
  assert.throws(()=>untarDist(data),/Chemin TAR interdit/);
});
test('True duplicate paths remain rejected',()=>{
  const data=fixture([tarEntry('package/dist/a.txt','one'),tarEntry('package/dist/a.txt','two')]);
  assert.throws(()=>untarDist(data),/réellement dupliquée/);
});
test('PAX utf8 byte lengths are parsed correctly',()=>{
  const name='package/dist/éléments/'+'été'.repeat(42)+'.txt';
  const data=fixture([tarEntry('PaxHeader/utf8',paxRecord('path',name),'x'),tarEntry(name,'ok')]);
  assert.equal(untarDist(data).get(name.slice('package/dist/'.length)).toString(),'ok');
});
