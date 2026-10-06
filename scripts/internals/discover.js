const fs = require('fs');
const path = require('path');

const appData = process.env.APPDATA || 'C:\\Users\\Артем\\AppData\\Roaming';
const postmanDataDir = path.join(appData, 'Postman');
const partitionsDir = path.join(postmanDataDir, 'Partitions');

console.log('--- Postman Vault Discovery ---');
console.log('Postman Data Dir:', postmanDataDir);

if (!fs.existsSync(postmanDataDir)) {
  console.error('Postman data directory not found!');
  process.exit(1);
}

// Read user partitions
const userPartitionFile = path.join(postmanDataDir, 'storage', 'userPartitionData.json');
if (fs.existsSync(userPartitionFile)) {
  const data = JSON.parse(fs.readFileSync(userPartitionFile, 'utf8'));
  console.log('\nFound user partitions:');
  console.log(JSON.stringify(data.v8Partitions, null, 2));
}

// Find all LevelDB folders
function findLevelDbs(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.leveldb')) {
        results.push(full);
      } else {
        results = results.concat(findLevelDbs(full));
      }
    }
  }
  return results;
}

const levelDbs = findLevelDbs(partitionsDir);
console.log('\nDiscovered LevelDB databases:');
levelDbs.forEach(db => console.log(' -', db));
