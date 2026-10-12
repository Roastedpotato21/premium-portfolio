/* Browser regression checks using Chrome's native DevTools protocol, no npm dependencies.
   Requires headless Chrome with --remote-debugging-port=9222 (or CHROME_PORT). */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createApp } = require('../server/index.cjs');
const workspace = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(workspace, 'index.html'), 'utf8');
const artifacts = path.join(workspace, 'tmp', 'motion-verification');
fs.mkdirSync(artifacts, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let inlineCount = 0;
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) { new vm.Script(match[1]); inlineCount++; }
}
new vm.Script(fs.readFileSync(path.join(workspace, 'portfolio-motion.js'), 'utf8'));
new vm.Script(fs.readFileSync(path.join(workspace, 'admin-credentials.js'), 'utf8'));
for (const match of html.matchAll(/(?:src|href)="((?:vendor\/|portfolio-)[^"]+)"/g)) {
    assert(fs.existsSync(path.join(workspace, match[1])), `Missing local dependency ${match[1]}`);
}
const previewOrigin = 'http://127.0.0.1:5812';

async function browser(scenario) {
    const port = process.env.CHROME_PORT || 9222;
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let nextId = 0;
    const pending = new Map();
    const errors = [];
    socket.addEventListener('message', event => {
        const data = JSON.parse(event.data);
        if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
        if (data.id && pending.has(data.id)) {
            const call = pending.get(data.id);
            pending.delete(data.id);
            clearTimeout(call.timeout);
            data.error ? call.reject(data.error) : call.resolve(data.result);
        }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    };
    const screenshot = async suffix => {
        const result = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(artifacts, `${scenario.name}${suffix}.png`), Buffer.from(result.data, 'base64'));
    };
    try {
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: 900, deviceScaleFactor: 1, mobile: scenario.width < 500 });
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: scenario.reduced ? 'reduce' : 'no-preference' }, { name: 'prefers-color-scheme', value: 'light' }] });
        await send('Page.addScriptToEvaluateOnNewDocument', { source: "try {localStorage.removeItem('portfolio-theme');localStorage.removeItem('portfolio-data')}catch{}" });
        if (scenario.noJS) await send('Emulation.setScriptExecutionDisabled', { value: true });
        if (scenario.noLibraries) {
            await send('Network.enable');
            await send('Network.setBlockedURLs', { urls: ['*/vendor/gsap.min.js', '*/vendor/ScrollTrigger.min.js'] });
        }
        await send('Page.navigate', { url: previewOrigin });
        await send('Page.bringToFront');
        await delay(1800);
        assert.deepEqual(errors, [], `${scenario.name}: initialization errors`);
        const initial = await evaluate(`({gsap:!!window.gsap, triggers:window.ScrollTrigger?.getAll().length||0, glow:!!document.querySelector('.cursor-glow'), width:innerWidth, scrollWidth:document.documentElement.scrollWidth, heroTitle:document.getElementById('heroTitle').textContent, titleOpacity:getComputedStyle(document.getElementById('heroTitle')).opacity, hiddenCards:[...document.querySelectorAll('.project-card,.cert-card,.achievement-card,.timeline-item')].filter(el=>+getComputedStyle(el).opacity<.95).length, gradientAnimation:getComputedStyle(document.querySelector('#heroTitle strong')).animationName})`);
        assert(initial.scrollWidth <= initial.width, `${scenario.name}: horizontal overflow`);
        assert.equal(initial.titleOpacity, '1', `${scenario.name}: hero permanently hidden`);
        assert.equal(initial.hiddenCards, 0, `${scenario.name}: offscreen content hidden before reveal`);
        assert(initial.heroTitle.includes('Siri'));
        assert.equal(await evaluate(`!!document.querySelector('.hero-workspace')`), false, 'Removed picture was restored');
        if (scenario.reduced || scenario.noLibraries || scenario.noJS) {
            assert.equal(initial.triggers, 0);
            assert.equal(initial.glow, false);
        } else assert(initial.triggers > 0, 'ScrollTrigger did not initialize');
        if (scenario.reduced) assert.equal(initial.gradientAnimation, 'none');
        if (scenario.width <= 850) assert.equal(initial.glow, false, 'Desktop cursor glow exists on mobile');
        if (scenario.noLibraries) assert.equal(initial.gsap, false);
        await screenshot('-hero');
        const targets = await evaluate(`[...document.querySelectorAll('section:not(.hero)[id]')].map(section=>section.id)`);
        for (const id of targets) {
            assert.equal(await evaluate(`!!document.getElementById(${JSON.stringify(id)})`), true);
            if (!scenario.noJS) {
                await evaluate(`(()=>{const link=document.querySelector('.nav-links a[href="#${id}"]');if(link)link.click();else location.hash='#${id}';})()`);
                await delay(1200);
            } else {
                await evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({behavior:'instant',block:'start'})`);
                await delay(850);
            }
            const section = await evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});return {top:el.querySelector('.section-title').getBoundingClientRect().top,navBottom:document.querySelector('.nav-inner').getBoundingClientRect().bottom,visible:+getComputedStyle(el.querySelector('.section-title')).opacity,active:document.querySelector('.nav-links .active')?.hash}})()`);
            assert(section.top >= section.navBottom + 8, `Navbar covers ${id} heading`);
            assert(section.visible >= .98, `${id} heading hidden`);
            if (!scenario.noJS && await evaluate(`!!document.querySelector('.nav-links a[href="#${id}"]')`)) assert.equal(section.active, '#' + id, `${id} nav highlight wrong`);
            const layout = await evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)}),content=el.querySelector('.about-paragraph,.skills-container,.projects-grid,.timeline,.cert-grid,.achievement-grid,.contact-wrapper'),header=el.querySelector('.section-subtitle')||el.querySelector('.section-title'),style=getComputedStyle(el);return {hasContent:!!content.textContent.trim(),minHeight:style.minHeight,gap:content.getBoundingClientRect().top-header.getBoundingClientRect().bottom,trailing:el.getBoundingClientRect().bottom-content.getBoundingClientRect().bottom,paddingBottom:parseFloat(style.paddingBottom),overflow:document.documentElement.scrollWidth>innerWidth}})()`);
            assert(layout.hasContent, `${id}: missing database content`);
            assert.equal(layout.minHeight, '0px', `${id}: forced section height`);
            assert(layout.gap >= 31 && layout.gap <= 49, `${id}: inconsistent heading/content spacing`);
            assert(Math.abs(layout.trailing - layout.paddingBottom) <= 1, `${id}: unexplained trailing whitespace`);
            assert.equal(layout.overflow, false, `${id}: horizontal overflow`);
        }
        if (!scenario.noJS && !scenario.noLibraries && !scenario.reduced && scenario.width > 850) {
            await evaluate(`document.getElementById('projects').scrollIntoView({behavior:'instant'})`);
            await delay(1100);
            const bounds = await evaluate(`(()=>{const r=document.querySelector('.project-card').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bounds.x + bounds.width * .7, y: bounds.y + Math.min(120, bounds.height * .3) });
            await delay(400);
            const hover = await evaluate(`({tilt:document.querySelector('.project-card').style.getPropertyValue('--tilt-x'),icon:getComputedStyle(document.querySelector('.project-visual')).transform,glow:document.querySelector('.cursor-glow')?.classList.contains('is-visible')})`);
            assert(hover.tilt, 'Project tilt not responding to pointer');
            assert.notEqual(hover.icon, 'none', 'Project icon hover missing');
            if (initial.glow) assert.equal(hover.glow, true);
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: scenario.width - 15, y: 150 });
            await delay(200);
            assert.equal(await evaluate(`document.querySelector('.project-card').style.getPropertyValue('--tilt-x')`), '');
            await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
            const button = await evaluate(`(()=>{const r=document.querySelector('.hero .btn-primary').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: button.x, y: button.y });
            await delay(350);
            assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.hero .btn-primary i')).transform`), 'none', 'CTA arrow hover missing');
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: scenario.width - 15, y: 150 });
        }
        await evaluate(`document.getElementById('achievements').scrollIntoView({behavior:'instant'})`);
        await delay(850);
        const gallery = await evaluate(`({badges:document.querySelectorAll('.achievement-card:not(.achievement-card--featured)').length, profile:document.querySelector('.achievement-card--featured').getBoundingClientRect().width,badgeWidth:document.querySelector('.achievement-card:not(.achievement-card--featured) img').getBoundingClientRect().width,missing:[...document.querySelectorAll('#achievements img')].filter(i=>i.complete&&!i.naturalWidth).length})`);
        assert.equal(gallery.badges, 8);
        assert(gallery.profile <= 680.1);
        assert(gallery.badgeWidth <= 225.6); // hover scale is 1.025
        assert.equal(gallery.missing, 0);
        await screenshot('-achievements');
        if (!scenario.noJS) {
            await evaluate(`document.querySelector('.skill-chip').click()`);
            assert.equal(await evaluate(`document.querySelector('.skill-chip').getAttribute('aria-pressed')`), 'true');
            if (scenario.width <= 850) {
                await evaluate(`window.scrollTo({top:0,behavior:'instant'});document.querySelector('.mobile-nav summary').click()`);
                assert.equal(await evaluate(`document.querySelector('.mobile-nav').open`), true);
                await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
                assert.equal(await evaluate(`document.querySelector('.mobile-nav').open`), false);
                await evaluate(`document.querySelector('.mobile-nav summary').click();document.querySelector('.mobile-nav a[href="#projects"]').click()`);
                await delay(1200);
                assert.equal(await evaluate(`document.querySelector('.mobile-nav').open`), false);
                assert.equal(await evaluate(`location.hash`), '#projects');
            }
            // Navigation uses native hashes, scroll margin, and normal browser history.
            await evaluate(`document.querySelector('.nav-links a[href="#skills"]').click()`);
            await delay(1200);
            assert.equal(await evaluate(`location.hash`), '#skills');
            await evaluate(`document.querySelector('.nav-links a[href="#contact"]').click()`);
            await delay(1200);
            assert.equal(await evaluate(`location.hash`), '#contact');
            await evaluate(`history.back()`);
            await delay(1200);
            assert.equal(await evaluate(`location.hash`), '#skills');
            await evaluate(`history.forward()`);
            await delay(1200);
            assert.equal(await evaluate(`location.hash`), '#contact');
            await evaluate(`document.getElementById('themeToggle').click()`);
            await delay(550);
            assert.equal(await evaluate(`document.documentElement.classList.contains('dark-mode')`), true);
            await screenshot('-dark');
            await evaluate(`document.getElementById('themeToggle').click()`);
            await delay(500);
            assert.equal(await evaluate(`document.documentElement.classList.contains('dark-mode')`), false);
            await evaluate(`document.getElementById('adminBtn').click()`);
            assert.equal(await evaluate(`document.getElementById('loginModal').classList.contains('active')`), true);
            await evaluate(`document.getElementById('loginClose').click()`);
            await evaluate(`document.querySelector('.cert-btn').click()`);
            await evaluate(`document.querySelector('#certPreviewBody img').decode()`);
            await delay(500);
            assert.equal(await evaluate(`document.getElementById('certPreviewModal').getAttribute('aria-hidden')`), 'false');
            assert.equal(await evaluate(`document.querySelector('#certPreviewBody img').naturalWidth>0`), true);
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
            assert.equal(await evaluate(`document.getElementById('certPreviewModal').getAttribute('aria-hidden')`), 'true');
            assert.equal(await evaluate(`document.activeElement.classList.contains('cert-btn')`), true);
            if (!scenario.reduced && !scenario.noLibraries) {
                await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
                await delay(250);
                assert.equal(await evaluate(`ScrollTrigger.getAll().length`), 0, 'Reduced-motion toggle did not clean triggers');
                assert.equal(await evaluate(`!!document.querySelector('.cursor-glow')`), false);
                assert.equal(await evaluate(`[...document.querySelectorAll('.is-revealing')].length`), 0);
                await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
                await delay(500);
                assert(await evaluate(`ScrollTrigger.getAll().length>0`));
            }
            // Verify system preference changes when no explicit theme has been saved.
            await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: scenario.reduced ? 'reduce' : 'no-preference' }] });
            await delay(150);
            await evaluate(`localStorage.removeItem('portfolio-theme')`);
            await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: scenario.reduced ? 'reduce' : 'no-preference' }] });
            await delay(500);
            assert.equal(await evaluate(`document.documentElement.classList.contains('dark-mode')`), true);
        }
        assert.deepEqual(errors, [], `${scenario.name}: console exceptions`);
        console.log(`PASS ${scenario.name}`, JSON.stringify({ width: initial.width, triggers: initial.triggers, ...gallery }));
        return { name: scenario.name, passed: true, ...initial, ...gallery };
    } finally {
        await send('Page.close').catch(() => {});
        socket.close();
    }
}

