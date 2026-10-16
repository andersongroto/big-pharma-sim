// Jogador automático simples, usado nos testes e no balanceamento.
import { DISEASES } from '../src/data/diseases.js';
import { MARKET_IDS } from '../src/data/markets.js';
import { MODALITIES } from '../src/data/modalities.js';
import * as A from '../src/engine/actions.js';
import { describeEvent } from '../src/engine/events.js';
import { targetsFor, diseaseMarketSize, trialPlan, approvedIn } from '../src/engine/model.js';
import { canAccelerate } from '../src/engine/regulatory.js';
import { creditLimit } from '../src/engine/finance.js';

let botSeed = 1;
const botRand = () => {
  botSeed = (botSeed * 1103515245 + 12345) % 2147483648;
  return botSeed / 2147483648;
};

export function botTurn(state, { ethical = true } = {}) {
  if (state.month === 0 && !state._botSeeded) {
    botSeed = state.seed % 2147483647 || 1;
    state._botSeeded = true;
  }
  // decisões pendentes
  while (state.events.length) {
    const ev = state.events[0];
    const desc = describeEvent(state, ev);
    let idx = 0;
    if (ev.type === 'acquisition_offer') idx = 1;
    if (ev.type === 'license_offer') idx = state.cash < 100 ? 0 : 1;
    if (ethical) {
      while (desc.options[idx]?.unethical) idx++;
    } else {
      const bad = desc.options.findIndex((o) => o.unethical);
      if (bad >= 0) idx = bad;
    }
    if (idx >= desc.options.length) idx = 0;
    A.resolveEvent(state, ev.id, idx);
  }

  const reserve = 40;
  const comfort = 150;
  // financiamento
  const last = state.history[state.history.length - 1];
  const burn = last ? Math.max(0, -(last.profit)) : 0;
  if (state.cash < comfort + burn * 6) {
    if (A.equityCooldown(state) === 0) A.issueEquity(state, Math.min(A.maxEquity(state), Math.max(400, burn * 12)));
    const room = creditLimit(state) - state.debt;
    if (state.cash < comfort && room > 10) A.takeLoan(state, Math.min(room, comfort));
  }

  // pesquisa
  while (state.programs.length < A.labSlots(state) && state.cash > reserve * 2) {
    const options = DISEASES.flatMap((D) => targetsFor(state, D.id).map((x) => ({ d: D.id, t: x.target.id, score: diseaseMarketSize(state, D.id) * x.fit * (1.1 - state.diseases[D.id].soc) })))
      .filter((o) => !state.programs.some((p) => p.diseaseId === o.d && p.targetId === o.t))
      .sort((x, y) => y.score - x.score)
      .slice(0, 8);
    if (!options.length) break;
    const o = options[Math.floor(botRand() * options.length)];
    if (!A.startProgram(state, { diseaseId: o.d, targetId: o.t, budget: 'medio' }).ok) break;
  }

  for (const a of state.assets) {
    if (a.owner !== 'player') continue;
    if (a.stage === 'lead') {
      A.filePatent(state, a.id);
      if (state.cash > reserve) A.startPreclinical(state, a.id);
    }
    if (a.stage === 'pre_ok' && state.cash > reserve) A.startPhase1(state, a.id, { regions: ['US'] });
    if (a.stage !== 'clinico') continue;
    for (const ind of Object.values(a.inds)) {
      const d = ind.diseaseId;
      if (ind.status === 'planejada' && !ind.trial) {
        const plan = trialPlan(state, a, d, 'fase2', { regions: ['US', 'EU'] });
        if (state.cash > plan.cost * 0.5 + reserve) A.startTrial(state, a.id, d, 'fase2', { regions: ['US', 'EU'] });
      }
      if (ind.status === 'fase2_ok' && !ind.trial && !ind.failedFase3) {
        const verdict = ind.results.fase2?.verdict;
        if (verdict === 'negativo') {
          A.abandonIndication(state, a.id, d);
          continue;
        }
        if (verdict === 'positivo') {
          for (const t of ['orphan', 'breakthrough', 'fastTrack']) if (A.designationStatus(state, a, ind, t).available) A.applyDesignation(state, a.id, d, t);
          for (const m of ['US', 'EU']) if (canAccelerate(state, a, ind, m) && !ind.reg[m]) A.submit(state, a.id, d, m);
        }
        const cfg = { regions: ['US', 'EU', 'JP', 'CN'], size: 'padrao' };
        const plan = trialPlan(state, a, d, 'fase3', cfg);
        if (state.cash > plan.cost * 0.4 + reserve) A.startTrial(state, a.id, d, 'fase3', cfg);
      }
      if (ind.status === 'fase2_ok' && ind.failedFase3) A.abandonIndication(state, a.id, d);
      if (ind.status === 'registro') {
        for (const m of MARKET_IDS) {
          if (!ind.reg[m]) A.submit(state, a.id, d, m, { usePRV: m === 'US' && state.prvs > 0 });
          else if (ind.reg[m].status === 'ponte' && !ind.reg[m].study) A.startBridging(state, a.id, d, m);
        }
      }
    }
  }

  // presença comercial onde há aprovação
  for (const m of MARKET_IDS) {
    const approved = state.assets.some((a) => a.owner === 'player' && approvedIn(a, m).length);
    const p = state.presence[m];
    if (approved && p.type === 'nenhuma') A.setPresence(state, m, 'distribuidor');
    const rev = state.assets.reduce((s, a) => s + (a.markets[m]?.rev || 0), 0);
    if (p.type === 'distribuidor' && !p.pending && rev * 12 > 300 && state.cash > 200) A.setPresence(state, m, 'subsidiaria');
  }

  // capacidade de produção
  for (const [type, r] of Object.entries(state.production || {})) {
    const building = state.factories.some((f) => f.type === type && f.readyAt > state.month);
    if (!building && r.demand > r.capacity * 1.2 && r.cmo + r.lost > 0 && state.cash > 800) A.buildFactory(state, type);
  }
  void MODALITIES;
}
