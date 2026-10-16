// Descoberta de novas indicações para um alvo (reposicionamento).
import { DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { TARGET_BY_ID as TGT } from '../data/targets.js';
import { setPrior } from './assets.js';
import { news } from './util.js';

export function revealFit(state, targetId, d, how) {
  if (!TGT[targetId]?.fits[d]) return false;
  state.knownFits[targetId] ||= {};
  if (state.knownFits[targetId][d]) return false;
  state.knownFits[targetId][d] = true;
  for (const a of state.assets) {
    if (a.targetId === targetId && a.owner === 'player' && a.toxEst != null && !a.prior[d]) setPrior(state, a, d, 0.18);
  }
  if (how === 'serendipidade') state.achievements.serendipidade ??= state.month;
  news(state, `Nova indicação possível: ${TGT[targetId].name} pode tratar ${DIS[d].name.toLowerCase()} (${how}).`, 'bom', { tab: 'pipeline' });
  return true;
}
