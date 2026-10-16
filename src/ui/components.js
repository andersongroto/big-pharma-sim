// Componentes visuais reutilizáveis (geram HTML).
import { esc, num, pct, money } from './format.js';

export const PIPE_STEPS = ['Descoberta', 'Pré-clínico', 'Fase I', 'Fase II', 'Fase III', 'Registro', 'Mercado'];

// Barra em forma de cápsula com as etapas do desenvolvimento.
// done: etapas concluídas; active: etapa em andamento (-1 se nenhuma); state: ok | fail
export function capsule(done, active = -1, status = 'ok') {
  const segs = PIPE_STEPS.map((label, i) => {
    let cls = 'seg';
    if (i < done) cls += ' done';
    if (i === active) cls += ' active';
    if (status === 'fail' && i === Math.max(done, active)) cls += ' failed';
    return `<span class="${cls}" title="${label}"></span>`;
  }).join('');
  const label = status === 'fail' ? 'Interrompido' : active >= 0 ? PIPE_STEPS[active] : PIPE_STEPS[Math.max(0, done - 1)];
  return `<span class="capsule" role="img" aria-label="Etapa: ${label}">${segs}</span>`;
}

export function chip(text, tone = '') {
  return `<span class="chip ${tone}">${esc(text)}</span>`;
}

export function meter(value, { tone = '', label = '' } = {}) {
  const v = Math.max(0, Math.min(1, value || 0));
  return `<span class="meter ${tone}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}" ${label ? `aria-label="${esc(label)}"` : ''}><span style="width:${(v * 100).toFixed(1)}%"></span></span>`;
}

export function stat(label, value, sub = '', tone = '') {
  return `<div class="stat ${tone}"><div class="stat-label">${esc(label)}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
}

export function btn(label, act, data = {}, { kind = '', disabled = false, title = '' } = {}) {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button type="button" class="btn ${kind}" data-act="${act}" ${attrs} ${disabled ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${label}</button>`;
}

export function empty(text) {
  return `<div class="empty">${text}</div>`;
}

export function section(title, body, { actions = '', sub = '', id = '' } = {}) {
  return `<section class="panel" ${id ? `id="${id}"` : ''}>
    <header class="panel-head"><div><h2>${title}</h2>${sub ? `<p class="panel-sub">${sub}</p>` : ''}</div>${actions ? `<div class="panel-actions">${actions}</div>` : ''}</header>
    <div class="panel-body">${body}</div>
  </section>`;
}

export function table(headers, rows, { cls = '' } = {}) {
  if (!rows.length) return '';
  const th = headers.map((h) => (typeof h === 'string' ? `<th>${h}</th>` : `<th class="${h.cls || ''}">${h.label}</th>`)).join('');
  return `<div class="table-wrap"><table class="${cls}"><thead><tr>${th}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

// Gráfico de linhas/áreas em SVG com escala única e rótulos.
export function lineChart(series, { height = 160, format = money, zero = true } = {}) {
  const width = 640;
  const pad = { l: 64, r: 12, t: 10, b: 22 };
  const all = series.flatMap((s) => s.values.filter(Number.isFinite));
  const n = Math.max(...series.map((s) => s.values.length));
  if (!all.length || n < 2) return `<div class="chart-empty">Os gráficos aparecem após alguns meses de operação.</div>`;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (zero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  if (hi === lo) hi = lo + 1;
  const span = hi - lo;
  hi += span * 0.06;
  if (lo < 0) lo -= span * 0.06;
  const x = (i) => pad.l + (i / (n - 1)) * (width - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const ticks = [lo, lo + (hi - lo) / 2, hi].map((v) => ({ v, y: y(v) }));
  const grid = ticks.map((t) => `<line x1="${pad.l}" x2="${width - pad.r}" y1="${t.y.toFixed(1)}" y2="${t.y.toFixed(1)}" class="grid"/><text x="${pad.l - 8}" y="${(t.y + 4).toFixed(1)}" class="axis" text-anchor="end">${esc(format(t.v))}</text>`).join('');
  const zeroLine = lo < 0 && hi > 0 ? `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="zero"/>` : '';
  const paths = series.map((s, si) => {
    const pts = s.values.map((v, i) => (Number.isFinite(v) ? [x(i), y(v)] : null)).filter(Boolean);
    if (!pts.length) return '';
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const base = y(Math.max(lo, 0));
    const area = s.area ? `<path d="${d}L${pts[pts.length - 1][0].toFixed(1)},${base.toFixed(1)}L${pts[0][0].toFixed(1)},${base.toFixed(1)}Z" class="area s${si}"/>` : '';
    const last = pts[pts.length - 1];
    return `${area}<path d="${d}" class="line s${si}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" class="dot s${si}"/>`;
  }).join('');
  const legend = series.length > 1 ? `<div class="legend">${series.map((s, si) => `<span><i class="sw s${si}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<div class="chart">${legend}<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))}">${grid}${zeroLine}${paths}</svg></div>`;
}

export function sparkline(values, { width = 120, height = 28 } = {}) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return '';
  const lo = Math.min(0, ...v);
  const hi = Math.max(...v, lo + 1e-9);
  const pts = v.map((val, i) => `${((i / (v.length - 1)) * width).toFixed(1)},${(height - 2 - ((val - lo) / (hi - lo)) * (height - 4)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><polyline points="${pts.join(' ')}"/></svg>`;
}

export function effBar(est, soc, placebo) {
  if (!est) return '<span class="muted">sem dados</span>';
  const lo = Math.max(0, est.mean - 1.96 * est.se);
  const hi = Math.min(1, est.mean + 1.96 * est.se);
  return `<span class="effbar" title="Estimativa ${pct(est.mean)} (IC 95%: ${pct(lo)}–${pct(hi)}). Tratamento padrão ${pct(soc)}, placebo ${pct(placebo)}.">
    <span class="ci" style="left:${lo * 100}%;width:${(hi - lo) * 100}%"></span>
    <span class="pt" style="left:${est.mean * 100}%"></span>
    <span class="soc" style="left:${soc * 100}%"></span>
    <span class="plc" style="left:${placebo * 100}%"></span>
  </span> <span class="mono">${pct(est.mean)} <span class="muted">±${num(est.se * 196, 0)}</span></span>`;
}
