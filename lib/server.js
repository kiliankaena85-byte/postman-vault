const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { scanProfiles } = require('./scanner');
const { parseCollectionDirectory, toPostmanV21, toOpenApi3 } = require('./converter');
const { auditCollection } = require('./security_audit');

function isValidDir(p) {
  try {
    return !!(p && fs.existsSync(p) && fs.statSync(p).isDirectory());
  } catch (_) {
    return false;
  }
}

function startServer(port = 4567) {
  const server = http.createServer((req, res) => {
    // Localhost Origin protection
    const origin = req.headers.origin;
    if (origin) {
      try {
        const u = new URL(origin);
        if (!['localhost', '127.0.0.1'].includes(u.hostname)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          return res.end('Forbidden: Cross-origin access denied.');
        }
      } catch (_) {
        res.writeHead(400);
        return res.end('Invalid Origin');
      }
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // API: Scan
    if (url.pathname === '/api/scan') {
      const data = scanProfiles();
      let totalEndpoints = 0;
      const collections = [];

      for (const p of data.discoveredPaths) {
        try {
          const parsed = parseCollectionDirectory(p);
          const reqCount = countRequests(parsed.items);
          totalEndpoints += reqCount;
          const audit = auditCollection(parsed);
          collections.push({
            path: p,
            name: parsed.meta.name,
            description: parsed.meta.description,
            requestCount: reqCount,
            audit: {
              critical: audit.criticalCount,
              high: audit.highCount,
              medium: audit.mediumCount,
              score: Math.max(0, 100 - (audit.criticalCount * 40 + audit.highCount * 20 + audit.mediumCount * 5))
            }
          });
        } catch (_) {}
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ...data,
        totalEndpoints,
        collections
      }));
    }

    // API: Endpoints Tree
    if (url.pathname === '/api/tree') {
      const target = url.searchParams.get('path');
      if (!isValidDir(target)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Valid directory path required' }));
      }
      const parsed = parseCollectionDirectory(target);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ meta: parsed.meta, items: parsed.items }));
    }

    // API: Audit
    if (url.pathname === '/api/audit') {
      const target = url.searchParams.get('path');
      if (!isValidDir(target)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Valid directory path required' }));
      }
      const parsed = parseCollectionDirectory(target);
      const report = auditCollection(parsed);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ collection: parsed.meta, report }));
    }

    // API: Export
    if (url.pathname === '/api/export') {
      const target = url.searchParams.get('path');
      const format = url.searchParams.get('format') || 'v21';
      const sanitize = url.searchParams.get('sanitize') === 'true';

      if (!isValidDir(target)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Valid directory path required' }));
      }
      const parsed = parseCollectionDirectory(target);
      const prefix = sanitize ? 'sanitized_' : '';
      const safeName = prefix + parsed.meta.name.replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase();

      if (format === 'v21') {
        const v21 = toPostmanV21(parsed, { sanitize });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${safeName}.postman_collection.json"`
        });
        return res.end(JSON.stringify(v21, null, 2));
      } else if (format === 'openapi-yaml') {
        const openapi = toOpenApi3(parsed, { sanitize });
        res.writeHead(200, {
          'Content-Type': 'text/yaml',
          'Content-Disposition': `attachment; filename="${safeName}.openapi.yaml"`
        });
        return res.end(yaml.dump(openapi, { indent: 2, lineWidth: -1 }));
      } else if (format === 'openapi-json') {
        const openapi = toOpenApi3(parsed, { sanitize });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${safeName}.openapi.json"`
        });
        return res.end(JSON.stringify(openapi, null, 2));
      }
    }

    // UI Dashboard HTML
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(getHtml());
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`\n======================================================`);
    console.log(`   POSTMAN VAULT - Web Dashboard is Live!            `);
    console.log(`   Open in browser: http://localhost:${port}          `);
    console.log(`   Loopback bound:  127.0.0.1 (Air-Gapped)           `);
    console.log(`======================================================\n`);
  });
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

