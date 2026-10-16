// Formatação de números, datas e HTML.
import { dateLabel } from '../engine/util.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const nf = (d) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const NF0 = nf(0);
const NF1 = nf(1);
const NF2 = nf(2);

// Valores em US$ milhões.
export function money(v, { sign = false } = {}) {
  if (!Number.isFinite(v)) return '—';
  const s = sign && v > 0 ? '+' : v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1000) return `${s}US$ ${(a >= 100000 ? NF0 : NF1).format(a / 1000)} bi`;
  if (a >= 100) return `${s}US$ ${NF0.format(a)} mi`;
  if (a >= 1) return `${s}US$ ${NF1.format(a)} mi`;
  if (a === 0) return 'US$ 0';
  return `${s}US$ ${NF0.format(a * 1000)} mil`;
}

// Preços unitários em US$.
export function usd(v) {
  if (!Number.isFinite(v)) return '—';
  return `US$ ${v >= 100 ? NF0.format(v) : NF2.format(v)}`;
}

export function num(v, d = 0) {
  if (!Number.isFinite(v)) return '—';
  return (d === 0 ? NF0 : d === 1 ? NF1 : NF2).format(v);
}

export function compact(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${NF1.format(v / 1e9)} bi`;
  if (a >= 1e6) return `${NF1.format(v / 1e6)} mi`;
  if (a >= 1e3) return `${NF1.format(v / 1e3)} mil`;
  return NF0.format(v);
}

export const pct = (v, d = 0) => (Number.isFinite(v) ? `${(d ? nf(d) : NF0).format(v * 100)}%` : '—');
export const date = (m) => dateLabel(m);

export function months(n) {
  if (n <= 0) return 'agora';
  if (n < 12) return `${n} ${n === 1 ? 'mês' : 'meses'}`;
  const y = Math.floor(n / 12);
  const r = n % 12;
  return r ? `${y}a ${r}m` : `${y} ${y === 1 ? 'ano' : 'anos'}`;
}

export function untilLabel(state, m) {
  if (!Number.isFinite(m)) return '—';
  return `${date(m)} (${m <= state.month ? 'vencida' : `em ${months(m - state.month)}`})`;
}
