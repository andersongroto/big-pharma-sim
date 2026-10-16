import { MARKETS, MARKET_BY_ID as MKT } from '../../data/markets.js';
import { DISEASE_BY_ID as DIS } from '../../data/diseases.js';
import { TARGET_BY_ID as TGT } from '../../data/targets.js';
import { MODALITIES, CMO_MARKUP } from '../../data/modalities.js';
import { assetName, approvedIn, suggestedPrice, marketingScale, exclusivity, priceCeiling, valuePrice, labelEff, headToHead } from '../../engine/model.js';
import { hasPresence } from '../../engine/regulatory.js';
import { erosion } from '../../engine/market.js';
import { money, esc, pct, date, usd, compact } from '../format.js';
import { section, table, meter, chip, btn, empty, sparkline } from '../components.js';
import { marketedAssets, seChips, presenceLabel } from '../helpers.js';

function toggle(a, flag, label, hint, danger = false) {
  const on = !!a.flags[flag];
  return `<label class="toggle ${danger ? 'danger' : ''}" title="${esc(hint)}"><input type="checkbox" data-act="toggleFlag" data-id="${a.id}" data-flag="${flag}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
}

function marketRow(state, a, m) {
  const M = MKT[m];
  const pm = a.markets[m];
  const ds = approvedIn(a, m);
  const sugg = suggestedPrice(state, a, m);
  const ex = exclusivity(state, a, m);
  const unit = DIS[ds[0] || a.originDisease].course === 1 ? 'trat.' : 'mês';
  let status;
  if (a.flags.withdrawn) status = chip('Retirado', 'bad');
  else if (a.flags.recalledUntil > state.month) status = chip(`Recolhido até ${date(a.flags.recalledUntil)}`, 'bad');
  else if (pm.launched == null) status = hasPresence(state, m) ? chip('Aguardando lançamento') : chip('Sem operação comercial', 'warn');
  else if (!hasPresence(state, m)) status = chip('Operação encerrada', 'bad');
  else if (pm.compulsorySince != null) status = chip('Licença compulsória', 'bad');
  else if (pm.genericSince != null) status = chip(`Genéricos desde ${date(pm.genericSince)}`, 'warn');
  else status = chip(`Exclusivo até ${date(ex.end)}`, ex.end - state.month < 36 ? 'warn' : 'good');
  const shares = ds.map((d) => {
    const ero = erosion(state, a, pm, d, m);
    const s = (pm.share[d] || 0) * (1 - ero);
    return `<div class="small"><span class="muted">${esc(DIS[d].name.split(' (')[0])}:</span> <b>${pct(s, s < 0.1 ? 1 : 0)}</b> <span class="muted">acesso ${pct(pm.access[d] ?? 0)}</span></div>`;
  }).join('');
  const off = Object.entries(pm.offShare || {}).filter(([, s]) => s > 0.0005).map(([d, s]) => `<div class="small bad-text">Off-label ${esc(DIS[d].name.split(' (')[0])}: ${pct(s, 1)}</div>`).join('');
  const patients = Object.values(pm.patients || {}).reduce((s, x) => s + x, 0);
  const scale = marketingScale(state, a, m);
  const vp = ds.length ? valuePrice(state, labelEff(state, a, ds[0]), ds[0], m, headToHead(a, ds[0])) : sugg;
  const ceil = priceCeiling(state, a, m);
  const margin = pm.units > 0 ? pm.rev - (pm.units * a.cogs) / 1e6 - pm.marketing : null;
  return `<tr>
    <td><b>${M.name}</b><div class="muted small">${presenceLabel(state, m)}</div></td>
    <td>${status}</td>
    <td><div class="price-cell"><span class="muted">US$</span><input type="number" min="1" step="1" value="${Math.round(pm.price)}" data-change="price" data-id="${a.id}" data-m="${m}" aria-label="Preço em ${M.name}"><span class="muted small">/${unit}</span></div>
      <div class="muted small">Justo pelo valor: ${usd(vp)}${Number.isFinite(ceil) ? ` · teto CMED ${usd(ceil)}` : ''}</div>
      ${m === 'US' && pm.ira < 1 ? chip(`Medicare −${Math.round((1 - pm.ira) * 100)}%`, 'warn') : ''}</td>
    <td>${shares}${off}<div class="small muted">${compact(patients)} pacientes/ano</div></td>
    <td class="num"><b>${money(pm.rev)}</b><div class="small ${margin == null ? 'muted' : margin >= 0 ? 'good-text' : 'bad-text'}">${margin == null ? '—' : `margem ${money(margin, { sign: true })}`}</div></td>
    <td><div class="price-cell"><span class="muted">US$</span><input type="number" min="0" step="0.5" value="${pm.marketing}" data-change="marketing" data-id="${a.id}" data-m="${m}" aria-label="Marketing mensal em ${M.name} (US$ mi)"><span class="muted small">mi/mês</span></div>
      <div class="muted small">Referência: ${money(scale)}</div></td>
    <td>${meter(pm.awareness, { tone: 'accent', label: 'Conhecimento entre médicos' })}<div class="muted small">${pct(pm.awareness)}</div></td>
    <td>${pm.genericSince != null && !pm.authGeneric ? btn('Genérico autorizado', 'authGeneric', { id: a.id, m }, { kind: 'small ghost', title: 'Venda sua própria versão genérica e capture parte do volume perdido' }) : pm.authGeneric ? chip('Genérico próprio', 'accent') : ''}</td>
  </tr>`;
}

function productCard(state, a, focus) {
  const t = TGT[a.targetId];
  const mod = MODALITIES[a.modality];
  const annual = a.revHist.slice(-12).reduce((s, x) => s + x, 0);
  const marketsList = MARKETS.filter((M) => a.markets[M.id]).map((M) => M.id);
  const inds = [...new Set(MARKETS.flatMap((M) => approvedIn(a, M.id)))];
  const flags = [
    toggle(a, 'cmo', 'Usar fabricante terceirizado (CMO)', `Cobre falta de capacidade própria, a um custo ${CMO_MARKUP}× maior.`),
    toggle(a, 'pap', 'Programa de assistência ao paciente', 'Custa 3% da receita; melhora a reputação e reduz pressão política sobre preços.'),
    a.markets.US ? toggle(a, 'dtc', 'Propaganda na TV (EUA)', 'Aumenta o marketing nos EUA em 50% e acelera o conhecimento da marca.') : '',
    toggle(a, 'offLabel', 'Promover usos não aprovados', 'Ilegal. Gera vendas em indicações não aprovadas, com alto risco de multas pesadas.', true),
  ].join('');
  const projects = [];
  if (!a.flags.formulation) projects.push(btn('Nova formulação de liberação prolongada · US$ 25 mi', 'startFormulation', { id: a.id }, { kind: 'small ghost', title: 'Mais conveniência e uma patente nova (fraca). Críticos chamam de evergreening.' }));
  else if (typeof a.flags.formulation === 'object') projects.push(`<span class="muted small">Nova formulação: ${a.flags.formulation.monthsLeft} meses</span>`);
  if (approvedIn(a, 'US').length) {
    if (!a.flags.pediatric) projects.push(btn('Estudo pediátrico (+6 meses de exclusividade nos EUA)', 'startPediatric', { id: a.id }, { kind: 'small ghost' }));
    else if (typeof a.flags.pediatric === 'object') projects.push(`<span class="muted small">Estudo pediátrico: ${a.flags.pediatric.monthsLeft} meses</span>`);
  }
  projects.push(btn('Novas indicações', 'tab', { tab: 'pipeline', focus: a.id }, { kind: 'small ghost' }));
  projects.push(btn('Vender produto', 'confirmSell', { id: a.id }, { kind: 'small ghost' }));
  return `<article class="product-card ${focus ? 'focus' : ''}" id="asset-${a.id}">
    <header class="asset-head">
      <div class="asset-title"><span class="code mono">${esc(a.code)}</span><h3>${esc(assetName(a))}</h3>${chip(mod.name)} ${a.boxed ? chip('Tarja preta', 'bad') : ''} ${a.flags.rems ? chip('Plano de gestão de riscos', 'warn') : ''}</div>
      <div class="asset-stage">${sparkline(a.revHist.slice(-36))}</div>
      <div class="asset-value"><span class="kv-label">Vendas 12 meses</span><b class="mono">${money(annual)}</b><span class="muted small">pico ${money(a.peakAnnual)}</span></div>
    </header>
    <div class="asset-facts">
      <div><span class="kv-label">Mecanismo</span>${esc(t.name)}</div>
      <div><span class="kv-label">Indicações aprovadas</span>${inds.map((d) => esc(DIS[d].name)).join(', ') || '—'}</div>
      <div><span class="kv-label">Custo de produção</span>${usd(a.cogs)} por unidade</div>
    </div>
    <div class="asset-ses"><span class="kv-label">Bula: efeitos conhecidos</span> ${seChips(a)}</div>
    ${table(['Mercado', 'Situação', 'Preço', 'Participação', { label: 'Receita/mês', cls: 'num' }, 'Marketing', 'Conhecimento', ''], marketsList.map((m) => marketRow(state, a, m)), { cls: 'markets' })}
    <div class="flags">${flags}</div>
    <footer class="asset-foot">${projects.join(' ')}</footer>
  </article>`;
}

export function products(state, ui) {
  const list = marketedAssets(state);
  if (!list.length) return section('Produtos', empty('Nenhum produto aprovado ainda. Leve uma molécula até o registro e conquiste a aprovação das agências.'));
  list.sort((x, y) => y.revHist.slice(-1)[0] - x.revHist.slice(-1)[0] || 0);
  const intro = `<p class="intro">Defina preço e marketing em cada mercado. Preço acima do valor clínico reduz o acesso (planos e sistemas públicos deixam de cobrir) e, em doenças graves, gera pressão política e risco de licença compulsória. A margem mostrada desconta produção e marketing.</p>`;
  return intro + list.map((a) => productCard(state, a, ui.focus === a.id)).join('');
}
