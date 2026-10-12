# Portfolio motion

## Audit and architecture

The frontend uses regular HTML/CSS and vanilla JavaScript. There is no React,
Next.js, Vite, Tailwind, TypeScript, or frontend build step. Existing external
resources are Manrope and Font Awesome. The content-management upgrade adds a
Node.js/SQLite server and npm run/test commands; see [CMS.md](CMS.md).

The existing navigation, hero, About, Skills, Projects, Experience, Education,
Certifications, Achievements, Contact, theme toggle, and content editor are retained.
The removed workspace picture stays removed, and compact badge sizing is retained.

The previous CSS entrances and IntersectionObserver both changed transforms and
opacity. Two scroll listeners duplicated work; anchor interception discarded native
history; the mobile navigation had no menu. Those paths are replaced by one motion layer.

- `vendor/`: local GSAP 3.13.0 and ScrollTrigger 3.13.0, with upstream license headers.
- `portfolio-motion.js`: consistent reveal utilities, a 1.4-second hero sequence,
  scroll-trigger batches, timeline drawing, the existing numeric counter, and
  desktop-only parallax, glow, and one-degree project tilt.
- `portfolio-motion.css`: hover/focus effects, mobile menu, ambient motion,
  animated name gradient, and reduced-motion rules.
- `index.html`: retains existing application behavior; adds native mobile disclosure,
  accessible skill buttons, pre-paint saved/system theme selection, root theme
  transitions, and an honest contact email-draft action.

Native CSS smooth scrolling is the only scroll controller. Lenis was omitted to
preserve touch/keyboard scrolling and browser anchor history without introducing
a second controller. One passive listener schedules scroll updates once per frame.

Official references: [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
and [matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/).

## Accessibility, mobile, and performance

Content is visible by default, including if motion libraries or all JS fail.
Reveals start on entering the viewport, with an 18px translation, 0.65-second
duration, and consistent easing. Keyboard focus exposes any target currently
animating. Skill buttons support native keyboard use and `aria-pressed`.

Reduced-motion users receive native instant scrolling and no elaborate entrances,
gradient animation, ambient motion, tilt, parallax, or cursor glow. Changing the
preference at runtime reverts GSAP contexts and pointer listeners. Contexts also
clean up on pagehide and rebuild on bfcache restore or CMS content refresh; deferred animation callbacks
are registered in their GSAP context.

Mobile uses a native `details` menu, usable without JS. Enhancements close it after
selection, outside click, or Escape. Desktop pointer effects are disabled on touch
and narrow screens; glow is also skipped for data-saving or low-core devices.

Motion primarily uses transform/opacity, with no particle system, custom continuous
scroll loop, or blanket `will-change`. Gallery images remain lazy-loaded, dimensioned,
and compact. Certificate images are created on demand and loaded immediately.
Certificate dismissal restores focus to the initiating button.

The saved or system theme applies before paint. Root view transitions provide a
short theme crossfade in supported browsers and are disabled for reduced motion.
System theme changes are honored if the user hasn't saved an explicit preference.

## Verification and limitations

Run `node scripts/verify-portfolio.cjs` with headless Chrome at debugging port 9222
(override using `CHROME_PORT`). No npm test dependencies are required. Checks cover
1440px desktop, 1024px laptop, 768px tablet, 390px phone, reduced motion, missing
GSAP, and disabled JS. They exercise navigation/history, theme, mobile menus,
certificate loading/focus return, skill buttons, and gallery sizing. JS syntax and
local dependencies are checked, and mailto drafts are tested in isolation without
opening a mail app or sending mail.

Results/screenshots are stored in `tmp/motion-verification/`. No lint, TypeScript,
or production build commands exist. Checks do not establish a universal 60fps guarantee.

Optional future work: project detail modals and quiet role rotation. Contact opens
a draft in the visitor's mail app; automatic delivery requires a backend. Existing
generic LinkedIn/resume destinations still need the owner's actual URLs.
