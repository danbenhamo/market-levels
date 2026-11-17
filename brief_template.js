// Two-page morning brief for Telegram, built from a small JSON file.
// Every number and Latin term is wrapped in an isolated left-to-right span so Hebrew sentences read correctly.
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// runs that start with a sign, digit, $ or Latin letter (e.g. "ES 7,523", "-0.8%", "Put wall", "±105") stay LTR
const LTR = new RegExp(String.raw`(?<![֐-׿A-Za-z0-9])[+\-−±~$]?[A-Za-z0-9$](?:[A-Za-z0-9$%.,/&+\-–:]*[A-Za-z0-9%$])?(?:[ ][+\-−±~$]?[A-Za-z0-9$](?:[A-Za-z0-9$%.,/&+\-–:]*[A-Za-z0-9%$])?)*`, 'gu');
const t = s => { s = String(s ?? ''); let out = '', last = 0; for (const m of s.matchAll(LTR)) { out += esc(s.slice(last, m.index)) + `<bdi class="n">${esc(m[0])}</bdi>`; last = m.index + m[0].length; } return out + esc(s.slice(last)); };

const DIR = {
  bull: { word: 'עולה', arrow: '▲', cls: 'bull' },
  bear: { word: 'יורד', arrow: '▼', cls: 'bear' },
  neutral: { word: 'ניטרלי', arrow: '◆', cls: 'neu' },
};

const GLOSSARY = {
  'Put wall': 'המחיר שבו יש הכי הרבה אופציות פוט פתוחות. בדרך כלל משמש כתמיכה: השוק נוטה להאט שם בירידה. אם הוא נשבר, הירידה יכולה להאיץ.',
  'Call wall': 'המחיר שבו יש הכי הרבה אופציות קול פתוחות. בדרך כלל משמש כהתנגדות: השוק נוטה להיעצר שם בעלייה.',
  'טווח צפוי': 'כמה נקודות השוק צפוי לזוז היום למעלה או למטה, לפי מחירי האופציות. ברוב הימים התנועה נשארת בתוך הטווח.',
  'גמא שלילית': 'מצב שבו הסוחרים הגדולים שמוכרים אופציות נאלצים לקנות כשהשוק עולה ולמכור כשהוא יורד, ולכן תנועות נעשות חדות יותר.',
  'VIX': 'מדד הפחד של השוק. מתחת ל-15 שקט, 15–25 עצבני, מעל 30 פאניקה.',
};

const CSS = `
:root{--bg:#f3f5f8;--card:#fff;--ink:#131a26;--muted:#5a6476;--line:#dde2ea;--accent:#1f4fd1;--accent-bg:#e7edfc;
--bull:#0f7a4a;--bull-bg:#e5f4ec;--bear:#c2362b;--bear-bg:#fbe9e7;--neu:#9a5d00;--neu-bg:#fdf1dc}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Heebo","Segoe UI",Arial,sans-serif;font-size:16.5px;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{padding:4px 2px;display:grid;gap:12px;align-content:start}
.page + .page{break-before:page}
bdi.n{direction:ltr;unicode-bidi:isolate;font-family:"Heebo",Arial,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
header .date{font-size:14px;color:var(--muted)}
h1{margin:0;font-size:30px;font-weight:800;line-height:1.15}
h2{margin:0 0 8px;font-size:19px;font-weight:800}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;break-inside:avoid}
.oneline{border:2px solid var(--accent);background:var(--accent-bg);font-size:19px;font-weight:700;line-height:1.5}
.oneline .lbl{display:block;font-size:13px;font-weight:600;color:var(--accent);margin-bottom:2px}
.dirs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dir{border-radius:12px;padding:10px 14px;border:2px solid}
.dir.bull{background:var(--bull-bg);border-color:var(--bull)} .dir.bear{background:var(--bear-bg);border-color:var(--bear)} .dir.neu{background:var(--neu-bg);border-color:var(--neu)}
.dir .sym{font-size:15px;font-weight:700;color:var(--muted)}
.dir .big{font-size:26px;font-weight:800;line-height:1.2}
.dir.bull .big{color:var(--bull)} .dir.bear .big{color:var(--bear)} .dir.neu .big{color:var(--neu)}
.dir .why{font-size:15px;margin-top:2px}
table{width:100%;border-collapse:collapse}
th{font-size:13px;color:var(--muted);font-weight:600;text-align:right;padding:4px 6px;border-bottom:2px solid var(--line)}
td{padding:7px 6px;border-bottom:1px solid var(--line);vertical-align:top;text-align:right}
td.v{font-size:19px;font-weight:800;white-space:nowrap}
td.name{font-weight:700;white-space:nowrap}
td.mean{font-size:14.5px;color:#2a3242}
tr.res td.v{color:var(--bull)} tr.sup td.v{color:var(--bear)}
.move{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
.move div{background:var(--bg);border-radius:10px;padding:6px 12px}
.move b{display:block;font-size:13px;color:var(--muted);font-weight:600}
.move span{font-size:22px;font-weight:800}
.scen{display:grid;gap:8px}
.sc{border-radius:10px;padding:8px 12px;border-inline-start:6px solid}
.sc.base{background:var(--neu-bg);border-color:var(--neu)} .sc.bear{background:var(--bear-bg);border-color:var(--bear)} .sc.bull{background:var(--bull-bg);border-color:var(--bull)}
.sc .hd{font-weight:800;font-size:17px}
.sc .p{float:left;font-weight:800;font-size:17px}
.sc .ln{font-size:15.5px}
.sc .ln b{color:var(--muted);font-weight:700}
ul{margin:0;padding-inline-start:20px;display:grid;gap:5px}
td.time{font-weight:800;white-space:nowrap;width:70px}
tr.key td{background:var(--accent-bg)}
.note{font-size:14.5px;color:#2a3242;margin-top:6px}
.gl{font-size:13.5px;color:#2a3242;display:grid;gap:4px}
.gl b{color:var(--ink)}
.coach{border:2px solid #7a4cc2;background:#f3edfc}
.coach h2{color:#5a2ea6;font-size:17px;margin-bottom:4px}
.coach ul{font-size:15.5px;gap:3px}
.foot{font-size:12.5px;color:var(--muted);text-align:center}`;

