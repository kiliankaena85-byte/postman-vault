const fs = require('fs');
const path = require('path');

function getPostmanDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'Postman');
  } else if (process.platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Library', 'Application Support', 'Postman');
  } else {
    return path.join(process.env.HOME || '', '.config', 'Postman');
  }
}

function scanProfiles() {
  const postmanDir = getPostmanDataDir();
  const profiles = [];

  if (!fs.existsSync(postmanDir)) {
    return { postmanDir, exists: false, profiles, discoveredPaths: [] };
  }

  const userPartitionFile = path.join(postmanDir, 'storage', 'userPartitionData.json');
  if (fs.existsSync(userPartitionFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(userPartitionFile, 'utf8'));
      if (data.v8Partitions) {
        for (const [uuid, pInfo] of Object.entries(data.v8Partitions)) {
          profiles.push({
            uuid,
            namespace: pInfo.context?.namespace || 'unknown',
            userId: pInfo.context?.userId,
            teamId: pInfo.context?.teamId,
            name: pInfo.meta?.name || 'Local Profile',
            email: pInfo.meta?.email || null,
            lastUpdated: pInfo.meta?.lastUpdated || null
          });
        }
      }
    } catch (e) {
      // ignore parse error
    }
  }

  // Scan leveldb logs for primaryPath
  const discoveredPaths = new Set();
  const partitionsDir = path.join(postmanDir, 'Partitions');
  if (fs.existsSync(partitionsDir)) {
    try {
      const partitions = fs.readdirSync(partitionsDir);
      for (const part of partitions) {
        const idbDir = path.join(partitionsDir, part, 'IndexedDB');
        if (!fs.existsSync(idbDir)) continue;
        const dbs = fs.readdirSync(idbDir);
        for (const dbName of dbs) {
          if (!dbName.endsWith('.leveldb')) continue;
          const fullDb = path.join(idbDir, dbName);
          const files = fs.readdirSync(fullDb);
          for (const f of files) {
            if (f.endsWith('.log')) {
              try {
                const content = fs.readFileSync(path.join(fullDb, f), 'utf8');
                // Regex for primaryPath followed by file path (cross-platform for Windows and POSIX)
                const matches = content.match(/primaryPath[^\/\\A-Za-z0-9]*([A-Za-z]:[\\\/][a-zA-Z0-9_\-\.\/\\ ]+|\/[a-zA-Z0-9_\-\.\/\\ ]+)/g);
                if (matches) {
                  for (const m of matches) {
                    const cleanMatch = m.match(/([A-Za-z]:[\\\/][a-zA-Z0-9_\-\.\/\\ ]+|\/[a-zA-Z0-9_\-\.\/\\ ]+)/);
                    if (cleanMatch) {
                      const clean = cleanMatch[1].trim();
                      const norm = path.normalize(clean);
                      if ((clean.includes('/collections') || clean.includes('\\collections')) && fs.existsSync(norm)) {
                        // Find collection root directory
                        let cur = fs.statSync(norm).isDirectory() ? norm : path.dirname(norm);
                        while (cur && path.basename(path.dirname(cur)) === 'collections') {
                          break;
                        }
                        if (path.basename(path.dirname(cur)) === 'collections' || fs.existsSync(path.join(cur, '.resources'))) {
                          discoveredPaths.add(path.normalize(cur));
                        }
                      }
                    }
                  }
                }
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}
  }

  return {
    postmanDir,
    exists: true,
    profiles,
    discoveredPaths: Array.from(discoveredPaths)
  };
}

module.exports = {
  getPostmanDataDir,
  scanProfiles
};
