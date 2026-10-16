// Conteúdo dos diálogos: planejamento de ensaios, submissões, eventos, ajuda, menu e fim de jogo.
import { MARKETS } from '../data/markets.js';
import { DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { SIZES, trialPlan, trialPower, assetName, socEff, effEstimate } from '../engine/model.js';
import { approvalProbability, reviewMonthsFor, filingFee, needsBridging, canAccelerate } from '../engine/regulatory.js';
import { describeEvent } from '../engine/events.js';
import { score, rankFor } from '../engine/achievements.js';
import { money, esc, pct, num, date } from './format.js';
import { chip } from './components.js';

const PHASE_TEXT = {
  fase1: ['Fase I', 'Testa segurança e dose em voluntários saudáveis. Revela os efeitos adversos mais comuns; moléculas tóxicas param aqui.'],
  fase2: ['Fase II', 'Prova de conceito em pacientes, contra placebo. Mostra se o mecanismo realmente funciona — é onde a maioria dos projetos fracassa.'],
  fase3: ['Fase III', 'Estudo confirmatório com milhares de pacientes: é o que as agências avaliam. Comparar com o tratamento padrão custa mais e é mais arriscado, mas uma vitória justifica preço maior e melhor acesso.'],
};

export function defaultTrialCfg(phase) {
  return { regions: phase === 'fase1' ? ['US'] : phase === 'fase3' ? ['US', 'EU', 'JP', 'CN'] : ['US', 'EU'], size: 'padrao', comparator: 'placebo', cro: false };
}

export function trialModal(state, m) {
  const a = state.assets.find((x) => x.id === m.assetId);
  const d = m.disease || null;
  const cfg = m.cfg;
  const [title, text] = PHASE_TEXT[m.phase];
  const plan = trialPlan(state, a, d, m.phase, cfg);
  const power = d ? trialPower(state, a, d, cfg, plan, m.phase) : null;
  const rare = 1 - Math.exp((-plan.patients * 0.001) / 3);
  const regionBoxes = MARKETS.map((M) => `<label class="check-card ${cfg.regions.includes(M.id) ? 'on' : ''}">
    <input type="checkbox" data-trial="region" value="${M.id}" ${cfg.regions.includes(M.id) ? 'checked' : ''}>
    <span><b>${M.name}</b><small>custo ${pct(M.trialCost)}${M.localData && m.phase === 'fase3' ? ' · dados locais exigidos' : ''}</small></span></label>`).join('');
  const sizes = Object.entries(SIZES).map(([k, s]) => `<button type="button" class="${cfg.size === k ? 'on' : ''}" data-trial="size" data-value="${k}">${s.label}</button>`).join('');
  const soc = d ? socEff(state, d) : 0;
  const comparator = m.phase === 'fase3' ? `<div class="field"><span class="field-label">Comparador</span><div class="seg">
      <button type="button" class="${cfg.comparator !== 'ativo' ? 'on' : ''}" data-trial="comparator" data-value="placebo">Placebo</button>
      <button type="button" class="${cfg.comparator === 'ativo' ? 'on' : ''}" data-trial="comparator" data-value="ativo">Tratamento padrão (${pct(soc)})</button></div>
      <p class="small muted">Contra o padrão, o estudo precisa provar não inferioridade; se provar superioridade, o produto ganha argumento de venda e preço.</p></div>` : '';
  const missingLocal = m.phase === 'fase3' ? MARKETS.filter((M) => M.localData && !cfg.regions.includes(M.id) && !(d && DIS[d].orphan)).map((M) => M.short) : [];
  const est = d ? effEstimate(a, d) : null;
  return `<div class="modal-head"><h2>Planejar ${title}</h2><p>${esc(assetName(a))}${d ? ` · ${esc(DIS[d].name)}` : ''}</p></div>
  <div class="modal-body">
    <p>${text}</p>
    ${est ? `<p class="small">Eficácia estimada até agora: <b>${pct(est.mean)}</b> (±${num(est.se * 196)} pontos, fonte: ${est.source}). Placebo: ${pct(DIS[d].placebo)} · padrão atual: ${pct(soc)}.</p>` : ''}
    <div class="field"><span class="field-label">Países com centros de pesquisa</span><div class="check-grid">${regionBoxes}</div>
    <p class="small muted">Mais países recrutam pacientes mais rápido. Custos por paciente variam por país.</p></div>
    <div class="field"><span class="field-label">Tamanho do estudo</span><div class="seg">${sizes}</div>
    <p class="small muted">Estudos maiores custam mais, mas medem a eficácia com mais precisão e detectam efeitos adversos raros antes do lançamento.</p></div>
    ${comparator}
    <label class="toggle"><input type="checkbox" data-trial="cro" ${cfg.cro ? 'checked' : ''}><span>Terceirizar para uma CRO (+15% de custo, −20% de tempo)</span></label>
    <dl class="summary">
      <dt>Pacientes</dt><dd>${plan.patients.toLocaleString('pt-BR')}</dd>
      <dt>Duração</dt><dd>${plan.months} meses (até ${date(state.month + plan.months)})</dd>
      <dt>Custo total</dt><dd>${money(plan.cost)} <small>(${money(plan.monthly)}/mês)</small></dd>
      ${power ? `<dt>Chance estimada de sucesso</dt><dd>${pct(power.success)}${power.superior != null ? ` <small>· superioridade ${pct(power.superior)}</small>` : ''}</dd>` : ''}
      <dt>Detecta efeito 1:1.000</dt><dd>${pct(rare)}</dd>
    </dl>
    ${missingLocal.length ? `<p class="warn-text small">Sem pacientes de ${missingLocal.join(', ')}, essas agências vão exigir um estudo-ponte antes de aprovar.</p>` : ''}
  </div>
  <div class="modal-foot"><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button><button type="button" class="btn primary" data-act="startTrialConfirm" ${cfg.regions.length ? '' : 'disabled'}>Iniciar ${title} · ${money(plan.cost)}</button></div>`;
}

export function submitModal(state, m) {
  const a = state.assets.find((x) => x.id === m.assetId);
  const ind = a.inds[m.disease];
  const accelerated = ind.status !== 'registro';
  const rows = MARKETS.map((M) => {
    const existing = ind.reg[M.id];
    const eligible = !existing && (!accelerated || canAccelerate(state, a, ind, M.id));
    const sel = m.selected.includes(M.id) && eligible;
    const rev = reviewMonthsFor(state, a, ind, M.id, M.id === 'US' && m.prv);
    const p = approvalProbability(state, a, ind, M.id, accelerated);
    const bridge = needsBridging(state, ind, M.id);
    return `<tr class="${eligible ? '' : 'dead'}"><td><label class="toggle"><input type="checkbox" data-submit="market" value="${M.id}" ${sel ? 'checked' : ''} ${eligible ? '' : 'disabled'}><span><b>${M.agency}</b> · ${M.name}</span></label></td>
      <td>${existing ? chip('Já submetido', 'accent') : eligible ? `${rev.months} meses${rev.priority ? ' ' + chip('Prioritária', 'good') : ''}` : chip('Não elegível', '')}</td>
      <td class="num">${eligible ? money(filingFee(state, a, ind, M.id)) : '—'}</td>
      <td class="num">${eligible ? pct(p) : '—'}</td>
      <td>${eligible && bridge ? chip('Exige estudo-ponte', 'warn') : ''}</td></tr>`;
  }).join('');
  return `<div class="modal-head"><h2>${accelerated ? 'Pedir aprovação acelerada' : 'Submeter registro'}</h2><p>${esc(assetName(a))} · ${esc(DIS[m.disease].name)}</p></div>
  <div class="modal-body">
    <p>${accelerated ? 'Com dados de Fase II impressionantes em doença grave, FDA e EMA podem aprovar condicionalmente. Você terá 18 meses para iniciar a Fase III confirmatória — se ela falhar, a aprovação é revogada.' : 'Cada agência analisa o dossiê de forma independente, com prazos, taxas e exigências próprias.'}</p>
    <div class="table-wrap"><table><thead><tr><th>Agência</th><th>Revisão</th><th class="num">Taxa</th><th class="num">Chance estimada</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    ${state.prvs > 0 && !ind.reg.US ? `<label class="toggle"><input type="checkbox" data-submit="prv" ${m.prv ? 'checked' : ''}><span>Usar voucher de revisão prioritária na FDA (você tem ${state.prvs})</span></label>` : ''}
  </div>
  <div class="modal-foot"><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button><button type="button" class="btn primary" data-act="submitConfirm" ${m.selected.length ? '' : 'disabled'}>Submeter</button></div>`;
}

export function eventModal(state, ev) {
  const desc = describeEvent(state, ev);
  const opts = desc.options.map((o, i) => `<button type="button" class="option ${o.unethical ? 'unethical' : ''}" data-act="eventOption" data-ev="${ev.id}" data-idx="${i}">
    <b>${esc(o.label)}</b>${o.hint ? `<span>${esc(o.hint)}</span>` : ''}${o.unethical ? '<em>Eticamente questionável</em>' : ''}</button>`).join('');
  const more = state.events.length > 1 ? `<p class="small muted">Mais ${state.events.length - 1} ${state.events.length === 2 ? 'decisão' : 'decisões'} na fila.</p>` : '';
  return `<div class="modal-head event"><span class="eyebrow">Decisão necessária · ${date(state.month)}</span><h2>${esc(desc.title)}</h2></div>
  <div class="modal-body"><p class="event-text">${esc(desc.text)}</p><div class="options">${opts}</div>${more}</div>`;
}

export function confirmModal(m) {
  return `<div class="modal-head"><h2>${esc(m.title)}</h2></div>
  <div class="modal-body"><p>${esc(m.text)}</p></div>
  <div class="modal-foot"><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button><button type="button" class="btn ${m.danger ? 'danger' : 'primary'}" data-act="confirmYes">${esc(m.yes || 'Confirmar')}</button></div>`;
}

export function helpModal() {
  return `<div class="modal-head"><h2>Como jogar</h2><p>Você é o CEO. Cada turno é um mês.</p></div>
  <div class="modal-body prose">
    <h3>1. Descoberta</h3>
    <p>Na aba <b>Pesquisa</b>, combine uma doença com um alvo terapêutico. Alvos validados são seguros mas concorridos; especulativos podem não funcionar em humanos. Cada laboratório comporta dois programas.</p>
    <h3>2. Patente</h3>
    <p>Deposite a patente da molécula antes da Fase I. O prazo de 20 anos começa no depósito e corre durante todo o desenvolvimento — atrasar o depósito arrisca perder a molécula para um concorrente.</p>
    <h3>3. Desenvolvimento</h3>
    <p>Pré-clínico → Fase I (segurança) → Fase II (prova de conceito) → Fase III (confirmação). Você escolhe países, tamanho, comparador e terceirização. Estudos maiores medem melhor a eficácia e revelam efeitos raros. Depois da Fase I, a mesma molécula pode ser testada em outras doenças do mesmo mecanismo.</p>
    <h3>4. Registro</h3>
    <p>Submeta o dossiê a FDA, EMA, PMDA, NMPA, ANVISA e CDSCO. Designações (órfão, Fast Track, Breakthrough) aceleram o processo. Japão, China e Índia exigem pacientes locais. Agências podem aprovar, rejeitar ou pedir mais dados.</p>
    <h3>5. Mercado</h3>
    <p>Para vender é preciso operação comercial no país (subsidiária ou distribuidor). Em <b>Produtos</b>, ajuste preço e marketing por mercado. Preço acima do valor clínico reduz o acesso; em doenças graves, gera audiências públicas e ameaças de licença compulsória.</p>
    <h3>6. Ciclo de vida</h3>
    <p>Efeitos adversos raros aparecem com milhões de pacientes: atualize a bula, recolha o produto ou… arrisque esconder. Genéricos chegam quando patente e exclusividade acabam. Estenda a vida do produto com novas indicações, formulações, estudo pediátrico e litígios — ou aceite o penhasco e invista no próximo sucesso.</p>
    <h3>7. Reposicionamento</h3>
    <p>Efeitos inesperados nos ensaios (como "ereções espontâneas" em um remédio para circulação pulmonar) revelam novas indicações. Triagens de reposicionamento e publicações científicas também.</p>
    <h3>Atalhos</h3>
    <p><kbd>Espaço</kbd> avança um mês quando nenhum campo está selecionado. <kbd>Esc</kbd> fecha diálogos.</p>
  </div>
  <div class="modal-foot"><button type="button" class="btn primary" data-act="closeModal">Entendi</button></div>`;
}

export function menuModal(state, m) {
  return `<div class="modal-head"><h2>Jogo</h2><p>${esc(state.company.name)} · ${date(state.month)}</p></div>
  <div class="modal-body">
    <p class="small muted">O jogo é salvo automaticamente neste navegador a cada mês.</p>
    <div class="menu-actions">
      <button type="button" class="btn" data-act="exportSave">Copiar código do jogo salvo</button>
      <button type="button" class="btn ghost" data-act="downloadSave">Baixar arquivo .json</button>
    </div>
    ${m.exported ? `<textarea id="saveText" class="save-text" readonly>${esc(m.exported)}</textarea><p class="small muted">${esc(m.copied || '')}</p>` : ''}
    <div class="field"><label class="field-label" for="importText">Carregar jogo (cole o código ou escolha o arquivo)</label>
      <textarea id="importText" class="save-text" placeholder="Cole aqui o código do jogo salvo"></textarea>
      <div class="menu-actions"><input type="file" id="importFile" accept=".json,application/json"><button type="button" class="btn" data-act="importSave">Carregar</button></div>
      ${m.error ? `<p class="bad-text small">${esc(m.error)}</p>` : ''}
    </div>
  </div>
  <div class="modal-foot"><button type="button" class="btn ghost danger" data-act="newGameConfirm">Novo jogo</button><button type="button" class="btn primary" data-act="closeModal">Voltar ao jogo</button></div>`;
}

export function endModal(state) {
  const sc = score(state);
  const go = state.gameOver;
  let title = 'Fim do mandato';
  let text = `Depois de 25 anos à frente da ${state.company.name}, o conselho avalia sua gestão.`;
  if (go?.reason === 'falencia') {
    title = 'Falência';
    text = `${state.company.name} não conseguiu honrar suas dívidas e entrou com pedido de falência em ${date(go.month)}.`;
  } else if (go?.reason === 'vendida') {
    title = 'Empresa vendida';
    text = `${state.company.name} foi vendida para ${go.buyer} por ${money(go.price)} em ${date(go.month)}.`;
  }
  const parts = Object.entries(sc.parts).map(([k, v]) => `<dt>${{ valor: 'Valor de mercado', pacientes: 'Pacientes tratados', aprovacoes: 'Novas aprovações', reputacao: 'Reputação', conquistas: 'Conquistas', metas: 'Metas do cenário' }[k]}</dt><dd class="mono">${num(v)}</dd>`).join('');
  return `<div class="modal-head"><span class="eyebrow">${date(state.month)}</span><h2>${title}</h2><p>${esc(text)}</p></div>
  <div class="modal-body">
    <div class="score-big"><span class="mono">${num(sc.total)}</span><span>${esc(rankFor(sc.total))}</span></div>
    <dl class="valuation">${parts}</dl>
    <p class="small">Valor de mercado final: <b>${money(state.marketCap)}</b> · pacientes-ano tratados: <b>${num(state.stats.patientYears / 1e6, 1)} mi</b> · aprovações na sua gestão: <b>${state.stats.newApprovals}</b></p>
  </div>
  <div class="modal-foot">${go ? '' : '<button type="button" class="btn ghost" data-act="closeModal">Continuar jogando</button>'}<button type="button" class="btn primary" data-act="newGame">Novo jogo</button></div>`;
}

