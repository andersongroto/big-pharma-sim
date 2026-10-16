// Laço principal: avança a simulação em um mês.
import { researchTick } from './research.js';
import { clinicalTick } from './clinical.js';
import { regulatoryTick, presenceTick } from './regulatory.js';
import { marketTick } from './market.js';
import { ipTick } from './ip.js';
import { competitorTick } from './competitors.js';
import { productionTick } from './production.js';
import { financeTick } from './finance.js';
import { eventsTick } from './events.js';
import { checkAchievements, GAME_LENGTH } from './achievements.js';
import { clamp, news, dateLabel } from './util.js';

export function canAdvance(state) {
  return !state.gameOver && state.events.length === 0;
}

export function advanceMonth(state) {
  if (!canAdvance(state)) return null;
  state.month += 1;
  state.monthNews = [];
  const cashBefore = state.cash;

  presenceTick(state);
  researchTick(state);
  clinicalTick(state);
  regulatoryTick(state);
  productionTick(state);
  marketTick(state);
  ipTick(state);
  competitorTick(state);
  eventsTick(state);

  // reputação tende lentamente ao neutro
  state.reputation = clamp(state.reputation + (50 - state.reputation) * 0.004, 0, 100);

  financeTick(state);
  checkAchievements(state);

  if (state.month === GAME_LENGTH && !state.gameOver) {
    news(state, `Fim do mandato de 25 anos (${dateLabel(state.month)}). Veja o balanço final — você pode continuar jogando.`, 'info');
  }

  const last = state.history[state.history.length - 1];
  state.lastReport = {
    month: state.month,
    revenue: last?.revenue ?? 0,
    profit: last?.profit ?? 0,
    cashDelta: state.cash - cashBefore,
    news: state.monthNews.slice(),
  };
  return state.lastReport;
}