async function main() {
    const results = [];
    let scenarios = [
        { name: 'desktop', width: 1440 }, { name: 'phone', width: 390 },
        { name: 'laptop', width: 1024 }, { name: 'tablet', width: 768 },
        { name: 'reduced-motion', width: 390, reduced: true },
        { name: 'no-animation-library', width: 1440, noLibraries: true },
        { name: 'javascript-disabled', width: 390, noJS: true }
    ];
    if (process.env.PORTFOLIO_SCENARIOS) scenarios = scenarios.filter(scenario => process.env.PORTFOLIO_SCENARIOS.split(',').includes(scenario.name));
    for (const scenario of scenarios) results.push(await browser(scenario));
    // Run the email draft handler in isolation so checks never open a mail app or send mail.
    const handler = html.match(/contactForm\.addEventListener\('submit', function\(e\) \{([\s\S]*?)\n\s*\}\);/)[1];
    const status = {};
    const fields = new Map([['name', 'Example Developer'], ['email', 'example@example.com'], ['subject', 'Portfolio & internship'], ['message', 'Hello Siri!\nNice work.']]);
    const form = { querySelector: () => status, classList: { add: value => { assert.equal(value, 'draft-ready'); } } };
    const sandbox = { FormData: class { get(key) { return fields.get(key); } }, encodeURIComponent };
    const emailWindow = { location: {} };
    vm.runInNewContext(`(function(e){${handler}}).call(form,{preventDefault(){}})`, { ...sandbox, window: emailWindow, form });
    assert(emailWindow.location.href.startsWith('mailto:sirigoudmunukuntla@gmail.com?subject='));
    assert(decodeURIComponent(emailWindow.location.href).includes('Portfolio & internship'));
    assert(decodeURIComponent(emailWindow.location.href).includes('example@example.com'));
    assert(status.textContent.includes('Send it from your email app'));
    const report = process.env.PORTFOLIO_SCENARIOS ? 'interaction-results.json' : 'results.json';
    fs.writeFileSync(path.join(artifacts, report), JSON.stringify({ inlineScriptsParsed: inlineCount, scenarios: results, emailDraft: 'passed' }, null, 2));
    console.log(`PASS email draft preparation; ${inlineCount} inline scripts parsed. Results: tmp/motion-verification/${report}`);
}
async function run() {
    const directory = fs.mkdtempSync(path.join(artifacts, 'cms-db-'));
    const app = createApp({ dataDir: directory, origin: previewOrigin, setupToken: 'motion-test-only' });
    await new Promise(resolve => app.server.listen(5812, '127.0.0.1', resolve));
    try { await main(); }
    finally {
        await new Promise(resolve => app.server.close(resolve));
        app.store.close();
        assert(directory.startsWith(artifacts + path.sep));
        fs.rmSync(directory, { recursive: true, force: true });
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
