import { MARKETS, MARKET_BY_ID as MKT } from '../../data/markets.js';
import { DISEASE_BY_ID as DIS } from '../../data/diseases.js';
import { assetName, exclusivity, patentEndOf, approvedAnywhere } from '../../engine/model.js';
import { money, esc, pct, date } from '../format.js';
import { section, table, chip, btn, empty } from '../components.js';
import { playerAssets } from '../helpers.js';

const KIND = { composto: 'Composto (molécula)', formulacao: 'Formulação', polimorfo: 'Forma cristalina', uso: 'Segundo uso médico' };

function timeline(state, a) {
  const start = state.month;
  const span = 240;
  const rows = Object.keys(a.markets).map((m) => {
    const ex = exclusivity(state, a, m);
    const pm = a.markets[m];
    const toPct = (v) => Math.max(0, Math.min(100, ((v - start) / span) * 100));
    const pEnd = toPct(ex.patentEnd);
    const dEnd = toPct(ex.dataEnd);
    const lost = pm.genericSince != null;
    return `<div class="tl-row"><span class="tl-label mono">${MKT[m].short}</span>
      <span class="tl-track">${lost ? `<span class="tl-lost" style="width:100%"></span>` : `<span class="tl-data" style="width:${dEnd}%"></span><span class="tl-patent" style="width:${pEnd}%"></span>`}</span>
      <span class="tl-end small">${lost ? `genéricos desde ${date(pm.genericSince)}` : date(ex.end)}</span></div>`;
  }).join('');
  if (!rows) return '';
  return `<div class="timeline" aria-label="Linha do tempo de exclusividade">${rows}
    <div class="tl-legend small"><span><i class="tl-patent"></i>Patente</span><span><i class="tl-data"></i>Exclusividade regulatória</span><span class="muted">Escala: próximos 20 anos</span></div></div>`;
}

function assetPatents(state, a) {
  const rows = a.patents.map((p) => {
    const ends = MARKETS.map((M) => patentEndOf(p, M));
    const end = Math.max(...ends);
    const tone = p.status === 'ativa' ? (end - state.month < 36 ? 'warn' : 'good') : 'bad';
    return `<tr><td>${KIND[p.kind]}${p.diseaseId ? `<div class="muted small">${esc(DIS[p.diseaseId].name)}</div>` : ''}</td>
      <td>${date(p.filed)}</td><td>${date(end)}${p.ext ? ` <span class="muted small">(+${p.ext} meses de extensão)</span>` : ''}${p.settleAt ? `<div class="small warn-text">Acordo: genérico em ${date(p.settleAt)}</div>` : ''}</td>
      <td class="num">${pct(p.strength)}</td><td>${chip(p.status, tone)}</td></tr>`;
  });
  const actions = [];
  if (!a.patents.some((p) => p.kind === 'composto') && !a.patentBlocked) actions.push(btn('Depositar patente de composto · US$ 1,5 mi', 'filePatent', { id: a.id }, { kind: 'small primary' }));
  if (a.patents.some((p) => p.kind === 'composto' && p.status === 'ativa') && !a.patents.some((p) => p.kind === 'polimorfo')) {
    actions.push(btn('Patentear nova forma cristalina · US$ 3 mi', 'polymorph', { id: a.id }, { kind: 'small ghost', title: 'Patente fraca que pode estender a proteção. Não vale na Índia e prejudica um pouco a reputação.' }));
  }
  for (const ind of Object.values(a.inds)) {
    if (ind.diseaseId !== a.originDisease && !a.patents.some((p) => p.kind === 'uso' && p.diseaseId === ind.diseaseId) && !['abandonada', 'falhou'].includes(ind.status)) {
      actions.push(btn(`Patente de uso em ${esc(DIS[ind.diseaseId].name.toLowerCase())} · US$ 2 mi`, 'usePatent', { id: a.id, disease: ind.diseaseId }, { kind: 'small ghost', title: 'Protege parcialmente a nova indicação: genéricos ainda podem ser usados "fora da bula".' }));
    }
  }
  const lits = state.litigations.filter((l) => l.assetId === a.id && !l.done).map((l) => `<li>Litígio contra ${esc(l.challenger)}: decisão prevista em ${date(l.resolveAt)} (chance de vitória ≈ ${pct(l.winP)})</li>`).join('');
  return `<article class="asset-card" id="asset-${a.id}">
    <header class="asset-head"><div class="asset-title"><span class="code mono">${esc(a.code)}</span><h3>${esc(assetName(a))}</h3>${a.patentBlocked ? chip('Molécula impatenteável', 'bad') : ''}</div></header>
    ${rows.length ? table(['Tipo', 'Depósito', 'Vencimento', { label: 'Força', cls: 'num' }, 'Situação'], rows) : '<p class="muted">Nenhuma patente.</p>'}
    ${timeline(state, a)}
    ${lits ? `<ul class="small">${lits}</ul>` : ''}
    ${actions.length ? `<footer class="asset-foot">${actions.join(' ')}</footer>` : ''}
  </article>`;
}

export function patents(state) {
  const list = playerAssets(state).filter((a) => !['falhou', 'abandonado'].includes(a.stage));
  list.sort((x, y) => Number(approvedAnywhere(y)) - Number(approvedAnywhere(x)));
  const deals = state.deals.map((d) => `<tr><td><b>${esc(d.assetName)}</b><div class="muted small">${esc(d.disease)}</div></td><td>${esc(d.partner)}</td><td class="num">${money(d.upfront)}</td><td class="num">${pct(d.royalty)}</td>
    <td>${!d.announced ? 'Em desenvolvimento pelo parceiro' : d.success ? (state.month < d.endAt ? 'Pagando royalties' : 'Encerrado') : 'Fracassou'}</td><td class="num">${money(d.received)}</td></tr>`);
  const intro = `<p class="intro">A patente de composto vale 20 anos a partir do depósito — e o relógio corre durante todo o desenvolvimento. Extensões compensam parte do tempo perdido nos EUA, Europa e Japão. Depois que patente e exclusividade regulatória acabam, genéricos (ou biossimilares) derrubam as vendas.</p>`;
  return `${intro}${list.length ? list.map((a) => assetPatents(state, a)).join('') : section('Patentes', empty('Nenhum ativo ainda.'))}
  ${deals.length ? section('Acordos de licenciamento', table(['Ativo', 'Parceiro', { label: 'À vista', cls: 'num' }, { label: 'Royalty', cls: 'num' }, 'Situação', { label: 'Recebido', cls: 'num' }], deals)) : ''}`;
}
