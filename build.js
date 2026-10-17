#!/usr/bin/env node
// Builds the single self-contained offline HTML file from src/ + vendor/.
// Usage: node build.js
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const css = read('src/styles.css');
const jsDir = path.join(root, 'src/js');
const app = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort()
  .map(f => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
// "<!--" inside an inline <script> can confuse HTML parsers; the escaped form is equivalent in JS regex/strings.
const xlsx = read('vendor/xlsx.core.min.js').replace(/<!--/g, '<\\!--');
// QR code generator (qrcode-generator 1.4.4, MIT, Kazuhiko Arase) — used for identity cards
const qr = read('vendor/qrcode.js').replace(/<!--/g, '<\\!--');

for (const [name, s] of [['app', app], ['xlsx', xlsx], ['qr', qr]]) {
  if (/<\/script/i.test(s)) throw new Error(`${name} contains a closing script tag`);
}

const html = read('src/index.template.html')
  .replace('/*__STYLES__*/', () => css)
  .replace('/*__XLSX__*/', () => xlsx + '\n' + qr)
  .replace('/*__APP__*/', () => app);

const out = path.join(root, 'MLC_Polling_Personnel_Tool.html');
fs.writeFileSync(out, html);
console.log(`Built ${path.basename(out)} (${(html.length / 1024).toFixed(0)} KB)`);
