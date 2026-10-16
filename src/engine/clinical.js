// Desenvolvimento: pré-clínico, Fase I (por molécula) e Fases II/III (por indicação).
import { DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { TARGET_BY_ID as TGT } from '../data/targets.js';
import { SIDE_EFFECTS as SE } from '../data/sideEffects.js';
import { SE_TRIAL_K, MIN_CLINICAL, NI_MARGIN, socEff, knownFits, assetName, hiddenFitsLeft } from './model.js';
import { newIndication, setPrior } from './assets.js';
import { revealFit } from './knowledge.js';
import { clamp, book, chance, gauss, news, uid } from './util.js';

export function evaluateTrial(state, a, d, n, comparator = 'placebo', phase = 'fase2') {
  const D = DIS[d];
  const eff = (a.eff[d] ?? 0.02) * (phase === 'fase3' ? a.p3f?.[d] ?? 1 : 1);
  const se = SE_TRIAL_K / Math.sqrt(n);
  const obs = clamp(eff + gauss(state, 0, se), 0, 1);
  const soc = socEff(state, d);
  if (comparator === 'ativo') {
    const seD = se * Math.SQRT2;
    const zSup = (obs - soc) / seD;
    const zNI = (obs - soc + NI_MARGIN) / seD;
    const superior = zSup > 1.96;
    const success = zNI > 1.96;
    return { phase, obs, se, z: zNI, zSup, success, superior, comparator, n, soc, verdict: superior ? 'superior' : success ? 'nao_inferior' : 'negativo' };
  }
  const z = (obs - D.placebo) / se;
  const success = z > 1.96 && obs - D.placebo >= MIN_CLINICAL * (phase === 'fase3' ? 1.25 : 1);
  return { phase, obs, se, z, success, superior: false, comparator, n, soc, verdict: success ? 'positivo' : z > 1 ? 'inconclusivo' : 'negativo' };
}

// Ensaios revelam efeitos adversos com probabilidade crescente com o número de pacientes.
export function revealSideEffects(state, a, n) {
  const found = [];
  for (const se of a.ses) {
    if (se.revealed) continue;
    const p = 1 - Math.exp((-n * se.freq) / 3);
    if (chance(state, p)) {
      se.revealed = true;
      se.revealedAt = state.month;
      found.push(se);
    }
  }
  if (!found.length) return found;
  const bad = found.filter((s) => SE[s.id].severity > 0);
  if (bad.length) {
    const serious = bad.some((s) => SE[s.id].severity >= 3);
    news(state, `Ensaio de ${assetName(a)} registra: ${bad.map((s) => SE[s.id].name.toLowerCase()).join(', ')}.`, serious ? 'alerta' : 'info', { tab: 'pipeline', id: a.id });
  }
  for (const s of found.filter((x) => SE[x.id].severity === 0)) {
    news(state, `Efeito inesperado em ${assetName(a)}: pacientes relatam "${SE[s.id].name.toLowerCase()}".`, 'bom', { tab: 'pipeline', id: a.id });
    const d = TGT[a.targetId].beneficial[s.id];
    if (d) revealFit(state, a.targetId, d, 'serendipidade');
  }
  return found;
}

function gainExpertise(state, d, amount) {
  const area = DIS[d].area;
  state.expertise[area] = Math.min(100, state.expertise[area] + amount);
}

function finishCompoundTrial(state, a) {
  const phase = a.trial.phase;
  const patients = a.trial.patients || 80;
  const origin = a.originDisease;
  a.trial = null;
  gainExpertise(state, origin, 2);
  if (phase === 'preclinico') {
    if (chance(state, 0.06 + 0.3 * a.tox)) {
      a.stage = 'falhou';
      news(state, `${a.code} fracassa no pré-clínico: toxicidade inaceitável em modelos animais.`, 'ruim', { tab: 'pipeline', id: a.id });
      return;
    }
    a.stage = 'pre_ok';
    a.toxEst = clamp(a.tox + gauss(state, 0, 0.12), 0, 1);
    for (const { d } of knownFits(state, a.targetId)) setPrior(state, a, d);
    for (const se of a.ses) {
      if (SE[se.id].severity >= 3 && chance(state, 0.25)) {
        se.revealed = true;
        se.revealedAt = state.month;
        news(state, `Sinal de toxicidade em animais para ${a.code}: ${SE[se.id].name.toLowerCase()}.`, 'alerta', { tab: 'pipeline', id: a.id });
      }
    }
    const blocked = !a.patents.some((p) => p.kind === 'composto');
    news(state, `${a.code} conclui o pré-clínico e está pronto para testes em humanos.${blocked ? ' Atenção: deposite a patente antes da Fase I (o registro do ensaio torna a molécula pública).' : ''}`, 'bom', { tab: 'pipeline', id: a.id });
    return;
  }
  // Fase I
  revealSideEffects(state, a, patients);
  if (chance(state, 0.04 + 0.4 * a.tox)) {
    a.stage = 'falhou';
    news(state, `Fase I de ${a.code} interrompida: eventos adversos graves em voluntários.`, 'ruim', { tab: 'pipeline', id: a.id });
    return;
  }
  a.stage = 'clinico';
  a.toxEst = clamp(a.tox + gauss(state, 0, 0.05), 0, 1);
  if (!a.inds[origin]) a.inds[origin] = newIndication(state, origin);
  news(state, `${a.code} mostrou-se seguro na Fase I. Pronto para a Fase II em ${DIS[origin].name.toLowerCase()}.`, 'bom', { tab: 'pipeline', id: a.id });
}

function withdrawConditional(state, a, ind, reason) {
  for (const r of Object.values(ind.reg)) {
    if (r.status === 'aprovado' && r.conditional) {
      r.status = 'retirado';
      r.conditional = false;
    }
  }
  state.reputation = clamp(state.reputation - 3, 0, 100);
  news(state, `Aprovação acelerada de ${assetName(a)} para ${DIS[ind.diseaseId].name.toLowerCase()} é revogada: ${reason}.`, 'ruim', { tab: 'regulatorio' });
}

function finishIndTrial(state, a, ind) {
  const tr = ind.trial;
  const d = ind.diseaseId;
  const D = DIS[d];
  ind.trial = null;
  gainExpertise(state, d, 3);
  revealSideEffects(state, a, tr.patients);
  if (tr.phase === 'fase2') {
    const r = evaluateTrial(state, a, d, tr.patients, 'placebo', 'fase2');
    r.month = state.month;
    ind.results.fase2 = r;
    ind.status = 'fase2_ok';
    const txt = {
      positivo: ['bom', 'resultado positivo'],
      inconclusivo: ['alerta', 'resultado inconclusivo'],
      negativo: ['ruim', 'resultado negativo'],
    }[r.verdict];
    news(state, `Fase II de ${assetName(a)} em ${D.name.toLowerCase()}: ${txt[1]} (eficácia observada ${(r.obs * 100).toFixed(0)}%, placebo ${(D.placebo * 100).toFixed(0)}%).`, txt[0], { tab: 'pipeline', id: a.id });
    return;
  }
  if (tr.phase === 'fase3') {
    const r = evaluateTrial(state, a, d, tr.patients, tr.cfg.comparator, 'fase3');
    r.month = state.month;
    const prev = ind.results.fase3;
    ind.results.fase3 = r;
    for (const m of tr.cfg.regions) ind.localData[m] = true;
    if (r.success) {
      ind.status = 'registro';
      ind.failedFase3 = false;
      if (r.superior) state.achievements.superioridade ??= state.month;
      const claim = r.comparator === 'ativo' ? (r.superior ? ' Superior ao tratamento padrão!' : ' Não inferior ao tratamento padrão.') : '';
      news(state, `Fase III de ${assetName(a)} em ${D.name.toLowerCase()} atinge o desfecho primário (eficácia ${(r.obs * 100).toFixed(0)}%).${claim} Pronto para submissão.`, 'bom', { tab: 'regulatorio' });
      if (Object.values(ind.reg).some((x) => x.conditional)) {
        for (const x of Object.values(ind.reg)) x.conditional = false;
        news(state, `Estudo confirmatório converte a aprovação acelerada de ${assetName(a)} em aprovação plena.`, 'bom');
      }
    } else {
      ind.status = 'fase2_ok';
      ind.failedFase3 = true;
      if (prev?.success) ind.results.fase3 = prev;
      news(state, `Fase III de ${assetName(a)} em ${D.name.toLowerCase()} FRACASSA (eficácia ${(r.obs * 100).toFixed(0)}%). Prejuízo de US$ ${(tr.cost ?? tr.monthly * tr.months).toFixed(0)} mi.`, 'ruim', { tab: 'pipeline', id: a.id });
      if (Object.values(ind.reg).some((x) => x.status === 'aprovado' && x.conditional)) withdrawConditional(state, a, ind, 'o estudo confirmatório falhou');
    }
  }
}

function finishProject(state, a, key) {
  a.flags[key] = 'done';
  if (key === 'formulation') {
    a.conv = Math.min(0.98, a.conv + 0.15);
    a.patents.push({ id: uid(state, 'p'), kind: 'formulacao', filed: state.month, ext: 0, strength: 0.45, status: 'ativa', diseaseId: null });
    news(state, `Nova formulação de liberação prolongada de ${assetName(a)} concluída: mais conveniente e protegida por nova patente.`, 'bom', { tab: 'patentes' });
  } else if (key === 'pediatric') {
    news(state, `Estudo pediátrico de ${assetName(a)} concluído: +6 meses de exclusividade nos EUA.`, 'bom', { tab: 'patentes' });
  } else if (key === 'screen') {
    const left = hiddenFitsLeft(state, a.targetId);
    let found = 0;
    for (const d of left) if (chance(state, 0.55) && revealFit(state, a.targetId, d, 'triagem de reposicionamento')) found++;
    if (!found) news(state, `Triagem de reposicionamento de ${assetName(a)} não encontrou novas indicações promissoras.`, 'info', { tab: 'pipeline', id: a.id });
  }
}

export function clinicalTick(state) {
  for (const a of state.assets) {
    if (a.owner !== 'player') continue;
    if (a.trial) {
      book(state, 'pd', -a.trial.monthly);
      a.trial.monthsLeft -= 1;
      if (a.trial.monthsLeft <= 0) finishCompoundTrial(state, a);
    }
    for (const ind of Object.values(a.inds)) {
      if (!ind.trial) continue;
      book(state, 'pd', -ind.trial.monthly);
      if (ind.desig.orphan) state.orphanCredit += ind.trial.monthly * 0.25;
      ind.trial.monthsLeft -= 1;
      if (ind.trial.monthsLeft <= 0) finishIndTrial(state, a, ind);
    }
    for (const key of ['formulation', 'pediatric', 'screen']) {
      const f = a.flags[key];
      if (f && typeof f === 'object') {
        book(state, 'pd', -f.monthly);
        f.monthsLeft -= 1;
        if (f.monthsLeft <= 0) finishProject(state, a, key);
      }
    }
  }
}
