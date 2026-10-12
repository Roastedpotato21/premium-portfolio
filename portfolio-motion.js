(() => {
  'use strict';
  const root = document.documentElement, toggle = document.getElementById('themeToggle');
  function theme(value) { root.dataset.theme = value; if (toggle) { toggle.setAttribute('aria-label', `Switch to ${value === 'dark' ? 'light' : 'dark'} theme`); toggle.setAttribute('aria-pressed', String(value === 'dark')); } }
  try { theme(localStorage.getItem('portfolio-theme') || 'light'); } catch { theme('light'); }
  toggle?.addEventListener('click', () => { const value = root.dataset.theme === 'dark' ? 'light' : 'dark'; theme(value); try { localStorage.setItem('portfolio-theme', value); } catch { /* Theme still works without storage. */ } });
  const menu = document.getElementById('mobileMenu'), trigger = document.getElementById('menuToggle');
  trigger?.addEventListener('click', () => { menu.showModal(); trigger.setAttribute('aria-expanded', 'true'); });
  document.getElementById('menuClose')?.addEventListener('click', () => menu.close());
  menu?.addEventListener('click', e => { if (e.target.closest('a')) menu.close(); });
  menu?.addEventListener('close', () => { trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); });
  const navbar = document.querySelector('.navbar'), sections = [...document.querySelectorAll('main section[id]')];
  let frame = false;
  const update = () => { frame = false; navbar?.classList.toggle('scrolled', scrollY > 20); let active = ''; for (const section of sections) if (section.getBoundingClientRect().top < 180) active = section.id; document.querySelectorAll('.nav-links a').forEach(a => { if (a.hash === '#' + active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); }); };
  window.addEventListener('scroll', () => { if (!frame) { frame = true; requestAnimationFrame(update); } }, { passive: true }); update();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!reduced.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) { const animation = entry.target.animate([{ opacity: .25, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 600, easing: 'cubic-bezier(.2,.65,.3,1)' }); reduced.addEventListener('change', () => animation.finish(), { once: true }); observer.unobserve(entry.target); } }); }, { threshold: .12 });
    document.querySelectorAll('.hero-copy,.hero-art,.section-heading,.project-card,.timeline-item,.cert-card').forEach(el => observer.observe(el));
  }
})();
