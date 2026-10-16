import { OBJECTIVES, score, rankFor, GAME_LENGTH } from '../../engine/achievements.js';
import { assetName } from '../../engine/model.js';
import { money, num, compact, esc, date, pct } from '../format.js';
import { stat, section, lineChart, capsule, empty, meter } from '../components.js';
import { pendingActions, activeAssets, stageInfo } from '../helpers.js';
import { newsList } from './news.js';

export function overview(state) {
  const last = state.history[state.history.length - 1];
  const prev = state.history[state.history.length - 13];
  const capChange = prev ? state.marketCap / prev.marketCap - 1 : null;
  const tiles = `<div class="stats">
    ${stat('Caixa', money(state.cash), state.debt > 0 ? `Dívida ${money(state.debt)}` : 'Sem dívidas', state.cash < 0 ? 'bad' : '')}
    ${stat('Receita 12 meses', money(state.stats.rev12), last ? `Último mês ${money(last.revenue)}` : '')}
    ${stat('Resultado 12 meses', money(state.stats.profit12, { sign: true }), last ? `Último mês ${money(last.profit, { sign: true })}` : '', state.stats.profit12 < 0 ? 'bad' : 'good')}
    ${stat('Valor de mercado', money(state.marketCap), `${capChange != null ? `${capChange >= 0 ? '▲' : '▼'} ${pct(Math.abs(capChange))} em 12 meses · ` : ''}US$ ${num(state.sharePrice, 2)}/ação`)}
    ${stat('Pacientes por ano', compact(state.stats.patientsNow), `${compact(state.stats.patientYears)} pacientes-ano acumulados`)}
    ${stat('Reputação', `${num(state.reputation)}<small>/100</small>`, meter(state.reputation / 100, { tone: state.reputation < 35 ? 'bad' : state.reputation > 70 ? 'good' : '' }))}
  </div>`;

  const todos = pendingActions(state);
  const todoHtml = todos.length
    ? `<ul class="todo">${todos.slice(0, 10).map((t) => `<li class="${t.tone}"><span>${esc(t.text)}</span><button type="button" class="btn small ghost" data-act="tab" data-tab="${t.tab}" ${t.id ? `data-focus="${t.id}"` : ''}>Abrir</button></li>`).join('')}</ul>`
    : empty('Nada urgente. Bom momento para planejar a próxima aposta.');

  const done = state.objectivesDone || {};
  const objectives = `<ul class="objectives">${OBJECTIVES[state.scenario].map((o) => `<li class="${done[o.id] != null ? 'done' : ''}"><span class="check" aria-hidden="true">${done[o.id] != null ? '✓' : ''}</span><span>${esc(o.text)}${done[o.id] != null ? ` <small class="muted">— ${date(done[o.id])}</small>` : ''}</span></li>`).join('')}</ul>
    <div class="score-line"><span>Pontuação atual: <b class="mono">${num(score(state).total)}</b></span><span class="muted">${esc(rankFor(score(state).total))}</span><span class="muted">Mandato: ${date(state.month)} de ${date(GAME_LENGTH)}</span></div>`;

  const hist = state.history.slice(-72);
  const finChart = lineChart([
    { name: 'Receita', values: hist.map((h) => h.revenue), area: true },
    { name: 'Resultado', values: hist.map((h) => h.profit) },
  ], { height: 170 });
  const capChart = lineChart([{ name: 'Valor de mercado', values: hist.map((h) => h.marketCap), area: true }], { height: 120 });

  const assets = activeAssets(state).filter((a) => a.stage !== 'vendido');
  const pipe = assets.length
    ? `<ul class="mini-pipe">${assets.slice(0, 14).map((a) => {
      const st = stageInfo(a);
      return `<li><button type="button" class="linklike" data-act="tab" data-tab="${st.done >= 7 ? 'produtos' : 'pipeline'}" data-focus="${a.id}">${esc(assetName(a))}</button>${capsule(st.done, st.active, st.status)}</li>`;
    }).join('')}</ul>`
    : empty('Sem moléculas. Inicie programas de descoberta na aba Pesquisa.');

  return `${tiles}
  <div class="grid-2">
    ${section('Pendências', todoHtml, { sub: 'O que exige sua decisão agora' })}
    ${section('Metas do mandato', objectives)}
  </div>
  <div class="grid-2 wide-left">
    ${section('Receita e resultado mensal', finChart + capChart, { sub: 'Últimos 6 anos, em US$ por mês' })}
    ${section('Pipeline', pipe, { actions: `<button type="button" class="btn small ghost" data-act="tab" data-tab="pipeline">Ver tudo</button>` })}
  </div>
  ${section('Últimas notícias', newsList(state, state.news.slice(0, 12)), { actions: `<button type="button" class="btn small ghost" data-act="tab" data-tab="noticias">Arquivo</button>` })}`;
}
