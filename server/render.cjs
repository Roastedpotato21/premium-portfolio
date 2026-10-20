'use strict';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const asset = value => value ? value.replace(/^\//, '') : '';
const image = (src, alt, cls = '') => `<img src="${escape(asset(src))}" alt="${escape(alt)}" class="${cls}" loading="lazy" decoding="async">`;
const link = (text, href, cls = 'project-link') => href ? `<a class="${cls}" href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(text)} ↗</a>` : '';
const chips = values => `<div class="tech-stack">${(values || []).map(v => `<span class="tech-badge">${escape(v)}</span>`).join('')}</div>`;
function projectArt(item) { return item.project_image ? image(item.project_image, item.title) : `<div class="project-art"><strong>${escape(item.title.includes('Pulse') ? 'Pulse' : item.title.includes('NexMatch') ? 'NexMatch' : item.title.includes('Inventory') ? 'In good order.' : item.title.includes('Medical') ? 'Care, connected.' : item.title)}</strong><small>${escape(item.category)}</small></div>`; }
function render(type, item) {
  const id = ` data-item-id="${escape(item.id)}"`;
  if (type === 'projects') return `<article class="project-card"${id}><a class="project-media" href="${escape(item.live_demo_url || item.github_url || `/projects/${item.slug}`)}" ${item.live_demo_url || item.github_url ? 'target="_blank" rel="noopener noreferrer"' : ''} aria-label="Read about ${escape(item.title)}">${projectArt(item)}${item.featured ? '<span class="featured-label">Selected project</span>' : ''}<span class="project-arrow" aria-hidden="true">↗</span></a><div class="project-meta"><span>${escape(item.category)}</span><span>${escape(item.year || item.development_status)}</span></div><h3 class="project-title"><a href="${escape(item.live_demo_url || item.github_url || `/projects/${item.slug}`)}" ${item.live_demo_url || item.github_url ? 'target="_blank" rel="noopener noreferrer"' : ''}>${escape(item.title)}</a></h3><p class="project-description">${escape(item.short_description)}</p>${chips(item.tech_stack)}<div class="project-links">${link('GitHub', item.github_url)}${link('Live project', item.live_demo_url)}</div></article>`;
  if (type === 'certifications') return `<article class="cert-card"${id}>${item.certificate_image ? `<a href="${escape(asset(item.certificate_image))}" target="_blank" rel="noopener noreferrer" aria-label="View ${escape(item.certificate_name)}">${image(item.certificate_image, item.certificate_name, 'cert-image')}</a>` : ''}<p class="cert-category">${escape(item.category)}</p><h3 class="cert-name">${escape(item.certificate_name)}</h3><p class="cert-issuer">${escape(item.issuer)}${item.issue_date ? ' · ' + escape(item.issue_date) : ''}</p>${item.description ? `<p class="cert-issuer">${escape(item.description)}</p>` : ''}${item.credential_id ? `<p class="cert-issuer">Credential ${escape(item.credential_id)}</p>` : ''}${link('Certificate', asset(item.certificate_image), 'cert-btn')}${link('Verify credential', item.credential_url, 'cert-btn')}</article>`;
  if (type === 'achievements') return `<figure class="achievement-card${item.featured ? ' featured' : ''}"${id}>${item.image ? `<a href="${escape(asset(item.image))}" target="_blank" rel="noopener noreferrer" aria-label="View ${escape(item.title)}">${image(item.image, item.description || item.title)}</a>` : ''}<div><figcaption>${escape(item.title)}</figcaption><p>${escape([item.organization,item.date].filter(Boolean).join(' · '))}</p>${item.description ? `<p>${escape(item.description)}</p>` : ''}${link('View proof', item.proof_url)}</div></figure>`;
  if (type === 'skills') return `<span class="skill-chip"${id}>${item.icon ? `<span aria-hidden="true">${escape(item.icon)}</span>` : ''}${escape(item.name)}</span>`;
  const education = type === 'education';
  return `<article class="timeline-item"${id}><p class="timeline-date">${escape(item.period || [item.start_date, item.current ? 'Present' : item.end_date].filter(Boolean).join(' — '))}</p><h3 class="timeline-title">${escape(education ? item.degree : item.title)}</h3><p class="cms-timeline-description">${escape(education ? item.institution : item.organization)}</p>${item.field_of_study ? `<p class="cms-timeline-description">${escape(item.field_of_study)}</p>` : ''}${item.location ? `<p class="cms-timeline-description">${escape(item.location)}</p>` : ''}<p class="cms-timeline-description">${escape(item.description)}</p>${chips(item.technologies)}${link('Learn more', item.link)}</article>`;
}
function groupSkills(items) {
  const groups = {};
  const categoryIcons = { 'AI & Intelligence': '🧠', 'Frontend': '🎨', 'Backend & DevOps': '⚙️', 'Languages': '💻', 'Databases': '🗄️', 'Tools & Platforms': '🛠️' };
  for (const item of items) { const category = item.category || 'Other'; (groups[category] ||= []).push(item); }
  let index = 0;
  return Object.entries(groups).map(([name, rows]) => {
    const icon = categoryIcons[name] || '📦';
    const html = `<div class="skill-group" style="--group-index:${index}"><div class="skill-group-header"><span class="skill-group-icon" aria-hidden="true">${escape(icon)}</span><div><h3>${escape(name)}</h3><span class="skill-group-count">${rows.length} skill${rows.length > 1 ? 's' : ''}</span></div></div><div class="skill-chips">${rows.map((i, j) => `<span class="skill-chip" data-item-id="${escape(i.id)}" style="--chip-index:${j}">${i.icon ? `<span aria-hidden="true">${escape(i.icon)}</span>` : ''}${escape(i.name)}</span>`).join('')}</div></div>`;
    index++;
    return html;
  }).join('');
}
function metadata(title, description, canonical, portrait) {
  return `<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}">${canonical ? `<link rel="canonical" href="${escape(canonical)}"><meta property="og:url" content="${escape(canonical)}">` : ''}${portrait ? `<meta property="og:image" content="${escape(portrait)}"><meta name="twitter:image" content="${escape(portrait)}">` : ''}`;
}
function portraitUrl(site, origin) { return origin && site.portraitUrl ? new URL(asset(site.portraitUrl), origin).href : ''; }
function portfolioHTML(template, data, origin) {
  const site = data.site;
  template = template.replace('<!--meta-->', () => metadata(`${site.displayName} — Developer & AI Enthusiast`, site.heroDescription, origin ? new URL('/', origin).href : '', portraitUrl(site, origin)));
  for (const type of ['projects','skills','experience','education','certifications','achievements']) {
    if (!data[type].length) template = template.replace(new RegExp(`<section id="${type}"[\\s\\S]*?</section>`), '');
    else template = template.replace(`<!--${type}-->`, () => type === 'skills' ? groupSkills(data.skills) : data[type].map(i => render(type, i)).join(''));
  }
  template = template.replace('<!--socials-->', () => link('GitHub', site.githubUrl, '') + link('LinkedIn', site.linkedinUrl, '') + link(site.otherSocialLabel || 'Elsewhere', site.otherSocialUrl, ''));
  template = template.replace('<!--resume-->', () => link('Résumé', site.resumeUrl, 'text-link'));
  return template.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, key) => escape(key === 'currentYear' ? new Date().getFullYear() : key === 'portraitUrl' ? asset(site[key]) : site[key]));
}
function projectHTML(item, site, origin) {
  const canonical = origin ? new URL('/projects/' + item.slug, origin).href : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${metadata(`${item.title} — ${site.displayName}`, item.short_description, canonical, item.project_image ? new URL(asset(item.project_image), origin || 'http://localhost').href : portraitUrl(site, origin))}<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet"><link rel="stylesheet" href="/portfolio-theme.css"><script defer src="/portfolio-motion.js"></script></head><body><header class="navbar"><a class="wordmark" href="/">siri</a><a href="/#projects" class="text-link">← All projects</a><button id="themeToggle" class="icon-button" type="button" aria-label="Switch theme">◐</button></header><main class="container project-detail"><p class="eyebrow">${escape(item.category)}${item.year ? ' / ' + escape(item.year) : ''}</p><h1>${escape(item.title)}</h1><p class="hero-position">${escape(item.short_description)}</p>${chips(item.tech_stack)}<div class="project-links">${link('View code', item.github_url)}${link('Open live project', item.live_demo_url)}</div><div class="project-media">${projectArt(item)}</div><p class="detail-copy">${escape(item.full_description)}</p><div class="gallery">${item.additional_images.map((src, i) => image(src, `${item.title} — image ${i + 1}`)).join('')}</div><div class="button-row"><a class="button primary" href="/#projects">Explore more projects ↗</a></div></main></body></html>`;
}
module.exports = { portfolioHTML, projectHTML, render };
