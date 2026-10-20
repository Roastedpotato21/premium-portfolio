(() => {
  'use strict';

  // 1. Theme Management
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');

  function theme(value) {
    root.dataset.theme = value;
    if (toggle) {
      toggle.setAttribute('aria-label', `Switch to ${value === 'dark' ? 'light' : 'dark'} theme`);
      toggle.setAttribute('aria-pressed', String(value === 'dark'));
    }
  }

  try {
    theme(localStorage.getItem('portfolio-theme') || 'light');
  } catch {
    theme('light');
  }

  toggle?.addEventListener('click', () => {
    const value = root.dataset.theme === 'dark' ? 'light' : 'dark';
    theme(value);
    try {
      localStorage.setItem('portfolio-theme', value);
    } catch {
      /* Theme persists in DOM */
    }
  });

  // 2. Mobile Menu
  const menu = document.getElementById('mobileMenu');
  const trigger = document.getElementById('menuToggle');
  trigger?.addEventListener('click', () => {
    menu?.showModal();
    trigger.setAttribute('aria-expanded', 'true');
  });
  document.getElementById('menuClose')?.addEventListener('click', () => menu?.close());
  menu?.addEventListener('click', e => {
    if (e.target.closest('a')) menu.close();
  });
  menu?.addEventListener('close', () => {
    trigger?.setAttribute('aria-expanded', 'false');
    trigger?.focus();
  });

  // 3. Ambient Cursor Spotlight (Quizzie-style interactive glow)
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reducedMotion) {
    window.addEventListener('pointermove', (e) => {
      root.style.setProperty('--mouse-x', `${e.clientX}px`);
      root.style.setProperty('--mouse-y', `${e.clientY}px`);
    }, { passive: true });
  }

  // 4. Gooey Nav Sliding Pill Indicator & Scroll Spy
  const navbar = document.querySelector('.navbar');
  const navLinks = document.querySelector('.nav-links');
  const navAnchors = navLinks ? [...navLinks.querySelectorAll('a[href^="#"]')] : [];
  const sections = [...document.querySelectorAll('main section[id]')];

  let pill = navLinks?.querySelector('.nav-pill-indicator');
  if (navLinks && !pill) {
    pill = document.createElement('div');
    pill.className = 'nav-pill-indicator';
    pill.setAttribute('aria-hidden', 'true');
    navLinks.prepend(pill);
  }

  function movePillTo(element) {
    if (!pill || !navLinks || !element) return;
    const navRect = navLinks.getBoundingClientRect();
    const targetRect = element.getBoundingClientRect();
    const left = targetRect.left - navRect.left;
    const width = targetRect.width;
    pill.style.transform = `translateX(${Math.round(left)}px)`;
    pill.style.width = `${Math.round(width)}px`;
    pill.style.opacity = '1';
  }

  function resetPillToActive() {
    const activeAnchor = navLinks?.querySelector('a[aria-current="location"]');
    if (activeAnchor) {
      movePillTo(activeAnchor);
    } else if (pill) {
      pill.style.opacity = '0';
    }
  }

  if (navLinks && navAnchors.length) {
    navAnchors.forEach(a => {
      a.addEventListener('mouseenter', () => movePillTo(a));
      a.addEventListener('focus', () => movePillTo(a));
    });
    navLinks.addEventListener('mouseleave', resetPillToActive);
  }

  let scrollTimeout = false;
  const updateSpy = () => {
    scrollTimeout = false;
    navbar?.classList.toggle('scrolled', window.scrollY > 20);

    let activeId = '';
    const scrollOffset = 200;
    for (const section of sections) {
      const top = section.getBoundingClientRect().top;
      if (top <= scrollOffset) {
        activeId = section.id;
      }
    }

    let activeAnchor = null;
    navAnchors.forEach(a => {
      if (a.getAttribute('href') === `#${activeId}`) {
        a.setAttribute('aria-current', 'location');
        activeAnchor = a;
      } else {
        a.removeAttribute('aria-current');
      }
    });

    if (activeAnchor) {
      movePillTo(activeAnchor);
    } else if (pill) {
      pill.style.opacity = '0';
    }
  };

  window.addEventListener('scroll', () => {
    if (!scrollTimeout) {
      scrollTimeout = true;
      requestAnimationFrame(updateSpy);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    resetPillToActive();
  }, { passive: true });

  // Initial pill placement once layout completes
  setTimeout(updateSpy, 100);

  // 5. 3D Card Tilt with Specular Glare (Quizzie-style depth)
  if (!reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const tiltCards = document.querySelectorAll('.project-card, .cert-card, .achievement-card');
    tiltCards.forEach(card => {
      let glare = card.querySelector('.card-glare');
      if (!glare) {
        glare = document.createElement('div');
        glare.className = 'card-glare';
        glare.setAttribute('aria-hidden', 'true');
        card.appendChild(glare);
      }

      let tiltFrame = false;
      card.addEventListener('pointermove', (e) => {
        if (tiltFrame) return;
        tiltFrame = true;
        requestAnimationFrame(() => {
          tiltFrame = false;
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;

          const rotateX = ((y - centerY) / centerY) * -6;
          const rotateY = ((x - centerX) / centerX) * 6;

          card.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;

          const px = ((x / rect.width) * 100).toFixed(1);
          const py = ((y / rect.height) * 100).toFixed(1);
          glare.style.background = `radial-gradient(circle at ${px}% ${py}%, rgba(255, 255, 255, 0.22), transparent 60%)`;
          glare.style.opacity = '1';
        });
      });

      card.addEventListener('pointerleave', () => {
        card.style.transform = '';
        glare.style.opacity = '0';
      });
    });
  }

  // 6. Smooth Staggered Scroll Reveal Animations
  if (!reducedMotion && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.animate([
            { opacity: 0.2, transform: 'translateY(24px) scale(0.98)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' }
          ], {
            duration: 650,
            easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
            fill: 'forwards'
          });
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll(
      '.hero-copy, .hero-art, .section-heading, .project-card, .timeline-item, .cert-card, .achievement-card, .skill-group'
    ).forEach(el => revealObserver.observe(el));
  }
})();
