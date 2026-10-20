'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { redis } = require('./redis.cjs');
const { Repository } = require('./repository.cjs');
const { auth } = require('./auth.cjs');
const { types, fail } = require('./content.cjs');
const { portfolioHTML, projectHTML } = require('./render.cjs');
const root = path.resolve(__dirname, '..');
const assets = ['portfolio-theme.css', 'portfolio-motion.js', 'cms.css', 'cms.js', 'cms-admin.js', 'admin-credentials.js'];
function createApp(options = {}) {
  const env = options.env || process.env;
  const client = options.redis === undefined ? redis() : options.redis;
  const store = new Repository(client), authentication = auth(client, env);
  const origin = options.origin || env.PUBLIC_ORIGIN || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : `http://127.0.0.1:${env.PORT || 5501}`);
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  async function body(req, raw = false) {
    const max = raw ? 4 * 1024 * 1024 : 128 * 1024;
    if (Number(req.headers['content-length']) > max) fail('Request too large.', 413);
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > max) fail('Request too large.', 413); chunks.push(chunk); }
    const buffer = Buffer.concat(chunks);
    if (raw) return buffer;
    if (!req.headers['content-type']?.startsWith('application/json')) fail('Use JSON for this request.', 415);
    try { const value = JSON.parse(buffer.toString()); if (!value || typeof value !== 'object') fail('Invalid JSON.'); return value; } catch { fail('Invalid JSON.'); }
  }
  function html(res, text, status = 200) { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(text); }
  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    if (env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const pathname = new URL(req.url, origin).pathname;
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) res.setHeader('X-Robots-Tag', 'noindex');
    if (pathname.startsWith('/api/')) {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const validOrigins = [origin, env.PUBLIC_ORIGIN, env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null, host ? `https://${host}` : null, host ? `http://${host}` : null].filter(Boolean);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && !validOrigins.includes(req.headers.origin)) fail('Requests must come from this portfolio.', 403);
      if (pathname === '/api/auth/status' && req.method === 'GET') { const session = await authentication.session(req); return json(res, 200, { configured: authentication.configured, authenticated: !!session, csrf: session?.csrf || null }); }
      if (pathname === '/api/auth/login' && req.method === 'POST') return json(res, 200, await authentication.login(req, res, await body(req)));
      if (pathname === '/api/auth/logout' && req.method === 'POST') return json(res, 200, await authentication.logout(req, res));
      if (pathname === '/api/content' && req.method === 'GET') return json(res, 200, await store.publicData());
      if (pathname.startsWith('/api/admin/')) {
        await authentication.protect(req);
        if (pathname === '/api/admin/site') {
          if (req.method === 'GET') { const data = await store.read(); return json(res, 200, { site: data.site, revision: data.revision }); }
          if (req.method === 'PUT') return json(res, 200, await store.settings(await body(req)));
        }
        if (pathname === '/api/admin/overview' && req.method === 'GET') { const data = await store.read(); return json(res, 200, Object.fromEntries(Object.keys(types).map(t => [t, { total: data[t].length, published: data[t].filter(i => i.status === 'published').length }]))); }
        if (pathname === '/api/admin/uploads' && req.method === 'POST') {
          const bytes = await body(req, true), mime = req.headers['content-type']; let ext;
          if (mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ext = 'png';
          if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ext = 'jpg';
          if (mime === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') ext = 'webp';
          if (mime === 'image/gif' && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) ext = 'gif';
          const filename = String(req.headers['x-file-name'] || '');
          if (!ext || !new RegExp(ext === 'jpg' ? '\\.jpe?g$' : '\\.' + ext + '$', 'i').test(filename)) fail('Choose a matching PNG, JPEG, WebP, or GIF file, up to 4 MB.', 415);
          if (!env.BLOB_READ_WRITE_TOKEN) fail('Image uploads need BLOB_READ_WRITE_TOKEN. You can also paste an HTTPS image URL.', 503);
          const put = options.put || require('@vercel/blob').put;
          const blob = await put(`portfolio/${randomUUID()}.${ext}`, bytes, { access: 'public', contentType: mime, token: env.BLOB_READ_WRITE_TOKEN, addRandomSuffix: false });
          return json(res, 201, { url: blob.url });
        }
        const match = pathname.match(/^\/api\/admin\/items\/([a-z]+)(?:\/([a-f0-9-]+|reorder))?$/);
        if (match) { const [, type, id] = match; if (!Object.hasOwn(types, type)) fail('Unknown section.', 404);
          if (!id && req.method === 'GET') return json(res, 200, await store.list(type));
          if (!id && req.method === 'POST') return json(res, 201, await store.save(type, await body(req)));
          if (id === 'reorder' && req.method === 'PUT') return json(res, 200, await store.reorder(type, await body(req)));
          if (id && req.method === 'PUT') return json(res, 200, await store.save(type, await body(req), id));
          if (id && req.method === 'DELETE') return json(res, 200, await store.remove(type, id, (await body(req)).version));
        }
      }
      fail('Endpoint not found.', 404);
    }
    if (!['GET', 'HEAD'].includes(req.method)) fail('Method not allowed.', 405);
    if (pathname === '/' || pathname === '/index.html') {
      const templateFile = fs.existsSync(path.join(root, 'index.template.html')) ? path.join(root, 'index.template.html') : path.join(root, 'index.html');
      return html(res, portfolioHTML(fs.readFileSync(templateFile, 'utf8'), await store.publicData(), env.PUBLIC_ORIGIN));
    }
    if (pathname.startsWith('/projects/')) { const data = await store.publicData(), item = data.projects.find(i => i.slug === pathname.slice(10)); if (!item) fail('Project not found.', 404); return html(res, projectHTML(item, data.site, env.PUBLIC_ORIGIN)); }
    if (pathname === '/admin.html' || pathname === '/admin' || pathname === '/admin/login' || /^\/admin\/(projects|certifications|achievements|skills|experience|education|settings)$/.test(pathname)) {
      return html(res, fs.readFileSync(path.join(root, 'admin.html'), 'utf8'));
    }
    let file;
    if (assets.includes(pathname.slice(1))) file = path.join(root, pathname.slice(1));
    let decoded; try { decoded = decodeURIComponent(pathname); } catch { fail('Invalid URL.'); }
    if (/^\/images\/[a-zA-Z0-9/_ .-]+\.(png|jpe?g|webp|gif)$/.test(decoded) && !decoded.includes('..')) file = path.join(root, decoded.slice(1));
    if (!file || !fs.existsSync(file)) fail('Page not found.', 404);
    const mime = { '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[path.extname(file)];
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache, no-store, must-revalidate' }); fs.createReadStream(file).pipe(res);
  }
  const handler = (req, res) => handle(req, res).catch(error => { if (res.headersSent) return res.destroy(); json(res, error.status || 503, { error: error.status ? error.message : 'The content service is temporarily unavailable. Please try again.' }); });
  return { handler, server: http.createServer(handler), store, origin };
}
if (require.main === module) { const app = createApp(); app.server.listen(Number(process.env.PORT || 5501), '127.0.0.1', () => console.log(`Portfolio: ${app.origin}`)); }
module.exports = { createApp };
