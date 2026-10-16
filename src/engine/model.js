// Cálculos derivados (sem efeitos colaterais): eficácia, preço justo, acesso, participação de mercado,
// exclusividade, planejamento de ensaios e estimativas de valor.
import { DISEASE_BY_ID as DIS, DISEASES } from '../data/diseases.js';
import { TARGET_BY_ID as TGT, TARGETS } from '../data/targets.js';
import { MARKETS, MARKET_BY_ID as MKT } from '../data/markets.js';
import { MODALITIES } from '../data/modalities.js';
import { SIDE_EFFECTS as SE } from '../data/sideEffects.js';
import { clamp, sum, normCdf } from './util.js';

export const PHASES = {
  preclinico: { label: 'Pré-clínico' },
  fase1: { label: 'Fase I', months: 12, patients: 80, cpp: 0.12, setup: 0.6 },
  fase2: { label: 'Fase II', months: 24, patients: 300, cpp: 0.08, setup: 1.5 },
  fase3: { label: 'Fase III', months: 36, patients: 2400, cpp: 0.055, setup: 4 },
  adicional: { label: 'Estudo adicional', months: 15, patients: 800, cpp: 0.06, setup: 2 },
  ponte: { label: 'Estudo-ponte', months: 12, patients: 300, cpp: 0.05, setup: 1 },
  pediatrico: { label: 'Estudo pediátrico', months: 12, patients: 200, cpp: 0.08, setup: 1 },
};

export const SIZES = {
  pequeno: { label: 'Enxuto', n: 0.6, t: 0.85 },
  padrao: { label: 'Padrão', n: 1, t: 1 },
  grande: { label: 'Robusto', n: 1.6, t: 1.2 },
};

export const BUDGETS = {
  baixo: { label: 'Baixo', cost: 1.2, speed: 0.6, q: -0.03 },
  medio: { label: 'Médio', cost: 2.5, speed: 1.0, q: 0 },
  alto: { label: 'Alto', cost: 5, speed: 1.6, q: 0.05 },
};

// Pesos do modelo de escolha de tratamento (logit multinomial).
export const W = { eff: 5, safety: 2.5, conv: 1.2, socInertia: 5, socPrice: 0.2 };
const SEV_PERCEPTION = { 0: 0, 1: 0.6, 2: 2.5, 3: 8, 4: 40 };
const SEV_RISK = { 0: 0, 1: 0, 2: 1, 3: 5, 4: 30 };

export const SE_TRIAL_K = 1.4; // desvio-padrão do desfecho por paciente (erro-padrão = K / sqrt(n))
export const MIN_CLINICAL = 0.08; // diferença mínima clinicamente relevante contra placebo
export const NI_MARGIN = 0.05; // margem de não inferioridade contra comparador ativo

export const assetName = (a) => a.brand || a.code;
export const socEff = (state, d) => state.diseases[d].soc;

export function poolIn(state, d, m) {
  const D = DIS[d];
  const share = D.regions ? D.regions[m] ?? 0 : MKT[m].patientShare;
  return D.patients * 1000 * share * (state.diseases[d].mult || 1);
}

// Unidades vendidas por mês (pacientes-mês, ou tratamentos para terapias de dose única).
export function monthlyUnits(D, pool, share) {
  return D.course > 0 ? (pool / 12) * share * D.course : pool * share;
}

export function isKnownFit(state, targetId, d) {
  const t = TGT[targetId];
  if (!(d in t.fits)) return false;
  return !t.hidden.includes(d) || !!state.knownFits[targetId]?.[d];
}

export function knownFits(state, targetId) {
  const t = TGT[targetId];
  return Object.entries(t.fits)
    .filter(([d]) => isKnownFit(state, targetId, d))
    .map(([d, fit]) => ({ d, fit }));
}

export function targetsFor(state, d) {
  return TARGETS.filter((t) => isKnownFit(state, t.id, d)).map((t) => ({ target: t, fit: t.fits[d] }));
}

export function hiddenFitsLeft(state, targetId) {
  const t = TGT[targetId];
  return t.hidden.filter((d) => !state.knownFits[targetId]?.[d]);
}

