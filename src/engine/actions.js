// Ações do jogador. Todas validam as regras e retornam { ok, msg }.
import { DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { MARKET_BY_ID as MKT } from '../data/markets.js';
import { PROD_TYPES } from '../data/modalities.js';
import { TARGET_BY_ID as TGT } from '../data/targets.js';
import {
  BUDGETS, trialPlan, isKnownFit, socEff, approvedIn, approvedAnywhere, assetName, priceCeiling, hiddenFitsLeft,
} from './model.js';
import { newIndication, fileCompositionPatent } from './assets.js';
import { startReview, canAccelerate, launchIfPossible } from './regulatory.js';
import { creditLimit, assetValue } from './finance.js';
import { newFactory, factoryName } from './production.js';
import { resolveEvent as resolveEv } from './events.js';
import { clamp, book, chance, randRange, uid, dateLabel } from './util.js';

const ok = (msg = '') => ({ ok: true, msg });
const fail = (msg) => ({ ok: false, msg });
const money = (v) => (Math.abs(v) >= 1000 ? `US$ ${(v / 1000).toFixed(1).replace('.', ',')} bi` : `US$ ${v.toFixed(v < 10 ? 1 : 0)} mi`);

function getAsset(state, id) {
  const a = state.assets.find((x) => x.id === id);
  return a && a.owner === 'player' ? a : null;
}

function spend(state, key, amount) {
  if (state.cash < amount) return false;
  book(state, key, -amount);
  return true;
}

function spendCapex(state, amount) {
  if (state.cash < amount) return false;
  state.cash -= amount;
  state.ledger.capex -= amount;
  return true;
}

// ---------- pesquisa ----------
export const labSlots = (state) => state.labs * 2;
export const LAB_COST = 60;

export function startProgram(state, { diseaseId, targetId, budget = 'medio' }) {
  if (state.programs.length >= labSlots(state)) return fail('Todos os laboratórios estão ocupados. Construa outro laboratório.');
  if (!isKnownFit(state, targetId, diseaseId)) return fail('Não há evidência científica ligando esse alvo a essa doença.');
  if (!BUDGETS[budget]) return fail('Orçamento inválido.');
  if (state.programs.some((p) => p.targetId === targetId && p.diseaseId === diseaseId)) return fail('Já existe um programa com esse alvo e doença.');
  state.programs.push({ id: uid(state, 'r'), diseaseId, targetId, budget, months: 0, started: state.month, spent: 0 });
  return ok(`Programa de descoberta iniciado: ${TGT[targetId].name} para ${DIS[diseaseId].name.toLowerCase()}.`);
}

export function setProgramBudget(state, id, budget) {
  const p = state.programs.find((x) => x.id === id);
  if (!p || !BUDGETS[budget]) return fail('Programa não encontrado.');
  p.budget = budget;
  return ok();
}

export function cancelProgram(state, id) {
  const before = state.programs.length;
  state.programs = state.programs.filter((x) => x.id !== id);
  return before === state.programs.length ? fail('Programa não encontrado.') : ok('Programa encerrado.');
}

export function buildLab(state) {
  const cost = LAB_COST * state.diff.costMult;
  if (!spendCapex(state, cost)) return fail('Caixa insuficiente para construir um laboratório.');
  state.labsBuilding.push({ readyAt: state.month + 6 });
  return ok(`Novo laboratório em construção (pronto em ${dateLabel(state.month + 6)}).`);
}

// ---------- desenvolvimento ----------
export function filePatent(state, assetId) {
  const a = getAsset(state, assetId);
  if (!a) return fail('Ativo não encontrado.');
  if (a.patentBlocked) return fail('A molécula já não é patenteável.');
  if (a.patents.some((p) => p.kind === 'composto')) return fail('A patente de composto já foi depositada.');
  if (!spend(state, 'juridico', 1.5)) return fail('Caixa insuficiente.');
  fileCompositionPatent(state, a);
  return ok(`Patente de composto de ${a.code} depositada. Vigência até ${dateLabel(state.month + 240)}.`);
}

export function startPreclinical(state, assetId) {
  const a = getAsset(state, assetId);
  if (!a || a.stage !== 'lead') return fail('A molécula não está pronta para o pré-clínico.');
  const plan = trialPlan(state, a, null, 'preclinico');
  a.trial = { phase: 'preclinico', monthsLeft: plan.months, months: plan.months, monthly: plan.monthly, patients: 0, cost: plan.cost, cfg: {}, startedAt: state.month };
  a.stage = 'preclinico';
  return ok(`Estudos pré-clínicos de ${a.code} iniciados (${plan.months} meses, ${money(plan.cost)}).`);
}

export function startPhase1(state, assetId, cfg = {}) {
  const a = getAsset(state, assetId);
  if (!a || a.stage !== 'pre_ok') return fail('A molécula não está pronta para a Fase I.');
  const c = { regions: cfg.regions?.length ? cfg.regions : ['US'], size: cfg.size || 'padrao', cro: !!cfg.cro };
  const plan = trialPlan(state, a, null, 'fase1', c);
  let warn = '';
  if (!a.patentBlocked && !a.patents.some((p) => p.kind === 'composto')) {
    a.patentBlocked = true;
    warn = ' A molécula se tornou pública sem patente depositada e não poderá mais ser patenteada.';
  }
  a.trial = { phase: 'fase1', monthsLeft: plan.months, months: plan.months, monthly: plan.monthly, patients: plan.patients, cost: plan.cost, cfg: c, startedAt: state.month };
  a.stage = 'fase1';
  a.clinicalStart ??= state.month;
  return ok(`Fase I de ${a.code} iniciada (${plan.months} meses, ${money(plan.cost)}).${warn}`);
}

export function addIndication(state, assetId, diseaseId) {
  const a = getAsset(state, assetId);
  if (!a || a.stage !== 'clinico') return fail('Novas indicações só podem ser estudadas depois da Fase I.');
  if (a.inds[diseaseId] && !['abandonada'].includes(a.inds[diseaseId].status)) return fail('Essa indicação já está no plano de desenvolvimento.');
  if (!isKnownFit(state, a.targetId, diseaseId)) return fail('Não há evidência para essa indicação.');
  a.inds[diseaseId] = newIndication(state, diseaseId);
  return ok(`${DIS[diseaseId].name} adicionada ao plano de ${assetName(a)}. Próximo passo: Fase II.`);
}

export function startTrial(state, assetId, diseaseId, phase, cfg = {}) {
  const a = getAsset(state, assetId);
  const ind = a?.inds[diseaseId];
  if (!ind) return fail('Indicação não encontrada.');
  if (ind.trial) return fail('Já há um estudo em andamento nesta indicação.');
  if (phase === 'fase2' && ind.status !== 'planejada') return fail('A Fase II não está disponível.');
  if (phase === 'fase3' && ind.status !== 'fase2_ok') return fail('A Fase III exige a Fase II concluída.');
  const c = {
    regions: cfg.regions?.length ? cfg.regions : ['US', 'EU'],
    size: cfg.size || 'padrao',
    comparator: phase === 'fase3' ? cfg.comparator || 'placebo' : 'placebo',
    cro: !!cfg.cro,
  };
  const plan = trialPlan(state, a, diseaseId, phase, c);
  if (state.cash < plan.monthly * 2) return fail('Caixa insuficiente até para os primeiros meses do estudo.');
  ind.trial = { phase, monthsLeft: plan.months, months: plan.months, monthly: plan.monthly, patients: plan.patients, cost: plan.cost, cfg: c, startedAt: state.month };
  ind.status = phase;
  if (phase === 'fase3') state.achievements.fase3 ??= state.month;
  return ok(`${phase === 'fase2' ? 'Fase II' : 'Fase III'} de ${assetName(a)} em ${DIS[diseaseId].name.toLowerCase()} iniciada: ${plan.patients.toLocaleString('pt-BR')} pacientes, ${plan.months} meses, ${money(plan.cost)}.`);
}

export function abandonIndication(state, assetId, diseaseId) {
  const a = getAsset(state, assetId);
  const ind = a?.inds[diseaseId];
  if (!ind) return fail('Indicação não encontrada.');
  if (Object.values(ind.reg).some((r) => r.status === 'aprovado')) return fail('Indicações já aprovadas não podem ser abandonadas.');
  ind.trial = null;
  ind.status = 'abandonada';
  for (const r of Object.values(ind.reg)) {
    if (r.status !== 'aprovado') {
      r.status = 'retirado';
      r.study = null;
    }
  }
  return ok(`Indicação de ${DIS[diseaseId].name.toLowerCase()} abandonada.`);
}

export function abandonAsset(state, assetId) {
  const a = getAsset(state, assetId);
  if (!a) return fail('Ativo não encontrado.');
  if (approvedAnywhere(a)) return fail('Produtos aprovados não podem ser abandonados; venda-os ou retire-os do mercado.');
  a.stage = 'abandonado';
  a.trial = null;
  for (const ind of Object.values(a.inds)) ind.trial = null;
  for (const k of ['formulation', 'pediatric', 'screen']) if (a.flags[k] && typeof a.flags[k] === 'object') a.flags[k] = null;
  return ok(`${assetName(a)} foi descontinuado.`);
}

export function designationStatus(state, a, ind, type) {
  const D = DIS[ind.diseaseId];
  const soc = socEff(state, ind.diseaseId);
  if (ind.desig[type]) return { available: false, reason: 'Concedida' };
  if (type === 'orphan') return D.orphan ? { available: true } : { available: false, reason: 'Só para doenças raras' };
  if (type === 'fastTrack') {
    if (ind.desig.ftDenied) return { available: false, reason: 'Negada' };
    return D.severity >= 4 || soc < 0.3 ? { available: true } : { available: false, reason: 'Exige doença grave ou necessidade não atendida' };
  }
  if (type === 'breakthrough') {
    if (ind.desig.btDenied) return { available: false, reason: 'Negada' };
    const r2 = ind.results.fase2;
    if (!r2) return { available: false, reason: 'Exige dados de Fase II' };
    return r2.verdict === 'positivo' && r2.obs - soc >= 0.15 && D.severity >= 3 ? { available: true } : { available: false, reason: 'Exige melhora substancial sobre o padrão' };
  }
  return { available: false, reason: '' };
}

const DESIG_NAMES = { orphan: 'Medicamento órfão', fastTrack: 'Fast Track', breakthrough: 'Terapia inovadora (Breakthrough)' };

export function applyDesignation(state, assetId, diseaseId, type) {
  const a = getAsset(state, assetId);
  const ind = a?.inds[diseaseId];
  if (!ind) return fail('Indicação não encontrada.');
  const st = designationStatus(state, a, ind, type);
  if (!st.available) return fail(st.reason || 'Indisponível.');
  if (!spend(state, 'pd', 0.2)) return fail('Caixa insuficiente.');
  const p = type === 'orphan' ? 1 : type === 'fastTrack' ? 0.85 : 0.75;
  if (chance(state, p + (state.agencies.US - 55) / 300)) {
    ind.desig[type] = true;
    if (type === 'breakthrough' && ind.trial?.phase === 'fase3') {
      ind.trial.monthsLeft = Math.max(1, Math.round(ind.trial.monthsLeft * 0.8));
    }
    return ok(`Designação "${DESIG_NAMES[type]}" concedida a ${assetName(a)} em ${DIS[diseaseId].name.toLowerCase()}.`);
  }
  if (type === 'fastTrack') ind.desig.ftDenied = true;
  if (type === 'breakthrough') ind.desig.btDenied = true;
  return fail(`A FDA negou a designação "${DESIG_NAMES[type]}".`);
}

// ---------- regulatório ----------
export function submit(state, assetId, diseaseId, m, { usePRV = false } = {}) {
  const a = getAsset(state, assetId);
  const ind = a?.inds[diseaseId];
  if (!ind) return fail('Indicação não encontrada.');
  const existing = ind.reg[m];
  if (existing && !['retirado'].includes(existing.status)) return fail('Já existe um processo nesta agência.');
  let accelerated = false;
  if (ind.status !== 'registro') {
    if (ind.status === 'fase2_ok' && canAccelerate(state, a, ind, m)) accelerated = true;
    else if (ind.status === 'fase3' && ind.accelerated && canAccelerate(state, a, ind, m)) accelerated = true;
    else return fail('É preciso concluir a Fase III com sucesso antes de submeter.');
  }
  if (usePRV && (m !== 'US' || state.prvs <= 0)) return fail('Voucher de revisão prioritária indisponível.');
  if (usePRV) state.prvs -= 1;
  startReview(state, a, ind, m, { usePRV, accelerated });
  if (ind.fraudHidden) ind.reg[m].bonus -= 0.2;
  const r = ind.reg[m];
  if (r.status === 'ponte') return ok(`Dossiê de ${assetName(a)} protocolado na ${MKT[m].agency}, que exige um estudo-ponte com pacientes locais.`);
  return ok(`Dossiê de ${assetName(a)} protocolado na ${MKT[m].agency}${r.priority ? ' com revisão prioritária' : ''}${accelerated ? ' (via aprovação acelerada)' : ''}. Decisão prevista: ${dateLabel(r.decisionAt)}.`);
}

export function startBridging(state, assetId, diseaseId, m) {
  const a = getAsset(state, assetId);
  const r = a?.inds[diseaseId]?.reg[m];
  if (!r || r.status !== 'ponte' || r.study) return fail('Estudo-ponte não aplicável.');
  const plan = trialPlan(state, a, diseaseId, 'ponte', { regions: [m] });
  r.study = { kind: 'ponte', monthsLeft: plan.months, monthly: plan.monthly };
  return ok(`Estudo-ponte em ${MKT[m].name} iniciado (${plan.months} meses, ${money(plan.cost)}).`);
}

export function sellPRV(state) {
  if (state.prvs <= 0) return fail('Você não possui vouchers.');
  const price = Math.round(randRange(state, 85, 125));
  state.prvs -= 1;
  book(state, 'outras', price);
  return ok(`Voucher de revisão prioritária vendido por ${money(price)}.`);
}

// ---------- comercial ----------
export function setPresence(state, m, type) {
  const p = state.presence[m];
  const M = MKT[m];
  if (p.type === type && !p.pending) return fail('Nada a mudar.');
  if (type === 'subsidiaria') {
    if (p.pending?.type === 'subsidiaria' || (p.type === 'subsidiaria')) return fail('A subsidiária já está a caminho.');
    const cost = M.subsidiary.setup;
    if (!spendCapex(state, cost)) return fail('Caixa insuficiente.');
    if (p.type === 'distribuidor') {
      p.pending = { type: 'subsidiaria', at: state.month + 6 };
    } else {
      state.presence[m] = { type: 'subsidiaria', readyAt: state.month + 6 };
    }
    return ok(`Subsidiária em ${M.name} em implantação (${money(cost)}, pronta em ${dateLabel(state.month + 6)}).`);
  }
  if (type === 'distribuidor') {
    if (!spend(state, 'sga', 1)) return fail('Caixa insuficiente.');
    if (p.type === 'subsidiaria') book(state, 'sga', -M.subsidiary.setup * 0.15);
    state.presence[m] = { type: 'distribuidor', readyAt: null };
    for (const a of state.assets) if (a.owner === 'player') launchIfPossible(state, a, m);
    return ok(`Contrato de distribuição em ${M.name} assinado. O distribuidor fica com ${Math.round(M.distributorCut * 100)}% da receita.`);
  }
  if (p.type === 'subsidiaria') book(state, 'sga', -M.subsidiary.setup * 0.25);
  state.presence[m] = { type: 'nenhuma', readyAt: null };
  return ok(`Operação comercial em ${M.name} encerrada.`);
}

export function setPrice(state, assetId, m, price) {
  const a = getAsset(state, assetId);
  const pm = a?.markets[m];
  if (!pm) return fail('Produto não disponível neste mercado.');
  let p = Math.round(Number(price));
  if (!Number.isFinite(p) || p <= 0) return fail('Preço inválido.');
  const ceil = priceCeiling(state, a, m);
  let note = '';
  if (p > ceil) {
    p = Math.floor(ceil);
    note = ` A CMED limitou o preço a US$ ${p.toLocaleString('pt-BR')}.`;
  }
  if (pm.launched != null && p > pm.price * 1.15) {
    state.reputation = clamp(state.reputation - 2, 0, 100);
    note += ' O aumento repercutiu mal na imprensa.';
  }
  pm.price = p;
  pm.lastPriceChange = state.month;
  if (pm.launched == null) pm.launchPrice = p;
  return ok(`Preço de ${assetName(a)} em ${MKT[m].name}: US$ ${p.toLocaleString('pt-BR')}.${note}`);
}

export function setMarketing(state, assetId, m, amount) {
  const a = getAsset(state, assetId);
  const pm = a?.markets[m];
  if (!pm) return fail('Produto não disponível neste mercado.');
  const v = Number(amount);
  if (!Number.isFinite(v) || v < 0 || v > 500) return fail('Orçamento de marketing inválido (0 a 500).');
  pm.marketing = Math.round(v * 10) / 10;
  return ok();
}

export function toggleFlag(state, assetId, flag) {
  const a = getAsset(state, assetId);
  if (!a || !['dtc', 'offLabel', 'pap', 'cmo'].includes(flag)) return fail('Opção inválida.');
  if (flag === 'dtc' && !a.markets.US) return fail('Propaganda ao consumidor só é permitida nos EUA.');
  a.flags[flag] = !a.flags[flag];
  const labels = {
    dtc: ['Propaganda direta ao consumidor ativada nos EUA.', 'Propaganda direta ao consumidor desativada.'],
    offLabel: ['Representantes passam a promover usos não aprovados. Isso é ilegal.', 'Promoção off-label encerrada.'],
    pap: ['Programa de assistência ao paciente ativado (3% da receita do produto).', 'Programa de assistência ao paciente encerrado.'],
    cmo: ['Produção terceirizada (CMO) habilitada para cobrir falta de capacidade.', 'Produção terceirizada desabilitada.'],
  };
  if (flag === 'pap' && !a.flags.pap) state.reputation = clamp(state.reputation - 1, 0, 100);
  return ok(labels[flag][a.flags[flag] ? 0 : 1]);
}

export function renameProduct(state, assetId, name) {
  const a = getAsset(state, assetId);
  const n = String(name || '').trim();
  if (!a) return fail('Ativo não encontrado.');
  if (n.length < 2 || n.length > 20) return fail('Use de 2 a 20 caracteres.');
  if (approvedAnywhere(a) && a.brand && Object.values(a.markets).some((pm) => pm.launched != null)) return fail('Não é possível renomear um produto já lançado.');
  a.brand = n;
  return ok(`Nome comercial definido: ${n}.`);
}

function startProject(state, a, key, months, cost) {
  a.flags[key] = { monthsLeft: months, months, monthly: cost / months };
}

export function startFormulation(state, assetId) {
  const a = getAsset(state, assetId);
  if (!a || !approvedAnywhere(a)) return fail('Exige um produto aprovado.');
  if (a.flags.formulation) return fail('A nova formulação já foi desenvolvida ou está em andamento.');
  startProject(state, a, 'formulation', 18, 25 * state.diff.costMult);
  return ok(`Desenvolvimento de formulação de liberação prolongada de ${assetName(a)} iniciado (18 meses).`);
}

export function startPediatric(state, assetId) {
  const a = getAsset(state, assetId);
  if (!a || !approvedIn(a, 'US').length) return fail('Exige aprovação nos EUA.');
  if (a.flags.pediatric) return fail('O estudo pediátrico já foi feito ou está em andamento.');
  const plan = trialPlan(state, a, a.originDisease, 'pediatrico', { regions: ['US'] });
  startProject(state, a, 'pediatric', plan.months, plan.cost);
  return ok(`Estudo pediátrico de ${assetName(a)} iniciado (${plan.months} meses, ${money(plan.cost)}).`);
}

export function startScreen(state, assetId) {
  const a = getAsset(state, assetId);
  if (!a || !['pre_ok', 'fase1', 'clinico'].includes(a.stage)) return fail('A triagem exige uma molécula com o pré-clínico concluído.');
  if (a.flags.screen) return fail('A triagem já foi feita ou está em andamento.');
  startProject(state, a, 'screen', 6, 6 * state.diff.costMult);
  return ok(`Triagem de reposicionamento de ${assetName(a)} iniciada (6 meses).`);
}

export function filePolymorphPatent(state, assetId) {
  const a = getAsset(state, assetId);
  if (!a || !a.patents.some((p) => p.kind === 'composto' && p.status === 'ativa')) return fail('Exige patente de composto ativa.');
  if (a.patents.some((p) => p.kind === 'polimorfo')) return fail('Já existe uma patente de polimorfo.');
  if (!spend(state, 'juridico', 3)) return fail('Caixa insuficiente.');
  a.patents.push({ id: uid(state, 'p'), kind: 'polimorfo', filed: state.month, ext: 0, strength: 0.3, status: 'ativa', diseaseId: null });
  state.reputation = clamp(state.reputation - 1, 0, 100);
  return ok(`Patente de nova forma cristalina de ${assetName(a)} depositada. Críticos chamam a prática de "evergreening".`);
}

export function fileUsePatent(state, assetId, diseaseId) {
  const a = getAsset(state, assetId);
  if (!a?.inds[diseaseId] || diseaseId === a.originDisease) return fail('A patente de uso cobre apenas novas indicações.');
  if (a.patents.some((p) => p.kind === 'uso' && p.diseaseId === diseaseId)) return fail('Já existe patente de uso para essa indicação.');
  if (!spend(state, 'juridico', 2)) return fail('Caixa insuficiente.');
  a.patents.push({ id: uid(state, 'p'), kind: 'uso', filed: state.month, ext: 0, strength: 0.5, status: 'ativa', diseaseId });
  return ok(`Patente de segundo uso médico de ${assetName(a)} em ${DIS[diseaseId].name.toLowerCase()} depositada.`);
}

export function launchAuthorizedGeneric(state, assetId, m) {
  const a = getAsset(state, assetId);
  const pm = a?.markets[m];
  if (!pm || pm.genericSince == null) return fail('O genérico autorizado só faz sentido após a perda de exclusividade.');
  if (pm.authGeneric) return fail('Já lançado.');
  pm.authGeneric = true;
  return ok(`Genérico autorizado de ${assetName(a)} lançado em ${MKT[m].name}.`);
}

export function saleOffer(state, assetId) {
  const a = getAsset(state, assetId);
  if (!a) return 0;
  return Math.max(5, Math.round(assetValue(state, a) * 0.6));
}

export function sellAsset(state, assetId) {
  const a = getAsset(state, assetId);
  if (!a) return fail('Ativo não encontrado.');
  const value = saleOffer(state, assetId);
  book(state, 'outras', value);
  a.stage = 'vendido';
  a.owner = 'comprador';
  a.trial = null;
  for (const ind of Object.values(a.inds)) ind.trial = null;
  if (value >= 500) state.achievements.licenciador ??= state.month;
  return ok(`${assetName(a)} vendido por ${money(value)}.`);
}

export function buyOffer(state, offerId) {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o) return fail('Oferta expirada.');
  if (!spend(state, 'pd', o.price)) return fail('Caixa insuficiente para adquirir o ativo.');
  o.asset.owner = 'player';
  state.assets.push(o.asset);
  state.offers = state.offers.filter((x) => x !== o);
  return ok(`Direitos de ${o.asset.code} adquiridos de ${o.biotech} por ${money(o.price)}.`);
}

