#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { scanProfiles } = require('../lib/scanner');
const { parseCollectionDirectory, toPostmanV21, toOpenApi3 } = require('../lib/converter');
const { auditCollection } = require('../lib/security_audit');
const { startServer } = require('../lib/server');

const args = process.argv.slice(2);
const command = args[0];

function printHeader() {
  console.log('\n======================================================');
  console.log('   POSTMAN VAULT - Offline Porter & Security Auditor   ');
  console.log('======================================================\n');
}

function printHelp() {
  printHeader();
  console.log('Usage:');
  console.log('  postman-vault ui [port]             Launch local Web Dashboard (default: 4567)');
  console.log('  postman-vault scan                  Scan system for local Postman collections');
  console.log('  postman-vault audit <path>          Run security audit on a collection');
  console.log('  postman-vault export <path> [opts]  Export collection to OpenAPI / Postman v2.1\n');
  console.log('Export Options:');
  console.log('  --format <v21|openapi|all>          Export format (default: all)');
  console.log('  --out <dir>                         Target directory (default: ./output)');
  console.log('  --sanitize                          Scrub tokens and passwords from output');
  console.log('  --audit                             Run security check before exporting\n');
  console.log('Examples:');
  console.log('  postman-vault scan');
  console.log('  postman-vault export "./collections/MyAPI" --format all --out ./dist --sanitize');
  console.log('  postman-vault audit "./collections/MyAPI"\n');
}

const pkg = require('../package.json');

if (command === '--version' || command === '-v') {
  console.log(`v${pkg.version}`);
  process.exit(0);
}

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'ui') {
  const port = parseInt(args[1], 10) || 4567;
  startServer(port);
} else if (command === 'scan') {
  printHeader();
  console.log('Scanning local Postman data directory and LevelDB registries...\n');
  const res = scanProfiles();

  if (!res.exists) {
    console.log(`[!] Postman data directory not found at: ${res.postmanDir}`);
    process.exit(1);
  }

  console.log(`[+] Postman Directory: ${res.postmanDir}`);
  console.log(`[+] Registered User Partitions (${res.profiles.length}):`);
  res.profiles.forEach(p => {
    console.log(`    - [${p.namespace}] ${p.name || 'Unnamed'} (ID: ${p.userId || 'N/A'}, Team: ${p.teamId || 'N/A'})`);
    if (p.email) console.log(`      Email: ${p.email}`);
  });

  console.log(`\n[+] Discovered Local Collection Repositories (${res.discoveredPaths.length}):`);
  if (res.discoveredPaths.length === 0) {
    console.log('    No linked git repositories discovered in LevelDB logs.');
  } else {
    res.discoveredPaths.forEach(p => {
      console.log(`    -> ${p}`);
    });
  }
  console.log('\nYou can now run:');
  console.log('  postman-vault export "<path>" --out ./exported\n');
  process.exit(0);
}

if (command === 'audit') {
  const targetPath = args[1];
  if (!targetPath) {
    console.error('Error: Please provide collection directory path.');
    process.exit(1);
  }

  printHeader();
  console.log(`Auditing collection at: ${targetPath}...\n`);
  const parsed = parseCollectionDirectory(path.resolve(targetPath));
  const report = auditCollection(parsed);

  console.log(`Collection Name: "${parsed.meta.name}"`);
  console.log(`Total Requests Scanned: ${countRequests(parsed.items)}`);
  console.log('------------------------------------------------------');
  console.log(`Critical Vulnerabilities: ${report.criticalCount}`);
  console.log(`High Severity Findings:    ${report.highCount}`);
  console.log(`Medium Warnings:           ${report.mediumCount}`);
  console.log('------------------------------------------------------\n');

  if (report.findings.length === 0) {
    console.log(' [PASS] No hardcoded secrets, plain tokens, or credential leaks detected!');
  } else {
    report.findings.forEach((f, idx) => {
      const color = f.severity === 'CRITICAL' ? '[! CRITICAL !]' : f.severity === 'HIGH' ? '[HIGH]' : '[MEDIUM]';
      console.log(`${idx + 1}. ${color} ${f.type}`);
      console.log(`   Location:    ${f.location}`);
      console.log(`   Description: ${f.description}`);
      if (f.snippet) console.log(`   Snippet:     ${f.snippet}`);
      console.log('');
    });
  }
  process.exit(report.criticalCount > 0 ? 1 : 0);
}

if (command === 'export') {
  const targetPath = args[1];
  if (!targetPath) {
    console.error('Error: Please provide collection directory path.');
    process.exit(1);
  }

  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : 'all';

  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? path.resolve(args[outIdx + 1]) : path.resolve('./exported');

  const shouldAudit = args.includes('--audit');
  const sanitize = args.includes('--sanitize');

  printHeader();
  console.log(`Loading collection from: ${targetPath}...`);
  const parsed = parseCollectionDirectory(path.resolve(targetPath));
  console.log(`[+] Collection: "${parsed.meta.name}" (${countRequests(parsed.items)} requests found)`);
  if (sanitize) {
    console.log(`[+] Sanitization ENABLED: sensitive tokens, passwords and secrets will be scrubbed.`);
  }

  if (shouldAudit) {
    console.log('\nRunning pre-export security audit...');
    const report = auditCollection(parsed);
    if (report.criticalCount > 0) {
      console.error(`\n[ABORT] Found ${report.criticalCount} CRITICAL security leaks! Export aborted.`);
      process.exit(1);
    } else {
      console.log(`[+] Security check passed (Warnings: ${report.mediumCount})`);
    }
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const prefix = sanitize ? 'sanitized_' : '';
  const safeName = prefix + parsed.meta.name.replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase();

  // Export Postman v2.1.0 JSON
  if (format === 'v21' || format === 'all') {
    const v21Data = toPostmanV21(parsed, { sanitize });
    const v21File = path.join(outDir, `${safeName}.postman_collection.json`);
    fs.writeFileSync(v21File, JSON.stringify(v21Data, null, 2), 'utf8');
    console.log(`[+] Exported Postman v2.1 Collection: ${v21File}`);
  }

  // Export OpenAPI 3.0.3 (YAML and JSON)
  if (format === 'openapi' || format === 'all') {
    const openapiData = toOpenApi3(parsed, { sanitize });
    const yamlFile = path.join(outDir, `${safeName}.openapi.yaml`);
    fs.writeFileSync(yamlFile, yaml.dump(openapiData, { indent: 2, lineWidth: -1 }), 'utf8');
    console.log(`[+] Exported OpenAPI 3.0 YAML:        ${yamlFile}`);

    const jsonFile = path.join(outDir, `${safeName}.openapi.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(openapiData, null, 2), 'utf8');
    console.log(`[+] Exported OpenAPI 3.0 JSON:        ${jsonFile}`);
  }

  console.log('\n[SUCCESS] All artifacts generated successfully without cloud sync!\n');
  process.exit(0);
}

function countRequests(items) {
  let count = 0;
  for (const item of items) {
    if (item.type === 'folder') {
      count += countRequests(item.item);
    } else if (item.type === 'request') {
      count++;
    }
  }
  return count;
}
