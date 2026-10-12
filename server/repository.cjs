'use strict';
const { randomUUID } = require('node:crypto');
const { types, validate, fail, url } = require('./content.cjs');
const original = require('./seed.json');
const KEY = 'portfolio:content:v2';
const defaults = {
  ...original.site,
  displayName: 'Siri Vennela', heroEyebrow: 'Developer · AI enthusiast · Open source contributor',
  heroTitle: 'Siri Vennela',
  heroSubtitle: 'Building intelligent AI agents that remember and reason.',
  aboutTitle: 'Curiosity is where\nit all begins.',
  projectsTitle: 'Ideas, made real.', skillsTitle: 'A considered toolkit.',
  expTitle: 'Learning by doing.', certTitle: 'Always a student.',
  contactTitle: 'Have something\ninteresting in mind?',
  githubUrl: 'https://github.com/Roastedpotato21', linkedinUrl: '', resumeUrl: '',
  otherSocialUrl: '', otherSocialLabel: '', portraitUrl: 'images/siri-profile.jpg',
};
function seedData(source = original) {
  const data = { site: { ...defaults, ...source.site }, revision: 1 };
  // Apply the new copy only to untouched original copy, never to edited content.
  for (const key of Object.keys(defaults)) if (source.site?.[key] === original.site[key]) data.site[key] = defaults[key];
  for (const type of Object.keys(types)) data[type] = source[type].map((item, i) => ({
    ...validate(type, item), id: item.id || randomUUID(), display_order: item.display_order ?? i,
    created_at: item.created_at || new Date().toISOString(), updated_at: item.updated_at || new Date().toISOString(), version: item.version || 1,
  }));
  return data;
}
function validateSite(input, previous) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid site settings.');
  const site = { ...previous };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(defaults, key) || typeof value !== 'string' || value.length > (key === 'aboutParagraph' ? 10000 : 3000)) fail('Invalid site content field.');
    if (key.endsWith('Url')) url(value, key === 'portraitUrl');
    if (key === 'heroEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('Enter a valid email address.');
    if (['displayName', 'heroTitle'].includes(key) && !value.trim()) fail('Name and hero title cannot be empty.');
    site[key] = value.trim();
  }
  return site;
}
class Repository {
  constructor(client) { this.client = client; this.fallback = seedData(); }
  async read() {
    if (!this.client) return structuredClone(this.fallback);
    const raw = await this.client.get(KEY);
    if (!raw) fail('The content store needs its one-time seed. Run npm run seed.', 503);
    return JSON.parse(raw);
  }
  async publicData() {
    const data = await this.read();
    for (const type of Object.keys(types)) data[type] = data[type].filter(i => i.status === 'published').sort((a, b) => a.display_order - b.display_order);
    return data;
  }
  async mutate(change) {
    if (!this.client) fail('Connect Upstash Redis to save content.', 503);
    for (let attempt = 0; attempt < 5; attempt++) {
      const raw = await this.client.get(KEY);
      if (!raw) fail('Run the one-time content seed first.', 503);
      const data = JSON.parse(raw); const result = change(data); data.revision++;
      // Compare-and-swap prevents lost updates across serverless instances.
      const ok = await this.client.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 else return 0 end", [KEY], [raw, JSON.stringify(data)]);
      if (Number(ok) === 1) return result;
    }
    fail('Content changed elsewhere. Reload and try again.', 409);
  }
  async list(type) { return (await this.read())[type].sort((a, b) => a.display_order - b.display_order); }
  async save(type, input, id) {
    const payload = validate(type, input);
    return this.mutate(data => {
      const rows = data[type], old = id ? rows.find(i => i.id === id) : null;
      if (id && !old) fail('Item not found.', 404);
      if (old && old.version !== input.version) fail('This item changed in another tab. Reload before saving.', 409);
      if (type === 'projects' && rows.some(i => i.slug === payload.slug && i.id !== id)) fail('This project slug is already in use.', 409);
      if (!id && rows.length >= 500) fail('This section has reached its 500 item limit.');
      const now = new Date().toISOString();
      const item = { ...payload, id: id || randomUUID(), display_order: old?.display_order ?? Math.max(-1, ...rows.map(i => i.display_order)) + 1, created_at: old?.created_at || now, updated_at: now, version: (old?.version || 0) + 1 };
      if (old) rows[rows.indexOf(old)] = item; else rows.push(item);
      return item;
    });
  }
  async remove(type, id, version) {
    return this.mutate(data => { const item = data[type].find(i => i.id === id); if (!item) fail('Item not found.', 404); if (item.version !== version) fail('Item changed. Reload before deleting.', 409); data[type] = data[type].filter(i => i.id !== id); return { ok: true }; });
  }
  async reorder(type, entries) {
    return this.mutate(data => {
      const rows = data[type];
      if (!Array.isArray(entries) || entries.length !== rows.length || new Set(entries.map(e => e?.id)).size !== rows.length) fail('Provide every item exactly once.');
      data[type] = entries.map((e, i) => { const row = rows.find(r => r.id === e?.id); if (!row || row.version !== e.version) fail('Order changed. Reload before reordering.', 409); return { ...row, display_order: i, version: row.version + 1, updated_at: new Date().toISOString() }; });
      return data[type];
    });
  }
  async settings(input) { return this.mutate(data => { if (input.revision !== data.revision) fail('Settings changed. Reload before saving.', 409); data.site = validateSite(input.site, data.site); return data.site; }); }
}
module.exports = { Repository, seedData, KEY, defaults };
