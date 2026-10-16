// Simula partidas inteiras com o bot e imprime indicadores de balanceamento.
// Uso: node scripts/balance.mjs [cenario] [partidas] [meses]
import { newGame } from '../src/engine/newGame.js';
import { advanceMonth } from '../src/engine/sim.js';
import { score } from '../src/engine/achievements.js';
import { botTurn } from './bot.mjs';

const scenario = process.argv[2] || 'startup';
const runs = Number(process.argv[3] || 6);
const months = Number(process.argv[4] || 300);
const fmt = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}bi` : `${v.toFixed(0)}mi`);

const rows = [];
for (let i = 0; i < runs; i++) {
  const s = newGame({ companyName: 'Bot Pharma', scenario, seed: 1000 + i, focusArea: ['onco', 'cardio', 'imuno', 'neuro', 'raras', 'infecto'][i % 6] });
  const startRev = s.stats.initialRev12;
  let minCash = s.cash;
  const checkpoints = {};
  for (let m = 0; m < months && !s.gameOver; m++) {
    botTurn(s);
    advanceMonth(s);
    minCash = Math.min(minCash, s.cash);
    if ((m + 1) % 60 === 0) checkpoints[(m + 1) / 12] = `${fmt(s.stats.rev12)}/${fmt(s.marketCap)}`;
    for (const k of ['cash', 'marketCap', 'debt', 'reputation']) {
      if (!Number.isFinite(s[k])) throw new Error(`${k} inválido no mês ${s.month}`);
    }
  }
  const approved = s.assets.filter((a) => Object.values(a.inds).some((ind) => ind.approvedAt != null && a.origin !== 'inicial')).length;
  const failed = s.assets.filter((a) => a.stage === 'falhou').length;
  rows.push({
    seed: 1000 + i, fim: s.gameOver?.reason || `mês ${s.month}`, receitaIni: fmt(startRev), receita12: fmt(s.stats.rev12),
    valor: fmt(s.marketCap), caixaMin: fmt(minCash), divida: fmt(s.debt), aprovs: s.stats.newApprovals, ativosAprov: approved, falhas: failed,
    rep: s.reputation.toFixed(0), pontos: score(s).total, ...checkpoints,
  });
}
console.table(rows);
