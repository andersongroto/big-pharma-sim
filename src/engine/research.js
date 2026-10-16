// Pesquisa básica: programas de descoberta em laboratórios próprios.
import { DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { TARGET_BY_ID as TGT } from '../data/targets.js';
import { MODALITIES } from '../data/modalities.js';
import { BUDGETS } from './model.js';
import { createAsset } from './assets.js';
import { book, chance, news } from './util.js';

export function programCost(state, p) {
  return BUDGETS[p.budget].cost * MODALITIES[TGT[p.targetId].modality].discovery * state.diff.costMult;
}

export function discoveryChance(state, p) {
  const D = DIS[p.diseaseId];
  const mod = MODALITIES[TGT[p.targetId].modality];
  const exp = state.expertise[D.area];
  return (0.04 * BUDGETS[p.budget].speed * (0.6 + exp / 100) * (1 - 0.5 * D.difficulty) * (1 + p.months / 24)) / mod.discovery;
}

export function researchTick(state) {
  for (const b of state.labsBuilding) {
    if (b.readyAt <= state.month) {
      state.labs += 1;
      news(state, 'Novo laboratório de pesquisa inaugurado: mais duas vagas para programas de descoberta.', 'bom', { tab: 'pesquisa' });
    }
  }
  state.labsBuilding = state.labsBuilding.filter((b) => b.readyAt > state.month);

  for (const p of [...state.programs]) {
    const D = DIS[p.diseaseId];
    const t = TGT[p.targetId];
    const cost = programCost(state, p);
    book(state, 'pd', -cost);
    p.spent = (p.spent || 0) + cost;
    const pr = discoveryChance(state, p);
    p.months += 1;
    state.expertise[D.area] = Math.min(100, state.expertise[D.area] + 0.12);
    if (chance(state, pr)) {
      const exp = state.expertise[D.area];
      const a = createAsset(state, {
        targetId: p.targetId, diseaseId: p.diseaseId,
        qualityBonus: BUDGETS[p.budget].q + (0.12 * exp) / 100,
      });
      state.assets.push(a);
      state.programs = state.programs.filter((x) => x.id !== p.id);
      state.achievements.descoberta ??= state.month;
      news(state, `Descoberta! O programa de ${D.name.toLowerCase()} identificou a molécula líder ${a.code} (${t.name}). Deposite a patente e inicie o pré-clínico.`, 'bom', { tab: 'pipeline', id: a.id });
    }
  }

  // Concorrentes podem patentear moléculas parecidas antes de você.
  for (const a of state.assets) {
    if (a.owner !== 'player' || a.patentBlocked) continue;
    if (!['lead', 'preclinico', 'pre_ok'].includes(a.stage)) continue;
    if (a.patents.some((p) => p.kind === 'composto')) continue;
    if (chance(state, 0.012)) {
      a.patentBlocked = true;
      news(state, `Um concorrente depositou antes uma patente que cobre ${a.code}. A molécula não poderá ter patente de composto — restará apenas a exclusividade regulatória.`, 'ruim', { tab: 'patentes', id: a.id });
    }
  }

  for (const k of Object.keys(state.expertise)) state.expertise[k] = Math.max(5, state.expertise[k] - 0.04);
}
