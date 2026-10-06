const fs = require('fs');
const path = require('path');

const targetDb = 'C:\\Users\\Артем\\AppData\\Roaming\\Postman\\Partitions\\18e932e7-de76-4de9-b046-691e246f1a64\\IndexedDB\\https_desktop.postman.com_0.indexeddb.leveldb';
const logPath = path.join(targetDb, '000032.log');

const buf = fs.readFileSync(logPath);
const utf8Str = buf.toString('utf8');

// Look for URLs or requests
const urlRegex = /https?:\/\/[a-zA-Z0-9\.\-_:\/]+/g;
const urls = [...new Set(utf8Str.match(urlRegex) || [])];
console.log('Discovered URLs in Postman local DB:');
urls.slice(0, 20).forEach(u => console.log(' -', u));

// Look for request names / endpoints
const methodRegex = /"(GET|POST|PUT|PATCH|DELETE)"/g;
console.log('\nDiscovered HTTP methods:', [...new Set(utf8Str.match(methodRegex) || [])]);
