import { DISEASE_BY_ID as DIS } from '../../data/diseases.js';
import { TARGET_BY_ID as TGT } from '../../data/targets.js';
import { MODALITIES } from '../../data/modalities.js';
import { MARKET_BY_ID as MKT } from '../../data/markets.js';
import {
  assetName, knownFits, effEstimate, socEff, indicationPoS, peakSales, trialPlan, compoundStageLabel, REG_STATUS,
} from '../../engine/model.js';
import { assetValue } from '../../engine/finance.js';
import { canAccelerate } from '../../engine/regulatory.js';
import { designationStatus, saleOffer } from '../../engine/actions.js';
import { money, esc, pct, date, months, usd } from '../format.js';
import { section, capsule, chip, btn, empty, table, effBar, meter } from '../components.js';
import { stageInfo, seChips, toxLabel, verdictLabel, indStatusLabel, areaName } from '../helpers.js';

function patentInfo(state, a) {
  const cp = a.patents.find((p) => p.kind === 'composto');
  if (cp) {
    const end = cp.filed + 240 + (cp.ext || 0);
    return cp.status === 'ativa' ? chip(`Patente até ${date(end)}`, end - state.month < 60 ? 'warn' : '') : chip(`Patente ${cp.status}`, 'bad');
  }
  if (a.patentBlocked) return chip('Sem patente de composto', 'bad');
  return `${chip('Patente não depositada', 'warn')} ${btn('Depositar (US$ 1,5 mi)', 'filePatent', { id: a.id }, { kind: 'small' })}`;
}

function trialProgress(tr, label) {
  const done = tr.months - tr.monthsLeft;
  return `<div class="progress"><div class="progress-label"><b>${label}</b> · ${done} de ${tr.months} meses · ${money(tr.monthly)}/mês${tr.patients ? ` · ${tr.patients.toLocaleString('pt-BR')} pacientes` : ''}</div>${meter(done / tr.months, { tone: 'accent' })}</div>`;
}

function compoundBlock(state, a) {
  if (a.stage === 'lead') {
    const plan = trialPlan(state, a, null, 'preclinico');
    return `<div class="next"><p>Molécula líder identificada. Estudos em modelos animais e toxicologia vêm antes de qualquer teste em humanos.</p>${btn(`Iniciar pré-clínico · ${money(plan.cost)} · ${plan.months} meses`, 'startPreclinical', { id: a.id }, { kind: 'primary' })}</div>`;
  }
  if (a.stage === 'preclinico' || a.stage === 'fase1') return trialProgress(a.trial, a.stage === 'fase1' ? 'Fase I (segurança em voluntários)' : 'Pré-clínico');
  if (a.stage === 'pre_ok') {
    const warn = !a.patentBlocked && !a.patents.some((p) => p.kind === 'composto') ? '<p class="warn-text">Atenção: iniciar a Fase I sem patente torna a molécula pública e impatenteável.</p>' : '';
    return `<div class="next"><p>Pré-clínico concluído. Toxicidade estimada: <b>${toxLabel(a.toxEst)}</b>.</p>${warn}${btn('Planejar Fase I…', 'trialModal', { id: a.id, phase: 'fase1' }, { kind: 'primary' })}</div>`;
  }
  return '';
}

function regSummary(ind) {
  const entries = Object.entries(ind.reg);
  if (!entries.length) return '';
  return `<div class="reg-chips">${entries.map(([m, r]) => {
    const tone = r.status === 'aprovado' ? 'good' : ['rejeitado', 'retirado'].includes(r.status) ? 'bad' : r.status === 'crl' ? 'warn' : 'accent';
    return chip(`${MKT[m].short}: ${REG_STATUS[r.status]}${r.conditional ? ' (cond.)' : ''}`, tone);
  }).join(' ')}</div>`;
}

function desigButtons(state, a, ind) {
  const names = { orphan: 'Órfão', fastTrack: 'Fast Track', breakthrough: 'Breakthrough' };
  return Object.entries(names).map(([k, label]) => {
    if (ind.desig[k]) return chip(label, 'good');
    const st = designationStatus(state, a, ind, k);
    if (!st.available) return '';
    return btn(`Pedir ${label}`, 'designation', { id: a.id, disease: ind.diseaseId, type: k }, { kind: 'small ghost', title: 'Custo: US$ 0,2 mi' });
  }).join(' ');
}

