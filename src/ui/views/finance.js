import { PNL_KEYS } from '../../engine/util.js';
import { creditLimit, interestRate, trailing } from '../../engine/finance.js';
import { equityCooldown, maxEquity } from '../../engine/actions.js';
import { money, num, pct } from '../format.js';
import { section, table, stat, lineChart, btn } from '../components.js';

const LABELS = {
  receita: 'Receita de vendas', royalties: 'Royalties', outras: 'Outras receitas e despesas', cogs: 'Custo de produção',
  pd: 'Pesquisa e desenvolvimento', marketing: 'Marketing e vendas', sga: 'Despesas administrativas', producao: 'Fábricas',
  juridico: 'Jurídico', multas: 'Multas', juros: 'Juros', impostos: 'Impostos',
};

export function finance(state) {
  const h = state.history;
  const last = h[h.length - 1];
  const sumKey = (k, n) => h.slice(-n).reduce((s, x) => s + (x.ledger?.[k] || 0), 0);
  const rows = PNL_KEYS.map((k) => `<tr><td>${LABELS[k]}</td><td class="num">${money(last?.ledger?.[k] || 0)}</td><td class="num">${money(sumKey(k, 12))}</td></tr>`);
  rows.push(`<tr class="total"><td>Resultado líquido</td><td class="num">${money(last?.profit || 0, { sign: true })}</td><td class="num">${money(trailing(state, 'profit'), { sign: true })}</td></tr>`);
  const capex = sumKey('capex', 12);
  rows.push(`<tr class="muted"><td>Investimentos (laboratórios, fábricas, subsidiárias)</td><td class="num">${money(last?.ledger?.capex || 0)}</td><td class="num">${money(capex)}</td></tr>`);

  const limit = creditLimit(state);
  const cool = equityCooldown(state);
  const v = state.valuation || {};
  const hist = h.slice(-120);

  const financing = `<div class="fin-forms">
    <div class="fin-form">
      <h3>Dívida</h3>
      <p class="small muted">Limite de crédito ${money(limit)} · juros de ${pct(interestRate(state), 1)} ao ano. Se o caixa ficar negativo, a linha de crédito é usada automaticamente; sem limite, a empresa entra em insolvência e quebra em 3 meses.</p>
      <div class="inline-form"><label for="loanAmt">Valor (US$ mi)</label><input id="loanAmt" type="number" min="1" step="10" value="${Math.max(0, Math.min(100, Math.round(limit - state.debt)))}">
      ${btn('Tomar empréstimo', 'loan', {}, { kind: 'small', disabled: limit - state.debt < 1 })} ${btn('Amortizar', 'repay', {}, { kind: 'small ghost', disabled: state.debt <= 0 })}</div>
    </div>
    <div class="fin-form">
      <h3>Ações</h3>
      <p class="small muted">Oferta de até ${money(maxEquity(state))} (30% do valor de mercado), com desconto de 8% e diluição dos acionistas. ${cool ? `Próxima oferta possível em ${cool} meses.` : 'Disponível agora.'}</p>
      <div class="inline-form"><label for="eqAmt">Valor (US$ mi)</label><input id="eqAmt" type="number" min="1" step="10" value="${Math.min(maxEquity(state), 200)}">
      ${btn('Emitir ações', 'equity', {}, { kind: 'small', disabled: cool > 0 })} ${btn('Recomprar ações', 'buyback', {}, { kind: 'small ghost' })}</div>
    </div>
  </div>`;

  const valuation = `<dl class="valuation with-total">
    <dt>Produtos no mercado</dt><dd>${money(v.products || 0)}</dd>
    <dt>Pipeline (ajustado ao risco)</dt><dd>${money(v.pipeline || 0)}</dd>
    <dt>Fábricas</dt><dd>${money(v.factories || 0)}</dd>
    <dt>Caixa</dt><dd>${money(state.cash)}</dd>
    <dt>Dívida</dt><dd>${money(-state.debt)}</dd>
    <dt>Humor do mercado</dt><dd>${pct(state.sentiment)}</dd>
    <dt>Valor de mercado</dt><dd><b>${money(state.marketCap)}</b></dd>
  </dl>`;

  return `<div class="stats">
    ${stat('Caixa', money(state.cash), '', state.cash < 0 ? 'bad' : '')}
    ${stat('Dívida', money(state.debt), `Limite ${money(limit)}`)}
    ${stat('Valor de mercado', money(state.marketCap), `${num(state.shares, 0)} mi de ações`)}
    ${stat('Preço da ação', `US$ ${num(state.sharePrice, 2)}`)}
    ${stat('Prejuízo fiscal acumulado', money(state.taxLoss), `Alíquota ${pct(state.taxRate)}`)}
  </div>
  <div class="grid-2 wide-left">
    ${section('Demonstração de resultados', table(['', { label: 'Último mês', cls: 'num' }, { label: '12 meses', cls: 'num' }], rows, { cls: 'pnl' }))}
    ${section('Composição do valor', valuation)}
  </div>
  ${section('Captação de recursos', financing)}
  <div class="grid-2">
    ${section('Receita, P&D e resultado', lineChart([
    { name: 'Receita', values: hist.map((x) => x.revenue), area: true },
    { name: 'P&D', values: hist.map((x) => x.rd) },
    { name: 'Resultado', values: hist.map((x) => x.profit) },
  ]), { sub: 'Últimos 10 anos, por mês' })}
    ${section('Caixa e dívida', lineChart([
    { name: 'Caixa', values: hist.map((x) => x.cash), area: true },
    { name: 'Dívida', values: hist.map((x) => x.debt) },
  ]))}
  </div>`;
}
