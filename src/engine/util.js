// Utilitários do motor: matemática, RNG determinístico (guardado no próprio estado) e registros.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
export const avg = (arr, f = (x) => x) => (arr.length ? sum(arr, f) / arr.length : 0);
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// mulberry32 com o estado salvo em state.rng, para que salvar/carregar preserve a sequência.
export function rand(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randRange = (s, a, b) => a + (b - a) * rand(s);
export const randInt = (s, a, b) => Math.floor(randRange(s, a, b + 1));
export const chance = (s, p) => rand(s) < p;
export const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];

export function gauss(s, mean = 0, sd = 1) {
  let u = 0;
  while (u === 0) u = rand(s);
  const v = rand(s);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function weightedPick(s, items, weight) {
  const total = sum(items, weight);
  if (total <= 0) return null;
  let r = rand(s) * total;
  for (const it of items) {
    r -= weight(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// Função de distribuição acumulada da normal padrão (aproximação de Abramowitz-Stegun).
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const dd = 0.3989423 * Math.exp((-z * z) / 2);
  const p = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function uid(state, prefix) {
  state.nextId = (state.nextId || 0) + 1;
  return `${prefix}${state.nextId}`;
}

export const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const START_YEAR = 2027;

export function dateLabel(month) {
  const y = START_YEAR + Math.floor(month / 12);
  return `${MONTHS[((month % 12) + 12) % 12]}/${y}`;
}

export function yearOf(month) {
  return START_YEAR + Math.floor(month / 12);
}

// Registra uma notícia. kind: info | bom | ruim | alerta | concorrencia
export function news(state, text, kind = 'info', ref = null) {
  const item = { month: state.month, text, kind, ref };
  state.news.unshift(item);
  if (state.news.length > 400) state.news.length = 400;
  state.monthNews.push(item);
}

// Lançamento contábil: altera o caixa imediatamente e acumula no razão do mês.
export const PNL_KEYS = ['receita', 'royalties', 'outras', 'cogs', 'pd', 'marketing', 'sga', 'producao', 'juridico', 'multas', 'juros', 'impostos'];
export function book(state, key, amount) {
  if (!Number.isFinite(amount)) throw new Error(`Lançamento inválido em ${key}: ${amount}`);
  state.cash += amount;
  state.ledger[key] = (state.ledger[key] || 0) + amount;
}

export function emptyLedger() {
  const l = {};
  for (const k of [...PNL_KEYS, 'capex', 'financiamento']) l[k] = 0;
  return l;
}

export function addTimer(state, at, type, params = {}) {
  state.timers.push({ at, type, params });
}

// Enfileira uma decisão para o jogador. O texto é montado na hora de exibir (ver events.js).
export function queueEvent(state, type, params = {}) {
  const id = uid(state, 'ev');
  state.events.push({ id, type, params, month: state.month });
  return id;
}
