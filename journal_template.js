// Monthly trade journal PDF (Hebrew, RTL) built from a JSON file:
// { "month": "נובמבר 2026", "updated": "23.11.2026 23:17",
//   "trades": [{date:"2026-11-23", time_in:"15:36", time_out:"15:55", contract:"MNQ", side:"Long", qty:2,
//               entry:25942.75, exit:26072, points:129.25, pnl:517, note:"..."}],
//   "tips": ["...", "..."] }          // optional: the latest tips for the next day
// Everything else (totals, per-day, per-contract, the equity curve) is worked out here.
const { t, esc } = require('./brief_template.js');

const money = v => (v < 0 ? '-' : v > 0 ? '+' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
const num = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const cls = v => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
const dmy = d => d.slice(8, 10) + '.' + d.slice(5, 7);
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const dayName = d => DAYS[new Date(d + 'T12:00:00Z').getUTCDay()];

function equitySvg(days) {
  const W = 700, H = 170, P = { l: 56, r: 14, t: 14, b: 26 };
  let cum = 0; const pts = days.map(d => (cum += d.pnl));
  const vals = [0, ...pts], lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const n = days.length, x = i => P.l + (n === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (n - 1));
  const y = v => P.t + ((hi - v) * (H - P.t - P.b)) / span;
  const bw = Math.min(40, ((W - P.l - P.r) / Math.max(n, 1)) * 0.5);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" direction="ltr">`;
  s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="#9aa4b5" stroke-dasharray="4 4"/>`;
  [hi, lo].forEach(v => { if (v !== 0) s += `<text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#5a6476">${esc(money(v))}</text>`; });
  s += `<text x="${P.l - 6}" y="${y(0) + 4}" text-anchor="end" font-size="11" fill="#5a6476">$0</text>`;
  days.forEach((d, i) => {   // daily bars
    const top = y(Math.max(0, d.pnl)), bot = y(Math.min(0, d.pnl));
    s += `<rect x="${x(i) - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1, bot - top)}" fill="${d.pnl >= 0 ? '#bfe5cf' : '#f4c7c2'}"/>`;
    s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#5a6476">${dmy(d.date)}</text>`;
  });
  s += `<polyline fill="none" stroke="#1f4fd1" stroke-width="2.5" points="${pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`;
  pts.forEach((v, i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#1f4fd1"/>`; });
  const last = pts[pts.length - 1];
  s += `<text x="${x(n - 1)}" y="${y(last) - 8}" text-anchor="${n > 1 ? 'end' : 'middle'}" font-size="12" font-weight="700" fill="#1f4fd1">${esc(money(last))}</text>`;
  return s + '</svg>';
}


// Month calendar: one row per week (Mon–Fri) and a week total, like a trading-platform P&L calendar.
function calendarHtml(byDay, month) {
  const [Y, M] = month.split('-').map(Number);
  const first = new Date(Date.UTC(Y, M - 1, 1)), last = new Date(Date.UTC(Y, M, 0));
  const iso = dt => dt.toISOString().slice(0, 10);
  const weekNo = dt => { const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil(((d - y0) / 86400000 + 1) / 7); };
  const start = new Date(first); start.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));   // back to Monday
  const map = Object.fromEntries(byDay.map(g => [g.date, g]));
  let rows = '';
  for (let wk = new Date(start); wk <= last; wk.setUTCDate(wk.getUTCDate() + 7)) {
    let cells = '', wsum = 0, wdays = 0;
    for (let i = 0; i < 5; i++) {
      const dt = new Date(wk); dt.setUTCDate(wk.getUTCDate() + i);
      const inMonth = dt.getUTCMonth() === M - 1, g = map[iso(dt)];
      if (g) { wsum += g.pnl; wdays++; }
      const k = !inMonth ? 'out' : g ? (g.pnl > 0 ? 'win' : g.pnl < 0 ? 'loss' : 'flat') : 'none';
      cells += `<td class="cd ${k}"><span class="dn2">${dt.getUTCDate()}</span>` + (g && inMonth
        ? `<b>${t(money(g.pnl))}</b><small>${g.n} עסקאות</small><small>${t(Math.round(100 * g.w / g.n) + '%')}</small>` : '') + '</td>';
    }
    rows += `<tr><td class="wk"><small>שבוע ${weekNo(wk)}</small><b class="${cls(wsum)}">${t(money(wsum))}</b><span class="dd">${wdays} ימים</span></td>${cells}</tr>`;
  }
  return `<table class="cal"><tr><th></th><th>שני</th><th>שלישי</th><th>רביעי</th><th>חמישי</th><th>שישי</th></tr>${rows}</table>`;
}

module.exports = function journalHtml(d) {
  const tr = [...d.trades].sort((a, b) => (a.date + a.time_in).localeCompare(b.date + b.time_in));
  const wins = tr.filter(x => x.pnl > 0), losses = tr.filter(x => x.pnl < 0);
  const total = tr.reduce((s, x) => s + x.pnl, 0);
  const gw = wins.reduce((s, x) => s + x.pnl, 0), gl = -losses.reduce((s, x) => s + x.pnl, 0);
  const byDay = []; tr.forEach(x => { let g = byDay.find(b => b.date === x.date); if (!g) byDay.push(g = { date: x.date, pnl: 0, n: 0, w: 0 }); g.pnl += x.pnl; g.n++; if (x.pnl > 0) g.w++; });
  const best = byDay.reduce((a, b) => (b.pnl > a.pnl ? b : a), byDay[0] || { pnl: 0, date: '' });
  const worst = byDay.reduce((a, b) => (b.pnl < a.pnl ? b : a), byDay[0] || { pnl: 0, date: '' });
  const combos = {}; tr.forEach(x => { const k = x.contract + ' ' + x.side; const c = combos[k] || (combos[k] = { k, contract: x.contract, side: x.side, pnl: 0, n: 0, w: 0 }); c.pnl += x.pnl; c.n++; if (x.pnl > 0) c.w++; });
  const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '–');

  const tiles = [
    ['סה"כ רווח/הפסד', money(total), cls(total)], ['עסקאות', tr.length, ''], ['אחוז הצלחה', pct(wins.length, tr.length), ''],
    ['רווח ממוצע', wins.length ? money(gw / wins.length) : '–', 'up'], ['הפסד ממוצע', losses.length ? money(-gl / losses.length) : '–', 'dn'],
    ['יחס רווח/הפסד', gl ? (gw / gl).toFixed(2) : '–', ''], ['היום הטוב', best.date ? `${money(best.pnl)} · ${dmy(best.date)}` : '–', 'up'],
    ['היום החלש', worst.date ? `${money(worst.pnl)} · ${dmy(worst.date)}` : '–', 'dn'],
  ].map(([k, v, c]) => `<div class="tile"><b>${esc(k)}</b><span class="v ${c}">${t(String(v))}</span></div>`).join('');

  let cum = 0;
  const dayRows = byDay.map(g => { cum += g.pnl; return `<tr><td>${t(dayName(g.date) + ' ' + dmy(g.date))}</td><td>${g.n}</td><td>${t(pct(g.w, g.n))}</td><td class="${cls(g.pnl)}">${t(money(g.pnl))}</td><td class="${cls(cum)}">${t(money(cum))}</td></tr>`; }).join('');
  const comboRows = Object.values(combos).sort((a, b) => b.pnl - a.pnl).map(c => `<tr><td><span class="pill ${c.contract.includes('NQ') ? 'nq' : 'es'}">${c.contract}</span></td><td><span class="side ${c.side === 'Long' ? 'long' : 'short'}">${c.side === 'Long' ? '▲ לונג' : '▼ שורט'}</span></td><td>${c.n}</td><td>${t(pct(c.w, c.n))}</td><td class="${cls(c.pnl)}">${t(money(c.pnl))}</td><td class="${cls(c.pnl)}">${t(money(c.pnl / c.n))}</td></tr>`).join('');

  let tradeRows = '';
  byDay.forEach(g => {
    tradeRows += `<tr class="dayhead"><td colspan="9">${t(dayName(g.date) + ' ' + dmy(g.date))} · ${g.n} עסקאות · <span class="${cls(g.pnl)}">${t(money(g.pnl))}</span></td></tr>`;
    tr.filter(x => x.date === g.date).forEach(x => {
      tradeRows += `<tr><td>${t(x.time_in + '–' + x.time_out)}</td><td><span class="pill ${x.contract.includes('NQ') ? 'nq' : 'es'}">${x.contract}</span></td>` +
        `<td><span class="side ${x.side === 'Long' ? 'long' : 'short'}">${x.side === 'Long' ? '▲ לונג' : '▼ שורט'}</span></td><td>${x.qty}</td>` +
        `<td>${t(num(x.entry))}</td><td>${t(num(x.exit))}</td><td class="${cls(x.points)}">${t((x.points > 0 ? '+' : '') + num(x.points))}</td>` +
        `<td class="${cls(x.pnl)} pnl">${t(money(x.pnl))}</td><td class="note">${t(x.note || '')}</td></tr>`;
    });
  });

  const monthKey = tr.length ? tr[tr.length - 1].date.slice(0, 7) : new Date().toISOString().slice(0, 7);
  const tips = (d.tips || []).length ? `<section class="tips"><h2>🎯 הדגשים למחר</h2><ul>${d.tips.map(x => `<li>${t(x)}</li>`).join('')}</ul></section>` : '';

  return `<title>${esc('יומן עסקאות ' + (d.month || ''))}</title>
<style>
:root{--bg:#f3f5f8;--surface:#fff;--ink:#131a26;--muted:#5a6476;--line:#dde2ea;--navy:#16233f;--bull:#0f7a4a;--bear:#c2362b;
--es:#1f4fd1;--es-bg:#eaf0fe;--nq:#0b7a75;--nq-bg:#e4f5f3;--f:"Heebo","Segoe UI",Arial,sans-serif}
body{background:var(--bg);color:var(--ink);font-family:var(--f);font-size:15px;line-height:1.45;margin:0}
.wrap{max-width:780px;margin:0 auto;display:grid;gap:10px}
header{background:var(--navy);color:#fff;border-radius:12px;padding:10px 18px}
header .sub{font-size:14px;color:#b9c6e4} h1{font-size:28px;margin:0}
section{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 14px}
h2{font-size:18px;margin:0 0 6px}
bdi.n{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;white-space:nowrap}
.up{color:var(--bull);font-weight:700}.dn{color:var(--bear);font-weight:700}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tile{border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:#fff}
.tile b{display:block;font-size:12.5px;color:var(--muted);font-weight:500}.tile .v{font-size:19px;font-weight:700}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#f3f3f3;font-weight:700;text-align:right;padding:5px 6px;font-size:12px;color:var(--muted)}
td{padding:4px 6px;border-bottom:1px solid var(--line);vertical-align:top}
tr{break-inside:avoid}
.dayhead td{background:#eef1f6;font-weight:700;border-bottom:none;padding-top:6px}
.pill{font-size:11.5px;font-weight:800;color:#fff;border-radius:5px;padding:1px 6px}.pill.es{background:var(--es)}.pill.nq{background:var(--nq)}
.side{font-weight:700;font-size:12.5px;white-space:nowrap}.side.long{color:var(--bull)}.side.short{color:var(--bear)}
.pnl{font-size:13.5px}.note{color:var(--muted);font-size:12px;max-width:190px}
.tips{border-right:6px solid #6a3fc4}.tips h2{color:#6a3fc4}.tips ul{margin:0;padding-inline-start:20px}
.calwrap{break-inside:avoid}
.cal{table-layout:fixed;border-collapse:separate;border-spacing:5px}
.cal th{background:none;text-align:center;font-size:12.5px}
.cal td{border:none;border-radius:8px;height:68px;text-align:center;vertical-align:middle;padding:4px;position:relative}
.cal .cd{background:#e9ecf2;color:#131a26}.cal .cd.out{background:#f6f7f9}
.cal .cd.win{background:#12a150;color:#fff}.cal .cd.loss{background:#d93545;color:#fff}.cal .cd.flat{background:#9aa4b5;color:#fff}
.cal .cd b{display:block;font-size:15px}.cal .cd small{display:block;font-size:11px;opacity:.92}
.cal .dn2{position:absolute;top:3px;left:6px;font-size:11px;opacity:.75}
.cal .wk{background:#16233f;color:#fff;width:92px}.cal .wk small{display:block;font-size:11px;color:#b9c6e4}
.cal .wk b{display:block;font-size:15px}.cal .wk b.up{color:#5fd68f}.cal .wk b.dn{color:#ff8a80}
.cal .wk .dd{display:inline-block;margin-top:2px;font-size:10.5px;border:1px solid #5fd68f;border-radius:4px;padding:0 5px;color:#5fd68f}
.foot{font-size:12px;color:var(--muted);text-align:center}
</style>
<div class="wrap" dir="rtl" lang="he">
<header><div class="sub">${t('עודכן ' + (d.updated || ''))} · ${t('MES / MNQ')} · חשבון דמו</div><h1>${esc('יומן עסקאות · ' + (d.month || ''))}</h1></header>
<section><div class="tiles">${tiles}</div></section>
<section><h2>📈 רווח מצטבר ורווח יומי</h2>${equitySvg(byDay)}</section>
<div class="two">
<section><h2>לפי יום</h2><table><tr><th>יום</th><th>עסקאות</th><th>הצלחה</th><th>רווח/הפסד</th><th>מצטבר</th></tr>${dayRows}</table></section>
<section><h2>לפי חוזה וכיוון</h2><table><tr><th>חוזה</th><th>כיוון</th><th>עסקאות</th><th>הצלחה</th><th>סה"כ</th><th>ממוצע</th></tr>${comboRows}</table></section>
</div>
${tips}
<section><h2>כל העסקאות</h2><table><tr><th>שעות</th><th>חוזה</th><th>כיוון</th><th>חוזים</th><th>כניסה</th><th>יציאה</th><th>נקודות</th><th>רווח/הפסד</th><th>הערה</th></tr>${tradeRows}</table></section>
<section class="calwrap"><h2>🗓️ לוח חודשי</h2>${calendarHtml(byDay, monthKey)}</section>
<div class="foot">חשבון דמו. שעון ישראל. לא ייעוץ השקעות.</div>
</div>`;
};
