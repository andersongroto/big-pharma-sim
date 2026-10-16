// Criação de moléculas (ativos) com atributos ocultos: eficácia real, toxicidade e efeitos adversos.
import { DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { TARGET_BY_ID as TGT } from '../data/targets.js';
import { MODALITIES } from '../data/modalities.js';
import { SIDE_EFFECTS as SE, MILD_POOL, SERIOUS_POOL, SEVERE_POOL } from '../data/sideEffects.js';
import { brandName } from '../data/names.js';
import { clamp, rand, randRange, randInt, chance, pick, gauss, uid } from './util.js';
import { suggestedPrice, marketingScale } from './model.js';

function freqFor(state, severity, tox) {
  switch (severity) {
    case 0: return randRange(state, 0.03, 0.1);
    case 1: return randRange(state, 0.02, 0.16);
    case 2: return randRange(state, 0.01, 0.05) * (0.6 + tox);
    case 3: return randRange(state, 0.002, 0.02) * (0.5 + tox);
    default: return randRange(state, 0.00003, 0.0004) * (0.6 + tox);
  }
}

function genSideEffects(state, target, modality, tox) {
  const ses = [];
  const has = (id) => ses.some((s) => s.id === id);
  const add = (id) => {
    if (has(id)) return;
    const sev = SE[id].severity;
    ses.push({
      id, freq: freqFor(state, sev, tox), revealed: false, revealedAt: null,
      threshold: sev >= 4 ? randRange(state, 3, 10) : randRange(state, 5, 15),
    });
  };
  const mild = [...MILD_POOL];
  if (MODALITIES[modality].injectable) mild.push('reacao_injecao');
  const nMild = randInt(state, 2, 4);
  for (let i = 0; i < nMild; i++) add(pick(state, mild));
  for (const r of target.risks) {
    const sev = SE[r].severity;
    if (chance(state, sev <= 1 ? 0.75 : 0.35 + tox * 0.5)) add(r);
  }
  if (chance(state, tox * 0.8)) add(pick(state, SERIOUS_POOL));
  if (chance(state, 0.25 + tox * 0.45)) {
    const severeRisk = target.risks.filter((r) => SE[r].severity >= 4);
    add(severeRisk.length && chance(state, 0.6) ? pick(state, severeRisk) : pick(state, SEVERE_POOL));
  }
  for (const [seId, disease] of Object.entries(target.beneficial)) {
    if (target.hidden.includes(disease) && chance(state, 0.75)) add(seId);
  }
  return ses;
}

export function makeCode(state, prefix) {
  let code;
  do code = `${prefix}-${randInt(state, 1000, 9899)}`;
  while (state.assets.some((a) => a.code === code));
  return code;
}

export function makeBrand(state) {
  let name;
  let tries = 0;
  do {
    name = brandName(() => rand(state));
    tries++;
  } while (tries < 20 && (state.assets.some((a) => a.brand === name) || state.compDrugs.some((c) => c.name === name)));
  return name;
}

// Cria uma molécula para um alvo, descoberta a partir de uma doença de origem.
export function createAsset(state, { targetId, diseaseId, qualityBonus = 0, prefix, owner = 'player' }) {
  const target = TGT[targetId];
  const mod = MODALITIES[target.modality];
  const q = clamp(Math.pow(rand(state), 0.85) + qualityBonus, 0, 1);
  const tox = clamp(Math.pow(rand(state), 1.2) * target.toxRisk * 1.6 * state.diff.toxMult, 0, 1);
  const eff = {};
  const apparent = {};
  const p3f = {};
  for (const [d, fit] of Object.entries(target.fits)) {
    const D = DIS[d];
    const base = clamp(fit * (0.45 + 0.55 * q) * (1 - 0.35 * D.difficulty) * randRange(state, 0.8, 1.15), 0.02, 0.97);
    // Mecanismos pouco validados costumam não se traduzir em benefício clínico (falha de prova de conceito).
    const validation = Math.pow(target.validation, 1.8) * state.diff.validationMult * (target.hidden.includes(d) ? 0.85 : 1);
    apparent[d] = base;
    eff[d] = chance(state, validation) ? base : base * randRange(state, 0.05, 0.35);
    // Desfecho substituto da Fase II nem sempre prevê o desfecho clínico da Fase III.
    p3f[d] = chance(state, 0.2 + 0.3 * (1 - target.validation)) ? randRange(state, 0.05, 0.5) : randRange(state, 0.85, 1.02);
  }
  const asset = {
    id: uid(state, 'a'),
    code: makeCode(state, prefix || state.company.prefix),
    brand: null,
    owner,
    targetId,
    modality: target.modality,
    originDisease: diseaseId,
    origin: 'interno',
    created: state.month,
    q, tox, eff, apparent, p3f,
    ses: genSideEffects(state, target, target.modality, tox),
    cogs: Math.max(mod.cogsMin, mod.cogsRate * DIS[diseaseId].refPrice) * randRange(state, 0.8, 1.25),
    conv: clamp(mod.conv + randRange(state, -0.08, 0.08), 0.2, 0.98),
    stage: 'lead',
    trial: null,
    toxEst: null,
    prior: {},
    clinicalStart: null,
    inds: {},
    patents: [],
    patentBlocked: false,
    markets: {},
    boxed: false,
    flags: { offLabel: false, pap: false, cmo: true, dtc: false, rems: false, formulation: null, pediatric: null, screen: null, recalledUntil: null, withdrawn: false, ira: false, pandemic: false },
    exposurePY: 0,
    harm: 0,
    revHist: [],
    lifetimeRevenue: 0,
    peakAnnual: 0,
  };
  return asset;
}

export function newIndication(state, diseaseId) {
  return {
    diseaseId, status: 'planejada', trial: null, results: {}, addedAt: state.month,
    desig: { fastTrack: false, breakthrough: false, orphan: false }, accelerated: false,
    confirmDeadline: null, reg: {}, localData: {}, approvedAt: null,
  };
}

// Estimativa pré-clínica: otimista e ruidosa (modelos animais não detectam falhas de mecanismo).
export function setPrior(state, asset, d, se = 0.15) {
  const base = asset.apparent[d] ?? 0.1;
  asset.prior[d] = { mean: clamp(base + gauss(state, 0, 0.08), 0.02, 0.95), se };
}

export function newProductMarket(state, asset, m) {
  return {
    price: suggestedPrice(state, asset, m),
    marketing: Math.round(marketingScale(state, asset, m) * 6) / 10,
    awareness: 0.03, launched: null, share: {}, access: {}, patients: {}, offShare: {},
    rev: 0, units: 0, genericSince: null, compulsorySince: null, authGeneric: false,
    priceAtLoss: null, ira: 1, licensed: null, lastPriceChange: state.month, launchPrice: null,
  };
}

export function fileCompositionPatent(state, asset, filedMonth = state.month) {
  asset.patents.push({
    id: uid(state, 'p'), kind: 'composto', filed: filedMonth, ext: 0,
    strength: randRange(state, 0.7, 0.95), status: 'ativa', diseaseId: null,
  });
}
