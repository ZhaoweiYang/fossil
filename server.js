// 化石拍卖平台服务端 / Fossil auction platform server.
// Zero runtime dependencies — uses only Node built-ins, so `node server.js`
// runs in any fresh clone with no install step.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCategories,
  getFossils,
  getFossilDetail,
  getAuctions,
  getAuction,
  getListings,
  getSales,
  getCategoryTrend,
  getStats,
  getActivity,
  placeBid,
  createListing,
  buyListing,
  RuleError,
} from './src/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  // Serve Apple Wallet passes with the correct MIME so Safari triggers the
  // "Add to Wallet" sheet when applepay.html's PASS_URL points at a local .pkpass.
  '.pkpass': 'application/vnd.apple.pkpass',
};

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) reject(new Error('payload too large'));
      raw += c;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---- API routing ------------------------------------------------------
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const [, resource, id, action] = parts;
  const method = req.method;

  try {
    if (method === 'GET') {
      switch (resource) {
        case 'categories':
          return sendJson(res, 200, getCategories());
        case 'fossils':
          if (id) {
            const f = getFossilDetail(id);
            return f ? sendJson(res, 200, f) : sendJson(res, 404, { error: '未找到该化石' });
          }
          return sendJson(res, 200, getFossils());
        case 'auctions':
          if (id) {
            const a = getAuction(id);
            return a ? sendJson(res, 200, a) : sendJson(res, 404, { error: '未找到该场次' });
          }
          return sendJson(res, 200, getAuctions());
        case 'listings':
          return sendJson(res, 200, getListings());
        case 'sales':
          return sendJson(res, 200, getSales());
        case 'trends':
          return sendJson(res, 200, getCategoryTrend(id));
        case 'stats':
          return sendJson(res, 200, getStats());
        case 'activity':
          return sendJson(res, 200, getActivity());
        default:
          return sendJson(res, 404, { error: '未知接口' });
      }
    }

    if (method === 'POST') {
      const body = await readBody(req);
      if (resource === 'auctions' && id && action === 'bids') {
        return sendJson(res, 201, placeBid(id, body));
      }
      if (resource === 'listings' && !id) {
        return sendJson(res, 201, createListing(body));
      }
      if (resource === 'listings' && id && action === 'buy') {
        return sendJson(res, 200, buyListing(id, body));
      }
      return sendJson(res, 404, { error: '未知接口' });
    }

    return sendJson(res, 405, { error: '方法不被允许' });
  } catch (err) {
    if (err instanceof RuleError) return sendJson(res, 400, { error: err.message });
    return sendJson(res, 500, { error: '服务器错误', detail: err.message });
  }
}

// ---- static files -----------------------------------------------------
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  // prevent path traversal
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  return serveStatic(req, res, url);
});

// Export for tests; only listen when run directly.
export { server };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`🦖 化石拍卖平台已启动: http://localhost:${PORT}`);
  });
}
