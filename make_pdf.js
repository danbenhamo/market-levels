// Render the daily reports to a clean A4 PDF (light theme, RTL).
//   node make_pdf.js --html page.html --out brief.pdf          (a full briefing page, as published)
//   node make_pdf.js --brief data.json --out brief.pdf           (two-page morning brief, see brief_template.js)
//   node make_pdf.js --journal month.json --out journal.pdf      (monthly trade journal, see journal_template.js)
//   node make_pdf.js --title "..." --subtitle "..." --text body.txt --out note.pdf
// body.txt format: "## heading" starts a section, "- item" is a bullet, "! text" is a highlighted verdict line,
// "key: value" lines inside a "## " section that starts with "##=" become number tiles; other lines are paragraphs.
const fs = require('fs');
const { chromium } = require('playwright');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const { t, esc } = require('./brief_template.js');

// Colours carry meaning everywhere: red = down / put wall (support), green = up / call wall (resistance),
// amber = neutral / watch out, blue = ES, teal = NQ, purple = options. A legend at the top says so.
const BASE_CSS = `
:root{--bg:#f3f5f8;--surface:#fff;--ink:#131a26;--muted:#5a6476;--line:#dde2ea;--navy:#16233f;
--bull:#0f7a4a;--bull-bg:#e3f4ea;--bear:#c2362b;--bear-bg:#fbe7e4;--warn:#a85f00;--warn-bg:#fdf0d9;
--es:#1f4fd1;--es-bg:#eaf0fe;--nq:#0b7a75;--nq-bg:#e4f5f3;--opt:#6a3fc4;--opt-bg:#f0eafc;
--f-body:"Heebo","Segoe UI",Arial,sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:19px;line-height:1.5;margin:0}
.wrap{max-width:760px;margin:0 auto;padding:0;display:grid;gap:9px}
header{background:var(--navy);color:#fff;border-radius:12px;padding:10px 18px}
header .eyebrow{font-size:15px;color:#b9c6e4}
h1{font-size:30px;margin:0;font-weight:800}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;color:var(--muted);padding:2px 4px}
.legend span{display:inline-flex;align-items:center;gap:5px}
.legend i{width:13px;height:13px;border-radius:3px;display:inline-block}
section{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:9px 16px;break-inside:avoid;border-right:6px solid var(--line)}
h2{font-size:21px;margin:0 0 6px;display:flex;align-items:center;gap:8px}
p{margin:0 0 6px} ul{margin:0;padding-inline-start:22px;display:grid;gap:5px}
bdi.n{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;white-space:nowrap}
.up{color:var(--bull);font-weight:700} .dn{color:var(--bear);font-weight:700}
.verdict{background:#fff;border:2px solid var(--navy);border-right-width:6px;font-size:21px;font-weight:600}
.verdict.bull{border-color:var(--bull);background:var(--bull-bg)} .verdict.bear{border-color:var(--bear);background:var(--bear-bg)}
.badge{font-size:15px;font-weight:800;color:#fff;border-radius:6px;padding:1px 9px;font-family:var(--f-mono)}
section.es{border-right-color:var(--es)} section.es .badge{background:var(--es)}
section.nq{border-right-color:var(--nq)} section.nq .badge{background:var(--nq)}
section.panel.es{background:var(--es-bg)} section.panel.nq{background:var(--nq-bg)}
section.opt{border-right-color:var(--opt)} section.opt h2{color:var(--opt)}
section.warn{border-right-color:var(--warn);background:var(--warn-bg)} section.warn h2{color:var(--warn)}
section.good{border-right-color:var(--bull)} section.bad{border-right-color:var(--bear)}
.panel h3{font-size:18px;margin:10px 0 4px} .panel ul{background:#fff;border-radius:8px;padding:6px 30px 6px 10px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tile{background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px 12px;border-top:4px solid #9aa4b5}
.tile b{display:block;font-size:15px;color:var(--muted);font-weight:500}
.tile .v{font-size:23px;font-weight:700} .tile .s{font-size:14px;color:var(--muted);display:block} .tile .s bdi.up,.tile .s bdi.dn{font-size:18px}
.tile.put{border-top-color:var(--bear)} .tile.put .v{color:var(--bear)}
.tile.call{border-top-color:var(--bull)} .tile.call .v{color:var(--bull)}
.tile.dir.bull{background:var(--bull-bg);border-top-color:var(--bull)} .tile.dir.bull .v{color:var(--bull)}
.tile.dir.bear{background:var(--bear-bg);border-top-color:var(--bear)} .tile.dir.bear .v{color:var(--bear)}
.tile.dir.neu{background:var(--warn-bg);border-top-color:var(--warn)} .tile.dir.neu .v{color:var(--warn)}
.tile.price{border-top-color:var(--navy)}
.foot{font-size:14px;color:var(--muted);text-align:center}`;
const PRINT_CSS = `html{background:#f3f5f8} section{break-inside:avoid} body{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap">';

const LEGEND = `<div class="legend"><span><i style="background:var(--bear)"></i>אדום = ירידה · Put wall (תמיכה)</span>
<span><i style="background:var(--bull)"></i>ירוק = עלייה · Call wall (התנגדות)</span><span><i style="background:var(--warn)"></i>כתום = ניטרלי · לשים לב</span>
<span><i style="background:var(--es)"></i>כחול = ES</span><span><i style="background:var(--nq)"></i>טורקיז = NQ</span><span><i style="background:var(--opt)"></i>סגול = אופציות</span></div>`;

const BULL = /עולה|עלייה|חיובי|שורי|▲/, BEAR = /יורד|ירידה|שלילי|דובי|▼/, NEU = /ניטרלי|מעורב|דשדוש/;
// Numbers wrapped LTR; signed percentages coloured green / red.
const tx = s => t(s).replace(/<bdi class="n">([^<]*)<\/bdi>/g, (m, v) => {
  const c = /^\+[\d.,]+%/.test(v) ? 'up' : /^[-−][\d.,]+%/.test(v) ? 'dn' : '';
  return c ? `<bdi class="n ${c}">${v}</bdi>` : m; });
function secClass(h) {
  if (/^\s*ES\b|S&P/.test(h) && !/NQ/.test(h)) return 'es';
  if (/^\s*NQ\b|נאסד/.test(h) && !/\bES\b/.test(h)) return 'nq';
  if (/אופצי|פוטים|קולים|גמא|gamma/i.test(h)) return 'opt';
  if (/לשים לב|אזהר|סיכונ|אירוע/.test(h)) return 'warn';
  if (/עבד|הצלח|טוב/.test(h)) return 'good';
  if (/לא עבד|טעות|לתקן/.test(h)) return 'bad';
  return '';
}
const ICON = { opt: '🎯', warn: '⚠️', good: '✅', bad: '❌' };
function heading(h, cls) {
  const m = h.match(/^\s*(ES|NQ)\b\s*[:·\-–]?\s*(.*)$/);
  if (m) return `<h2><span class="badge">${m[1]}</span>${tx(m[2])}</h2>`;
  return `<h2>${ICON[cls] ? ICON[cls] + ' ' : ''}${tx(h)}</h2>`;
}
function tile(k, v) {
  let cls = '';
  if (/put|פוט|תמיכה/i.test(k)) cls = 'put';
  else if (/call|קול|התנגדות/i.test(k)) cls = 'call';
  else if (/כיוון|הטיה|מגמה/.test(k)) cls = 'dir ' + (BULL.test(v) ? 'bull' : BEAR.test(v) ? 'bear' : 'neu');
  else if (/מחיר|סגירה/.test(k)) cls = 'price';
  let main = v, sub = '';
  const i = v.indexOf(' · '); if (i > 0) { main = v.slice(0, i); sub = v.slice(i + 3); }
  else { const m = v.match(/^(.*?)\s*\((.+)\)$/); if (m) { main = m[1]; sub = m[2]; } }
  if (cls.startsWith('dir')) main = (BULL.test(v) ? '▲ ' : BEAR.test(v) ? '▼ ' : '◆ ') + main;
  return `<div class="tile ${cls}"><b>${tx(k)}</b><span class="v">${tx(main)}</span>${sub ? `<span class="s">${tx(sub)}</span>` : ''}</div>`;
}

function fromText(title, subtitle, text) {
  const out = [];
  let open = null, list = false, tiles = false, panel = '';
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } if (tiles) { out.push('</div>'); tiles = false; } };
  const closeSec = () => { closeList(); if (open) { out.push('</section>'); open = null; } panel = ''; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('##=')) { closeSec(); const h = line.slice(3).trim(), c = secClass(h); out.push(`<section class="panel ${c}">${heading(h, c)}<div class="tiles">`); open = 1; tiles = true; panel = c; continue; }
    if (line.startsWith('## ') && panel && secClass(line.slice(3)) === panel) { closeList(); out.push(`<h3>👀 ${tx(line.slice(3).replace(/^\s*(ES|NQ)\s*[:·\-–]?\s*/, ''))}</h3>`); continue; }
    if (line.startsWith('## ')) { closeSec(); const h = line.slice(3), c = secClass(h); out.push(`<section class="${c}">${heading(h, c)}`); open = 1; continue; }
    if (line.startsWith('! ')) { closeSec(); const v = line.slice(2); const c = BULL.test(v) && !BEAR.test(v) ? 'bull' : BEAR.test(v) && !BULL.test(v) ? 'bear' : '';
      out.push(`<section class="verdict ${c}">${tx(v)}</section>`); continue; }
    if (tiles && line.includes(':')) { const j = line.indexOf(':'); out.push(tile(line.slice(0, j), line.slice(j + 1).trim())); continue; }
    if (!open) { out.push('<section>'); open = 1; }
    if (line.startsWith('- ')) { if (tiles) { out.push('</div>'); tiles = false; } if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${tx(line.slice(2))}</li>`); continue; }
    closeList(); out.push(`<p>${tx(line)}</p>`);
  }
  closeSec();
  return `<title>${esc(title)}</title>${FONTS}<style>${BASE_CSS}</style>
<div class="wrap" dir="rtl" lang="he"><header><div class="eyebrow">${tx(subtitle || '')} · ניתוח כללי, לא ייעוץ השקעות</div><h1>${tx(title)}</h1></header>${LEGEND}
${out.join('\n')}</div>`;
}

(async () => {
  let body;
  if (args.brief) body = require('./brief_template.js')(JSON.parse(fs.readFileSync(args.brief, 'utf8')));
  else if (args.journal) body = require('./journal_template.js')(JSON.parse(fs.readFileSync(args.journal, 'utf8')));
  else if (args.html) body = fs.readFileSync(args.html, 'utf8');
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
