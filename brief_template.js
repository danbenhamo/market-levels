// Two-page morning brief for Telegram, built from a small JSON file.
// ES and NQ each get their own panel (direction, levels, range, scenarios) so the two never mix.
// Every number and Latin term is wrapped in an isolated left-to-right span so Hebrew sentences read correctly.
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const W = String.raw`[+\-−±~$]?[A-Za-z0-9$](?:[A-Za-z0-9$%.,/&+\-–:]*[A-Za-z0-9%$])?`;
const LTR = new RegExp(String.raw`(?<![֐-׿A-Za-z0-9])` + W + String.raw`(?:[ ]` + W + `)*`, 'gu');
const t = s => { s = String(s ?? ''); let out = '', last = 0; for (const m of s.matchAll(LTR)) { out += esc(s.slice(last, m.index)) + `<bdi class="n">${esc(m[0])}</bdi>`; last = m.index + m[0].length; } return out + esc(s.slice(last)); };

const DIR = {
  bull: { word: 'עולה', arrow: '▲', cls: 'bull' },
  bear: { word: 'יורד', arrow: '▼', cls: 'bear' },
  neutral: { word: 'ניטרלי', arrow: '◆', cls: 'neu' },
};
const GLOSSARY = {
  'Put wall': 'המחיר עם הכי הרבה אופציות פוט פתוחות. בדרך כלל תמיכה: השוק מאט שם בירידה. אם נשבר, הירידה יכולה להאיץ.',
  'Call wall': 'המחיר עם הכי הרבה אופציות קול פתוחות. בדרך כלל התנגדות: השוק נעצר שם בעלייה.',
  'טווח צפוי': 'כמה נקודות השוק צפוי לזוז היום לכל כיוון, לפי מחירי האופציות.',
  'גמא שלילית': 'מצב שבו תנועות נעשות חדות יותר, כי הסוחרים הגדולים נאלצים לרדוף אחרי המחיר.',
  'VIX': 'מדד הפחד. מתחת ל-15 שקט, 15–25 עצבני, מעל 30 פאניקה.',
};

const CSS = `
:root{--bg:#f3f5f8;--card:#fff;--ink:#131a26;--muted:#5a6476;--line:#dde2ea;--accent:#1f4fd1;--accent-bg:#e7edfc;
--es:#1f4fd1;--es-bg:#eaf0fe;--nq:#0b7a75;--nq-bg:#e4f5f3;
--bull:#0f7a4a;--bull-bg:#e5f4ec;--bear:#c2362b;--bear-bg:#fbe9e7;--neu:#9a5d00;--neu-bg:#fdf1dc}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Heebo","Segoe UI",Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{padding:2px;display:grid;gap:10px;align-content:start}
.page + .page{break-before:page}
bdi.n{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;white-space:nowrap}
header .date{font-size:14px;color:var(--muted)}
h1{margin:0;font-size:28px;font-weight:800;line-height:1.15}
h2{margin:0 0 6px;font-size:18px;font-weight:800}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;break-inside:avoid}
.oneline{border:2px solid var(--accent);background:var(--accent-bg);font-size:18px;font-weight:700}
.oneline .lbl{display:block;font-size:13px;font-weight:600;color:var(--accent)}
.coach{border:2px solid #7a4cc2;background:#f3edfc}
.coach h2{color:#5a2ea6;font-size:16px;margin-bottom:2px}
.coach ul{font-size:15px;gap:2px}
.inst{border-radius:14px;border:3px solid;background:var(--card);overflow:hidden;break-inside:avoid}
.inst.es{border-color:var(--es)} .inst.nq{border-color:var(--nq)}
.ihead{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 14px;color:#fff}
.inst.es .ihead{background:var(--es)} .inst.nq .ihead{background:var(--nq)}
.ihead .nm{font-size:22px;font-weight:800}
.ihead .sub{font-size:13px;opacity:.9}
.ihead .dir{background:#fff;border-radius:999px;padding:3px 12px;font-weight:800;font-size:17px}
.dir.bull{color:var(--bull)} .dir.bear{color:var(--bear)} .dir.neu{color:var(--neu)}
.ibody{padding:8px 14px 10px;display:grid;gap:8px}
.why{font-size:15.5px;font-weight:600}
table{width:100%;border-collapse:collapse}
td{padding:5px 6px;border-bottom:1px solid var(--line);vertical-align:top;text-align:right}
td.v{font-size:19px;font-weight:800;white-space:nowrap;width:90px}
td.name{font-weight:700;white-space:nowrap;width:170px}
td.mean{font-size:14px;color:#2a3242}
tr.res td.v{color:var(--bull)} tr.sup td.v{color:var(--bear)} tr.now td{background:var(--bg)}
.move{display:flex;gap:10px;align-items:baseline;background:var(--bg);border-radius:10px;padding:5px 12px}
.move b{font-size:13px;color:var(--muted);font-weight:600}
.move span{font-size:19px;font-weight:800}
.move em{font-style:normal;font-size:14.5px;color:#2a3242}
.scen{display:grid;gap:5px}
.sc{border-radius:8px;padding:5px 10px;border-inline-start:5px solid;font-size:14.5px}
.sc.base{background:var(--neu-bg);border-color:var(--neu)} .sc.bear{background:var(--bear-bg);border-color:var(--bear)} .sc.bull{background:var(--bull-bg);border-color:var(--bull)}
.sc .hd{font-weight:800} .sc .p{float:left;font-weight:800}
.sc b.k{color:var(--muted)}
ul{margin:0;padding-inline-start:20px;display:grid;gap:4px}
.tag{display:inline-block;font-size:12px;font-weight:800;border-radius:6px;padding:0 6px;margin-inline-end:4px;color:#fff}
.tag.es{background:var(--es)} .tag.nq{background:var(--nq)} .tag.both{background:#5a6476}
td.time{font-weight:800;white-space:nowrap;width:64px}
tr.key td{background:var(--accent-bg)}
.gl{font-size:13px;color:#2a3242;display:grid;gap:2px}
.foot{font-size:12px;color:var(--muted);text-align:center}`;

