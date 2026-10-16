// Funções de apoio à interface: etapas, pendências e rótulos.
import { DISEASE_BY_ID as DIS, AREAS } from '../data/diseases.js';
import { MARKET_BY_ID as MKT, MARKET_IDS } from '../data/markets.js';
import { SIDE_EFFECTS as SE } from '../data/sideEffects.js';
import { approvedIn, approvedAnywhere, assetName, IND_STATUS } from '../engine/model.js';
import { hasPresence } from '../engine/regulatory.js';
import { labSlots } from '../engine/actions.js';
import { esc } from './format.js';

export const playerAssets = (state) => state.assets.filter((a) => a.owner === 'player');
export const activeAssets = (state) => playerAssets(state).filter((a) => !['falhou', 'abandonado'].includes(a.stage));
export const marketedAssets = (state) => playerAssets(state).filter((a) => approvedAnywhere(a) || Object.keys(a.markets).length);

export const areaName = (id) => AREAS[id]?.name || id;
export const diseaseName = (id) => DIS[id]?.name || id;
export const marketName = (id) => MKT[id]?.name || id;

const IND_PROGRESS = { planejada: [3, -1], fase2: [3, 3], fase2_ok: [4, -1], fase3: [4, 4], registro: [5, -1] };

export function indProgress(ind) {
  if (Object.values(ind.reg).some((r) => r.status === 'aprovado')) return [7, -1];
  const [done, active] = IND_PROGRESS[ind.status] || [3, -1];
  if (ind.status === 'registro' && Object.values(ind.reg).some((r) => ['revisao', 'ponte', 'adicional'].includes(r.status))) return [5, 5];
  return [done, active];
}

export function stageInfo(a) {
  switch (a.stage) {
    case 'lead': return { done: 1, active: -1, status: 'ok' };
    case 'preclinico': return { done: 1, active: 1, status: 'ok' };
    case 'pre_ok': return { done: 2, active: -1, status: 'ok' };
    case 'fase1': return { done: 2, active: 2, status: 'ok' };
    case 'falhou': return { done: a.clinicalStart != null ? 2 : 1, active: -1, status: 'fail' };
    case 'abandonado': return { done: 1, active: -1, status: 'fail' };
    default: {
      let best = [3, -1];
      for (const ind of Object.values(a.inds)) {
        if (['falhou', 'abandonada'].includes(ind.status)) continue;
        const p = indProgress(ind);
        if (p[0] > best[0] || (p[0] === best[0] && p[1] > best[1])) best = p;
      }
      return { done: best[0], active: best[1], status: 'ok' };
    }
  }
}

export function sevTone(sev) {
  return sev === 0 ? 'good' : sev >= 4 ? 'bad' : sev === 3 ? 'warn' : '';
}

export function seChips(a) {
  const shown = a.ses.filter((s) => s.revealed).sort((x, y) => SE[y.id].severity - SE[x.id].severity);
  if (!shown.length) return '<span class="muted">Nenhum efeito adverso conhecido ainda</span>';
  return shown.map((s) => {
    const sev = SE[s.id].severity;
    const freq = s.freq >= 0.01 ? `${Math.round(s.freq * 100)}%` : s.freq >= 0.001 ? `${(s.freq * 100).toFixed(1).replace('.', ',')}%` : `1:${Math.round(1 / s.freq).toLocaleString('pt-BR')}`;
    return `<span class="chip ${sevTone(sev)}" title="${sev === 0 ? 'Efeito inesperado' : `Gravidade ${sev}/4`}">${esc(SE[s.id].name)} <b>${freq}</b></span>`;
  }).join(' ');
}

export function toxLabel(t) {
  if (t == null) return '—';
  return t < 0.25 ? 'Baixa' : t < 0.5 ? 'Moderada' : 'Alta';
}

export function verdictLabel(r) {
  if (!r) return '';
  return {
    positivo: ['Positivo', 'good'], inconclusivo: ['Inconclusivo', 'warn'], negativo: ['Negativo', 'bad'],
    superior: ['Superior ao padrão', 'good'], nao_inferior: ['Não inferior', 'good'],
  }[r.verdict] || [r.verdict, ''];
}

