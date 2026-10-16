// Criação de um novo jogo a partir de um cenário inicial.
import { DISEASES, DISEASE_BY_ID as DIS, AREAS } from '../data/diseases.js';
import { MARKET_IDS } from '../data/markets.js';
import { TARGET_BY_ID as TGT } from '../data/targets.js';
import { PROD_TYPES } from '../data/modalities.js';
import { createAsset, newIndication, setPrior, fileCompositionPatent, newProductMarket, makeBrand } from './assets.js';
import { trialPlan, targetsFor, marketingScale, SE_TRIAL_K } from './model.js';
import { revealFit } from './knowledge.js';
import { SIDE_EFFECTS as SE } from '../data/sideEffects.js';
import { seedCompetitors, refreshOffers } from './competitors.js';
import { initShares } from './market.js';
import { updateValuation } from './finance.js';
import { clamp, gauss, randRange, randInt, pick, uid, emptyLedger, news } from './util.js';

export const DIFFICULTIES = {
  facil: { label: 'Fácil', costMult: 0.85, toxMult: 0.8, validationMult: 1.1, compRate: 0.7, eventMult: 0.7 },
  normal: { label: 'Normal', costMult: 1, toxMult: 1, validationMult: 1, compRate: 1, eventMult: 1 },
  dificil: { label: 'Difícil', costMult: 1.2, toxMult: 1.2, validationMult: 0.88, compRate: 1.35, eventMult: 1.25 },
};

export const SCENARIOS = {
  startup: {
    name: 'Startup de biotecnologia',
    blurb: 'US$ 400 mi de capital de risco, um laboratório e uma molécula promissora. Nenhum produto, nenhuma fábrica, nenhuma operação comercial.',
    cash: 400, debt: 0, shares: 50,
  },
  media: {
    name: 'Farmacêutica de médio porte',
    blurb: 'Dois produtos no mercado (um deles perde a patente em 2,5 anos), pipeline em andamento, operação nos EUA e na Europa.',
    cash: 1500, debt: 300, shares: 300,
  },
  big: {
    name: 'Big Pharma',
    blurb: 'Cinco blockbusters, presença global e um penhasco de patentes à vista: três produtos perdem exclusividade em até 5 anos.',
    cash: 6000, debt: 3000, shares: 2000,
  },
};

export function makePrefix(name) {
  const clean = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);
  let p = words.map((w) => w[0]).join('').slice(0, 3);
  if (p.length < 2) p = (words[0] || 'BPX').slice(0, 3);
  return p.padEnd(2, 'X');
}

function seedProduct(state, { targetId, diseases, launchedAgo, exclLeft, markets, quality = 0.75 }) {
  const a = createAsset(state, { targetId, diseaseId: diseases[0] });
  const t = TGT[targetId];
  a.q = quality;
  for (const [d, fit] of Object.entries(t.fits)) {
    const v = clamp(fit * (0.45 + 0.55 * quality) * (1 - 0.35 * DIS[d].difficulty), 0.02, 0.97);
    a.apparent[d] = v;
    if (diseases.includes(d)) a.eff[d] = v;
  }
  a.tox = Math.min(a.tox, 0.4);
  a.stage = 'clinico';
  a.origin = 'inicial';
  a.brand = makeBrand(state);
  const launch = -launchedAgo;
  a.created = launch - 120;
  a.clinicalStart = launch - 96;
  a.toxEst = a.tox;
  const ext = 24;
  a.patents.push({ id: uid(state, 'p'), kind: 'composto', filed: exclLeft - 240 - ext, ext, strength: randRange(state, 0.75, 0.92), status: 'ativa', diseaseId: null });
  diseases.forEach((d, i) => {
    const ind = newIndication(state, d);
    const se = SE_TRIAL_K / Math.sqrt(2400 * DIS[d].trialSize);
    const obs = clamp(a.eff[d] + gauss(state, 0, se * 0.5), 0.02, 0.97);
    ind.status = 'registro';
    ind.results.fase3 = { phase: 'fase3', obs, se, z: (obs - DIS[d].placebo) / se, success: true, verdict: 'positivo', comparator: 'placebo', n: Math.round(2400 * DIS[d].trialSize), superior: false };
    const approvedAt = launch + i * 24;
    ind.approvedAt = approvedAt;
    for (const m of markets) {
      const lag = ['CN', 'BR', 'IN'].includes(m) ? 12 : 0;
      ind.reg[m] = { status: 'aprovado', submitted: approvedAt + lag - 12, decisionAt: approvedAt + lag, approvedAt: approvedAt + lag, priority: false, boxed: false, conditional: false, bonus: 0 };
      ind.localData[m] = true;
    }
    a.inds[d] = ind;
  });
  for (const se of a.ses) {
    if (se.freq >= 0.004) {
      se.revealed = true;
      se.revealedAt = launch;
    }
  }
  a.boxed = a.ses.some((s) => s.revealed && s.freq >= 0.004 && s.id && ['infeccao', 'tromboembolismo', 'linfoma', 'pml', 'qt', 'suicidio'].includes(s.id));
  for (const m of markets) {
    const pm = newProductMarket(state, a, m);
    pm.launched = Math.min(...Object.values(a.inds).map((ind) => ind.reg[m].approvedAt));
    pm.launchPrice = pm.price;
    pm.awareness = 0.7;
    pm.marketing = Math.round(marketingScale(state, a, m) * 10) / 10;
    a.markets[m] = pm;
  }
  state.assets.push(a);
  return a;
}

