import { MARKETS } from '../../data/markets.js';
import { DISEASES, DISEASE_BY_ID as DIS, AREAS } from '../../data/diseases.js';
import { MODALITIES } from '../../data/modalities.js';
import { diseaseMarketSize, poolIn, playerProductsIn, assetName, targetsFor } from '../../engine/model.js';
import { money, esc, pct, date, compact, usd } from '../format.js';
import { section, table, chip, btn, empty } from '../components.js';
import { presenceLabel } from '../helpers.js';

function presencePanel(state) {
  const cards = MARKETS.map((M) => {
    const p = state.presence[M.id];
    const actions = [];
    if (p.type !== 'subsidiaria' && !p.pending) actions.push(btn(`Abrir subsidiária · ${money(M.subsidiary.setup)}`, 'presence', { m: M.id, type: 'subsidiaria' }, { kind: 'small', title: `Custo fixo de ${money(M.subsidiary.monthly)}/mês. Pronta em 6 meses.` }));
    if (p.type === 'nenhuma') actions.push(btn('Contratar distribuidor', 'presence', { m: M.id, type: 'distribuidor' }, { kind: 'small ghost', title: `O distribuidor fica com ${pct(M.distributorCut)} da receita e ajuda na promoção.` }));
    if (p.type !== 'nenhuma') actions.push(btn('Encerrar', 'confirmPresence', { m: M.id, type: 'nenhuma' }, { kind: 'small ghost danger' }));
    return `<div class="market-card">
      <div class="market-head"><span class="market-code mono">${M.short}</span><div><b>${M.name}</b><div class="muted small">${M.agency} · preços ${pct(M.priceIndex)} dos EUA</div></div></div>
      <div class="market-status">${chip(presenceLabel(state, M.id), p.type === 'subsidiaria' ? 'good' : p.type === 'distribuidor' ? 'accent' : '')}</div>
      <p class="small">${esc(M.note)}</p>
      <div class="market-actions">${actions.join(' ')}</div>
    </div>`;
  }).join('');
  return section('Operações comerciais', `<div class="market-grid">${cards}</div>`, { sub: 'Sem operação no país, um produto aprovado não pode ser vendido. Subsidiárias custam caro, mas ficam com toda a receita; distribuidores cobram comissão.' });
}