function indActions(state, a, ind) {
  const d = ind.diseaseId;
  if (ind.trial) {
    const label = ind.trial.phase === 'fase2' ? 'Fase II' : 'Fase III';
    return trialProgress(ind.trial, `${label}${ind.trial.cfg?.comparator === 'ativo' ? ' vs. padrão' : ''}`);
  }
  const out = [];
  if (ind.status === 'planejada' && a.stage === 'clinico') out.push(btn('Planejar Fase II…', 'trialModal', { id: a.id, phase: 'fase2', disease: d }, { kind: 'small primary' }));
  if (ind.status === 'fase2_ok') {
    out.push(btn(ind.failedFase3 ? 'Repetir Fase III…' : 'Planejar Fase III…', 'trialModal', { id: a.id, phase: 'fase3', disease: d }, { kind: 'small primary' }));
    if (['US', 'EU'].some((m) => canAccelerate(state, a, ind, m) && !ind.reg[m])) out.push(btn('Aprovação acelerada…', 'submitModal', { id: a.id, disease: d }, { kind: 'small' }));
  }
  if (ind.status === 'registro' && Object.keys(ind.reg).length < 6) out.push(btn('Submeter registro…', 'submitModal', { id: a.id, disease: d }, { kind: 'small primary' }));
  const approved = Object.values(ind.reg).some((r) => r.status === 'aprovado');
  if (!approved && !['falhou', 'abandonada'].includes(ind.status)) out.push(btn('Abandonar', 'confirmAbandonInd', { id: a.id, disease: d }, { kind: 'small ghost danger' }));
  return out.join(' ');
}

function indicationsTable(state, a) {
  const inds = Object.values(a.inds);
  if (!inds.length) return '';
  const rows = inds.map((ind) => {
    const d = ind.diseaseId;
    const D = DIS[d];
    const est = effEstimate(a, d);
    const r2 = ind.results.fase2;
    const r3 = ind.results.fase3;
    const res = [r2 && `F2: ${verdictLabel(r2)[0]}`, r3 && `F3: ${r3.success ? (r3.superior ? 'superior ao padrão' : 'sucesso') : 'fracasso'}`].filter(Boolean).map((t, i) => chip(t, i === 0 ? verdictLabel(r2)[1] : r3.success ? 'good' : 'bad')).join(' ');
    const dead = ['falhou', 'abandonada'].includes(ind.status);
    const pos = dead ? 0 : indicationPoS(state, a, ind);
    return `<tr class="${dead ? 'dead' : ''}">
      <td><b>${esc(D.name)}</b>${d === a.originDisease ? '' : ` ${chip('Nova indicação', 'good')}`}<div class="small">${desigButtons(state, a, ind)}</div></td>
      <td>${esc(indStatusLabel(ind))}<div>${res}</div>${regSummary(ind)}</td>
      <td>${effBar(est, socEff(state, d), D.placebo)}</td>
      <td class="num">${dead ? '—' : pct(pos)}</td>
      <td class="num">${dead ? '—' : money(peakSales(state, a, d))}</td>
      <td class="actions">${indActions(state, a, ind)}</td>
    </tr>`;
  });
  return table(['Indicação', 'Situação', 'Eficácia estimada <span class="muted small">(▮ padrão, ┊ placebo)</span>', { label: 'Chance de aprovação', cls: 'num' }, { label: 'Pico estimado/ano', cls: 'num' }, ''], rows, { cls: 'inds' });
}

function addIndicationForm(state, a) {
  if (a.stage !== 'clinico') return '';
  const options = knownFits(state, a.targetId).filter(({ d }) => !a.inds[d] || a.inds[d].status === 'abandonada');
  if (!options.length) return '';
  return `<div class="inline-form"><label for="addind-${a.id}">Estudar em outra doença:</label>
    <select id="addind-${a.id}">${options.map(({ d, fit }) => `<option value="${d}">${esc(DIS[d].name)} (evidência ${pct(fit)})</option>`).join('')}</select>
    ${btn('Adicionar indicação', 'addIndication', { id: a.id }, { kind: 'small' })}</div>`;
}

export function assetCard(state, a, { focus = false } = {}) {
  const t = TGT[a.targetId];
  const mod = MODALITIES[a.modality];
  const st = stageInfo(a);
  const value = assetValue(state, a);
  const extra = [];
  if (['pre_ok', 'fase1', 'clinico'].includes(a.stage)) {
    if (a.flags.screen && typeof a.flags.screen === 'object') extra.push(`<span class="muted small">Triagem de reposicionamento: ${a.flags.screen.monthsLeft} meses restantes</span>`);
    else if (!a.flags.screen) extra.push(btn('Triagem de reposicionamento · US$ 6 mi', 'startScreen', { id: a.id }, { kind: 'small ghost', title: 'Testa a molécula contra outras doenças para revelar indicações desconhecidas' }));
  }
  extra.push(btn(`Vender ativo (~${money(saleOffer(state, a.id))})`, 'confirmSell', { id: a.id }, { kind: 'small ghost' }));
  if (!Object.keys(a.markets).length) extra.push(btn('Descontinuar', 'confirmAbandon', { id: a.id }, { kind: 'small ghost danger' }));
  return `<article class="asset-card ${focus ? 'focus' : ''}" id="asset-${a.id}">
    <header class="asset-head">
      <div class="asset-title">
        <span class="code mono">${esc(a.code)}</span>
        <h3>${esc(a.brand || a.code)}</h3>
        ${chip(mod.name)} ${chip(areaName(DIS[a.originDisease].area))} ${a.origin === 'licenciado' ? chip('Licenciado', 'accent') : ''}
      </div>
      <div class="asset-stage">${capsule(st.done, st.active, st.status)}<span class="muted small">${compoundStageLabel(a.stage)}</span></div>
      <div class="asset-value"><span class="kv-label">Valor ajustado ao risco</span><b class="mono">${money(value)}</b></div>
    </header>
    <div class="asset-facts">
      <div><span class="kv-label">Mecanismo</span>${esc(t.name)}</div>
      <div><span class="kv-label">Origem</span>${esc(DIS[a.originDisease].name)}</div>
      <div><span class="kv-label">Via</span>${esc(mod.route)} · conveniência ${pct(a.conv)}</div>
      <div><span class="kv-label">Custo de produção</span>${usd(a.cogs)} por ${DIS[a.originDisease].course === 1 ? 'tratamento' : 'mês'}</div>
      <div><span class="kv-label">Toxicidade</span>${toxLabel(a.toxEst)}</div>
      <div><span class="kv-label">Propriedade intelectual</span>${patentInfo(state, a)}</div>
    </div>
    <div class="asset-ses"><span class="kv-label">Efeitos observados</span> ${seChips(a)}</div>
    ${compoundBlock(state, a)}
    ${indicationsTable(state, a)}
    ${addIndicationForm(state, a)}
    <footer class="asset-foot">${extra.join(' ')}</footer>
  </article>`;
}