// Melhor estimativa de eficácia que o jogador conhece.
export function effEstimate(asset, d) {
  const ind = asset.inds[d];
  const r = ind?.results?.fase3 || ind?.results?.fase2;
  if (r) return { mean: r.obs, se: r.se, source: r.phase === 'fase3' ? 'Fase III' : 'Fase II' };
  const p = asset.prior?.[d];
  if (p) return { mean: p.mean, se: p.se, source: 'Pré-clínico' };
  return null;
}

// Eficácia percebida no mercado: começa no resultado da bula e converge para a real com o uso.
export function labelEff(state, asset, d) {
  const ind = asset.inds[d];
  const r = ind?.results?.fase3 || ind?.results?.fase2;
  const truth = asset.eff[d] ?? 0.02;
  if (!r) return truth;
  const t = clamp((state.month - (ind.approvedAt ?? state.month)) / 60, 0, 1);
  return r.obs + (truth - r.obs) * t;
}

export function perceivedSafety(asset) {
  const s = sum(asset.ses.filter((x) => x.revealed), (x) => x.freq * SEV_PERCEPTION[SE[x.id].severity]);
  return clamp(1 - s - (asset.boxed ? 0.08 : 0), 0.2, 1);
}

export function riskScore(asset) {
  return sum(asset.ses.filter((x) => x.revealed), (x) => x.freq * SEV_RISK[SE[x.id].severity]);
}

export function valuePrice(state, effObs, d, m, headToHead = false) {
  const D = DIS[d];
  const M = MKT[m];
  const gain = effObs - socEff(state, d);
  let f = clamp(1 + 1.8 * gain, 0.35, 2.2) * (1 + 0.05 * (D.severity - 3));
  if (!headToHead && M.k >= 7) f *= 0.9; // ATS desconta incerteza sem comparação direta
  return D.refPrice * M.priceIndex * f;
}

export function accessFor(price, vp, M) {
  const ratio = price / Math.max(1e-6, vp);
  return clamp(1 / (1 + Math.exp((ratio - 1 - M.slack) * M.k)), 0.01, 1);
}

// Pagadores restringem o acesso quando o gasto potencial com a doença ameaça o orçamento
// (impacto orçamentário). Doenças graves têm mais tolerância.
export function budgetFactor(state, d, m, price) {
  const D = DIS[d];
  const M = MKT[m];
  const spend = (monthlyUnits(D, poolIn(state, d, m), 1) * 12 * price) / 1e9;
  const tolerance = M.budget * Math.pow(D.severity / 3, 1.5);
  return 1 / (1 + spend / tolerance);
}

export function priceFactor(ratio, M) {
  return Math.pow(Math.max(0.05, ratio), -M.priceSens);
}

export function approvedIn(asset, m) {
  return Object.values(asset.inds)
    .filter((ind) => ind.reg[m]?.status === 'aprovado')
    .map((ind) => ind.diseaseId);
}

export function approvedAnywhere(asset) {
  return Object.values(asset.inds).some((ind) => Object.values(ind.reg).some((r) => r.status === 'aprovado'));
}

export function headToHead(asset, d) {
  return asset.inds[d]?.results?.fase3?.comparator === 'ativo';
}

export function suggestedPrice(state, asset, m) {
  let ds = approvedIn(asset, m);
  if (!ds.length) ds = Object.keys(asset.inds).filter((d) => effEstimate(asset, d));
  if (!ds.length) ds = [asset.originDisease];
  let wsum = 0;
  let psum = 0;
  for (const d of ds) {
    const est = effEstimate(asset, d)?.mean ?? asset.eff[d] ?? 0.3;
    const w = Math.max(1, poolIn(state, d, m)) * DIS[d].refPrice;
    psum += valuePrice(state, est, d, m, headToHead(asset, d)) * w;
    wsum += w;
  }
  const p = Math.max(psum / wsum, asset.cogs * 2.4);
  return Math.round(p >= 1000 ? p / 10 : p) * (p >= 1000 ? 10 : 1);
}