// ---------- produção ----------
export function buildFactory(state, type) {
  const T = PROD_TYPES[type];
  if (!T) return fail('Tipo de fábrica inválido.');
  if (!spendCapex(state, T.build * state.diff.costMult)) return fail('Caixa insuficiente para a obra.');
  const f = newFactory(state, type, uid(state, 'f'));
  state.factories.push(f);
  return ok(`Construção de fábrica de ${T.name.toLowerCase()} iniciada. Operação prevista para ${dateLabel(f.readyAt)}.`);
}

export function expandFactory(state, id) {
  const f = state.factories.find((x) => x.id === id);
  if (!f || f.readyAt > state.month) return fail('Fábrica indisponível.');
  if (f.expansion) return fail('Ampliação já em andamento.');
  const cost = PROD_TYPES[f.type].build * 0.4 * state.diff.costMult;
  if (!spendCapex(state, cost)) return fail('Caixa insuficiente.');
  f.expansion = { at: state.month + 12, add: PROD_TYPES[f.type].capacity * 0.5 };
  return ok(`Ampliação da ${factoryName(f)} iniciada (+50% de capacidade em 12 meses).`);
}

export function qualityProgram(state, id) {
  const f = state.factories.find((x) => x.id === id);
  if (!f || f.readyAt > state.month) return fail('Fábrica indisponível.');
  if (f.qualityProgram) return fail('Programa de qualidade já em andamento.');
  if (!spend(state, 'producao', 15)) return fail('Caixa insuficiente.');
  f.qualityProgram = 6;
  return ok(`Programa de qualidade iniciado na ${factoryName(f)}.`);
}

