const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Parses a Postman v12 collection directory into a unified collection object
 */
function parseCollectionDirectory(collectionDir) {
  if (!fs.existsSync(collectionDir) || !fs.statSync(collectionDir).isDirectory()) {
    throw new Error(`Directory not found or not a directory: ${collectionDir}`);
  }

  // 1. Read definition.yaml
  const defFile = path.join(collectionDir, '.resources', 'definition.yaml');
  let meta = {
    name: path.basename(collectionDir),
    description: '',
    variables: []
  };

  if (fs.existsSync(defFile)) {
    try {
      const def = yaml.load(fs.readFileSync(defFile, 'utf8'));
      if (def) {
        meta.name = def.name || meta.name;
        meta.description = def.description || '';
        meta.variables = def.variables || [];
      }
    } catch (e) {
      console.warn(`Warning reading definition.yaml: ${e.message}`);
    }
  }

  // Auto-discover environments if collection variables are empty
  if (meta.variables.length === 0) {
    const candidateEnvDirs = [
      path.join(collectionDir, '..', '..', 'environments'),
      path.join(collectionDir, '..', 'environments'),
      path.join(collectionDir, 'environments')
    ];
    for (const envDir of candidateEnvDirs) {
      if (fs.existsSync(envDir) && fs.statSync(envDir).isDirectory()) {
        const files = fs.readdirSync(envDir);
        for (const f of files) {
          if (f.endsWith('.environment.yaml') || f.endsWith('.env.yaml')) {
            try {
              const envData = yaml.load(fs.readFileSync(path.join(envDir, f), 'utf8'));
              if (envData && Array.isArray(envData.values)) {
                for (const v of envData.values) {
                  if (!meta.variables.some(existing => existing.key === v.key)) {
                    meta.variables.push({
                      key: v.key,
                      value: v.value != null ? String(v.value) : ''
                    });
                  }
                }
              }
            } catch (_) {}
          }
        }
        if (meta.variables.length > 0) break;
      }
    }
  }

  // 2. Read recursive items (folders and requests)
  function readFolder(currentDir) {
    const items = [];
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    // Sort entries so requests/folders follow order if possible
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // skip .resources, .git
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        const subItems = readFolder(fullPath);
        items.push({
          type: 'folder',
          name: entry.name,
          item: subItems
        });
      } else if (entry.isFile() && entry.name.endsWith('.request.yaml')) {
        try {
          const reqData = yaml.load(fs.readFileSync(fullPath, 'utf8'));
          const reqName = entry.name.replace(/\.request\.yaml$/i, '');
          items.push({
            type: 'request',
            name: reqName,
            rawFile: fullPath,
            data: reqData
          });
        } catch (e) {
          console.warn(`Warning reading request ${entry.name}: ${e.message}`);
        }
      }
    }

    // Sort by order property if available
    items.sort((a, b) => {
      const orderA = a.data?.order ?? 99999;
      const orderB = b.data?.order ?? 99999;
      return orderA - orderB;
    });

    return items;
  }

  const items = readFolder(collectionDir);

  return {
    meta,
    items
  };
}

/**
 * Converts unified collection to standard Postman Collection v2.1.0 format
 * @param {Object} parsed - Parsed collection data
 * @param {Object} options - { sanitize: boolean }
 */
