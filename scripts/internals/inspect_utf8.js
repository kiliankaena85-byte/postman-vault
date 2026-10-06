const fs = require('fs');
const path = require('path');

const targetDb = 'C:\\Users\\Артем\\AppData\\Roaming\\Postman\\Partitions\\18e932e7-de76-4de9-b046-691e246f1a64\\IndexedDB\\https_desktop.postman.com_0.indexeddb.leveldb';
const logPath = path.join(targetDb, '000032.log');

const buf = fs.readFileSync(logPath);
const utf8Str = buf.toString('utf8');

console.log('000032.log size:', buf.length);

const terms = ['collection', 'REQUEST', 'workspace', 'environment', 'header', 'url'];
for (const term of terms) {
  const count = (utf8Str.match(new RegExp(term, 'gi')) || []).length;
  console.log(`${term}: ${count} matches`);
}

// Find strings around 'collection'
let idx = 0;
let found = 0;
while ((idx = utf8Str.indexOf('collection', idx)) !== -1 && found < 5) {
  const start = Math.max(0, idx - 40);
  const end = Math.min(utf8Str.length, idx + 100);
  console.log(`\nMatch [${found + 1}] at offset ${idx}:`);
  console.log(utf8Str.slice(start, end).replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7E]/g, '?'));
  idx += 10;
  found++;
}