function seedPipeline(state, { targetId, diseaseId, stage, indStatus, monthsLeft = 0, extraInds = [] }) {
  const a = createAsset(state, { targetId, diseaseId });
  a.created = -randInt(state, 24, 60);
  state.assets.push(a);
  if (stage === 'lead') return a;
  fileCompositionPatent(state, a, a.created + 2);
  a.toxEst = clamp(a.tox + gauss(state, 0, 0.12), 0, 1);
  a.tox = Math.min(a.tox, 0.45);
  for (const { d } of Object.entries(TGT[targetId].fits).map(([d]) => ({ d }))) {
    if (!TGT[targetId].hidden.includes(d)) setPrior(state, a, d);
  }
  if (stage === 'pre_ok') {
    a.stage = 'pre_ok';
    return a;
  }
  if (stage === 'fase1') {
    a.stage = 'fase1';
    a.clinicalStart = -6;
    const plan = trialPlan(state, a, null, 'fase1', { regions: ['US'], size: 'padrao' });
    a.trial = { phase: 'fase1', monthsLeft, months: plan.months, monthly: plan.monthly, patients: plan.patients, cost: plan.cost, cfg: { regions: ['US'], size: 'padrao' }, startedAt: -6 };
    return a;
  }
  a.stage = 'clinico';
  a.clinicalStart = -30;
  a.toxEst = clamp(a.tox + gauss(state, 0, 0.06), 0, 1);
  for (const se of a.ses) {
    if (se.freq <= 0.03) continue;
    se.revealed = true;
    const hiddenD = SE[se.id].severity === 0 ? TGT[targetId].beneficial[se.id] : null;
    if (hiddenD) revealFit(state, targetId, hiddenD, 'serendipidade');
  }
  for (const d of [diseaseId, ...extraInds]) a.inds[d] = newIndication(state, d);
  const ind = a.inds[diseaseId];
  ind.status = indStatus;
  if (indStatus === 'fase2_ok' || indStatus === 'fase3') {
    a.eff[diseaseId] = a.apparent[diseaseId];
    const se = SE_TRIAL_K / Math.sqrt(300 * DIS[diseaseId].trialSize);
    const obs = clamp(Math.max(a.eff[diseaseId] + gauss(state, 0, se), DIS[diseaseId].placebo + 2.1 * se), 0.02, 0.97);
    ind.results.fase2 = { phase: 'fase2', obs, se, z: (obs - DIS[diseaseId].placebo) / se, success: true, verdict: 'positivo', comparator: 'placebo', n: Math.round(300 * DIS[diseaseId].trialSize) };
  }
  if (indStatus === 'fase2' || indStatus === 'fase3') {
    const phase = indStatus;
    const cfg = { regions: ['US', 'EU'], size: 'padrao', comparator: 'placebo', cro: false };
    const plan = trialPlan(state, a, diseaseId, phase, cfg);
    ind.trial = { phase, monthsLeft, months: plan.months, monthly: plan.monthly, patients: plan.patients, cost: plan.cost, cfg, startedAt: monthsLeft - plan.months };
  }
  return a;
}