export function priceCeiling(state, asset, m) {
  if (!MKT[m].priceCeiling) return Infinity;
  return suggestedPrice(state, asset, m) * 1.15;
}

// Entradas do mercado que não pertencem ao jogador: tratamento padrão (genérico) e marcas concorrentes.
export function baseEntries(state, d, m) {
  const M = MKT[m];
  const soc = socEff(state, d);
  const entries = [{
    kind: 'soc', name: 'Tratamento padrão (genéricos)',
    w: Math.exp(W.eff * soc + W.safety * 0.8 + W.conv * 0.7) * W.socInertia * priceFactor(W.socPrice, M),
  }];
  for (const c of state.compDrugs) {
    if (c.diseaseId !== d || c.stage !== 'mercado') continue;
    const aw = clamp(0.1 + ((state.month - c.launch) / 30) * 0.75, 0.1, 0.85);
    const ratio = clamp(1 + 1.8 * (c.eff - soc), 0.5, 2.2);
    const budget = budgetFactor(state, d, m, ratio * DIS[d].refPrice * M.priceIndex);
    entries.push({
      kind: 'comp', name: `${c.name} (${c.company})`, ref: c,
      w: Math.exp(W.eff * c.eff + W.safety * c.safety + W.conv * c.conv) * aw * 0.9 * budget * priceFactor(ratio, M),
    });
  }
  return entries;
}

export function productWeight(state, asset, d, m, pm, offLabel = false) {
  const D = DIS[d];
  const M = MKT[m];
  const eff = offLabel ? (asset.eff[d] ?? 0) * 0.85 : labelEff(state, asset, d);
  const safety = perceivedSafety(asset);
  const claim = asset.inds[d]?.results?.fase3?.superior ? 0.35 : 0;
  const vp = valuePrice(state, eff, d, m, headToHead(asset, d));
  let access = accessFor(pm.price, vp, M) * budgetFactor(state, d, m, pm.price) * (asset.flags.rems ? 0.8 : 1);
  if (pm.pdpUntil != null && state.month < pm.pdpUntil) access = 1;
  let aw = pm.awareness;
  if (offLabel) {
    access = 0.25;
    aw *= 0.3;
  }
  const ratio = pm.price / (D.refPrice * M.priceIndex);
  const repF = 0.9 + (0.2 * state.reputation) / 100;
  const w = Math.exp(W.eff * eff + W.safety * safety + W.conv * asset.conv + claim) * (0.05 + aw) * access * priceFactor(ratio, M) * repF;
  return { w, access, vp };
}

export function marketingScale(state, asset, m) {
  const ds = approvedIn(asset, m);
  const poolK = sum(ds.length ? ds : [asset.originDisease], (d) => poolIn(state, d, m) / 1000);
  return MKT[m].mktScale * clamp(Math.sqrt(poolK / 300), 0.25, 5);
}

export function patentEndOf(p, M) {
  let end = p.filed + 240 + (M.pte ? p.ext || 0 : 0);
  if (p.settleAt != null) end = Math.min(end, p.settleAt);
  return end;
}

export function exclusivity(state, asset, m) {
  const M = MKT[m];
  const mod = MODALITIES[asset.modality];
  let patentEnd = -Infinity;
  let patentId = null;
  for (const p of asset.patents) {
    if (p.status !== 'ativa' || p.kind === 'uso') continue;
    if (M.evergreenBlocked && p.kind !== 'composto') continue;
    const end = patentEndOf(p, M);
    if (end > patentEnd) {
      patentEnd = end;
      patentId = p.id;
    }
  }
  let dataEnd = -Infinity;
  for (const ind of Object.values(asset.inds)) {
    const r = ind.reg[m];
    if (!r || r.approvedAt == null) continue;
    dataEnd = Math.max(dataEnd, r.approvedAt + M.dataExcl[mod.exclClass]);
    if (DIS[ind.diseaseId].orphan) dataEnd = Math.max(dataEnd, r.approvedAt + M.orphanExcl);
  }
  if (m === 'US' && asset.flags.pediatric === 'done') {
    patentEnd += 6;
    dataEnd += 6;
  }
  let end = Math.max(patentEnd, dataEnd);
  const pm = asset.markets[m];
  if (pm?.compulsorySince != null) end = Math.min(end, pm.compulsorySince);
  return { patentEnd, dataEnd, end, patentId };
}

