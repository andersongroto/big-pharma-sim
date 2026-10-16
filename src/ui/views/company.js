import { ACHIEVEMENTS, OBJECTIVES, score, rankFor } from '../../engine/achievements.js';
import { SCENARIOS } from '../../engine/newGame.js';
import { MARKETS } from '../../data/markets.js';
import { money, num, compact, date, esc } from '../format.js';
import { section, meter, stat } from '../components.js';

export function company(state) {
  const sc = score(state);
  const ethicsRisk = state.ethics.coverups.filter((c) => !c.exposed).length * 3 + state.ethics.payForDelay.length + state.ethics.bribes * 2 + (state.assets.some((a) => a.owner === 'player' && a.flags.offLabel) ? 3 : 0);
  const riskLabel = ethicsRisk === 0 ? ['Baixo', 'good'] : ethicsRisk < 4 ? ['Moderado', 'warn'] : ['Alto', 'bad'];
  const ach = ACHIEVEMENTS.map((a) => {
    const got = state.achievements[a.id];
    return `<li class="${got != null ? 'got' : ''} ${a.id === 'vilao' ? 'villain' : ''}"><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>${got != null ? `<small class="mono">${date(got)}</small>` : ''}</li>`;
  }).join('');
  const parts = Object.entries(sc.parts).map(([k, v]) => `<dt>${{ valor: 'Valor de mercado', pacientes: 'Pacientes tratados', aprovacoes: 'Novas aprovações', reputacao: 'Reputação', conquistas: 'Conquistas', metas: 'Metas do cenário' }[k]}</dt><dd class="mono">${num(v)}</dd>`).join('');
  const done = state.objectivesDone || {};
  return `<div class="stats">
    ${stat('Reputação', `${num(state.reputation)}<small>/100</small>`, meter(state.reputation / 100, { tone: state.reputation < 35 ? 'bad' : state.reputation > 70 ? 'good' : '' }))}
    ${stat('Risco de compliance', riskLabel[0], 'Omissões, suborno, pay-for-delay e promoção off-label', riskLabel[1])}
    ${stat('Pacientes-ano tratados', compact(state.stats.patientYears))}
    ${stat('Anos de vida saudável gerados', compact(state.stats.qaly), 'Estimativa ajustada pela gravidade')}
    ${stat('Aprovações', num(state.stats.approvals), `${num(state.stats.newApprovals)} durante a sua gestão`)}
  </div>
  <div class="grid-2">
    ${section('Pontuação', `<div class="score-big"><span class="mono">${num(sc.total)}</span><span>${esc(rankFor(sc.total))}</span></div><dl class="valuation">${parts}</dl>`, { sub: `${esc(SCENARIOS[state.scenario].name)} · dificuldade ${esc(state.diff.label)}` })}
    ${section('Metas do cenário', `<ul class="objectives">${OBJECTIVES[state.scenario].map((o) => `<li class="${done[o.id] != null ? 'done' : ''}"><span class="check" aria-hidden="true">${done[o.id] != null ? '✓' : ''}</span><span>${esc(o.text)}</span></li>`).join('')}</ul>`)}
  </div>
  ${section('Relação com agências e governos', `<div class="expertise">${MARKETS.map((M) => `<div><span>${M.agency} (${M.short})</span>${meter(state.agencies[M.id] / 100)}<span class="mono">${num(state.agencies[M.id])}</span></div>`).join('')}</div>`)}
  ${section('Conquistas', `<ul class="achievements">${ach}</ul>`, { sub: `${Object.keys(state.achievements).length} de ${ACHIEVEMENTS.length}` })}
  <p class="muted small">Valor de mercado inicial ajustado: ${money(state.history[0]?.marketCap ?? state.marketCap)}.</p>`;
}
