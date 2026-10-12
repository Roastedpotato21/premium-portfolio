'use strict';
// One shared HTTP client; never import this module into browser code.
let client;
function redis() {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require('@upstash/redis');
  client = new Redis({ url, token, automaticDeserialization: false });
  return client;
}
module.exports = { redis };