module.exports = function briefHtml(d) {
  const dirCard = (sym, x) => { const k = DIR[x?.dir] || DIR.neutral; return `<div class="dir ${k.cls}"><div class="sym">${t(sym)}</div><div class="big">${k.arrow} ${k.word}</div><div class="why">${t(x?.why)}</div></div>`; };
  const levels = (d.levels || []).map(r => `<tr class="${r.kind || ''}"><td class="name">${t(r.name)}</td><td class="v">${t(r.es)}</td><td class="v">${t(r.nq)}</td><td class="mean">${t(r.meaning)}</td></tr>`).join('');
  const scen = (d.scenarios || []).map(s => `<div class="sc ${s.kind || 'base'}"><span class="p">${t(s.prob)}</span><div class="hd">${t(s.name)}</div><div class="ln"><b>אם:</b> ${t(s.if)}</div><div class="ln"><b>אז:</b> ${t(s.then)}</div></div>`).join('');
  const drivers = (d.drivers || []).map(x => `<li>${t(x)}</li>`).join('');
  const sched = (d.schedule || []).map(r => `<tr class="${r.key ? 'key' : ''}"><td class="time">${t(r.time)}</td><td><b>${t(r.event)}</b>${r.why ? ` · ${t(r.why)}` : ''}</td></tr>`).join('');
  const terms = (d.glossary || Object.keys(GLOSSARY)).filter(k => GLOSSARY[k]).map(k => `<div><b>${t(k)}:</b> ${t(GLOSSARY[k])}</div>`).join('');
  const em = d.expected_move || {};
  const coach = (d.coaching || []).slice(0, 3).map(x => `<li>${t(x)}</li>`).join('');
  const coachCard = coach ? `<div class="card coach"><h2>${esc(d.coaching_title || 'דגשים מהמסחר שלך אתמול')}</h2><ul>${coach}</ul></div>` : '';
  return `<title>${esc(d.title || 'תדריך בוקר NQ / ES')}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap">
<style>${CSS}</style>
<div dir="rtl" lang="he">
<div class="page">
  <header><div class="date">${t(d.date_line)}</div><h1>${esc(d.title || 'תדריך בוקר NQ / ES')}</h1></header>
  <div class="card oneline"><span class="lbl">השורה התחתונה</span>${t(d.bottom_line)}</div>
  ${coachCard}
  <div class="dirs">${dirCard('NQ · נאסד"ק', d.nq)}${dirCard('ES · S&P 500', d.es)}</div>
  <div class="card"><h2>המספרים החשובים להיום</h2>
    <table><thead><tr><th>רמה</th><th>ES</th><th>NQ</th><th>מה זה אומר</th></tr></thead><tbody>${levels}</tbody></table>
    <div class="move"><div><b>טווח צפוי היום ב-ES</b><span>${t(em.es)}</span></div><div><b>טווח צפוי היום ב-NQ</b><span>${t(em.nq)}</span></div></div>
    ${em.note ? `<div class="note">${t(em.note)}</div>` : ''}
  </div>
</div>
  <div class="card"><h2>מה מזיז את השוק</h2><ul>${drivers}</ul></div>
</div>
<div class="page">
  <div class="card"><h2>מה יכול לקרות היום</h2><div class="scen">${scen}</div></div>
  <div class="card"><h2>לוח זמנים (שעון ישראל)</h2><table><tbody>${sched}</tbody></table></div>
  <div class="card"><h2>מילון קצר</h2><div class="gl">${terms}</div></div>
  <div class="foot">${d.link ? `הדוח המלא: ${esc(d.link)} · ` : ''}ניתוח כללי, לא ייעוץ השקעות.</div>
</div>
</div>`;
};
