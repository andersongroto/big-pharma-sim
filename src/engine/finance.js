// Finanças: custos fixos, impostos, crédito, avaliação de mercado e histórico.
import { MARKET_BY_ID as MKT } from '../data/markets.js';
import { PROD_TYPES } from '../data/modalities.js';
import { exclusivity, indicationPoS, peakSales, trialPlan } from './model.js';
import { clamp, sum, gauss, book, news, PNL_KEYS, emptyLedger } from './util.js';

const annuity = (n, r = 0.09) => (n <= 0 ? 0 : (1 - Math.pow(1 + r, -n)) / r);

const YEARS_TO_MARKET = { lead: 9, preclinico: 8, pre_ok: 7.5, fase1: 7 };
const IND_YEARS = { planejada: 6, fase2: 5, fase2_ok: 4.5, fase3: 3, registro: 1 };

export function yearsToMarket(a, ind) {
  if (YEARS_TO_MARKET[a.stage]) return YEARS_TO_MARKET[a.stage];
  if (!ind) return 6;
  if (ind.status === 'fase2' || ind.status === 'fase3') {
    const left = (ind.trial?.monthsLeft ?? 0) / 12;
    return left + (ind.status === 'fase2' ? 4 : 1);
  }
  return IND_YEARS[ind.status] ?? 6;
}

export function productValue(state, a) {
  const annual = (sum(a.revHist.slice(-3)) / Math.max(1, Math.min(3, a.revHist.length))) * 12;
  if (annual <= 0) return 0;
  let wsum = 0;
  let ysum = 0;
  for (const [m, pm] of Object.entries(a.markets)) {
    if (pm.launched == null) continue;
    const w = pm.rev + 0.01;
    const ex = exclusivity(state, a, m);
    const years = pm.genericSince != null ? 0 : clamp((ex.end - state.month) / 12, 0, 15);
    wsum += w;
    ysum += w * years;
  }
  const years = wsum ? ysum / wsum : 0;
  return annual * 0.45 * (annuity(years) + (0.35 * annuity(5)) / Math.pow(1.09, years));
}

// Valor presente ajustado ao risco (rNPV) de um ativo, em US$ mi.
export function assetValue(state, a) {
  if (['falhou', 'abandonado', 'vendido'].includes(a.stage)) return 0;
  let v = a.owner === 'player' ? productValue(state, a) : 0;
  const inds = Object.values(a.inds);
  const candidates = inds.length ? inds : [null];
  for (const ind of candidates) {
    if (ind && ['falhou', 'abandonada'].includes(ind.status)) continue;
    if (ind && Object.values(ind.reg).some((r) => r.status === 'aprovado')) continue;
    const d = ind ? ind.diseaseId : a.originDisease;
    const pos = ind ? indicationPoS(state, a, ind) : indicationPoS(state, a, { status: 'planejada', results: {}, reg: {} });
    const peak = peakSales(state, a, d);
    const yrs = yearsToMarket(a, ind);
    const remainingCost = ind?.status === 'registro' ? 5 : trialPlan(state, a, d, 'fase3', { regions: ['US', 'EU'] }).cost * (ind?.status === 'fase3' ? 0.3 : 1);
    v += (pos * peak * 2.2 - remainingCost * Math.min(1, pos * 2)) / Math.pow(1.1, yrs);
  }
  return Math.max(0, v);
}

export function trailing(state, key, months = 12) {
  return sum(state.history.slice(-months), (h) => h[key] || 0);
}

export function ebitda12(state) {
  return trailing(state, 'ebitda');
}

export function interestRate(state) {
  const e = Math.max(1, ebitda12(state));
  const lev = clamp(state.debt / e, 0, 5);
  return 0.05 + 0.03 * (lev / 5) + (state.month < state.crisisUntil ? 0.02 : 0) + (state.scenario === 'startup' && e < 50 ? 0.02 : 0);
}

export function creditLimit(state) {
  return Math.round(Math.max(150, 2.5 * Math.max(0, ebitda12(state))) + 0.1 * Math.max(0, state.marketCap));
}