export function indStatusLabel(ind) {
  if (Object.values(ind.reg).some((r) => r.status === 'aprovado')) return 'Aprovada';
  if (ind.status === 'fase2_ok' && ind.failedFase3) return 'Fase III falhou';
  return IND_STATUS[ind.status] || ind.status;
}

// Lista de pendências e oportunidades para o painel principal.
export function pendingActions(state) {
  const list = [];
  const push = (text, tab, tone = '', id = null) => list.push({ text, tab, tone, id });
  for (const a of activeAssets(state)) {
    const n = assetName(a);
    if (a.stage === 'lead') {
      if (!a.patentBlocked && !a.patents.some((p) => p.kind === 'composto')) push(`Deposite a patente de ${n} antes que um concorrente o faça`, 'pipeline', 'warn', a.id);
      push(`Inicie o pré-clínico de ${n}`, 'pipeline', '', a.id);
    }
    if (a.stage === 'pre_ok') {
      if (!a.patentBlocked && !a.patents.some((p) => p.kind === 'composto')) push(`Deposite a patente de ${n} antes da Fase I`, 'pipeline', 'warn', a.id);
      push(`${n} está pronto para a Fase I`, 'pipeline', '', a.id);
    }
    for (const ind of Object.values(a.inds)) {
      const dn = DIS[ind.diseaseId].name.toLowerCase();
      if (ind.status === 'planejada' && !ind.trial && a.stage === 'clinico') push(`${n}: inicie a Fase II em ${dn}`, 'pipeline', '', a.id);
      if (ind.status === 'fase2_ok' && !ind.trial && !ind.failedFase3) push(`${n}: decida o futuro em ${dn} (resultado da Fase II disponível)`, 'pipeline', 'accent', a.id);
      if (ind.status === 'registro') {
        const missing = MARKET_IDS.filter((m) => !ind.reg[m]);
        if (missing.length) push(`${n}: submeta o registro em ${dn} (${missing.length} ${missing.length === 1 ? 'agência' : 'agências'} pendentes)`, 'regulatorio', 'accent', a.id);
      }
      for (const [m, r] of Object.entries(ind.reg)) {
        if (r.status === 'ponte' && !r.study) push(`${n}: a ${MKT[m].agency} exige estudo-ponte`, 'regulatorio', 'warn', a.id);
      }
    }
  }
  for (const m of MARKET_IDS) {
    if (hasPresence(state, m)) continue;
    const waiting = marketedAssets(state).filter((a) => approvedIn(a, m).length && a.markets[m]?.launched == null);
    if (waiting.length && !(state.presence[m].readyAt > state.month)) push(`${waiting.map(assetName).join(', ')} aprovado em ${MKT[m].name}, sem operação comercial`, 'mercados', 'warn');
  }
  const free = labSlots(state) - state.programs.length;
  if (free > 0) push(`${free} ${free === 1 ? 'vaga livre' : 'vagas livres'} nos laboratórios de pesquisa`, 'pesquisa');
  const last = state.history[state.history.length - 1];
  if (last && last.profit < 0 && state.cash < -last.profit * 4) push('Caixa para menos de 4 meses de prejuízo: levante capital ou corte custos', 'financas', 'bad');
  for (const [type, r] of Object.entries(state.production || {})) {
    if (r.lost > 0) push(`Falta capacidade de produção (${type}): vendas perdidas`, 'producao', 'bad');
  }
  if (state.prvs > 0) push(`Você tem ${state.prvs} voucher(s) de revisão prioritária para usar ou vender`, 'regulatorio');
  return list;
}

export function presenceLabel(state, m) {
  const p = state.presence[m];
  if (p.type === 'subsidiaria' && p.readyAt > state.month) return 'Subsidiária em implantação';
  if (p.pending) return 'Distribuidor (subsidiária a caminho)';
  return { nenhuma: 'Sem operação', distribuidor: 'Distribuidor', subsidiaria: 'Subsidiária' }[p.type];
}