export function usePatentActive(state, asset, d, m) {
  if (MKT[m].evergreenBlocked) return false;
  return asset.patents.some((p) => p.kind === 'uso' && p.diseaseId === d && p.status === 'ativa' && state.month < p.filed + 240);
}

function regionDur(n) {
  return clamp(1.12 - 0.12 * (n - 1), 0.7, 1.12);
}

export function areaExpertise(state, asset, d) {
  return state.expertise[DIS[d || asset.originDisease].area] || 0;
}

// Planejamento de custo, duração e tamanho de um estudo.
export function trialPlan(state, asset, d, phase, cfg = {}) {
  const mod = MODALITIES[asset.modality];
  const costMult = state.diff.costMult;
  if (phase === 'preclinico') {
    const months = mod.preMonths;
    const cost = mod.preCost * months * costMult;
    return { patients: 0, cost, months, monthly: cost / months, regions: [] };
  }
  const ph = PHASES[phase];
  const D = d ? DIS[d] : null;
  const regions = cfg.regions?.length ? cfg.regions : ['US'];
  const size = SIZES[cfg.size || 'padrao'];
  const diseaseScaled = D && phase !== 'fase1';
  let patients = ph.patients * size.n * (diseaseScaled ? D.trialSize : 1);
  if (phase === 'ponte' || phase === 'pediatrico') patients = ph.patients;
  patients = Math.max(phase === 'fase1' ? 24 : 40, Math.round(patients));
  const regionCost = sum(regions, (r) => MKT[r].trialCost) / regions.length;
  const exp = areaExpertise(state, asset, d);
  const cpp = ph.cpp * (diseaseScaled ? D.trialMult : 1) * mod.trialCost * regionCost * (1 - (0.15 * exp) / 100);
  let cost = patients * cpp * (cfg.comparator === 'ativo' ? 1.3 : 1) * (cfg.cro ? 1.15 : 1) + ph.setup * regions.length;
  cost *= costMult;
  const ind = d ? asset.inds[d] : null;
  let months = ph.months * size.t * regionDur(regions.length) * (cfg.cro ? 0.8 : 1);
  if (D?.orphan && diseaseScaled) months *= 1.2;
  if (phase === 'fase3' && ind?.desig?.breakthrough) months *= 0.75;
  if (asset.flags.pandemic) months *= 0.5;
  months = Math.max(4, Math.round(months));
  return { patients, cost, months, monthly: cost / months, regions };
}

// Probabilidade preditiva de o estudo atingir o desfecho, dada a estimativa atual.
// Inclui o risco médio de tradução do mecanismo: sem dados de Fase II, o alvo pode não funcionar
// em humanos; na Fase III, o desfecho clínico pode não acompanhar o desfecho substituto da Fase II.
export function trialPower(state, asset, d, cfg, plan, phase = 'fase3') {
  const est = effEstimate(asset, d);
  if (!est) return null;
  const D = DIS[d];
  const v = TGT[asset.targetId].validation;
  const hasPhase2 = !!asset.inds[d]?.results?.fase2;
  const risk = phase === 'fase2' || !hasPhase2 ? Math.pow(v, 1.8) : 1 - (0.2 + 0.3 * (1 - v)) * 0.85;
  const se = SE_TRIAL_K / Math.sqrt(plan.patients);
  const soc = socEff(state, d);
  if (cfg.comparator === 'ativo') {
    const seD = se * Math.SQRT2;
    const spread = Math.sqrt(seD * seD + est.se * est.se);
    return {
      success: risk * normCdf((est.mean - soc + NI_MARGIN - 1.96 * seD) / spread),
      superior: risk * normCdf((est.mean - soc - 1.96 * seD) / spread),
    };
  }
  const thr = Math.max(D.placebo + 1.96 * se, D.placebo + MIN_CLINICAL * (phase === 'fase3' ? 1.25 : 1));
  return { success: risk * normCdf((est.mean - thr) / Math.sqrt(se * se + est.se * est.se)) };
}