function offersPanel(state) {
  if (!state.offers.length) return '';
  const rows = state.offers.map((o) => {
    const a = o.asset;
    const ind = a.inds[a.originDisease];
    const r2 = ind?.results.fase2;
    const cp = a.patents.find((p) => p.kind === 'composto');
    return `<tr><td><b>${esc(a.code)}</b><div class="muted small">${esc(o.biotech)}</div></td>
      <td>${esc(TGT[a.targetId].name)}<div class="muted small">${esc(MODALITIES[a.modality].name)}</div></td>
      <td>${esc(DIS[a.originDisease].name)}</td>
      <td>${a.stage === 'pre_ok' ? 'Pré-clínico concluído' : r2 ? `Fase II: ${verdictLabel(r2)[0].toLowerCase()} (${pct(r2.obs)})` : 'Fase I concluída'}<div class="muted small">Toxicidade ${toxLabel(a.toxEst).toLowerCase()}</div></td>
      <td>${cp ? date(cp.filed + 240) : '—'}</td>
      <td class="num"><b>${money(o.price)}</b></td>
      <td>${btn('Adquirir', 'buyOffer', { id: o.id }, { kind: 'small', disabled: state.cash < o.price })}</td></tr>`;
  });
  return section('Ativos de biotechs à venda', table(['Ativo', 'Mecanismo', 'Indicação', 'Dados', 'Patente até', { label: 'Preço', cls: 'num' }, ''], rows), { sub: `Licenciar moléculas de terceiros encurta o caminho, mas consome caixa e tempo de patente. Novas ofertas em ${months(state.offersRefreshAt - state.month)}.` });
}

export function pipeline(state, ui) {
  const mine = state.assets.filter((a) => a.owner === 'player');
  const active = mine.filter((a) => !['falhou', 'abandonado'].includes(a.stage) && !Object.values(a.inds).some((i) => Object.values(i.reg).some((r) => r.status === 'aprovado')));
  const marketedWithPipeline = mine.filter((a) => Object.values(a.inds).some((i) => Object.values(i.reg).some((r) => r.status === 'aprovado')) && Object.values(a.inds).some((i) => !Object.values(i.reg).some((r) => r.status === 'aprovado') && !['falhou', 'abandonada'].includes(i.status)));
  const order = { clinico: 0, fase1: 1, pre_ok: 2, preclinico: 3, lead: 4 };
  active.sort((x, y) => (order[x.stage] ?? 9) - (order[y.stage] ?? 9));
  const archived = state.assets.filter((a) => ['falhou', 'abandonado'].includes(a.stage) || a.stage === 'vendido');
  const cards = active.map((a) => assetCard(state, a, { focus: ui.focus === a.id })).join('');
  const lifecycle = marketedWithPipeline.map((a) => assetCard(state, a, { focus: ui.focus === a.id })).join('');
  const archive = archived.length
    ? `<details class="panel archive"><summary>Arquivo: ${archived.length} ${archived.length === 1 ? 'ativo encerrado' : 'ativos encerrados'}</summary><ul>${archived.map((a) => `<li><b>${esc(assetName(a))}</b> — ${esc(TGT[a.targetId].name)} para ${esc(DIS[a.originDisease].name.toLowerCase())}: ${a.stage === 'vendido' ? 'vendido/licenciado' : a.stage === 'falhou' ? 'fracassou' : 'descontinuado'} (${date(a.created)})</li>`).join('')}</ul></details>`
    : '';
  return `${cards || section('Pipeline', empty('Nenhuma molécula em desenvolvimento. Inicie programas na aba Pesquisa ou adquira ativos de biotechs.'))}
  ${lifecycle ? `<h2 class="group-title">Novas indicações para produtos no mercado</h2>${lifecycle}` : ''}
  ${offersPanel(state)}
  ${archive}`;
}
