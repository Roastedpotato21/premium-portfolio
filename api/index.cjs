'use strict';
const path = require('node:path');
const { createApp } = require('../server/index.cjs');

let appInstance = null;

function getApp() {
  if (!appInstance) {
    appInstance = createApp();
  }
  return appInstance;
}

module.exports = async function handler(req, res) {
  const app = getApp();
  
  // Reconstruct intended URL path from Vercel rewrite parameters or headers
  const urlObj = new URL(req.url, 'http://127.0.0.1');
  
  if (urlObj.searchParams.has('apiPath')) {
    const apiPath = urlObj.searchParams.get('apiPath');
    urlObj.searchParams.delete('apiPath');
    const search = urlObj.searchParams.toString();
    req.url = '/api/' + apiPath + (search ? '?' + search : '');
  } else if (urlObj.searchParams.has('slug')) {
    const slug = urlObj.searchParams.get('slug');
    urlObj.searchParams.delete('slug');
    const search = urlObj.searchParams.toString();
    req.url = '/projects/' + slug + (search ? '?' + search : '');
  } else if (urlObj.searchParams.has('path')) {
    const p = urlObj.searchParams.get('path');
    urlObj.searchParams.delete('path');
    const search = urlObj.searchParams.toString();
    req.url = p + (search ? '?' + search : '');
  } else if (req.headers['x-matched-path']) {
    req.url = req.headers['x-matched-path'] + (urlObj.search ? '?' + urlObj.searchParams.toString() : '');
  } else if (urlObj.pathname === '/api/index' || urlObj.pathname === '/api/index.cjs' || urlObj.pathname === '/api') {
    req.url = '/' + (urlObj.search ? '?' + urlObj.searchParams.toString() : '');
  }

  return app.handler(req, res);
};