function makeFactory(state, type, builtAgo = 60) {
  return { id: uid(state, 'f'), type, capacity: PROD_TYPES[type].capacity, quality: randInt(state, 70, 85), readyAt: -builtAgo, haltedUntil: -1, warning: false, lastInspection: -randInt(state, 0, 18) };
}

export function newGame({ companyName = 'Vitalis Pharma', scenario = 'startup', difficulty = 'normal', focusArea = 'onco', seed } = {}) {
  const sc = SCENARIOS[scenario];
  const s0 = (seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const state = {
    version: 1,
    seed: s0,
    rng: s0,
    month: 0,
    nextId: 0,
    scenario,
    difficulty,
    diff: { ...DIFFICULTIES[difficulty] },
    company: { name: companyName, prefix: makePrefix(companyName), focusArea },
    cash: sc.cash,
    debt: sc.debt,
    shares: sc.shares,
    sentiment: 1,
    marketCap: 0,
    sharePrice: 0,
    reputation: 55,
    expertise: {},
    labs: scenario === 'startup' ? 1 : scenario === 'media' ? 2 : 4,
    labsBuilding: [],
    presence: Object.fromEntries(MARKET_IDS.map((m) => [m, { type: 'nenhuma', readyAt: null }])),
    agencies: Object.fromEntries(MARKET_IDS.map((m) => [m, 55])),
    diseases: Object.fromEntries(DISEASES.map((d) => [d.id, { soc: d.soc, mult: 1, multUntil: null }])),
    knownFits: {},
    programs: [],
    assets: [],
    compDrugs: [],
    factories: [],
    offers: [],
    offersRefreshAt: 0,
    deals: [],
    litigations: [],
    prvs: 0,
    events: [],
    timers: [],
    news: [],
    monthNews: [],
    ledger: emptyLedger(),
    history: [],
    lastEquityMonth: -99,
    taxLoss: 0,
    orphanCredit: 0,
    crisisUntil: -1,
    pandemicUntil: -1,
    taxRate: 0.21,
    ethics: { offLabelRevenue: 0, coverups: [], payForDelay: [], bribes: 0, risk: 0 },
    stats: { patientYears: 0, qaly: 0, approvals: 0, newApprovals: 0, rev12: 0, profit12: 0, peakRev12: 0, patientsNow: 0, initialRev12: 0, lostExclusivity: [] },
    achievements: {},
    gameOver: null,
    endShown: false,
    insolventMonths: 0,
    lastReport: null,
    flags: {},
    production: {},
  };

  for (const a of Object.keys(AREAS)) state.expertise[a] = scenario === 'startup' ? 8 : scenario === 'media' ? 15 : 40;

  seedCompetitors(state);

  if (scenario === 'startup') {
    state.expertise[focusArea] = 35;
    const options = DISEASES.filter((d) => d.area === focusArea).flatMap((d) => targetsFor(state, d.id).map((x) => ({ d: d.id, t: x.target.id })));
    const choice = pick(state, options);
    const a = createAsset(state, { targetId: choice.t, diseaseId: choice.d, qualityBonus: 0.1 });
    state.assets.push(a);
    const other = pick(state, options.filter((o) => o.t !== choice.t)) || choice;
    state.programs.push({ id: uid(state, 'r'), diseaseId: other.d, targetId: other.t, budget: 'medio', months: 4, started: -4 });
  } else if (scenario === 'media') {
    state.expertise.cardio = 45;
    state.expertise.imuno = 45;
    state.presence.US = { type: 'subsidiaria', readyAt: null };
    state.presence.EU = { type: 'subsidiaria', readyAt: null };
    state.presence.JP = { type: 'distribuidor', readyAt: null };
    state.presence.BR = { type: 'distribuidor', readyAt: null };
    seedProduct(state, { targetId: 'arni', diseases: ['ic'], launchedAgo: 108, exclLeft: 30, markets: ['US', 'EU', 'JP', 'BR'], quality: 0.8 });
    seedProduct(state, { targetId: 'il17', diseases: ['psoriase'], launchedAgo: 36, exclLeft: 130, markets: ['US', 'EU', 'BR'], quality: 0.7 });
    seedPipeline(state, { targetId: 'jak', diseaseId: 'ar', stage: 'clinico', indStatus: 'fase3', monthsLeft: 20 });
    seedPipeline(state, { targetId: 'aldo', diseaseId: 'has', stage: 'clinico', indStatus: 'planejada' });
    seedPipeline(state, { targetId: 'pcsk9', diseaseId: 'hipercol', stage: 'pre_ok' });
    state.factories.push(makeFactory(state, 'quimico'));
    state.programs.push({ id: uid(state, 'r'), diseaseId: 'obesidade', targetId: 'glp1', budget: 'medio', months: 6, started: -6 });
  } else {
    state.expertise.onco = 60;
    state.expertise.imuno = 60;
    for (const m of ['US', 'EU', 'JP', 'CN', 'BR']) state.presence[m] = { type: 'subsidiaria', readyAt: null };
    state.presence.IN = { type: 'distribuidor', readyAt: null };
    const all = MARKET_IDS;
    seedProduct(state, { targetId: 'jak', diseases: ['ar', 'psoriase'], launchedAgo: 120, exclLeft: 20, markets: all, quality: 0.8 });
    seedProduct(state, { targetId: 'pd1', diseases: ['melanoma', 'nsclc'], launchedAgo: 72, exclLeft: 100, markets: all, quality: 0.85 });
    seedProduct(state, { targetId: 'integrase', diseases: ['hiv'], launchedAgo: 140, exclLeft: 36, markets: all, quality: 0.8 });
    seedProduct(state, { targetId: 'glp1', diseases: ['dm2'], launchedAgo: 48, exclLeft: 140, markets: all, quality: 0.7 });
    seedProduct(state, { targetId: 'cgrp', diseases: ['enxaqueca'], launchedAgo: 84, exclLeft: 60, markets: ['US', 'EU', 'JP', 'CN', 'BR'], quality: 0.75 });
    seedPipeline(state, { targetId: 'kras', diseaseId: 'nsclc', stage: 'clinico', indStatus: 'fase3', monthsLeft: 12 });
    seedPipeline(state, { targetId: 'amiloide', diseaseId: 'alzheimer', stage: 'clinico', indStatus: 'fase2', monthsLeft: 8 });
    seedPipeline(state, { targetId: 'il4r', diseaseId: 'dermatite', stage: 'clinico', indStatus: 'fase2_ok' });
    seedPipeline(state, { targetId: 'cartbcma', diseaseId: 'mieloma', stage: 'fase1', monthsLeft: 5 });
    seedPipeline(state, { targetId: 'fviiibi', diseaseId: 'hemofilia', stage: 'pre_ok' });
    seedPipeline(state, { targetId: 'mrnaflu', diseaseId: 'influenza', stage: 'lead' });
    state.factories.push(makeFactory(state, 'quimico'), makeFactory(state, 'quimico', 120), makeFactory(state, 'biologico'));
    state.programs.push(
      { id: uid(state, 'r'), diseaseId: 'mama_her2', targetId: 'her2adc', budget: 'alto', months: 3, started: -3 },
      { id: uid(state, 'r'), diseaseId: 'psoriase', targetId: 'il17', budget: 'medio', months: 8, started: -8 },
    );
  }

  initShares(state);
  refreshOffers(state);
  updateValuation(state, true);
  state.stats.initialRev12 = estimateInitialRevenue(state);
  news(state, `${companyName} inicia suas operações. Boa sorte, CEO!`, 'info');
  state.monthNews = [];
  return state;
}

// Receita anual estimada no início do jogo (base para as metas do cenário).
function estimateInitialRevenue(state) {
  let total = 0;
  for (const a of state.assets) for (const pm of Object.values(a.markets)) total += pm.rev || 0;
  return total * 12;
}
