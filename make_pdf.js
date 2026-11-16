// Render the daily reports to a clean A4 PDF (light theme, RTL).
//   node make_pdf.js --html page.html --out brief.pdf          (a full briefing page, as published)
//   node make_pdf.js --title "..." --subtitle "..." --text body.txt --out note.pdf
// body.txt format: "## heading" starts a section, "- item" is a bullet, "! text" is a highlighted verdict line,
// "key: value" lines inside a "## " section that starts with "##=" become number tiles; other lines are paragraphs.
const fs = require('fs');
const { chromium } = require('playwright');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BASE_CSS = `
:root{--bg:#f3f5f8;--surface:#fff;--ink:#131a26;--muted:#5a6476;--line:#dde2ea;--accent:#1f4fd1;--bull:#0f7a4a;--bear:#c2362b;--warn:#b06b00;
--accent-bg:#e7edfc;--f-body:"Heebo","Segoe UI",Arial,sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:19px;line-height:1.65;margin:0}
.wrap{max-width:760px;margin:0 auto;padding:22px 18px 30px;display:grid;gap:14px}
.eyebrow{font-size:15px;letter-spacing:.06em;color:var(--muted)}
h1{font-size:34px;margin:2px 0 0;font-weight:800}
section{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;break-inside:avoid}
h2{font-size:22px;margin:0 0 8px}
p{margin:0 0 6px} ul{margin:0;padding-inline-start:20px;display:grid;gap:4px}
.verdict{border:2px solid var(--accent);background:var(--accent-bg);font-size:21px;font-weight:600}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}
.tile{border:1px solid var(--line);border-radius:8px;padding:6px 10px}
.tile b{display:block;font-size:15px;color:var(--muted);font-weight:500}
.tile span{font-family:var(--f-mono);font-size:22px;font-weight:600;direction:ltr;unicode-bidi:isolate}
.foot{font-size:14px;color:var(--muted);text-align:center}`;
const PRINT_CSS = `html{background:#f3f5f8} section{break-inside:avoid} body{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap">';

function fromText(title, subtitle, text) {
  const out = [];
  let open = null, list = false, tiles = false;
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } if (tiles) { out.push('</div>'); tiles = false; } };
  const closeSec = () => { closeList(); if (open) { out.push('</section>'); open = null; } };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('##=')) { closeSec(); out.push(`<section><h2>${esc(line.slice(3).trim())}</h2><div class="tiles">`); open = 1; tiles = true; continue; }
    if (line.startsWith('## ')) { closeSec(); out.push(`<section><h2>${esc(line.slice(3))}</h2>`); open = 1; continue; }
    if (line.startsWith('! ')) { closeSec(); out.push(`<section class="verdict">${esc(line.slice(2))}</section>`); continue; }
    if (tiles && line.includes(':')) { const k = line.slice(0, line.indexOf(':')), v = line.slice(line.indexOf(':') + 1); out.push(`<div class="tile"><b>${esc(k)}</b><span>${esc(v.trim())}</span></div>`); continue; }
    if (!open) { out.push('<section>'); open = 1; }
    if (line.startsWith('- ')) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${esc(line.slice(2))}</li>`); continue; }
    closeList(); out.push(`<p>${esc(line)}</p>`);
  }
  closeSec();
  return `<title>${esc(title)}</title>${FONTS}<style>${BASE_CSS}</style>
<div class="wrap" dir="rtl" lang="he"><header><div class="eyebrow">${esc(subtitle || '')}</div><h1>${esc(title)}</h1></header>
${out.join('\n')}<div class="foot">ניתוח כללי, לא ייעוץ השקעות.</div></div>`;
}

(async () => {
  let body;
  if (args.html) body = fs.readFileSync(args.html, 'utf8');
  else body = fromText(args.title || 'דוח', args.subtitle || '', fs.readFileSync(args.text, 'utf8'));
  if (!/<link[^>]+fonts\.googleapis/.test(body)) body = FONTS + body;
  const zoom = args.html ? 'html{zoom:1.2} section{break-inside:auto} .tick>div,.lv,.sc,tr,li,h2{break-inside:avoid} h2{break-after:avoid}' : '';
  const doc = `<!doctype html><html lang="he" dir="rtl" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${PRINT_CSS}${zoom}</style></head><body>${body}</body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 1100 } });
  await page.emulateMedia({ colorScheme: 'light', media: 'screen' });
  await page.setContent(doc, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: args.out, format: 'A4', printBackground: true, margin: { top: '8mm', bottom: '10mm', left: '6mm', right: '6mm' } });
  await browser.close();
  console.log('wrote', args.out);
})();