// Probabilidade de sucesso até a aprovação, conforme o estágio atual.
export function indicationPoS(state, asset, ind) {
  if (Object.values(ind.reg).some((r) => r.status === 'aprovado')) return 1;
  const tgt = TGT[asset.targetId];
  const v = 0.5 + 0.5 * tgt.validation;
  switch (asset.stage) {
    case 'lead': return 0.07 * v;
    case 'preclinico': return 0.09 * v;
    case 'pre_ok': return 0.11 * v;
    case 'fase1': return 0.14 * v;
    default: break;
  }
  const r2 = ind.results.fase2;
  const r3 = ind.results.fase3;
  switch (ind.status) {
    case 'planejada':
    case 'fase2': return 0.3 * v;
    case 'fase2_ok':
    case 'fase3':
      if (!r2) return 0.3 * v;
      return r2.verdict === 'positivo' ? 0.55 : r2.verdict === 'inconclusivo' ? 0.3 : 0.06;
    case 'registro':
      return r3?.success ? 0.88 : r2?.verdict === 'positivo' ? 0.5 : 0.08;
    default: return 0;
  }
}

// Estimativa de vendas anuais no pico (US$ mi), supondo preço no valor e boa divulgação.
export function peakSales(state, asset, d, effOverride) {
  const D = DIS[d];
  const est = effOverride ?? effEstimate(asset, d)?.mean ?? asset.prior?.[d]?.mean ?? 0.3;
  let total = 0;
  for (const M of MARKETS) {
    const pool = poolIn(state, d, M.id);
    if (!pool) continue;
    const vp = valuePrice(state, est, d, M.id);
    const access = accessFor(vp, vp, M) * budgetFactor(state, d, M.id, vp);
    const ratio = vp / (D.refPrice * M.priceIndex);
    const w = Math.exp(W.eff * est + W.safety * 0.85 + W.conv * asset.conv) * 0.75 * access * priceFactor(ratio, M);
    const others = sum(baseEntries(state, d, M.id), (e) => e.w);
    const share = w / (w + others);
    const presence = state.presence[M.id]?.type === 'subsidiaria' ? 1 : 0.65;
    total += monthlyUnits(D, pool, share) * vp * M.netFactor * 12 * presence;
  }
  return total / 1e6;
}

export function diseaseMarketSize(state, d) {
  const D = DIS[d];
  let total = 0;
  for (const M of MARKETS) {
    const pool = poolIn(state, d, M.id);
    total += monthlyUnits(D, pool, 1) * D.refPrice * M.priceIndex * M.netFactor * 12;
  }
  return total / 1e6;
}

export function competitorsIn(state, d) {
  return state.compDrugs.filter((c) => c.diseaseId === d);
}

export function playerProductsIn(state, d) {
  return state.assets.filter((a) => a.inds[d] && Object.values(a.inds[d].reg).some((r) => r.status === 'aprovado'));
}

export function compoundStageLabel(stage) {
  return {
    lead: 'Molécula líder', preclinico: 'Pré-clínico', pre_ok: 'Pronto p/ Fase I', fase1: 'Fase I',
    clinico: 'Clínico', falhou: 'Fracassou', abandonado: 'Abandonado', vendido: 'Licenciado',
  }[stage] || stage;
}

export const IND_STATUS = {
  planejada: 'Pronta p/ Fase II', fase2: 'Fase II', fase2_ok: 'Fase II concluída', fase3: 'Fase III',
  registro: 'Registro', falhou: 'Fracassou', abandonada: 'Abandonada',
};

export const REG_STATUS = {
  revisao: 'Em revisão', aprovado: 'Aprovado', crl: 'Resposta completa (CRL)', rejeitado: 'Rejeitado',
  ponte: 'Estudo-ponte exigido', retirado: 'Retirado', adicional: 'Estudo adicional',
};

export function allDiseases() {
  return DISEASES;
}
