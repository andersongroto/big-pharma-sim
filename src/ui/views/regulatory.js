import { MARKETS, MARKET_BY_ID as MKT } from '../../data/markets.js';
import { DISEASE_BY_ID as DIS } from '../../data/diseases.js';
import { assetName, REG_STATUS, trialPlan } from '../../engine/model.js';
import { approvalProbability } from '../../engine/regulatory.js';
import { money, esc, pct, date, months, num } from '../format.js';
import { section, table, meter, chip, btn, empty } from '../components.js';
import { playerAssets } from '../helpers.js';

export function regulatory(state) {
  const agencyRows = MARKETS.map((M) => `<tr>
    <td><b>${M.agency}</b><div class="muted small">${esc(M.agencyName)}</div></td>
    <td>${esc(M.name)}</td>
    <td>${meter(state.agencies[M.id] / 100, { tone: state.agencies[M.id] < 40 ? 'bad' : state.agencies[M.id] > 65 ? 'good' : '' })} <span class="mono small">${num(state.agencies[M.id])}</span></td>
    <td class="num">${M.reviewMonths} / ${M.priorityMonths} meses</td>
    <td>${M.strictness >= 0.65 ? 'Alto' : M.strictness >= 0.55 ? 'Médio' : 'Baixo'}</td>
    <td>${M.localData ? chip('Exige', 'warn') : 'Não'}</td>
    <td class="num">${M.dataExcl.small ? `${M.dataExcl.small / 12} / ${M.dataExcl.bio / 12} anos` : 'Nenhuma'}</td>
  </tr>`);

  const processes = [];
  const ready = [];
  const approvals = [];
  for (const a of playerAssets(state)) {
    for (const ind of Object.values(a.inds)) {
      const label = `<b>${esc(assetName(a))}</b><div class="muted small">${esc(DIS[ind.diseaseId].name)}</div>`;
      for (const [m, r] of Object.entries(ind.reg)) {
        if (r.status === 'aprovado') {
          approvals.push({ month: r.approvedAt, html: `<tr><td>${label}</td><td>${MKT[m].agency}</td><td>${date(r.approvedAt)}</td><td>${r.boxed ? chip('Tarja preta', 'bad') : ''} ${r.conditional ? chip('Condicional', 'warn') : ''} ${r.priority ? chip('Prioritária', 'accent') : ''}</td></tr>` });
          continue;
        }
        if (['rejeitado', 'retirado'].includes(r.status)) continue;
        let status = REG_STATUS[r.status];
        let action = '';
        let eta = '—';
        if (r.status === 'revisao') {
          eta = `${date(r.decisionAt)} <span class="muted small">(${months(r.decisionAt - state.month)})</span>`;
        } else if (r.study) {
          status = `${r.study.kind === 'ponte' ? 'Estudo-ponte' : 'Estudo adicional'} em andamento`;
          eta = `${months(r.study.monthsLeft)} de estudo`;
        } else if (r.status === 'ponte') {
          const plan = trialPlan(state, a, ind.diseaseId, 'ponte', { regions: [m] });
          action = btn(`Iniciar estudo-ponte · ${money(plan.cost)} · ${plan.months} meses`, 'startBridging', { id: a.id, disease: ind.diseaseId, m }, { kind: 'small primary' });
        }
        const chance = r.status === 'revisao' ? pct(approvalProbability(state, a, ind, m)) : '—';
        processes.push(`<tr><td>${label}</td><td>${MKT[m].agency}</td><td>${esc(status)} ${r.priority ? chip('Prioritária', 'accent') : ''} ${r.conditional ? chip('Acelerada', 'warn') : ''}</td><td>${eta}</td><td class="num">${chance}</td><td>${action}</td></tr>`);
      }
      if (ind.status === 'registro' && MARKETS.some((M) => !ind.reg[M.id])) {
        const missing = MARKETS.filter((M) => !ind.reg[M.id]).map((M) => M.short).join(', ');
        ready.push(`<tr><td>${label}</td><td>${esc(missing)}</td><td>${btn('Submeter…', 'submitModal', { id: a.id, disease: ind.diseaseId }, { kind: 'small primary' })}</td></tr>`);
      }
    }
  }
  approvals.sort((x, y) => y.month - x.month);

  const prv = `<div class="kv-row">
    <div><span class="kv-label">Vouchers de revisão prioritária</span><span class="kv-value">${state.prvs}</span></div>
    <div class="muted small" style="max-width:48ch">A FDA concede um voucher a quem aprova tratamentos para doenças tropicais negligenciadas ou doenças pediátricas raras. Ele encurta a revisão de qualquer outro produto nos EUA ou pode ser vendido.</div>
    <div>${btn('Vender voucher', 'sellPRV', {}, { kind: 'ghost', disabled: !state.prvs })}</div>
  </div>`;

  return `${ready.length ? section('Prontos para submissão', table(['Produto', 'Agências pendentes', ''], ready)) : ''}
  ${section('Processos em andamento', processes.length ? table(['Produto', 'Agência', 'Situação', 'Decisão prevista', { label: 'Chance estimada', cls: 'num' }, ''], processes) : empty('Nenhum processo regulatório em andamento.'))}
  ${section('Agências reguladoras', table(['Agência', 'Mercado', 'Relacionamento', { label: 'Revisão padrão / prioritária', cls: 'num' }, 'Rigor', 'Dados locais', { label: 'Exclusividade de dados (química / biológica)', cls: 'num' }], agencyRows), { sub: 'Um bom relacionamento aumenta a chance de aprovação. Transparência em crises de segurança melhora a relação; omissões e infrações a destroem.' })}
  ${section('Vouchers', prv)}
  ${approvals.length ? section('Aprovações conquistadas', table(['Produto', 'Agência', 'Data', 'Rótulo'], approvals.slice(0, 40).map((x) => x.html))) : ''}`;
}