export function sellFactory(state, id) {
  const f = state.factories.find((x) => x.id === id);
  if (!f) return fail('Fábrica não encontrada.');
  const value = PROD_TYPES[f.type].build * (f.readyAt <= state.month ? 0.3 : 0.15);
  state.cash += value;
  state.ledger.capex += value;
  state.factories = state.factories.filter((x) => x !== f);
  return ok(`${factoryName(f)} vendida por ${money(value)}.`);
}

// ---------- finanças ----------
export function takeLoan(state, amount) {
  const v = Number(amount);
  const room = creditLimit(state) - state.debt;
  if (!Number.isFinite(v) || v <= 0) return fail('Valor inválido.');
  if (v > room) return fail(`Limite de crédito disponível: ${money(Math.max(0, room))}.`);
  state.debt += v;
  state.cash += v;
  state.ledger.financiamento += v;
  return ok(`Empréstimo de ${money(v)} contratado.`);
}

export function repayLoan(state, amount) {
  const v = Math.min(Number(amount), state.debt);
  if (!Number.isFinite(v) || v <= 0) return fail('Valor inválido.');
  if (v > state.cash) return fail('Caixa insuficiente.');
  state.debt -= v;
  state.cash -= v;
  state.ledger.financiamento -= v;
  return ok(`Dívida amortizada em ${money(v)}.`);
}