function toPostmanV21(parsed, options = {}) {
  const sanitize = !!options.sanitize;

  function transformItem(item) {
    if (item.type === 'folder') {
      return {
        name: item.name,
        item: item.item.map(transformItem)
      };
    }

    const d = item.data || {};
    const urlStr = d.url || '';
    
    // Parse URL into Postman v2.1 URL object
    let host = [];
    let pathParts = [];
    let query = [];

    // Separate query string if any
    let urlWithoutQuery = urlStr;
    if (urlStr.includes('?')) {
      const parts = urlStr.split('?');
      urlWithoutQuery = parts[0];
      const qs = parts[1];
      qs.split('&').forEach(pair => {
        if (!pair) return;
        const [k, v] = pair.split('=');
        let val = decodeURIComponent(v || '');
        if (sanitize && /(key|secret|token|password|auth)/i.test(k)) {
          val = '{{SECRET_PLACEHOLDER}}';
        }
        query.push({ key: decodeURIComponent(k || ''), value: val });
      });
    }

    if (urlWithoutQuery.startsWith('{{')) {
      const slashIdx = urlWithoutQuery.indexOf('/');
      if (slashIdx !== -1) {
        host = [urlWithoutQuery.slice(0, slashIdx)];
        pathParts = urlWithoutQuery.slice(slashIdx + 1).split('/').filter(Boolean);
      } else {
        host = [urlWithoutQuery];
      }
    } else {
      try {
        const u = new URL(urlWithoutQuery.startsWith('http') ? urlWithoutQuery : `http://localhost/${urlWithoutQuery.replace(/^\/+/, '')}`);
        host = u.hostname ? [u.hostname] : [];
        pathParts = u.pathname.split('/').filter(Boolean);
      } catch (_) {
        pathParts = urlWithoutQuery.split('/').filter(Boolean);
      }
    }

    // Headers
    const headers = (d.headers || []).map(h => {
      let val = h.value != null ? String(h.value) : '';
      if (sanitize && h.key?.toLowerCase() === 'authorization' && !val.includes('{{')) {
        val = 'Bearer {{API_TOKEN_PLACEHOLDER}}';
      }
      return {
        key: String(h.key || ''),
        value: val,
        type: 'text'
      };
    });

    // Body
    let body = undefined;
    if (d.body && d.body.content != null) {
      let content = typeof d.body.content === 'string' ? d.body.content : JSON.stringify(d.body.content);
      if (sanitize) {
        content = content.replace(/"(password|passwd|secret|apiKey)":\s*"[^"\{\}]+"/gi, '"$1": "{{MASKED_VALUE}}"');
      }
      body = {
        mode: d.body.type === 'json' ? 'raw' : (d.body.type || 'raw'),
        raw: content,
        options: {
          raw: {
            language: d.body.type || 'json'
          }
        }
      };
    }

    // Events / Scripts
    const events = [];
    if (d.scripts && Array.isArray(d.scripts)) {
      for (const s of d.scripts) {
        events.push({
          listen: s.type === 'afterResponse' ? 'test' : 'prerequest',
          script: {
            type: 'text/javascript',
            exec: (s.code || '').split('\n')
          }
        });
      }
    }

    return {
      name: item.name,
      request: {
        method: (d.method || 'GET').toUpperCase(),
        header: headers,
        body: body,
        url: {
          raw: urlStr,
          host: host,
          path: pathParts,
          query: query.length > 0 ? query : undefined
        },
        description: d.description || ''
      },
      event: events.length > 0 ? events : undefined,
      response: []
    };
  }

  const variables = (parsed.meta.variables || []).map(v => {
    let val = v.value;
    if (sanitize && /(secret|token|password|key|auth)/i.test(v.key)) {
      val = '';
    }
    return {
      key: v.key,
      value: val,
      type: 'string'
    };
  });

  return {
    info: {
      _postman_id: require('crypto').randomUUID(),
      name: parsed.meta.name + (sanitize ? ' (Sanitized)' : ''),
      description: parsed.meta.description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: parsed.items.map(transformItem),
    variable: variables
  };
}

/**
 * Converts unified collection to OpenAPI 3.0.3 specification
 * @param {Object} parsed - Parsed collection data
 * @param {Object} options - { sanitize: boolean }
 */
function toOpenApi3(parsed, options = {}) {
  const sanitize = !!options.sanitize;
  const paths = {};
  const tags = new Set();

  function processItem(item, folderName = null) {
    if (item.type === 'folder') {
      tags.add(item.name);
      item.item.forEach(sub => processItem(sub, item.name));
      return;
    }

    const d = item.data || {};
    const method = (d.method || 'get').toLowerCase();
    let rawUrl = d.url || '';

    // Strip {{baseUrl}} or host
    let route = rawUrl.replace(/^\{\{[^\}]+\}\}/, '').replace(/^https?:\/\/[^\/]+/, '');
    if (!route.startsWith('/')) route = '/' + route;
    // Strip query string for path key
    const qIdx = route.indexOf('?');
    if (qIdx !== -1) route = route.slice(0, qIdx);

    // Convert :param or {{param}} to {param} for OpenAPI
    route = route.replace(/:([a-zA-Z0-9_]+)/g, '{$1}').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, '{$1}');

    if (!paths[route]) {
      paths[route] = {};
    }

    // Extract path parameters
    const pathParams = [];
    const pMatches = route.match(/\{([a-zA-Z0-9_]+)\}/g);
    if (pMatches) {
      for (const m of pMatches) {
        const paramName = m.replace(/[\{\}]/g, '');
        pathParams.push({
          name: paramName,
          in: 'path',
          required: true,
          schema: { type: 'string' }
        });
      }
    }

    // Extract query parameters from URL
    const queryParams = [];
    if (rawUrl.includes('?')) {
      const qs = rawUrl.split('?')[1];
      const pairs = qs.split('&');
      for (const pair of pairs) {
        const [k, v] = pair.split('=');
        if (k) {
          queryParams.push({
            name: decodeURIComponent(k),
            in: 'query',
            required: false,
            schema: { type: 'string', default: v ? decodeURIComponent(v) : undefined }
          });
        }
      }
    }

    const operation = {
      summary: item.name,
      description: d.description || '',
      tags: folderName ? [folderName] : ['General'],
      parameters: [...pathParams, ...queryParams],
      responses: {
        '200': {
          description: 'Successful response'
        }
      }
    };

    // Body
    if (d.body && d.body.content && ['post', 'put', 'patch'].includes(method)) {
      let exampleJson = null;
      try {
        exampleJson = JSON.parse(d.body.content);
      } catch (_) {}

      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              example: exampleJson || d.body.content
            }
          }
        }
      };
    }

    // Security detection (Bearer, ApiKey)
    const hasAuth = (d.headers || []).some(h => h.key?.toLowerCase() === 'authorization');
    if (hasAuth) {
      operation.security = [{ BearerAuth: [] }];
    }

    paths[route][method] = operation;
  }

  parsed.items.forEach(item => processItem(item));

  return {
    openapi: '3.0.3',
    info: {
      title: parsed.meta.name,
      description: parsed.meta.description || 'Generated from offline Postman collection',
      version: '1.0.0'
    },
    servers: [
      {
        url: parsed.meta.variables?.find(v => v.key === 'baseUrl')?.value || 'http://localhost:3000',
        description: 'Default server'
      }
    ],
    tags: Array.from(tags).map(t => ({ name: t })),
    paths: paths,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    }
  };
}

module.exports = {
  parseCollectionDirectory,
  toPostmanV21,
  toOpenApi3
};
