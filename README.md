# Postman Vault (Offline Porter & Security Auditor)

> **Reverse-engineered local extraction, offline migration, and security compliance auditor for Postman Desktop collections.**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Format: OpenAPI 3.0](https://img.shields.io/badge/OpenAPI-3.0.3-brightgreen.svg)](https://swagger.io/specification/)
[![Compliance: Offline Only](https://img.shields.io/badge/Security-100%25%20Air--Gapped-orange.svg)](#)

---

## 🎯 The Problem

Postman deprecated the offline **Scratch Pad** and forces users to sync all workspaces, requests, and environment tokens to their US-based cloud infrastructure.

For **Fintech, Banking, Healthcare, and Enterprise teams**, this creates acute compliance and security risks:
* **Credential Leaks:** Production API tokens, JWTs, and internal IPs get uploaded to a 3rd-party SaaS.
* **Vendor Lock-in:** Postman v12 stores collections in modular `.request.yaml` files and Chromium LevelDB/IndexedDB state that no external API client (Bruno, Insomnia, Hoppscotch) can read natively.
* **Loss of Data Residency:** Organizations are forced into proprietary enterprise tiers simply to retain local control over their own API collections.

---

## 🚀 The Solution: Postman Vault

**Postman Vault** reverse-engineers Postman Desktop’s local LevelDB registry and v12 Git repository structure. It runs **100% locally / air-gapped** and delivers:

1. 🔍 **Local Discovery:** Automatically extracts user partitions, workspaces, and collections from `%APPDATA%\Postman\Partitions` and LevelDB logs without opening Postman.
2. 🔄 **Universal Conversion:**
   * Converts modular Postman v12 repositories into **Postman Collection v2.1.0 JSON** (compatible with Insomnia, Bruno, Hoppscotch, Postwoman).
   * Generates production-ready **OpenAPI 3.0.3 (Swagger)** specifications (YAML and JSON) with automated path parameters, query extraction, and schema inference.
3. 🛡️ **Enterprise Security Audit:**
   * Scans collection files for hardcoded secrets, plain JWT tokens (`eyJ...`), AWS credentials (`AKIA...`), and unmasked passwords before export or git commit.
4. 🖥️ **Web Dashboard & CLI:**
   * One-click export and visual audit reports directly in your browser.

---

## 📦 Quick Start

### 1. Installation
```bash
git clone https://github.com/kiliankaena85-byte/postman-vault.git
cd postman-vault
npm install
```

### 2. Launch Interactive Web Dashboard
```bash
node bin/cli.js ui
```
Open **`http://localhost:4567`** to see all detected local collections and export in 1 click!

---

## 💻 CLI Commands

### Scan System for Local Collections
```bash
node bin/cli.js scan
```

### Run Security Audit
```bash
node bin/cli.js audit "./collections/MyAPI"
```

### Export to OpenAPI 3.0 & Postman v2.1
```bash
# Standard export
node bin/cli.js export "./collections/MyAPI" --out ./dist --audit

# Sanitized export (strips out tokens & secrets for public sharing)
node bin/cli.js export "./collections/MyAPI" --out ./dist --sanitize
```

---

## 🗺️ Roadmap

- [x] LevelDB & Postman v12 Local Repository Scanner
- [x] 100% Offline Converter to Postman Collection v2.1.0 (JSON)
- [x] OpenAPI 3.0.3 (YAML and JSON) generator
- [x] Automatic Secret & Token Sanitizer (`--sanitize`)
- [x] Lightweight local Web Dashboard (`localhost:4567`)
- [ ] Direct export to native Bruno (`.bru`) directory format
- [ ] GitHub Actions / GitLab CI step for automated collection compliance auditing
- [ ] Export to Insomnia v4 format

---

## 🏢 Enterprise & Commercial Support

Using Postman Vault in air-gapped environments, banks, or large engineering teams?
* Need custom format adapters or automated compliance integrations?
* Looking for dedicated migration support or private builds?

Feel free to open an issue or reach out via GitHub discussions.

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE). Contributions, bug reports, and pull requests are warmly welcome!
