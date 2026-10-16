// Controlador da interface: estado, renderização, eventos, salvamento.
import { newGame } from '../engine/newGame.js';
import { advanceMonth, canAdvance } from '../engine/sim.js';
import * as A from '../engine/actions.js';
import { assetName } from '../engine/model.js';
import { GAME_LENGTH } from '../engine/achievements.js';
import { money, esc, num, date } from './format.js';
import { pendingActions } from './helpers.js';
import { startScreen } from './start.js';
import { overview } from './views/overview.js';
import { research } from './views/research.js';
import { pipeline } from './views/pipeline.js';
import { regulatory } from './views/regulatory.js';
import { products } from './views/products.js';
import { markets } from './views/markets.js';
import { patents } from './views/patents.js';
import { production } from './views/production.js';
import { finance } from './views/finance.js';
import { company } from './views/company.js';
import { newsView } from './views/news.js';
import {
  trialModal, submitModal, eventModal, confirmModal, helpModal, menuModal, endModal, defaultTrialCfg,
} from './modals.js';

const SAVE_KEY = 'bigpharma.save.v1';

const TABS = [
  { id: 'visao', label: 'Visão geral', view: overview },
  { id: 'pesquisa', label: 'Pesquisa', view: research },
  { id: 'pipeline', label: 'Pipeline', view: pipeline },
  { id: 'regulatorio', label: 'Regulatório', view: regulatory },
  { id: 'produtos', label: 'Produtos', view: products },
  { id: 'mercados', label: 'Mercados', view: markets },
  { id: 'patentes', label: 'Patentes', view: patents },
  { id: 'producao', label: 'Produção', view: production },
  { id: 'financas', label: 'Finanças', view: finance },
  { id: 'empresa', label: 'Empresa', view: company },
  { id: 'noticias', label: 'Notícias', view: newsView },
];

let root;
let state = null;
const ui = {
  tab: 'visao', focus: null, modal: null, toast: null, disease: null,
  setup: { name: 'Vitalis Pharma', scenario: 'startup', difficulty: 'normal', focus: 'onco', seed: '' },
};

// ---------- persistência ----------
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function save() {
  if (!state) return;
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* armazenamento indisponível ou cheio: o jogo segue sem salvar */
  }
}

