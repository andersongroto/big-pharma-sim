// Concorrência: pipelines rivais, lançamentos, genéricos que elevam o tratamento padrão,
// biotechs que oferecem ativos e parceiros que pagam royalties.
import { DISEASES, DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { TARGETS, TARGET_BY_ID as TGT } from '../data/targets.js';
import { MODALITIES } from '../data/modalities.js';
import { RIVALS, BIOTECHS } from '../data/names.js';
import { targetsFor, assetName } from './model.js';
import { createAsset, newIndication, setPrior, makeBrand } from './assets.js';
import { evaluateTrial } from './clinical.js';
import { assetValue } from './finance.js';
import { clamp, rand, randRange, randInt, chance, pick, gauss, weightedPick, uid, news, book } from './util.js';

function rivalFor(state, D) {
  const fitting = RIVALS.filter((r) => r.areas.includes(D.area));
  return pick(state, fitting.length ? fitting : RIVALS);
}

function makeComp(state, D, stage, { launch = null, eta = null, eff = null } = {}) {
  const soc = state.diseases[D.id].soc;
  const rival = rivalFor(state, D);
  const tg = TARGETS.filter((t) => D.id in t.fits);
  const mod = tg.length ? MODALITIES[pick(state, tg).modality] : MODALITIES.pequena;
  return {
    id: uid(state, 'c'), company: rival.name, companyId: rival.id, name: makeBrand(state), diseaseId: D.id,
    eff: clamp(eff ?? soc + randRange(state, 0.03, 0.15), 0.05, 0.95),
    safety: randRange(state, 0.7, 0.9), conv: clamp(mod.conv + randRange(state, -0.1, 0.1), 0.3, 0.95),
    stage, launch, eta, exclUntil: launch != null ? launch + randInt(state, 110, 150) : null,
  };
}

export function seedCompetitors(state) {
  for (const D of DISEASES) {
    const big = D.patients > 3000;
    const n = D.orphan ? randInt(state, 0, 1) : randInt(state, big ? 1 : 0, big ? 3 : 2);
    for (let i = 0; i < n; i++) state.compDrugs.push(makeComp(state, D, 'mercado', { launch: -randInt(state, 6, 110) }));
    if (chance(state, 0.3)) state.compDrugs.push(makeComp(state, D, 'fase3', { eta: randInt(state, 6, 40) }));
  }
}

function playerCares(state, d) {
  return state.assets.some((a) => a.owner === 'player' && a.inds[d] && !['falhou', 'abandonada'].includes(a.inds[d].status));
}

export function competitorTick(state) {
  for (const r of RIVALS) {
    if (!chance(state, 0.08 * r.strength * state.diff.compRate)) continue;
    const options = DISEASES.filter((D) => r.areas.includes(D.area));
    const D = weightedPick(state, options, (x) => Math.sqrt(x.patients) * (1.2 - state.diseases[x.id].soc) * (x.orphan ? 2.5 : 1));
    if (!D) continue;
    const inPipe = state.compDrugs.filter((c) => c.diseaseId === D.id && c.stage !== 'mercado').length;
    const onMarket = state.compDrugs.filter((c) => c.diseaseId === D.id && c.stage === 'mercado').length;
    if (inPipe >= 2 || onMarket >= 4) continue;
    const soc = state.diseases[D.id].soc;
    const c = makeComp(state, D, 'fase3', { eta: state.month + randInt(state, 30, 48), eff: soc + Math.abs(gauss(state, 0.09, 0.06)) });
    state.compDrugs.push(c);
    news(state, `${c.company} inicia Fase III de ${c.name} para ${D.name.toLowerCase()}.`, 'concorrencia', { tab: 'mercados', d: D.id, important: playerCares(state, D.id) });
  }

  for (const c of [...state.compDrugs]) {
    const D = DIS[c.diseaseId];
    if (c.stage === 'fase3' && state.month >= c.eta) {
      if (chance(state, 0.65)) {
        c.stage = 'registro';
        c.eta = state.month + 12;
        news(state, `${c.company}: ${c.name} atinge o desfecho na Fase III em ${D.name.toLowerCase()}. Lançamento previsto em um ano.`, 'concorrencia', { tab: 'mercados', d: D.id, important: playerCares(state, D.id) });
      } else {
        state.compDrugs = state.compDrugs.filter((x) => x !== c);
        news(state, `${c.company} interrompe ${c.name} (${D.name.toLowerCase()}) após falha na Fase III.`, 'concorrencia', { tab: 'mercados', d: D.id });
      }
    } else if (c.stage === 'registro' && state.month >= c.eta) {
      c.stage = 'mercado';
      c.launch = state.month;
      c.exclUntil = state.month + randInt(state, 110, 150);
      news(state, `${c.company} lança ${c.name} para ${D.name.toLowerCase()} (eficácia ${(c.eff * 100).toFixed(0)}%).`, 'concorrencia', { tab: 'mercados', d: D.id, important: playerCares(state, D.id) });
    } else if (c.stage === 'mercado' && c.exclUntil != null && state.month >= c.exclUntil) {
      const ds = state.diseases[c.diseaseId];
      const before = ds.soc;
      ds.soc = Math.max(ds.soc, c.eff - 0.03);
      state.compDrugs = state.compDrugs.filter((x) => x !== c);
      if (ds.soc > before + 0.01) {
        news(state, `${c.name} (${c.company}) perde a patente: genéricos baratos elevam o tratamento padrão em ${D.name.toLowerCase()} para ${(ds.soc * 100).toFixed(0)}%.`, 'concorrencia', { tab: 'mercados', d: D.id, important: playerCares(state, D.id) });
      }
    }
  }

  if (state.month >= state.offersRefreshAt) refreshOffers(state);
  dealsTick(state);
}

// Biotechs oferecem ativos para licenciamento.
export function refreshOffers(state) {
  state.offers = [];
  const n = randInt(state, 2, 3);
  const pool = DISEASES.flatMap((D) => targetsFor(state, D.id).map((x) => ({ d: D.id, t: x.target.id })));
  for (let i = 0; i < n; i++) {
    const { d, t } = pick(state, pool);
    const biotech = pick(state, BIOTECHS);
    const prefix = biotech.replace(/[^A-Z]/g, '').slice(0, 2).padEnd(2, 'X') + 'B';
    const a = createAsset(state, { targetId: t, diseaseId: d, prefix, owner: 'biotech', qualityBonus: randRange(state, -0.1, 0.1) });
    a.origin = 'licenciado';
    a.created = state.month - randInt(state, 24, 60);
    a.patents.push({ id: uid(state, 'p'), kind: 'composto', filed: a.created + 3, ext: 0, strength: randRange(state, 0.6, 0.9), status: 'ativa', diseaseId: null });
    a.toxEst = clamp(a.tox + gauss(state, 0, 0.12), 0, 1);
    for (const [dd] of Object.entries(TGT[t].fits)) if (!TGT[t].hidden.includes(dd) || state.knownFits[t]?.[dd]) setPrior(state, a, dd);
    const roll = rand(state);
    if (roll < 0.4) {
      a.stage = 'pre_ok';
    } else {
      a.stage = 'clinico';
      a.clinicalStart = state.month - randInt(state, 12, 30);
      a.toxEst = clamp(a.tox + gauss(state, 0, 0.05), 0, 1);
      for (const se of a.ses) if (se.freq > 0.03 && chance(state, 0.8)) se.revealed = true;
      a.inds[d] = newIndication(state, d);
      if (roll > 0.72) {
        const n2 = Math.round(300 * DIS[d].trialSize);
        const r = evaluateTrial(state, a, d, n2, 'placebo', 'fase2');
        r.month = state.month - randInt(state, 1, 5);
        a.inds[d].results.fase2 = r;
        a.inds[d].status = 'fase2_ok';
      }
    }
    const value = assetValue(state, a);
    state.offers.push({ id: uid(state, 'o'), biotech, asset: a, price: Math.max(15, Math.round(value * randRange(state, 0.8, 1.3))), expires: state.month + 6 });
  }
  state.offersRefreshAt = state.month + 6;
}

// Acordos de licenciamento de saída: o parceiro desenvolve e paga royalties se tiver sucesso.
export function createDeal(state, a, partner, upfront, royalty, pos, peak, yearsToMarket) {
  const success = chance(state, pos);
  const outcomeAt = state.month + Math.max(6, Math.round(yearsToMarket * 12 * (success ? 1 : randRange(state, 0.3, 0.9))));
  state.deals.push({
    id: uid(state, 'deal'), assetName: assetName(a), disease: DIS[a.originDisease].name, partner, upfront, royalty,
    success, outcomeAt, launchAt: success ? outcomeAt : null, peak, endAt: success ? outcomeAt + 144 : null,
    announced: false, received: 0,
  });
}

function dealsTick(state) {
  for (const deal of state.deals) {
    if (!deal.announced && state.month >= deal.outcomeAt) {
      deal.announced = true;
      if (deal.success) news(state, `${deal.partner} obtém aprovação de ${deal.assetName}, licenciado por você. Royalties de ${(deal.royalty * 100).toFixed(0)}% começam a entrar.`, 'bom', { tab: 'financas' });
      else news(state, `${deal.partner} abandona ${deal.assetName}, que você havia licenciado. Não haverá royalties.`, 'ruim', { tab: 'financas' });
    }
    if (deal.success && state.month >= deal.launchAt && state.month < deal.endAt) {
      const t = state.month - deal.launchAt;
      const ramp = Math.min(1, t / 36) * (t > 120 ? 0.4 : 1);
      const amount = (deal.peak * ramp * deal.royalty) / 12;
      if (amount > 0) {
        book(state, 'royalties', amount);
        deal.received += amount;
      }
    }
  }
}

export function competitorSummary(state, d) {
  const list = state.compDrugs.filter((c) => c.diseaseId === d);
  return { market: list.filter((c) => c.stage === 'mercado'), pipeline: list.filter((c) => c.stage !== 'mercado'), best: Math.max(state.diseases[d].soc, ...list.filter((c) => c.stage === 'mercado').map((c) => c.eff)) };
}
