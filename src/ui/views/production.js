import { PROD_TYPES, CMO_MARKUP, CMO_LIMIT } from '../../data/modalities.js';
import { factoryName } from '../../engine/production.js';
import { money, compact, date, pct, num } from '../format.js';
import { section, table, chip, btn, meter, empty } from '../components.js';

export function production(state) {
  const rep = state.production || {};
  const capRows = Object.entries(PROD_TYPES).map(([type, T]) => {
    const r = rep[type] || { demand: 0, capacity: 0, own: 0, cmo: 0, lost: 0 };
    const own = state.factories.filter((f) => f.type === type && f.readyAt <= state.month).reduce((s, f) => s + f.capacity, 0);
    const use = r.capacity > 0 ? Math.min(1, r.own / r.capacity) : 0;
    return `<tr><td><b>${T.name}</b><div class="muted small">${T.unit}/mês</div></td>
      <td class="num">${compact(r.demand)}</td><td class="num">${compact(own)}</td>
      <td>${meter(use, { tone: use > 0.95 ? 'warn' : 'accent' })} <span class="small mono">${pct(use)}</span></td>
      <td class="num">${compact(r.cmo)}${Number.isFinite(CMO_LIMIT[type]) ? ` <span class="muted small">máx. ${CMO_LIMIT[type]}</span>` : ''}</td>
      <td class="num ${r.lost > 0 ? 'bad-text' : ''}">${compact(r.lost)}</td></tr>`;
  });

  const facRows = state.factories.map((f) => {
    const T = PROD_TYPES[f.type];
    let status;
    if (f.readyAt > state.month) status = chip(`Em obras até ${date(f.readyAt)}`);
    else if (f.haltedUntil > state.month) status = chip(`Interditada até ${date(f.haltedUntil)}`, 'bad');
    else if (f.warning) status = chip('Carta de advertência', 'warn');
    else status = chip('Operando', 'good');
    const ready = f.readyAt <= state.month;
    return `<tr><td><b>${factoryName(f)}</b></td><td class="num">${compact(f.capacity)}${f.expansion ? ` <span class="muted small">(+50% em ${date(f.expansion.at)})</span>` : ''}</td><td>${status}</td>
      <td>${meter(f.quality / 100, { tone: f.quality < 55 ? 'bad' : f.quality < 70 ? 'warn' : 'good' })} <span class="small mono">${num(f.quality)}</span>${f.qualityProgram ? ' <span class="muted small">programa em andamento</span>' : ''}</td>
      <td class="num">${money(T.opex * (f.capacity / T.capacity))}/mês</td>
      <td class="actions">${ready ? `${btn('Programa de qualidade · US$ 15 mi', 'quality', { id: f.id }, { kind: 'small ghost', disabled: !!f.qualityProgram })} ${btn(`Ampliar · ${money(T.build * 0.4 * state.diff.costMult)}`, 'expand', { id: f.id }, { kind: 'small ghost', disabled: !!f.expansion })}` : ''} ${btn('Vender', 'confirmSellFactory', { id: f.id }, { kind: 'small ghost danger' })}</td></tr>`;
  });

  const build = Object.entries(PROD_TYPES).map(([type, T]) => `<div class="build-card">
    <h3>${T.name}</h3>
    <dl><dt>Investimento</dt><dd>${money(T.build * state.diff.costMult)}</dd><dt>Prazo</dt><dd>${T.months} meses</dd><dt>Capacidade</dt><dd>${compact(T.capacity)} ${T.unit}/mês</dd><dt>Custo fixo</dt><dd>${money(T.opex)}/mês</dd></dl>
    ${btn('Construir', 'buildFactory', { type }, { kind: 'small' })}
  </div>`).join('');

  return `${section('Capacidade e demanda', table(['Tipo', { label: 'Demanda', cls: 'num' }, { label: 'Capacidade própria', cls: 'num' }, 'Uso', { label: 'Terceirizado', cls: 'num' }, { label: 'Perdido', cls: 'num' }], capRows), { sub: `O que suas fábricas não produzem vai para fabricantes terceirizados (CMOs), a um custo ${CMO_MARKUP}× maior. Sem CMO habilitado no produto, a demanda excedente é perdida.` })}
  ${section('Fábricas', facRows.length ? table(['Fábrica', { label: 'Capacidade', cls: 'num' }, 'Situação', 'Qualidade (BPF)', { label: 'Custo fixo', cls: 'num' }, ''], facRows) : empty('Nenhuma fábrica própria. Toda a produção é terceirizada.'), { sub: 'Inspeções das agências verificam as boas práticas de fabricação. Qualidade baixa leva a cartas de advertência, interdições e lotes contaminados.' })}
  ${section('Construir fábrica', `<div class="build-grid">${build}</div>`)}`;
}
