// Agências reguladoras: submissões, revisões, comitês consultivos, aprovações e lançamentos.
import { DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { MARKET_BY_ID as MKT } from '../data/markets.js';
import { SIDE_EFFECTS as SE } from '../data/sideEffects.js';
import { socEff, riskScore, approvedIn, assetName, MIN_CLINICAL } from './model.js';
import { newProductMarket, makeBrand } from './assets.js';
import { clamp, book, chance, randInt, news, queueEvent, dateLabel } from './util.js';

export function hasPresence(state, m) {
  const p = state.presence[m];
  return p.type !== 'nenhuma' && (p.readyAt == null || p.readyAt <= state.month);
}

// Evidência usada pela agência: Fase III, ou Fase II em aprovação acelerada.
export function evidenceFor(ind, accelerated = ind.accelerated) {
  if (ind.results.fase3?.success) return ind.results.fase3;
  if (accelerated && ind.results.fase2) return ind.results.fase2;
  return ind.results.fase3 || null;
}

export function canAccelerate(state, a, ind, m) {
  const r2 = ind.results.fase2;
  if (!r2 || r2.verdict !== 'positivo') return false;
  if (!['US', 'EU'].includes(m)) return false;
  if (ind.results.fase3?.success) return false;
  const D = DIS[ind.diseaseId];
  return D.severity >= 4 && r2.obs - socEff(state, ind.diseaseId) >= 0.12;
}

export function approvalProbability(state, a, ind, m, accelerated = ind.accelerated) {
  const M = MKT[m];
  const D = DIS[ind.diseaseId];
  const res = evidenceFor(ind, accelerated);
  if (!res) return 0;
  let p;
  if (!res.success && !(accelerated && res.verdict === 'positivo')) {
    p = 0.06;
  } else {
    p = 0.95 - M.strictness * 0.15;
    const tolerance = 1.5 - D.severity / 5;
    p -= riskScore(a) * 2.5 * (0.5 + M.strictness) * tolerance;
    if (res.obs < socEff(state, ind.diseaseId) - 0.1 && D.severity <= 3) p -= 0.15;
    if (res.obs - D.placebo < MIN_CLINICAL * 1.5) p -= 0.1;
    if (accelerated && !ind.results.fase3?.success) p -= 0.15;
  }
  const r = ind.reg[m];
  p += (state.agencies[m] - 50) / 250;
  p += r?.bonus || 0;
  return clamp(p, 0.02, 0.98);
}

export function reviewMonthsFor(state, a, ind, m, usePRV = false) {
  const M = MKT[m];
  const D = DIS[ind.diseaseId];
  const res = evidenceFor(ind);
  const supplemental = approvedIn(a, m).length > 0;
  const priority = usePRV || ind.desig.breakthrough || (D.severity >= 4 && res && res.obs > socEff(state, ind.diseaseId) + 0.08);
  let months = priority ? M.priorityMonths : M.reviewMonths;
  if (ind.desig.fastTrack) months -= 2;
  if (supplemental) months -= 2;
  return { months: Math.max(5, months), priority, supplemental };
}

export function filingFee(state, a, ind, m) {
  const supplemental = approvedIn(a, m).length > 0;
  return MKT[m].filingFee * (ind.desig.orphan ? 0 : 1) * (supplemental ? 0.5 : 1);
}

export function needsBridging(state, ind, m) {
  return MKT[m].localData && !ind.localData[m] && !DIS[ind.diseaseId].orphan;
}

export function startReview(state, a, ind, m, { usePRV = false, accelerated = false } = {}) {
  const { months, priority, supplemental } = reviewMonthsFor(state, a, ind, m, usePRV);
  const fee = filingFee(state, a, ind, m);
  if (fee > 0) book(state, 'pd', -fee);
  if (accelerated) ind.accelerated = true;
  const total = months + randInt(state, -1, 1);
  ind.reg[m] = {
    status: needsBridging(state, ind, m) ? 'ponte' : 'revisao',
    submitted: state.month, decisionAt: state.month + total, months: total, priority, supplemental,
    boxed: false, conditional: !!accelerated, bonus: 0, advisoryDone: supplemental || m !== 'US', study: null,
    approvedAt: null,
  };
}

function needsBoxed(a) {
  return a.ses.some((s) => s.revealed && ((SE[s.id].severity >= 3 && s.freq >= 0.004) || SE[s.id].severity >= 4));
}

export function launchIfPossible(state, a, m) {
  const pm = a.markets[m];
  if (!pm || pm.launched != null || !approvedIn(a, m).length || !hasPresence(state, m)) return false;
  pm.launched = state.month;
  pm.launchPrice = pm.price;
  state.stats.launches = (state.stats.launches || 0) + 1;
  news(state, `${assetName(a)} é lançado em ${MKT[m].name} a US$ ${pm.price.toLocaleString('pt-BR')} por ${DIS[approvedIn(a, m)[0]].course === 1 ? 'tratamento' : 'mês'}.`, 'bom', { tab: 'produtos', id: a.id });
  return true;
}

function approve(state, a, ind, m) {
  const r = ind.reg[m];
  const D = DIS[ind.diseaseId];
  const M = MKT[m];
  r.status = 'aprovado';
  r.approvedAt = state.month;
  r.boxed = needsBoxed(a);
  if (r.boxed) a.boxed = true;
  if (a.ses.some((s) => s.revealed && SE[s.id].severity >= 4)) a.flags.rems = true;
  const firstForInd = ind.approvedAt == null;
  ind.approvedAt ??= state.month;
  if (!a.brand) a.brand = makeBrand(state);
  if (!a.markets[m]) a.markets[m] = newProductMarket(state, a, m);
  // Extensão de prazo de patente (PTE/CCP) na primeira aprovação em mercados que a concedem.
  if (M.pte) {
    const cp = a.patents.find((p) => p.kind === 'composto' && p.status === 'ativa');
    if (cp && !cp.extSet) {
      cp.extSet = true;
      const lost = state.month - (a.clinicalStart ?? state.month);
      const cap = state.month + 168 - (cp.filed + 240);
      cp.ext = clamp(Math.round(lost / 2), 0, Math.min(60, Math.max(0, cap)));
      if (cp.ext > 0) news(state, `Patente de ${assetName(a)} ganha ${cp.ext} meses de extensão de prazo pelo tempo perdido em desenvolvimento.`, 'bom', { tab: 'patentes' });
    }
  }
  if (firstForInd) {
    state.stats.approvals += 1;
    if (a.origin !== 'inicial') state.stats.newApprovals += 1;
    state.expertise[D.area] = Math.min(100, state.expertise[D.area] + 6);
    const impact = D.severity >= 4 && (a.eff[ind.diseaseId] ?? 0) > socEff(state, ind.diseaseId) + 0.1;
    state.reputation = clamp(state.reputation + (impact ? 2 : 0.5), 0, 100);
    state.achievements.aprovacao ??= state.month;
    if (D.orphan) state.achievements.orfa ??= state.month;
    if (a.modality === 'gene') state.achievements.cura ??= state.month;
    if (['tb', 'malaria'].includes(D.id)) state.achievements.saude_global ??= state.month;
    if (ind.diseaseId !== a.originDisease) state.achievements.reposicionamento ??= state.month;
  }
  if (D.prv && m === 'US' && !ind.prvAwarded) {
    ind.prvAwarded = true;
    state.prvs += 1;
    state.achievements.prv ??= state.month;
    news(state, `A FDA concede um voucher de revisão prioritária (PRV) pela aprovação em ${D.name.toLowerCase()}. Ele pode ser usado ou vendido por cerca de US$ 100 mi.`, 'bom', { tab: 'regulatorio' });
  }
  const label = r.boxed ? ' com advertência em tarja preta' : '';
  const cond = r.conditional ? ' (aprovação condicional — estudo confirmatório obrigatório)' : '';
  news(state, `${M.agency} aprova ${assetName(a)} para ${D.name.toLowerCase()}${label}${cond}.`, 'bom', { tab: 'regulatorio' });
  if (r.conditional && ind.confirmDeadline == null) ind.confirmDeadline = state.month + 18;
  if (!launchIfPossible(state, a, m) && !hasPresence(state, m)) {
    news(state, `${assetName(a)} está aprovado em ${M.name}, mas você não tem operação comercial lá. Abra uma subsidiária ou contrate um distribuidor.`, 'alerta', { tab: 'mercados' });
  }
  const global = Object.keys(MKT).every((mm) => approvedIn(a, mm).length > 0);
  if (global) state.achievements.global ??= state.month;
}

function decide(state, a, ind, m) {
  const r = ind.reg[m];
  const M = MKT[m];
  const D = DIS[ind.diseaseId];
  const p = approvalProbability(state, a, ind, m);
  if (chance(state, p)) {
    if (m === 'US' && r.advisoryVote) news(state, `Comitê consultivo da FDA votou ${r.advisoryVote} a favor de ${assetName(a)}.`, 'info');
    approve(state, a, ind, m);
    return;
  }
  const res = evidenceFor(ind);
  if (chance(state, res?.success ? 0.8 : 0.3)) {
    r.status = 'crl';
    news(state, `${M.agency} emite carta de resposta completa (CRL) para ${assetName(a)} em ${D.name.toLowerCase()}: exige dados adicionais.`, 'ruim', { tab: 'regulatorio' });
    queueEvent(state, 'crl', { assetId: a.id, diseaseId: ind.diseaseId, m });
  } else {
    r.status = 'rejeitado';
    news(state, `${M.agency} rejeita ${assetName(a)} para ${D.name.toLowerCase()}.`, 'ruim', { tab: 'regulatorio' });
  }
}

export function regulatoryTick(state) {
  for (const a of state.assets) {
    if (a.owner !== 'player') continue;
    for (const ind of Object.values(a.inds)) {
      for (const [m, r] of Object.entries(ind.reg)) {
        if (r.study) {
          book(state, 'pd', -r.study.monthly);
          r.study.monthsLeft -= 1;
          if (r.study.monthsLeft <= 0) {
            const kind = r.study.kind;
            r.study = null;
            if (kind === 'ponte') ind.localData[m] = true;
            if (kind === 'adicional') r.bonus = (r.bonus || 0) + 0.25;
            r.status = 'revisao';
            r.decisionAt = state.month + (kind === 'ponte' ? Math.ceil(MKT[m].reviewMonths / 2) : 6);
            news(state, `${kind === 'ponte' ? 'Estudo-ponte' : 'Estudo adicional'} de ${assetName(a)} concluído; dossiê reenviado à ${MKT[m].agency} (decisão em ${dateLabel(r.decisionAt)}).`, 'info', { tab: 'regulatorio' });
          }
          continue;
        }
        if (r.status !== 'revisao') continue;
        if (!r.advisoryDone && r.decisionAt - state.month <= 2) {
          r.advisoryDone = true;
          const p = approvalProbability(state, a, ind, m);
          if (p > 0.25 && p < 0.88) queueEvent(state, 'advisory', { assetId: a.id, diseaseId: ind.diseaseId, m });
        }
        if (state.month >= r.decisionAt) decide(state, a, ind, m);
      }
      // prazo para iniciar o estudo confirmatório de aprovações aceleradas
      const conditional = Object.values(ind.reg).some((r) => r.status === 'aprovado' && r.conditional);
      if (conditional && ind.confirmDeadline != null && state.month >= ind.confirmDeadline && ind.trial?.phase !== 'fase3' && !ind.results.fase3?.success) {
        for (const r of Object.values(ind.reg)) {
          if (r.status === 'aprovado' && r.conditional) r.status = 'retirado';
        }
        ind.confirmDeadline = null;
        state.reputation = clamp(state.reputation - 3, 0, 100);
        for (const k of Object.keys(state.agencies)) if (k === 'US' || k === 'EU') state.agencies[k] = clamp(state.agencies[k] - 8, 0, 100);
        news(state, `Prazo do estudo confirmatório de ${assetName(a)} expirou: as agências retiram a aprovação acelerada.`, 'ruim', { tab: 'regulatorio' });
      }
    }
    for (const m of Object.keys(a.markets)) launchIfPossible(state, a, m);
  }
  // relação com agências tende ao neutro
  for (const m of Object.keys(state.agencies)) {
    state.agencies[m] += (55 - state.agencies[m]) * 0.01;
  }
}

// Presença comercial: subsidiárias que ficam prontas e lançamentos pendentes.
export function presenceTick(state) {
  for (const [m, p] of Object.entries(state.presence)) {
    if (p.pending && state.month >= p.pending.at) {
      state.presence[m] = { type: p.pending.type, readyAt: null };
      news(state, `Subsidiária em ${MKT[m].name} assume a operação comercial no lugar do distribuidor.`, 'bom', { tab: 'mercados' });
    } else if (p.readyAt != null && p.readyAt === state.month) {
      news(state, `Subsidiária em ${MKT[m].name} pronta para operar.`, 'bom', { tab: 'mercados' });
    }
    if (hasPresence(state, m)) for (const a of state.assets) if (a.owner === 'player') launchIfPossible(state, a, m);
  }
}
