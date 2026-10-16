// Fábricas: construção, qualidade (BPF/GMP), inspeções e incidentes.
import { PROD_TYPES } from '../data/modalities.js';
import { MARKET_BY_ID as MKT } from '../data/markets.js';
import { clamp, chance, randInt, book, news, pick } from './util.js';

export const factoryName = (f) => `${PROD_TYPES[f.type].name} #${f.id.replace(/\D/g, '')}`;

export function productionTick(state) {
  for (const f of state.factories) {
    if (f.readyAt === state.month) {
      news(state, `Fábrica de ${PROD_TYPES[f.type].name.toLowerCase()} entra em operação.`, 'bom', { tab: 'producao' });
      state.achievements.fabrica ??= state.month;
    }
    if (f.readyAt > state.month) continue;
    if (f.expansion && state.month >= f.expansion.at) {
      f.capacity += f.expansion.add;
      f.expansion = null;
      news(state, `Ampliação da ${factoryName(f)} concluída: capacidade +50%.`, 'bom', { tab: 'producao' });
    }
    if (f.qualityProgram) {
      f.quality = clamp(f.quality + 2.5, 0, 100);
      f.qualityProgram -= 1;
      if (f.qualityProgram <= 0) {
        f.qualityProgram = 0;
        if (f.warning && f.quality >= 60) {
          f.warning = false;
          news(state, `${factoryName(f)}: carta de advertência encerrada após a remediação.`, 'bom', { tab: 'producao' });
        }
      }
    } else {
      f.quality = clamp(f.quality - 0.25, 0, 100);
    }
    if (f.haltedUntil === state.month) news(state, `${factoryName(f)} retoma a produção.`, 'info', { tab: 'producao' });

    // inspeção de boas práticas de fabricação
    if (state.month - f.lastInspection >= 12 && chance(state, 0.06)) {
      f.lastInspection = state.month;
      const agency = MKT[pick(state, ['US', 'EU', 'JP'])].agency;
      if (f.quality < 35) {
        f.haltedUntil = state.month + 6;
        f.warning = true;
        for (const m of Object.keys(state.agencies)) state.agencies[m] = clamp(state.agencies[m] - 4, 0, 100);
        news(state, `Inspeção da ${agency} interdita a ${factoryName(f)} por 6 meses: falhas graves de boas práticas de fabricação.`, 'ruim', { tab: 'producao' });
      } else if (f.quality < 55) {
        f.warning = true;
        state.agencies.US = clamp(state.agencies.US - 3, 0, 100);
        news(state, `Inspeção da ${agency} emite carta de advertência à ${factoryName(f)}: produção reduzida à metade até a remediação.`, 'ruim', { tab: 'producao' });
      } else {
        state.agencies.US = clamp(state.agencies.US + 1, 0, 100);
        news(state, `${factoryName(f)} passa sem ressalvas na inspeção da ${agency}.`, 'info', { tab: 'producao' });
      }
    }

    // contaminação de lote
    if (f.quality < 60 && chance(state, (60 - f.quality) / 2500)) {
      book(state, 'producao', -20);
      state.reputation = clamp(state.reputation - 2, 0, 100);
      news(state, `Lote contaminado na ${factoryName(f)}: recolhimento de US$ 20 mi e dano à reputação.`, 'ruim', { tab: 'producao' });
    }
  }
}

export function factoryBuildCost(type) {
  return PROD_TYPES[type].build;
}

export function newFactory(state, type, id) {
  return { id, type, capacity: PROD_TYPES[type].capacity, quality: 75, readyAt: state.month + PROD_TYPES[type].months, haltedUntil: -1, warning: false, lastInspection: state.month + randInt(state, 0, 6), qualityProgram: 0 };
}