function instPanel(code, sub, x = {}) {
  const k = DIR[x.dir] || DIR.neutral;
  const rows = (x.levels || []).map(r => `<tr class="${r.kind || ''}"><td class="name">${t(r.name)}</td><td class="v">${t(r.price)}</td><td class="mean">${t(r.meaning)}</td></tr>`).join('');
  const scen = (x.scenarios || []).map(s => `<div class="sc ${s.kind || 'base'}"><span class="p">${t(s.prob)}</span><span class="hd">${t(s.name)}</span><br><b class="k">אם</b> ${t(s.if)} <b class="k">← אז</b> ${t(s.then)}</div>`).join('');
  return `<div class="inst ${code.toLowerCase()}">
  <div class="ihead"><div><div class="nm">${esc(code)}</div><div class="sub">${t(sub)}</div></div><div class="dir ${k.cls}">${k.arrow} ${k.word}</div></div>
  <div class="ibody">
    <div class="why">${t(x.why)}</div>
    <table><tbody>${rows}</tbody></table>
    <div class="move"><b>טווח צפוי היום</b><span>${t(x.move)}</span>${x.range ? `<em>כלומר בערך בין ${t(x.range)}</em>` : ''}</div>
    ${scen ? `<div class="scen">${scen}</div>` : ''}
  </div></div>`;
}

module.exports = function briefHtml(d) {
  const coach = (d.coaching || []).slice(0, 3).map(x => `<li>${t(x)}</li>`).join('');
  const tagOf = g => g === 'ES' ? '<span class="tag es">ES</span>' : g === 'NQ' ? '<span class="tag nq">NQ</span>' : '<span class="tag both">שניהם</span>';
  const drivers = (d.drivers || []).map(x => typeof x === 'string' ? `<li>${t(x)}</li>` : `<li>${tagOf(x.tag)}${t(x.text)}</li>`).join('');
  const sched = (d.schedule || []).map(r => `<tr class="${r.key ? 'key' : ''}"><td class="time">${t(r.time)}</td><td><b>${t(r.event)}</b>${r.why ? ` · ${t(r.why)}` : ''}</td></tr>`).join('');
  const terms = (d.glossary || Object.keys(GLOSSARY)).filter(k => GLOSSARY[k]).map(k => `<div><b>${t(k)}:</b> ${t(GLOSSARY[k])}</div>`).join('');
  return `<title>${esc(d.title || 'תדריך בוקר NQ / ES')}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap">
<style>${CSS}</style>
<div dir="rtl" lang="he">
<div class="page">
  <header><div class="date">${t(d.date_line)}</div><h1>${esc(d.title || 'תדריך בוקר NQ / ES')}</h1></header>
  <div class="card oneline"><span class="lbl">השורה התחתונה</span>${t(d.bottom_line)}</div>
  ${coach ? `<div class="card coach"><h2>${esc(d.coaching_title || 'דגשים מהמסחר שלך אתמול')}</h2><ul>${coach}</ul></div>` : ''}
  ${instPanel('ES', 'חוזה S&P 500', d.es)}
</div>
<div class="page">
  ${instPanel('NQ', 'חוזה נאסד"ק 100', d.nq)}
  <div class="card"><h2>מה מזיז את השוק</h2><ul>${drivers}</ul></div>
  <div class="card"><h2>לוח זמנים היום (שעון ישראל)</h2><table><tbody>${sched}</tbody></table></div>
  ${terms ? `<div class="card"><h2>מילון קצר</h2><div class="gl">${terms}</div></div>` : ''}
  <div class="foot">${d.link ? `הדוח המלא: ${esc(d.link)} · ` : ''}ניתוח כללי, לא ייעוץ השקעות.</div>
</div>
</div>`;
};