export function updateValuation(state, initial = false) {
  let products = 0;
  let pipeline = 0;
  for (const a of state.assets) {
    if (a.owner !== 'player') continue;
    const pv = productValue(state, a);
    const v = assetValue(state, a);
    products += pv;
    pipeline += v - pv;
  }
  const factories = sum(state.factories.filter((f) => f.readyAt <= state.month), (f) => PROD_TYPES[f.type].build * 0.5);
  const royalties = sum(state.deals.filter((d) => d.success && state.month < d.endAt), (d) => d.peak * d.royalty * 3);
  const ev = products + pipeline + state.cash - state.debt + factories + state.prvs * 100 + royalties;
  if (!initial) {
    const crisis = state.month < state.crisisUntil ? 0.8 : 1;
    state.sentiment += (crisis - state.sentiment) * 0.06 + gauss(state, 0, 0.025);
    state.sentiment = clamp(state.sentiment, 0.65, 1.35);
  }
  state.valuation = { products, pipeline, factories, cash: state.cash, debt: state.debt };
  state.marketCap = Math.max(30, ev * state.sentiment * (0.9 + (0.2 * state.reputation) / 100));
  state.sharePrice = state.marketCap / state.shares;
}

export function financeTick(state) {
  const c = state.diff.costMult;
  book(state, 'pd', -state.labs * 1.2 * c);
  for (const [m, p] of Object.entries(state.presence)) {
    if (p.type === 'subsidiaria') book(state, 'sga', -MKT[m].subsidiary.monthly);
  }
  for (const f of state.factories) {
    if (f.readyAt <= state.month) book(state, 'producao', -PROD_TYPES[f.type].opex * (f.capacity / PROD_TYPES[f.type].capacity));
  }
  const prevRev = state.history.length ? state.history[state.history.length - 1].revenue : 0;
  book(state, 'sga', -(1 + 0.08 * prevRev + (state.scenario === 'big' ? 20 : state.scenario === 'media' ? 5 : 0)));
  if (state.debt > 0) book(state, 'juros', -(state.debt * interestRate(state)) / 12);

  const L = state.ledger;
  const pbt = sum(PNL_KEYS.filter((k) => k !== 'impostos'), (k) => L[k] || 0);
  if (pbt > 0) {
    const taxable = Math.max(0, pbt - state.taxLoss);
    state.taxLoss = Math.max(0, state.taxLoss - pbt);
    const tax = taxable * state.taxRate;
    const credit = Math.min(state.orphanCredit, tax);
    state.orphanCredit -= credit;
    if (tax - credit > 0) book(state, 'impostos', -(tax - credit));
  } else {
    state.taxLoss += -pbt;
  }

  // crédito automático e insolvência
  if (state.cash < 0) {
    const room = creditLimit(state) - state.debt;
    const draw = Math.min(Math.max(0, room), -state.cash + 25);
    if (draw > 0) {
      state.debt += draw;
      state.cash += draw;
      state.ledger.financiamento += draw;
      news(state, `Caixa negativo: saque automático de US$ ${draw.toFixed(0)} mi da linha de crédito.`, 'alerta', { tab: 'financas' });
    }
  }
  if (state.cash < 0) {
    state.insolventMonths += 1;
    news(state, `Insolvência: a empresa não consegue pagar suas contas (${state.insolventMonths}/3). Levante capital, venda ativos ou corte custos.`, 'ruim', { tab: 'financas' });
    if (state.insolventMonths >= 3) state.gameOver = { reason: 'falencia', month: state.month };
  } else {
    state.insolventMonths = 0;
  }

  const revenue = L.receita;
  const income = revenue + L.royalties + L.outras;
  const profit = sum(PNL_KEYS, (k) => L[k] || 0);
  const ebitda = profit - L.juros - L.impostos;
  updateValuation(state);
  state.history.push({
    month: state.month, revenue, income, profit, ebitda, cash: state.cash, debt: state.debt,
    marketCap: state.marketCap, sharePrice: state.sharePrice, reputation: state.reputation,
    rd: -L.pd, marketing: -L.marketing, ledger: { ...L },
  });
  if (state.history.length > 600) state.history.shift();
  state.stats.rev12 = trailing(state, 'revenue');
  state.stats.profit12 = trailing(state, 'profit');
  state.stats.peakRev12 = Math.max(state.stats.peakRev12, state.stats.rev12);
  state.ledger = emptyLedger();
}
