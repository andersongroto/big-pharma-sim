import { esc, date } from '../format.js';
import { empty } from '../components.js';

const KIND = { bom: 'Boa notícia', ruim: 'Má notícia', alerta: 'Alerta', info: 'Informação', concorrencia: 'Concorrência' };

export function newsList(state, items) {
  if (!items.length) return empty('Nenhuma notícia por enquanto.');
  return `<ul class="news">${items.map((n) => `<li class="k-${n.kind}">
    <span class="news-date mono">${date(n.month)}</span>
    <span class="news-kind" title="${KIND[n.kind] || ''}"></span>
    <span class="news-text">${esc(n.text)}</span>
    ${n.ref?.tab ? `<button type="button" class="btn small ghost" data-act="tab" data-tab="${n.ref.tab}" ${n.ref.id ? `data-focus="${esc(n.ref.id)}"` : ''} ${n.ref.d ? `data-disease="${esc(n.ref.d)}"` : ''}>Ver</button>` : '<span></span>'}
  </li>`).join('')}</ul>`;
}

export function newsView(state, ui) {
  const filter = ui.newsFilter || 'todas';
  const filters = [['todas', 'Todas'], ['bom', 'Boas'], ['ruim', 'Ruins'], ['alerta', 'Alertas'], ['concorrencia', 'Concorrência'], ['info', 'Informações']];
  const items = state.news.filter((n) => filter === 'todas' || n.kind === filter);
  return `<section class="panel">
    <header class="panel-head"><div><h2>Notícias</h2><p class="panel-sub">Tudo o que aconteceu com a empresa e o setor</p></div>
    <div class="seg" role="group" aria-label="Filtro">${filters.map(([k, l]) => `<button type="button" class="${k === filter ? 'on' : ''}" data-act="newsFilter" data-filter="${k}">${l}</button>`).join('')}</div></header>
    <div class="panel-body">${newsList(state, items.slice(0, 200))}</div>
  </section>`;
}
