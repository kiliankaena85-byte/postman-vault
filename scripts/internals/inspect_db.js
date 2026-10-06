const fs = require('fs');
const path = require('path');

const targetDb = 'C:\\Users\\Артем\\AppData\\Roaming\\Postman\\Partitions\\18e932e7-de76-4de9-b046-691e246f1a64\\IndexedDB\\https_desktop.postman.com_0.indexeddb.leveldb';

console.log('Inspecting:', targetDb);
const files = fs.readdirSync(targetDb);
console.log('Files in DB:', files);

// Let's inspect log and ldb files
for (const file of files) {
  if (file.endsWith('.log') || file.endsWith('.ldb')) {
    const filePath = path.join(targetDb, file);
    const buf = fs.readFileSync(filePath);
    console.log(`\n--- File: ${file} (Size: ${buf.length} bytes) ---`);
    
    // Look for JSON structures
    const str = buf.toString('latin1');
    
    // Search for interesting keys
    const keywords = ['"collection"', '"environment"', '"workspace"', '"request"', '"header"', 'pm.variables'];
    for (const kw of keywords) {
      let count = 0;
      let pos = 0;
      while ((pos = str.indexOf(kw, pos)) !== -1) {
        count++;
        pos += kw.length;
      }
      if (count > 0) {
        console.log(` Keyword ${kw}: ${count} occurrences`);
      }
    }

    // Extract a few JSON fragments
    const jsonRegex = /\{"id":"[a-f0-9\-]+"[^\r\n\}]{20,}/g;
    let match;
    let printed = 0;
    while ((match = jsonRegex.exec(str)) !== null && printed < 5) {
      // Find balanced or slice
      const sample = str.slice(match.index, match.index + 300).replace(/[^\x20-\x7E]/g, ' ');
      console.log(`   Sample JSON [${printed + 1}]:`, sample);
      printed++;
    }
  }
}