function diseaseDetail(state, d) {
  const D = DIS[d];
  const comps = state.compDrugs.filter((c) => c.diseaseId === d).sort((x, y) => (x.stage === 'mercado' ? 0 : 1) - (y.stage === 'mercado' ? 0 : 1));
  const rows = comps.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.company)}</td><td>${c.stage === 'mercado' ? chip('No mercado', 'accent') : chip(c.stage === 'registro' ? 'Em registro' : 'Fase III')}</td>
    <td class="num">${pct(c.eff)}</td><td>${c.stage === 'mercado' ? `Lançado em ${date(c.launch)}` : `Previsão: ${date(c.eta)}`}</td><td>${c.exclUntil ? `Genéricos em ${date(c.exclUntil)}` : '—'}</td></tr>`);
  const mine = playerProductsIn(state, d).map((a) => {
    const shares = MARKETS.filter((M) => a.markets[M.id]?.share[d] != null).map((M) => `${M.short} ${pct(a.markets[M.id].share[d], 1)}`).join(' · ');
    return `<li><b>${esc(assetName(a))}</b> — ${shares || 'ainda não lançado'}</li>`;
  }).join('');
  const regions = MARKETS.map((M) => `<td class="num">${compact(poolIn(state, d, M.id))}</td>`).join('');
  const ts = targetsFor(state, d).map((x) => `${esc(x.target.name)} (${MODALITIES[x.target.modality].name.toLowerCase()})`).join('; ');
  return section(esc(D.name), `
    <div class="kv-row">
      <div><span class="kv-label">Tratamento padrão</span><span class="kv-value">${pct(state.diseases[d].soc)} de eficácia</span></div>
      <div><span class="kv-label">Placebo</span><span class="kv-value">${pct(D.placebo)}</span></div>
      <div><span class="kv-label">Preço de referência (EUA)</span><span class="kv-value">${usd(D.refPrice)} ${D.course === 1 ? 'por tratamento' : D.course ? `por mês (${D.course} ${D.course === 1 ? 'mês' : 'meses'})` : 'por mês'}</span></div>
      <div><span class="kv-label">Gravidade</span><span class="kv-value">${'●'.repeat(D.severity)}${'○'.repeat(5 - D.severity)}</span></div>
    </div>
    <div class="table-wrap"><table><thead><tr>${MARKETS.map((M) => `<th class="num">${M.short}</th>`).join('')}</tr></thead><tbody><tr>${regions}</tr></tbody></table></div>
    <p class="small muted">${D.course ? 'Tratamentos por ano' : 'Pacientes em tratamento'} por mercado. Alvos conhecidos: ${ts || 'nenhum'}.</p>
    ${mine ? `<h3 class="h3">Seus produtos</h3><ul>${mine}</ul>` : ''}
    <h3 class="h3">Concorrência</h3>
    ${rows.length ? table(['Produto', 'Empresa', 'Estágio', { label: 'Eficácia', cls: 'num' }, 'Lançamento', 'Patente'], rows) : empty('Nenhum produto de marca concorrente. Só genéricos do tratamento padrão.')}
  `, { actions: btn('Fechar', 'disease', { d: '' }, { kind: 'small ghost' }) });
}

export function markets(state, ui) {
  const area = ui.marketArea || 'todas';
  const list = DISEASES.filter((D) => area === 'todas' || D.area === area);
  const rows = list.map((D) => {
    const comps = state.compDrugs.filter((c) => c.diseaseId === D.id);
    const onMarket = comps.filter((c) => c.stage === 'mercado');
    const best = Math.max(state.diseases[D.id].soc, ...onMarket.map((c) => c.eff));
    const mine = playerProductsIn(state, D.id);
    return `<tr class="${ui.disease === D.id ? 'selected' : ''}">
      <td><button type="button" class="linklike" data-act="disease" data-d="${D.id}">${esc(D.name)}</button><div class="muted small">${esc(AREAS[D.area].name)}${D.orphan ? ' · órfã' : ''}</div></td>
      <td class="num">${compact(D.patients * 1000)}</td>
      <td class="num">${money(diseaseMarketSize(state, D.id))}</td>
      <td class="num">${pct(state.diseases[D.id].soc)}</td>
      <td class="num">${onMarket.length} <span class="muted small">melhor ${pct(best)}</span></td>
      <td class="num">${comps.length - onMarket.length}</td>
      <td>${mine.map((a) => chip(assetName(a), 'accent')).join(' ')}</td>
    </tr>`;
  });
  const filters = `<div class="seg wrap" role="group" aria-label="Área">${[['todas', 'Todas'], ...Object.entries(AREAS).map(([k, v]) => [k, v.short])].map(([k, l]) => `<button type="button" class="${k === area ? 'on' : ''}" data-act="marketArea" data-area="${k}">${l}</button>`).join('')}</div>`;
  return `${presencePanel(state)}
  ${ui.disease ? diseaseDetail(state, ui.disease) : ''}
  ${section('Doenças e concorrência', `<div class="toolbar">${filters}</div>${table(['Doença', { label: 'Pacientes', cls: 'num' }, { label: 'Mercado potencial/ano', cls: 'num' }, { label: 'Padrão atual', cls: 'num' }, { label: 'Marcas no mercado', cls: 'num' }, { label: 'Em Fase III', cls: 'num' }, 'Seus produtos'], rows)}`, { sub: 'Mercado potencial = todos os pacientes tratados a preço de marca. Quando concorrentes perdem a patente, o tratamento padrão melhora e fica barato, e a barreira para novos produtos sobe.' })}`;
}
