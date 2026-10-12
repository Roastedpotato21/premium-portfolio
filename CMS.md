# Portfolio CMS

The original frontend is plain HTML/CSS/JavaScript with local GSAP animations. Previously, inline edits and credentials existed only in each browser's localStorage. There was no backend, database, image storage, or shared authentication.

The CMS keeps that frontend and adds a Node.js server, SQLite database, and image uploads on disk. No third-party runtime packages are required. Node 24.12 or newer is required; `node:sqlite` is still marked experimental in Node 24. Pin and test your Node version before deployment.

## Run and configure

```sh
npm start
```

Open `http://127.0.0.1:5501`. Click **Admin Login**. On first launch, enter the one-time token from `.data/setup-token`, a username, and a password of at least eight characters. Save, then log in. The token is deleted after successful setup. **Manage Content** opens `/admin`. The existing inline text editor and Save Changes button still work and now save to the database.

Opening `index.html` directly now forwards to the default local CMS URL instead of displaying empty database-backed sections. Keep the Node server running; if you configure another port/origin, use that server URL directly. Served pages version their CSS/JavaScript URLs so layout updates do not stay hidden behind cached assets.

Your previous browser credentials cannot securely authenticate a shared database. Choose server credentials once; you can reuse the same username/password if desired. Browser storage is not trusted for server access. Change credentials through the existing button after login. Changing the password revokes all earlier sessions.

## Content workflow

Each of Projects, Certifications, Achievements, Skills, Experience, and Education supports add/edit/delete, drafts, publishing/unpublishing, previews, and up/down ordering. Projects also support featured flags, descriptions, slug, tech stack, links, main image and additional images. Dates, URLs, slugs, required fields and file size/type are validated on the server. Deletion requires confirmation. Updates and reorder operations check item versions to prevent overwriting another tab's changes; reload and reopen an item after a conflict.

New items default to draft. Save, preview, then publish. The public API only returns published items. The portfolio checks for changes on focus and every 30 seconds while visible. Admin previews do not publish drafts. Text is treated as plain text, not HTML. Existing skill proficiency/icon fields are stored without introducing a new proficiency visualization into the public design.

Uploaded raster images are limited to 5 MB per file and checked by MIME type and signature. SVG is intentionally unsupported. Uploaded files are given random names and served from `/uploads`; existing images remain in `/images`. Files referenced by drafts are public if their URL is known, so do not upload private documents. Deleting an item does not delete media that other items might use. Images uploaded before canceling an item remain on disk; manual cleanup should first check references.

## Storage and migration

`server/seed.json` is a one-time migration of the original portfolio. On a new database the server imports it in a transaction. The migration marker prevents reimporting it on restarts, even when a section becomes empty. Future content is saved exclusively in SQLite, never written to frontend source files. The server renders published content for the initial page (including when JavaScript is disabled); `/api/content` updates it in the browser. The browser and server renderers use the existing public CSS classes and escape content rather than accepting HTML.

`.data/portfolio.sqlite` contains items, site text, credentials, sessions, rate limits and media metadata. `.data/uploads/` contains uploaded images. All managed item types share indexed publication/order columns and validated per-type JSON payloads, IDs, timestamps and versions. This small single-owner CMS uses one synchronous SQLite connection with WAL and a busy timeout; it is intended for modest traffic on one server, not distributed concurrent writers.

## Deployment

Use a persistent Node host or container with a persistent disk. GitHub Pages and an ordinary static-file host cannot run this CMS. Do not place the SQLite file/uploads on an ephemeral serverless filesystem. No deployment has been performed.

Set `NODE_ENV=production`, `PUBLIC_ORIGIN=https://your-domain.example`, `HOST=0.0.0.0`, `PORT` as needed, and `DATA_DIR` to a persistent private directory. `PUBLIC_ORIGIN` must match the URL visitors use, including scheme and port; use the default `127.0.0.1` URL locally rather than `localhost`. Terminate HTTPS at a reverse proxy and pass traffic to Node. Production cookies use Secure, HttpOnly and SameSite=Strict. Authenticated mutations require a session, a CSRF token and the exact configured origin. Login/setup/password changes are rate limited per socket address; behind a proxy this is a shared limit, so configure additional IP-based throttling at the proxy. Do not expose the setup token, database, server source or backups. The server uses an explicit public-file allowlist.

Back up the SQLite database using SQLite's backup facilities or stop the server before copying `.data/` (including uploaded files). Do not copy only the database file while writes are active because WAL files may contain recent changes. Keep the database and uploads together during restoration. This implementation does not send reset emails; recover a lost password through an authenticated database/operator recovery process rather than exposing a public reset route.

## Checks

```sh
npm test
npm run test:browser
npm run test:portfolio
```

The browser test requires Chrome running with DevTools on port 9222. It starts a separate temporary CMS/database and an isolated browser context. It does not configure or modify the real portfolio's credentials.

Implementation references: [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) and [Node password derivation](https://nodejs.org/download/release/v22.23.3/docs/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