export const equityCooldown = (state) => Math.max(0, state.lastEquityMonth + 6 - state.month);
export const maxEquity = (state) => Math.round(state.marketCap * 0.3);

export function issueEquity(state, amount) {
  const v = Number(amount);
  if (!Number.isFinite(v) || v <= 0) return fail('Valor inválido.');
  if (equityCooldown(state) > 0) return fail(`O mercado só aceita nova oferta de ações em ${equityCooldown(state)} meses.`);
  if (v > maxEquity(state)) return fail(`Oferta máxima: ${money(maxEquity(state))} (30% do valor de mercado).`);
  const price = state.sharePrice * 0.92;
  state.shares += v / price;
  state.cash += v;
  state.ledger.financiamento += v;
  state.lastEquityMonth = state.month;
  state.sentiment = clamp(state.sentiment - 0.02, 0.65, 1.35);
  return ok(`Oferta de ações levanta ${money(v)} a US$ ${price.toFixed(2)} por ação.`);
}

export function buyback(state, amount) {
  const v = Number(amount);
  if (!Number.isFinite(v) || v <= 0) return fail('Valor inválido.');
  if (v > state.cash) return fail('Caixa insuficiente.');
  const n = v / state.sharePrice;
  if (state.shares - n < state.shares * 0.5) return fail('Recompra grande demais.');
  state.shares -= n;
  state.cash -= v;
  state.ledger.financiamento -= v;
  return ok(`Recompra de ${money(v)} em ações concluída.`);
}

export function resolveEvent(state, eventId, idx) {
  const msg = resolveEv(state, eventId, idx);
  return ok(msg);
}

export function hiddenLeft(state, a) {
  return hiddenFitsLeft(state, a.targetId).length;
}