function getHtml() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Postman Vault — Автономный экспорт и аудит коллекций</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #131b2e;
      --card-hover: #1a243d;
      --border: #212e4a;
      --border-accent: #3b82f6;
      --text: #94a3b8;
      --text-bright: #f8fafc;
      --accent: #ff6c37;
      --accent-hover: #e05b2b;
      --green: #10b981;
      --green-bg: rgba(16, 185, 129, 0.12);
      --red: #ef4444;
      --red-bg: rgba(239, 68, 68, 0.12);
      --yellow: #f59e0b;
      --blue: #3b82f6;
      --blue-bg: rgba(59, 130, 246, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 24px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .logo-area {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .logo-badge {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #ff6c37, #ea580c);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(255, 108, 55, 0.35);
    }
    h1 {
      color: var(--text-bright);
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .subtitle {
      color: #64748b;
      font-size: 13px;
      margin-top: 2px;
    }
    .top-status {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .badge {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .badge-airgap {
      background: var(--green-bg);
      color: var(--green);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-user {
      background: var(--blue-bg);
      color: var(--blue);
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .stat-label {
      font-size: 13px;
      color: #64748b;
      font-weight: 500;
    }
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text-bright);
      margin-top: 6px;
    }

    /* Section */
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Collection Card */
    .collection-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 20px;
      transition: border-color 0.2s;
    }
    .collection-card:hover {
      border-color: var(--border-accent);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .card-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-bright);
      margin: 0;
    }
    .card-path {
      color: #64748b;
      font-size: 13px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      margin-top: 4px;
    }
    .card-desc {
      color: #94a3b8;
      font-size: 14px;
      margin: 12px 0 20px 0;
    }
    .card-footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      padding-top: 18px;
      border-top: 1px solid var(--border);
      gap: 12px;
    }
    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .btn {
      padding: 9px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.15s ease-in-out;
      border: none;
    }
    .btn-primary {
      background: var(--accent);
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(255, 108, 55, 0.25);
    }
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    .btn-clean {
      background: var(--green);
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
    }
    .btn-clean:hover {
      filter: brightness(1.1);
    }
    .btn-secondary {
      background: #1e293b;
      color: var(--text-bright);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: #334155;
    }

    /* Endpoints Explorer */
    .explorer-panel {
      margin-top: 20px;
      padding: 16px;
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: 10px;
      display: none;
    }
    .endpoint-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-bottom: 1px solid #131b2e;
      font-size: 13px;
    }
    .endpoint-item:last-child { border-bottom: none; }
    .method-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      min-width: 52px;
      text-align: center;
    }
    .method-get { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .method-post { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .method-put { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .method-delete { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .endpoint-path {
      color: var(--text-bright);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      flex: 1;
    }
    .endpoint-name { color: #64748b; }

    /* Audit Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 20px;
    }
    .modal-box {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      max-width: 650px;
      width: 100%;
      padding: 28px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      max-height: 85vh;
      overflow-y: auto;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .modal-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-bright);
      margin: 0;
    }
    .close-btn {
      background: none;
      border: none;
      color: #64748b;
      font-size: 22px;
      cursor: pointer;
    }
    .finding-card {
      background: #090d16;
      border-left: 4px solid var(--yellow);
      padding: 12px 16px;
      border-radius: 6px;
      margin-top: 10px;
    }
    .finding-card.CRITICAL { border-left-color: var(--red); }

    /* Guide Box */
    .guide-box {
      background: #090d16;
      border: 1px dashed var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-top: 36px;
    }
    .guide-title {
      color: var(--text-bright);
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 8px;
    }
    .guide-steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 12px;
      font-size: 13px;
    }
    .guide-step {
      background: var(--card);
      padding: 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
  </style>
</head>
<body>

  <div class="container">
    <!-- Header -->
    <header>
      <div class="logo-area">
        <div class="logo-badge">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#ffffff"/><path d="M22 16a6 6 0 11-12 0 6 6 0 0112 0z" fill="#ff6c37"/></svg>
        </div>
        <div>
          <h1>Postman Vault</h1>
          <div class="subtitle">Автономный экспорт коллекций и аудит безопасности</div>
        </div>
      </div>

      <div class="top-status">
        <span class="badge badge-airgap">
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0c-.69 0-1.843.265-2.928.56-1.11.3-2.229.655-2.887.87a1.54 1.54 0 0 0-1.044 1.262c-.596 4.477.787 7.795 2.464 9.99a11.8 11.8 0 0 0 4.048 3.19.5.5 0 0 0 .694-.288c.84-2.186 1.83-4.524 2.128-7.5a1.5 1.5 0 0 0-.67-1.39A18 18 0 0 0 8 0z"/></svg>
          100% Локально (Без облака)
        </span>
        <span class="badge badge-user" id="user-badge">Загрузка профиля...</span>
      </div>
    </header>

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Найденные коллекции</div>
        <div class="stat-value" id="stat-collections">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Всего API-запросов (Endpoints)</div>
        <div class="stat-value" id="stat-endpoints">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Индекс безопасности</div>
        <div class="stat-value" style="color: var(--green);" id="stat-security">100%</div>
      </div>
    </div>

    <!-- Collections List -->
    <div class="section-title">
      <span>Локальные воркспейсы Postman</span>
      <button class="btn btn-secondary" onclick="loadDashboard()">↻ Обновить поиск</button>
    </div>

    <div id="collections-container">
      <p style="color:#64748b;">Сканирование внутренней базы данных Postman...</p>
    </div>

    <!-- Guide -->
    <div class="guide-box">
      <div class="guide-title">💡 Куда импортировать полученные файлы?</div>
      <div class="guide-steps">
        <div class="guide-step">
          <strong style="color:var(--text-bright);">В открытый клиент Bruno:</strong><br>
          Скачайте «Postman v2.1 JSON», откройте Bruno $\to$ «Import Collection» $\to$ выберите файл. Всё заработает без аккаунта.
        </div>
        <div class="guide-step">
          <strong style="color:var(--text-bright);">В Swagger / документацию команды:</strong><br>
          Скачайте «OpenAPI 3.0 YAML». Это мировой стандарт документирования API, поддерживаемый всеми платформами.
        </div>
        <div class="guide-step">
          <strong style="color:var(--text-bright);">Для подрядчиков или в Git:</strong><br>
          Нажмите зелёную кнопку «Безопасный экспорт». Программа сотрет боевые пароли и токены перед сохранением.
        </div>
      </div>
    </div>
  </div>

  <!-- Audit Modal -->
  <div class="modal-overlay" id="audit-modal">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">🛡️ Отчёт аудита безопасности</div>
        <button class="close-btn" onclick="closeAuditModal()">&times;</button>
      </div>
      <div id="audit-modal-body">Анализ...</div>
    </div>
  </div>

  <script>
    let dashboardData = null;

    async function loadDashboard() {
      const container = document.getElementById('collections-container');
      container.innerHTML = '<p style="color:#64748b;">Сканирование внутренней памяти Postman Desktop...</p>';

      try {
        const res = await fetch('/api/scan');
        dashboardData = await res.json();

        // Update User
        const user = dashboardData.profiles.find(p => p.namespace === 'users') || dashboardData.profiles[0];
        document.getElementById('user-badge').textContent = user ? (user.name || user.email || 'Локальный пользователь') : 'Offline';

        // Update Stats
        document.getElementById('stat-collections').textContent = dashboardData.collections.length;
        document.getElementById('stat-endpoints').textContent = dashboardData.totalEndpoints;

        if (dashboardData.collections.length === 0) {
          container.innerHTML = '<p style="color:#64748b;">Локальных репозиториев не найдено. Убедитесь, что в Postman есть хотя бы одна коллекция.</p>';
          return;
        }

        container.innerHTML = '';
        dashboardData.collections.forEach((col, idx) => {
          const card = document.createElement('div');
          card.className = 'collection-card';
          card.innerHTML = \`
            <div class="card-header">
              <div>
                <h3 class="card-title">\${col.name}</h3>
                <div class="card-path">\${col.path}</div>
              </div>
              <span class="badge" style="background:rgba(59, 130, 246, 0.15); color:var(--blue);">
                \${col.requestCount} эндпоинтов
              </span>
            </div>

            <div class="card-desc">\${col.description || 'Локальная коллекция API'}</div>

            <div class="card-footer">
              <div class="btn-group">
                <!-- Safe Sanitized Export (Recommended) -->
                <a class="btn btn-clean" title="Стирает токены и пароли перед сохранением" href="/api/export?path=\${encodeURIComponent(col.path)}&format=v21&sanitize=true" download>
                  🔒 Безопасный экспорт (Без утечек)
                </a>
                <!-- Postman v2.1 -->
                <a class="btn btn-secondary" href="/api/export?path=\${encodeURIComponent(col.path)}&format=v21" download>
                  📥 Postman v2.1 JSON
                </a>
                <!-- OpenAPI 3.0 -->
                <a class="btn btn-secondary" href="/api/export?path=\${encodeURIComponent(col.path)}&format=openapi-yaml" download>
                  📄 OpenAPI 3.0 (YAML)
                </a>
              </div>

              <div class="btn-group">
                <button class="btn btn-secondary" onclick="openAuditModal('\${encodeURIComponent(col.path)}')">
                  🛡️ Проверить утечки
                </button>
                <button class="btn btn-secondary" onclick="toggleExplorer(\${idx}, '\${encodeURIComponent(col.path)}')">
                  👁️ Запросы (\${col.requestCount})
                </button>
              </div>
            </div>

            <div class="explorer-panel" id="explorer-\${idx}">
              <div style="font-weight:600; margin-bottom:8px; color:var(--text-bright);">Список доступных запросов:</div>
              <div id="explorer-list-\${idx}">Загрузка...</div>
            </div>
          \`;
          container.appendChild(card);
        });

      } catch (e) {
        container.innerHTML = '<p style="color:var(--red);">Ошибка сканирования: ' + e.message + '</p>';
      }
    }

    async function toggleExplorer(idx, encodedPath) {
      const panel = document.getElementById('explorer-' + idx);
      const list = document.getElementById('explorer-list-' + idx);

      if (panel.style.display === 'block') {
        panel.style.display = 'none';
        return;
      }

      panel.style.display = 'block';
      list.innerHTML = 'Загрузка эндпоинтов...';

      try {
        const res = await fetch('/api/tree?path=' + encodedPath);
        const data = await res.json();
        list.innerHTML = '';

        function renderItems(items, folder = '') {
          items.forEach(it => {
            if (it.type === 'folder') {
              renderItems(it.item, folder + it.name + ' / ');
            } else if (it.type === 'request') {
              const el = document.createElement('div');
              el.className = 'endpoint-item';
              const m = (it.data?.method || 'GET').toLowerCase();
              el.innerHTML = \`
                <span class="method-badge method-\${m}">\${m.toUpperCase()}</span>
                <span class="endpoint-path">\${it.data?.url || '/'}</span>
                <span class="endpoint-name">[\${folder}\${it.name}]</span>
              \`;
              list.appendChild(el);
            }
          });
        }

        renderItems(data.items);
      } catch (err) {
        list.innerHTML = '<p style="color:var(--red);">Ошибка: ' + err.message + '</p>';
      }
    }

    async function openAuditModal(encodedPath) {
      const modal = document.getElementById('audit-modal');
      const body = document.getElementById('audit-modal-body');
      modal.style.display = 'flex';
      body.innerHTML = 'Проверка безопасности и поиск токенов...';

      try {
        const res = await fetch('/api/audit?path=' + encodedPath);
        const data = await res.json();
        const r = data.report;

        let html = \`
          <div style="display:flex; justify-content:space-between; align-items:center; background:#090d16; padding:16px; border-radius:10px; margin-bottom:16px;">
            <div>
              <div style="font-size:13px; color:#64748b;">Проверено эндпоинтов</div>
              <div style="font-size:22px; font-weight:700; color:var(--text-bright);">\${data.collection.name}</div>
            </div>
            <div>
              <span class="badge" style="\${r.criticalCount === 0 ? 'background:var(--green-bg); color:var(--green);' : 'background:var(--red-bg); color:var(--red);'} font-size:14px; padding:8px 14px;">
                \${r.criticalCount === 0 ? '✓ Безопасно' : '! Требует внимания'}
              </span>
            </div>
          </div>
        \`;

        if (r.findings.length === 0) {
          html += \`
            <div style="padding:16px; background:var(--green-bg); border-radius:8px; color:var(--green);">
              <strong>Отличная новость!</strong> В этой коллекции нет открытых паролей, захардкоженных JWT-токенов или ключей авторизации. Все запросы соответствуют стандартам безопасности.
            </div>
          \`;
        } else {
          html += '<div style="font-weight:600; color:var(--text-bright); margin-bottom:10px;">Обнаруженные предупреждения:</div>';
          r.findings.forEach(f => {
            html += \`
              <div class="finding-card \${f.severity}">
                <div style="font-weight:600; color:var(--text-bright);">\${f.type}</div>
                <div style="color:#64748b; font-size:12px; margin-top:2px;">\${f.location}</div>
                <div style="margin-top:6px; font-size:13px;">\${f.description}</div>
              </div>
            \`;
          });
        }

        body.innerHTML = html;
      } catch (err) {
        body.innerHTML = '<p style="color:var(--red);">Ошибка: ' + err.message + '</p>';
      }
    }

    function closeAuditModal() {
      document.getElementById('audit-modal').style.display = 'none';
    }

    loadDashboard();
  </script>
</body>
</html>`;
}

module.exports = {
  startServer
};
