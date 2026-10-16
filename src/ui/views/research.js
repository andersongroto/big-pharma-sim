import { DISEASES, DISEASE_BY_ID as DIS, AREAS } from '../../data/diseases.js';
import { TARGET_BY_ID as TGT } from '../../data/targets.js';
import { MODALITIES } from '../../data/modalities.js';
import { targetsFor, diseaseMarketSize, BUDGETS, competitorsIn } from '../../engine/model.js';
import { programCost, discoveryChance } from '../../engine/research.js';
import { labSlots, LAB_COST } from '../../engine/actions.js';
import { money, esc, pct, num, compact, date } from '../format.js';
import { section, table, meter, empty, btn, chip } from '../components.js';
import { areaName } from '../helpers.js';

function fitDots(fit) {
  const n = Math.round(fit * 5);
  return `<span class="dots" title="Evidência biológica ${pct(fit)}">${'●'.repeat(n)}${'○'.repeat(5 - n)}</span>`;
}

function validationLabel(v) {
  return v >= 0.85 ? ['Validado', 'good'] : v >= 0.65 ? ['Promissor', ''] : ['Especulativo', 'warn'];
}

export function research(state, ui) {
  const slots = labSlots(state);
  const monthly = state.programs.reduce((s, p) => s + programCost(state, p), 0) + state.labs * 1.2 * state.diff.costMult;
  const building = state.labsBuilding.length ? ` · ${state.labsBuilding.length} em construção (pronto em ${date(state.labsBuilding[0].readyAt)})` : '';
  const header = `<div class="kv-row">
    <div><span class="kv-label">Laboratórios</span><span class="kv-value">${state.labs}${building}</span></div>
    <div><span class="kv-label">Programas</span><span class="kv-value">${state.programs.length} de ${slots} vagas</span></div>
    <div><span class="kv-label">Gasto mensal em pesquisa</span><span class="kv-value">${money(monthly)}</span></div>
    <div>${btn(`Construir laboratório (${money(LAB_COST * state.diff.costMult)})`, 'buildLab', {}, { kind: 'ghost' })}</div>
  </div>`;

  const exp = `<div class="expertise">${Object.keys(AREAS).map((a) => `<div><span>${esc(areaName(a))}</span>${meter(state.expertise[a] / 100)}<span class="mono">${num(state.expertise[a])}</span></div>`).join('')}</div>`;

  const progRows = state.programs.map((p) => {
    const t = TGT[p.targetId];
    const budgetSel = `<select data-change="programBudget" data-id="${p.id}" aria-label="Orçamento">${Object.entries(BUDGETS).map(([k, b]) => `<option value="${k}" ${k === p.budget ? 'selected' : ''}>${b.label}</option>`).join('')}</select>`;
    return `<tr><td><b>${esc(DIS[p.diseaseId].name)}</b><div class="muted small">${esc(t.name)}</div></td>
      <td>${esc(MODALITIES[t.modality].name)}</td><td>${budgetSel}<div class="muted small">${money(programCost(state, p))}/mês</div></td>
      <td class="num">${p.months}</td><td class="num">${pct(discoveryChance(state, p), 1)}</td><td class="num">${money(p.spent || 0)}</td>
      <td>${btn('Encerrar', 'cancelProgram', { id: p.id }, { kind: 'small ghost danger' })}</td></tr>`;
  });
  const programs = progRows.length
    ? table(['Programa', 'Modalidade', 'Orçamento', { label: 'Meses', cls: 'num' }, { label: 'Chance/mês', cls: 'num' }, { label: 'Gasto', cls: 'num' }, ''], progRows)
    : empty('Nenhum programa ativo. Escolha uma doença e um alvo abaixo.');

  const area = ui.researchArea || state.company.focusArea || 'onco';
  const budget = ui.researchBudget || 'medio';
  const full = state.programs.length >= slots;
  const areaChips = `<div class="seg wrap" role="group" aria-label="Área">${Object.keys(AREAS).map((a) => `<button type="button" class="${a === area ? 'on' : ''}" data-act="researchArea" data-area="${a}">${esc(AREAS[a].short)}</button>`).join('')}</div>`;
  const budgetChips = `<div class="seg" role="group" aria-label="Orçamento">${Object.entries(BUDGETS).map(([k, b]) => `<button type="button" class="${k === budget ? 'on' : ''}" data-act="researchBudget" data-budget="${k}">${b.label} · ${money(b.cost)}/mês</button>`).join('')}</div>`;

  const rows = [];
  for (const D of DISEASES.filter((x) => x.area === area)) {
    const ts = targetsFor(state, D.id);
    const comp = competitorsIn(state, D.id);
    const diseaseCell = `<td rowspan="${Math.max(1, ts.length)}"><b>${esc(D.name)}</b>
      <div class="muted small">${compact(D.patients * 1000)} ${D.course ? 'tratamentos/ano' : 'pacientes'} · mercado ${money(diseaseMarketSize(state, D.id))}/ano</div>
      <div class="small">Padrão atual: ${pct(state.diseases[D.id].soc)} · ${comp.filter((c) => c.stage === 'mercado').length} concorrentes${comp.some((c) => c.stage !== 'mercado') ? ` (+${comp.filter((c) => c.stage !== 'mercado').length} em Fase III)` : ''}</div>
      <div>${D.orphan ? chip('Órfã', 'accent') : ''}${D.prv ? chip('Voucher PRV', 'good') : ''}${D.publicHealth >= 0.8 ? chip('Saúde pública', 'warn') : ''}</div></td>`;
    if (!ts.length) {
      rows.push(`<tr>${diseaseCell}<td colspan="4" class="muted">Nenhum alvo validado. Novas indicações surgem por efeitos inesperados, triagens de reposicionamento ou publicações.</td></tr>`);
      continue;
    }
    ts.sort((x, y) => y.fit - x.fit).forEach(({ target, fit }, i) => {
      const [vl, vt] = validationLabel(target.validation);
      const running = state.programs.some((p) => p.targetId === target.id && p.diseaseId === D.id);
      const hidden = target.hidden.includes(D.id);
      rows.push(`<tr>${i === 0 ? diseaseCell : ''}
        <td><b>${esc(target.name)}</b>${hidden ? ' ' + chip('Nova indicação', 'good') : ''}<div class="muted small">${esc(target.desc)}</div></td>
        <td>${esc(MODALITIES[target.modality].name)}</td>
        <td>${fitDots(fit)} ${chip(vl, vt)}</td>
        <td>${running ? chip('Em andamento', 'accent') : btn('Iniciar', 'startProgram', { disease: D.id, target: target.id }, { kind: 'small', disabled: full, title: full ? 'Sem vagas nos laboratórios' : '' })}</td></tr>`);
    });
  }

  return `${section('Laboratórios de descoberta', header + programs, { sub: 'Cada laboratório comporta dois programas. A chance de descoberta cresce com o orçamento, a experiência na área e o tempo.' })}
  <div class="grid-2 wide-left">
    ${section('Novo programa de descoberta', `<div class="toolbar">${areaChips}${budgetChips}</div>${table(['Doença', 'Alvo terapêutico', 'Modalidade', 'Evidência', ''], rows, { cls: 'research' })}`, { sub: 'Escolha a doença e o mecanismo. Alvos validados são mais seguros; especulativos podem falhar na prova de conceito.' })}
    ${section('Experiência por área', exp, { sub: 'Experiência acelera descobertas, melhora as moléculas e barateia ensaios.' })}
  </div>`;
}
