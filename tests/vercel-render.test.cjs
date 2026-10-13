'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const handler = require('../api/index.cjs');

test('Vercel function renders the homepage and serves CMS content from seed fallback', async t => {
  const redisNames = [
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
  ];
  const saved = Object.fromEntries(redisNames.map(name => [name, process.env[name]]));
  for (const name of redisNames) delete process.env[name];
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${origin}/api/index.cjs?path=%2F`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(html, /<h1>Siri Vennela<\/h1>/);
  assert.match(html, /Building intelligent AI agents that remember and reason\./);
  assert.doesNotMatch(html, /\{\{[^}]+\}\}/);

  const adminResponse = await fetch(`${origin}/api/index.cjs?path=%2Fadmin`);
  const adminHtml = await adminResponse.text();
  assert.equal(adminResponse.status, 200);
  assert.match(adminHtml, /<title>Portfolio Content Manager \| Siri<\/title>/);

  const apiResponse = await fetch(`${origin}/api/index.cjs?apiPath=content`);
  const content = await apiResponse.json();
  assert.equal(apiResponse.status, 200);
  assert.equal(content.site.heroTitle, 'Siri Vennela');
  assert.ok(content.projects.length > 0);
});
