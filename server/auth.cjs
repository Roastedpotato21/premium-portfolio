'use strict';
const { randomBytes, scrypt, timingSafeEqual, createHash, createHmac } = require('node:crypto');
const { promisify } = require('node:util');
const { fail } = require('./content.cjs');
const derive = promisify(scrypt);
const equal = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());
async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
function auth(client, env = process.env) {
  const production = env.NODE_ENV === 'production';
  const name = production ? '__Host-portfolio-session' : 'portfolio-session';
  const configured = !!(client && env.ADMIN_USERNAME && /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(env.ADMIN_PASSWORD_HASH || '') && env.SESSION_SECRET?.length >= 32);
  const key = token => 'portfolio:session:' + createHmac('sha256', env.SESSION_SECRET || '').update(token).digest('hex');
  const cookie = (res, token, age) => res.setHeader('Set-Cookie', `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? '; Secure' : ''}`);
  async function session(req) {
    if (!configured) return null;
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const raw = await client.get(key(token)); if (!raw) return null;
    const value = JSON.parse(raw);
    if (value.expiresAt <= Date.now() || value.fingerprint !== createHash('sha256').update(env.ADMIN_USERNAME + env.ADMIN_PASSWORD_HASH).digest('hex')) return null;
    return { ...value, key: key(token) };
  }
  async function protect(req) { const s = await session(req); if (!s) fail('Please sign in again.', 401); if (!['GET', 'HEAD'].includes(req.method) && !equal(req.headers['x-csrf-token'] || '', s.csrf)) fail('Invalid request token. Sign in again.', 403); return s; }
  async function login(req, res, input) {
    if (!configured) fail('Admin sign-in is not configured. Check the server environment.', 503);
    // Vercel overwrites x-vercel-forwarded-for. Other hosts use the socket address.
    const ip = env.VERCEL ? req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress : req.socket.remoteAddress;
    const limitKey = 'portfolio:login:' + createHash('sha256').update(String(ip)).digest('hex');
    const count = await client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n", [limitKey], []);
    if (Number(count) > 8) { res.setHeader('Retry-After', '900'); fail('Too many sign-in attempts. Try again in 15 minutes.', 429); }
    if (typeof input.username !== 'string' || input.username.length > 64 || typeof input.password !== 'string' || input.password.length > 256) fail('Invalid credentials', 401);
    const [, salt] = env.ADMIN_PASSWORD_HASH.split('$');
    const hash = await hashPassword(input.password, salt);
    if (!equal(input.username, env.ADMIN_USERNAME) || !equal(hash, env.ADMIN_PASSWORD_HASH)) fail('Invalid credentials', 401);
    const old = await session(req); if (old) await client.del(old.key);
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    await client.set(key(token), JSON.stringify({ username: env.ADMIN_USERNAME, csrf, createdAt: Date.now(), expiresAt: Date.now() + 28800000, fingerprint: createHash('sha256').update(env.ADMIN_USERNAME + env.ADMIN_PASSWORD_HASH).digest('hex') }), { ex: 28800 });
    cookie(res, token, 28800); return { csrf };
  }
  async function logout(req, res) { const s = await protect(req); await client.del(s.key); cookie(res, '', 0); return { ok: true }; }
  return { session, protect, login, logout, configured };
}
module.exports = { auth, hashPassword };
