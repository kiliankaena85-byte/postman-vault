/**
 * Security Auditor for Postman Collections
 * Identifies sensitive leaks, hardcoded credentials, and compliance violations
 */

const SECRET_PATTERNS = [
  { name: 'Hardcoded JWT Token', regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, severity: 'HIGH' },
  { name: 'Hardcoded AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, severity: 'CRITICAL' },
  { name: 'Hardcoded Private Key', regex: /-----BEGIN (RSA|EC|PGP|OPENSSH|DSA|ENCRYPTED)?\s?PRIVATE KEY-----/, severity: 'CRITICAL' },
  { name: 'Stripe Secret Key', regex: /sk_live_[0-9a-zA-Z]{24}/, severity: 'CRITICAL' },
  { name: 'Generic API Key / Secret in URL', regex: /[?&](api_?key|secret|token|password|auth)=([a-zA-Z0-9_\-]{8,})/i, severity: 'HIGH' },
  { name: 'Plaintext Password in Body', regex: /"(password|passwd|secret)":\s*"([^"\{\}]+)"/i, severity: 'MEDIUM' }
];

function auditCollection(parsedCollection) {
  const findings = [];

  // Check variables for filled secrets
  const sensitiveVarNames = ['secret', 'token', 'password', 'key', 'auth', 'cert'];
  for (const v of parsedCollection.meta.variables || []) {
    const isSensitive = sensitiveVarNames.some(name => String(v.key || '').toLowerCase().includes(name));
    const valStr = v.value != null ? String(v.value).trim() : '';
    if (isSensitive && valStr !== '') {
      findings.push({
        severity: 'MEDIUM',
        type: 'Populated Sensitive Variable',
        location: `Collection Variable: ${v.key}`,
        description: `Variable '${v.key}' contains non-empty value in repository definition. Risk of secret exposure.`,
        snippet: valStr.length > 8 ? valStr.slice(0, 4) + '...' + valStr.slice(-4) : '***'
      });
    }
  }

  // Check requests
  function inspectItems(items, folderPath = '') {
    for (const item of items) {
      if (item.type === 'folder') {
        inspectItems(item.item, `${folderPath}/${item.name}`);
        continue;
      }

      const d = item.data || {};
      const reqPath = `${folderPath}/${item.name}`;

      // 1. Check URL
      const url = d.url || '';
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(url)) {
          findings.push({
            severity: pattern.severity,
            type: pattern.name,
            location: `${reqPath} (URL)`,
            description: `URL contains potential secret matching ${pattern.name}.`
          });
        }
      }

      // 2. Check Headers
      for (const h of d.headers || []) {
        // Bearer token check
        if (h.key?.toLowerCase() === 'authorization' && h.value && !h.value.includes('{{')) {
          if (h.value.startsWith('Bearer ') || h.value.startsWith('Basic ')) {
            findings.push({
              severity: 'HIGH',
              type: 'Hardcoded Authorization Header',
              location: `${reqPath} (Header: ${h.key})`,
              description: 'Authorization header contains hardcoded credentials instead of a variable {{token}}.',
              snippet: h.value.slice(0, 12) + '...'
            });
          }
        }
      }

      // 3. Check Body
      if (d.body && d.body.content) {
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.regex.test(d.body.content)) {
            findings.push({
              severity: pattern.severity,
              type: pattern.name,
              location: `${reqPath} (Body)`,
              description: `Request body contains pattern matching ${pattern.name}.`
            });
          }
        }
      }
    }
  }

  inspectItems(parsedCollection.items);

  return {
    totalFindings: findings.length,
    criticalCount: findings.filter(f => f.severity === 'CRITICAL').length,
    highCount: findings.filter(f => f.severity === 'HIGH').length,
    mediumCount: findings.filter(f => f.severity === 'MEDIUM').length,
    findings
  };
}

module.exports = {
  auditCollection
};