function loadSaved() {
  try {
    const raw = storage()?.getItem(SAVE_KEY);
    return raw ? validateSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function validateSave(s) {
  if (!s || typeof s !== 'object' || s.version !== 1 || !Array.isArray(s.assets) || !Number.isFinite(s.month)) return null;
  s.flags ||= {};
  s.production ||= {};
  return s;
}

// ---------- renderização ----------
function header() {
  const last = state.history[state.history.length - 1];
  const blocked = !canAdvance(state);
  return `<header class="topbar">
    <div class="brand"><span class="logo-capsule small" aria-hidden="true"><span></span><span></span></span><div><b>${esc(state.company.name)}</b><span class="muted small">${date(state.month)} · ano ${Math.floor(state.month / 12) + 1} de ${GAME_LENGTH / 12}</span></div></div>
    <dl class="ticker">
      <div><dt>Caixa</dt><dd class="${state.cash < 0 ? 'bad-text' : ''}">${money(state.cash)}</dd></div>
      <div><dt>Resultado do mês</dt><dd class="${last && last.profit < 0 ? 'bad-text' : 'good-text'}">${last ? money(last.profit, { sign: true }) : '—'}</dd></div>
      <div><dt>Valor de mercado</dt><dd>${money(state.marketCap)}</dd></div>
      <div><dt>Reputação</dt><dd>${num(state.reputation)}</dd></div>
    </dl>
    <div class="top-actions">
      <button type="button" class="btn icon ghost" data-act="help" aria-label="Como jogar" title="Como jogar">?</button>
      <button type="button" class="btn icon ghost" data-act="menu" aria-label="Menu do jogo" title="Salvar, carregar, novo jogo">☰</button>
      <button type="button" class="btn ghost" data-act="advance" data-n="6" ${blocked ? 'disabled' : ''} title="Avança até 6 meses, parando em decisões e resultados importantes">+6 meses</button>
      <button type="button" class="btn primary" data-act="advance" data-n="1" ${blocked ? 'disabled' : ''}>${state.events.length ? 'Decisão pendente' : 'Avançar mês ▸'}</button>
    </div>
  </header>`;
}

function nav() {
  const todo = pendingActions(state);
  const count = (tab) => todo.filter((t) => t.tab === tab).length;
  return `<nav class="tabs" aria-label="Seções">${TABS.map((t) => {
    const n = count(t.id);
    return `<button type="button" class="${ui.tab === t.id ? 'on' : ''}" data-act="tab" data-tab="${t.id}" ${ui.tab === t.id ? 'aria-current="page"' : ''}>${t.label}${n ? `<span class="badge">${n}</span>` : ''}</button>`;
  }).join('')}</nav>`;
}

function toast() {
  const t = ui.toast;
  if (!t) return '';
  const items = t.news.slice(0, 6).map((n) => `<li class="k-${n.kind}">${esc(n.text)}</li>`).join('');
  return `<aside class="toast" role="status" aria-live="polite">
    <header><b>${t.title}</b><button type="button" class="btn icon ghost small" data-act="closeToast" aria-label="Fechar">×</button></header>
    <p class="small">${t.summary}</p>
    ${items ? `<ul>${items}</ul>` : ''}
    ${t.news.length > 6 ? `<button type="button" class="linklike small" data-act="tab" data-tab="noticias">+${t.news.length - 6} notícias</button>` : ''}
  </aside>`;
}

function modal() {
  if (!ui.modal && state?.events.length) ui.modal = { type: 'event' };
  const m = ui.modal;
  if (!m) return '';
  let inner = '';
  let blocking = false;
  if (m.type === 'event') {
    if (!state.events.length) {
      ui.modal = null;
      return '';
    }
    inner = eventModal(state, state.events[0]);
    blocking = true;
  } else if (m.type === 'trial') inner = trialModal(state, m);
  else if (m.type === 'submit') inner = submitModal(state, m);
  else if (m.type === 'confirm') inner = confirmModal(m);
  else if (m.type === 'help') inner = helpModal();
  else if (m.type === 'menu') inner = menuModal(state, m);
  else if (m.type === 'end') {
    inner = endModal(state);
    blocking = !!state.gameOver;
  }
  return `<div class="modal-backdrop" ${blocking ? '' : 'data-act="backdrop"'}><div class="modal ${m.type}" role="dialog" aria-modal="true">${inner}</div></div>`;
}

function render() {
  if (!state) {
    root.innerHTML = startScreen(ui, !!loadSaved());
    return;
  }
  const scroll = window.scrollY;
  const tab = TABS.find((t) => t.id === ui.tab) || TABS[0];
  root.innerHTML = `<div class="app">${header()}${nav()}<main class="content" id="content">${tab.view(state, ui)}</main></div>${modal()}${toast()}`;
  if (ui.focus) {
    const el = document.getElementById(`asset-${ui.focus}`);
    if (el) el.scrollIntoView({ block: 'start' });
    ui.focus = null;
  } else if (!ui.resetScroll) {
    window.scrollTo(0, scroll);
  } else {
    window.scrollTo(0, 0);
    ui.resetScroll = false;
  }
  const firstOption = root.querySelector('.modal .option, .modal .btn.primary');
  if (firstOption && ui.focusModal) {
    firstOption.focus();
    ui.focusModal = false;
  }
}

function flash(res) {
  if (!res) return;
  if (res.msg) ui.toast = { title: res.ok ? 'Feito' : 'Não foi possível', summary: esc(res.msg), news: [] };
}

function act(res) {
  flash(res);
  save();
  render();
}

// ---------- avanço do tempo ----------
const STOP_WORDS = /(Fase II|Fase III|aprova|pré-clínico|Fase I|Descoberta|CRL|rejeita|Genéricos|Biossimilares|Insolvência)/;

function advance(n) {
  const reports = [];
  for (let i = 0; i < n; i++) {
    if (!canAdvance(state)) break;
    reports.push(advanceMonth(state));
    const r = reports[reports.length - 1];
    if (state.events.length || state.gameOver) break;
    if (n > 1 && r.news.some((x) => x.kind !== 'concorrencia' && x.kind !== 'info' && STOP_WORDS.test(x.text))) break;
  }
  if (!reports.length) return;
  const news = reports.flatMap((r) => r.news).filter((x) => x.kind !== 'concorrencia' || x.ref?.important);
  const last = state.history[state.history.length - 1];
  ui.toast = {
    title: reports.length > 1 ? `${date(reports[0].month)} a ${date(state.month)}` : `Relatório de ${date(state.month)}`,
    summary: `Receita ${money(last.revenue)} · resultado ${money(last.profit, { sign: true })} · caixa ${money(state.cash)}`,
    news: news.reverse(),
  };
  if (state.events.length) {
    ui.modal = { type: 'event' };
    ui.focusModal = true;
  } else if (state.gameOver) ui.modal = { type: 'end' };
  else if (state.month >= GAME_LENGTH && !state.endShown) {
    state.endShown = true;
    ui.modal = { type: 'end' };
  }
  save();
  render();
}

// ---------- ações ----------
const val = (id) => document.getElementById(id)?.value;

function confirm(title, text, onYes, opts = {}) {
  ui.modal = { type: 'confirm', title, text, onYes, ...opts };
  render();
}

const HANDLERS = {
  tab(el) {
    ui.tab = el.dataset.tab;
    ui.focus = el.dataset.focus || null;
    if (el.dataset.disease) ui.disease = el.dataset.disease;
    ui.resetScroll = !ui.focus;
    if (ui.modal?.type !== 'event') ui.modal = null;
    render();
  },
  advance(el) {
    if (state.events.length) {
      ui.modal = { type: 'event' };
      render();
      return;
    }
    advance(Number(el.dataset.n) || 1);
  },
  closeToast() {
    ui.toast = null;
    render();
  },
  closeModal() {
    if (ui.modal?.type === 'event') return;
    ui.modal = null;
    render();
  },
  backdrop(el, e) {
    if (e.target === el) HANDLERS.closeModal();
  },
  help() {
    ui.modal = { type: 'help' };
    render();
  },
  menu() {
    ui.modal = { type: 'menu' };
    render();
  },
  newsFilter(el) {
    ui.newsFilter = el.dataset.filter;
    render();
  },
  // pesquisa
  buildLab: () => act(A.buildLab(state)),
  cancelProgram: (el) => confirm('Encerrar programa?', 'O investimento feito até aqui será perdido.', () => A.cancelProgram(state, el.dataset.id), { danger: true, yes: 'Encerrar' }),
  researchArea(el) {
    ui.researchArea = el.dataset.area;
    render();
  },
  researchBudget(el) {
    ui.researchBudget = el.dataset.budget;
    render();
  },
  startProgram: (el) => act(A.startProgram(state, { diseaseId: el.dataset.disease, targetId: el.dataset.target, budget: ui.researchBudget || 'medio' })),
  // desenvolvimento
  filePatent: (el) => act(A.filePatent(state, el.dataset.id)),
  startPreclinical: (el) => act(A.startPreclinical(state, el.dataset.id)),
  trialModal(el) {
    ui.modal = { type: 'trial', assetId: el.dataset.id, phase: el.dataset.phase, disease: el.dataset.disease || null, cfg: defaultTrialCfg(el.dataset.phase) };
    render();
  },
  startTrialConfirm() {
    const m = ui.modal;
    const res = m.phase === 'fase1' ? A.startPhase1(state, m.assetId, m.cfg) : A.startTrial(state, m.assetId, m.disease, m.phase, m.cfg);
    if (res.ok) ui.modal = null;
    act(res);
  },
  designation: (el) => act(A.applyDesignation(state, el.dataset.id, el.dataset.disease, el.dataset.type)),
  submitModal(el) {
    const a = state.assets.find((x) => x.id === el.dataset.id);
    const ind = a.inds[el.dataset.disease];
    const selected = ['US', 'EU', 'JP', 'CN', 'BR', 'IN'].filter((m) => !ind.reg[m]);
    ui.modal = { type: 'submit', assetId: a.id, disease: el.dataset.disease, selected, prv: false };
    render();
  },
  submitConfirm() {
    const m = ui.modal;
    const msgs = [];
    let anyOk = false;
    for (const mk of m.selected) {
      const r = A.submit(state, m.assetId, m.disease, mk, { usePRV: mk === 'US' && m.prv });
      if (r.ok) anyOk = true;
      if (r.msg) msgs.push(r.msg);
    }
    ui.modal = null;
    act({ ok: anyOk, msg: msgs.join(' ') });
  },
  confirmAbandonInd: (el) => confirm('Abandonar indicação?', 'Os estudos em andamento nessa doença serão encerrados e o investimento perdido.', () => A.abandonIndication(state, el.dataset.id, el.dataset.disease), { danger: true, yes: 'Abandonar' }),
  addIndication: (el) => act(A.addIndication(state, el.dataset.id, val(`addind-${el.dataset.id}`))),
  startScreen: (el) => act(A.startScreen(state, el.dataset.id)),
  confirmSell(el) {
    const a = state.assets.find((x) => x.id === el.dataset.id);
    confirm(`Vender ${assetName(a)}?`, `Uma empresa interessada paga ${money(A.saleOffer(state, a.id))} à vista pelos direitos globais. O ativo sai do seu portfólio.`, () => A.sellAsset(state, a.id), { yes: 'Vender' });
  },
  confirmAbandon(el) {
    const a = state.assets.find((x) => x.id === el.dataset.id);
    confirm(`Descontinuar ${assetName(a)}?`, 'Todos os estudos serão encerrados. Essa decisão não pode ser desfeita.', () => A.abandonAsset(state, a.id), { danger: true, yes: 'Descontinuar' });
  },
  buyOffer: (el) => act(A.buyOffer(state, el.dataset.id)),
  // regulatório
  startBridging: (el) => act(A.startBridging(state, el.dataset.id, el.dataset.disease, el.dataset.m)),
  sellPRV: () => act(A.sellPRV(state)),
  // produtos
  toggleFlag(el) {
    if (el.dataset.flag === 'offLabel' && !state.assets.find((a) => a.id === el.dataset.id)?.flags.offLabel) {
      el.checked = false;
      confirm('Promover usos não aprovados?', 'Promoção off-label é ilegal. Gera vendas em indicações sem aprovação, mas investigações podem render multas de centenas de milhões e destruir a relação com as agências.', () => A.toggleFlag(state, el.dataset.id, 'offLabel'), { danger: true, yes: 'Assumir o risco' });
      return;
    }
    act(A.toggleFlag(state, el.dataset.id, el.dataset.flag));
  },
  authGeneric: (el) => act(A.launchAuthorizedGeneric(state, el.dataset.id, el.dataset.m)),
  startFormulation: (el) => act(A.startFormulation(state, el.dataset.id)),
  startPediatric: (el) => act(A.startPediatric(state, el.dataset.id)),
  // mercados
  presence: (el) => act(A.setPresence(state, el.dataset.m, el.dataset.type)),
  confirmPresence: (el) => confirm('Encerrar operação?', 'Os produtos deixam de ser vendidos neste mercado. Fechar uma subsidiária tem custos de rescisão.', () => A.setPresence(state, el.dataset.m, el.dataset.type), { danger: true, yes: 'Encerrar' }),
  disease(el) {
    ui.disease = el.dataset.d || null;
    render();
    if (ui.disease) window.scrollTo(0, 0);
  },
  marketArea(el) {
    ui.marketArea = el.dataset.area;
    render();
  },
  // patentes
  polymorph: (el) => act(A.filePolymorphPatent(state, el.dataset.id)),
  usePatent: (el) => act(A.fileUsePatent(state, el.dataset.id, el.dataset.disease)),
  // produção
  buildFactory: (el) => act(A.buildFactory(state, el.dataset.type)),
  expand: (el) => act(A.expandFactory(state, el.dataset.id)),
  quality: (el) => act(A.qualityProgram(state, el.dataset.id)),
  confirmSellFactory: (el) => confirm('Vender fábrica?', 'Você recebe só uma fração do investimento. A produção passa para terceiros.', () => A.sellFactory(state, el.dataset.id), { danger: true, yes: 'Vender' }),
  // finanças
  loan: () => act(A.takeLoan(state, val('loanAmt'))),
  repay: () => act(A.repayLoan(state, val('loanAmt'))),
  equity: () => act(A.issueEquity(state, val('eqAmt'))),
  buyback: () => act(A.buyback(state, val('eqAmt'))),
  // diálogos
  confirmYes() {
    const m = ui.modal;
    ui.modal = null;
    const res = m.onYes?.();
    act(res);
  },
  eventOption(el) {
    const res = A.resolveEvent(state, el.dataset.ev, Number(el.dataset.idx));
    ui.modal = state.events.length ? { type: 'event' } : null;
    ui.focusModal = true;
    if (state.gameOver) ui.modal = { type: 'end' };
    act(res.msg ? { ok: true, msg: res.msg } : null);
  },
  exportSave() {
    const text = JSON.stringify(state);
    ui.modal = { type: 'menu', exported: text, copied: '' };
    const done = (ok) => {
      if (ui.modal?.type === 'menu') ui.modal.copied = ok ? 'Código copiado para a área de transferência.' : 'Selecione o texto acima e copie manualmente.';
      render();
      if (!ok) document.getElementById('saveText')?.select();
    };
    try {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    } catch {
      done(false);
    }
  },
  downloadSave() {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `big-pharma-${state.company.prefix}-${state.month}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  importSave() {
    const fileInput = document.getElementById('importFile');
    const text = val('importText');
    const apply = (raw) => {
      try {
        const s = validateSave(JSON.parse(raw));
        if (!s) throw new Error('inválido');
        state = s;
        ui.modal = null;
        ui.tab = 'visao';
        act({ ok: true, msg: `Jogo de ${state.company.name} carregado (${date(state.month)}).` });
      } catch {
        ui.modal = { type: 'menu', error: 'Não foi possível ler esse jogo salvo. Confira se o código está completo.' };
        render();
      }
    };
    if (fileInput?.files?.[0]) fileInput.files[0].text().then(apply);
    else if (text?.trim()) apply(text.trim());
    else {
      ui.modal = { type: 'menu', error: 'Cole o código ou escolha um arquivo.' };
      render();
    }
  },
  newGameConfirm: () => confirm('Começar um novo jogo?', 'O jogo atual será substituído. Exporte-o antes se quiser guardá-lo.', () => {
    state = null;
    try {
      storage()?.removeItem(SAVE_KEY);
    } catch {
      /* ignora */
    }
    return null;
  }, { danger: true, yes: 'Novo jogo' }),
  newGame() {
    state = null;
    ui.modal = null;
    try {
      storage()?.removeItem(SAVE_KEY);
    } catch {
      /* ignora */
    }
    render();
  },
  // tela inicial
  pickScenario(el) {
    readSetup();
    ui.setup.scenario = el.dataset.value;
    render();
  },
  pickDifficulty(el) {
    readSetup();
    ui.setup.difficulty = el.dataset.value;
    render();
  },
  resumeGame() {
    state = loadSaved();
    render();
  },
  startGame(el, e) {
    e?.preventDefault();
    readSetup();
    const f = ui.setup;
    const seed = f.seed === '' ? undefined : Number(f.seed);
    state = newGame({ companyName: f.name.trim() || 'Vitalis Pharma', scenario: f.scenario, difficulty: f.difficulty, focusArea: f.focus, seed });
    ui.tab = 'visao';
    ui.toast = null;
    ui.modal = { type: 'help' };
    save();
    render();
  },
};

function readSetup() {
  const f = ui.setup;
  if (document.getElementById('companyName')) f.name = val('companyName');
  if (document.getElementById('focusArea')) f.focus = val('focusArea');
  if (document.getElementById('seed')) f.seed = val('seed');
}

const CHANGE = {
  programBudget: (el) => act(A.setProgramBudget(state, el.dataset.id, el.value)),
  price: (el) => act(A.setPrice(state, el.dataset.id, el.dataset.m, el.value)),
  marketing: (el) => act(A.setMarketing(state, el.dataset.id, el.dataset.m, el.value)),
};

function onTrialInput(el) {
  const m = ui.modal;
  if (!m || m.type !== 'trial') return;
  const field = el.dataset.trial;
  if (field === 'region') {
    const set = new Set(m.cfg.regions);
    if (el.checked) set.add(el.value);
    else set.delete(el.value);
    m.cfg.regions = ['US', 'EU', 'JP', 'CN', 'BR', 'IN'].filter((x) => set.has(x));
  } else if (field === 'size' || field === 'comparator') {
    m.cfg[field] = el.dataset.value;
  } else if (field === 'cro') {
    m.cfg.cro = el.checked;
  }
  render();
}

function onSubmitInput(el) {
  const m = ui.modal;
  if (!m || m.type !== 'submit') return;
  if (el.dataset.submit === 'prv') m.prv = el.checked;
  else {
    const set = new Set(m.selected);
    if (el.checked) set.add(el.value);
    else set.delete(el.value);
    m.selected = [...set];
  }
  render();
}

export function boot(el, hot = {}) {
  root = el;
  state = hot.state ? validateSave(hot.state) : loadSaved();
  if (hot.ui) Object.assign(ui, hot.ui, { modal: null });
  root.addEventListener('click', (e) => {
    const trial = e.target.closest('[data-trial]');
    if (trial && trial.tagName === 'BUTTON') return onTrialInput(trial);
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const h = HANDLERS[el.dataset.act];
    if (h) {
      if (el.tagName !== 'INPUT') e.preventDefault();
      h(el, e);
    }
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.trial) return onTrialInput(el);
    if (el.dataset.submit) return onSubmitInput(el);
    if (el.dataset.change && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el);
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    HANDLERS.startGame(null, e);
  });
  document.addEventListener('keydown', (e) => {
    if (!state) return;
    const tag = document.activeElement?.tagName;
    if (e.key === 'Escape' && ui.modal && ui.modal.type !== 'event' && !(ui.modal.type === 'end' && state.gameOver)) {
      ui.modal = null;
      render();
    } else if (e.key === ' ' && !ui.modal && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) {
      e.preventDefault();
      advance(1);
    }
  });
  window.claude?.hot?.snapshot?.(() => ({ state, ui: { tab: ui.tab, setup: ui.setup } }));
  render();
}
