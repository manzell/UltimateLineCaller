// node build.js — inlines fonts, styles and scripts into a single page.
// dist/artifact.html has no document wrapper (the host adds it); www/index.html is the full page for Android.
const fs = require('fs');
const path = require('path');
const fontDir = process.env.FONT_DIR || path.join(__dirname, 'src/fonts');
const face = (family, weight, file) => {
  const b64 = fs.readFileSync(path.join(fontDir, file)).toString('base64');
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
};
const fonts = [
  face('Barlow Condensed', 600, 'barlow-condensed-latin-600-normal.woff2'),
  face('Barlow Condensed', 700, 'barlow-condensed-latin-700-normal.woff2'),
  face('Atkinson Hyperlegible', 400, 'atkinson-hyperlegible-latin-400-normal.woff2'),
  face('Atkinson Hyperlegible', 700, 'atkinson-hyperlegible-latin-700-normal.woff2'),
].join('\n');
const read = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const body = (extra) => `<title>Line Caller</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${read('style.css')}
${fonts}</style>
<div id="app"></div>${extra}
<script>${read('engine.js').replace('if (typeof module !== \'undefined\') module.exports = Engine;', '')}</script>
<script>${read('report.js').replace('if (typeof module !== \'undefined\') module.exports = Report;', '')}</script>
<script>${read('app.js')}</script>`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'www'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/artifact.html'), body(''));
// The Android page also needs Capacitor's bridge so it can reach the speech plugin.
const nm = (f) => `<script>${fs.readFileSync(path.join(__dirname, 'node_modules', f), 'utf8')}</script>`;
const bridge = nm('@capacitor/core/dist/capacitor.js') + nm('firebase/firebase-app-compat.js') + nm('firebase/firebase-auth-compat.js') + nm('firebase/firebase-firestore-compat.js')
  + `<script>${read('firebase-config.js')}</script><script>${read('cloud.js').replace("if (typeof module !== 'undefined') module.exports = Cloud;", '')}</script>`;
const favicon = `<link rel="icon" type="image/png" href="data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'src/icon-64.png')).toString('base64')}">`;
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">${favicon}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0);padding-bottom:env(safe-area-inset-bottom,0)}body{margin:0;font-size:14px}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body(bridge)}</body></html>`;
fs.writeFileSync(path.join(__dirname, 'www/index.html'), page);
console.log('built', (page.length / 1024).toFixed(0) + ' KB');
