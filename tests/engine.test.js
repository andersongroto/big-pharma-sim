import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/engine/newGame.js';
import { advanceMonth } from '../src/engine/sim.js';
import * as A from '../src/engine/actions.js';
import { trialPlan, exclusivity, accessFor, valuePrice, suggestedPrice, targetsFor } from '../src/engine/model.js';
import { MARKET_BY_ID } from '../src/data/markets.js';
import { DISEASES } from '../src/data/diseases.js';
import { TARGETS } from '../src/data/targets.js';
import { SIDE_EFFECTS } from '../src/data/sideEffects.js';
import { EVENT_DEFS, describeEvent, resolveEvent } from '../src/engine/events.js';
import { evaluateTrial } from '../src/engine/clinical.js';
import { botTurn } from '../scripts/bot.mjs';

function run(state, months, withBot = true) {
  for (let i = 0; i < months && !state.gameOver; i++) {
    if (withBot) botTurn(state);
    else while (state.events.length) resolveEvent(state, state.events[0].id, 0);
    advanceMonth(state);
  }
  return state;
}

test('dados: alvos, doenças e efeitos adversos são consistentes', () => {
  const ids = new Set(DISEASES.map((d) => d.id));
  for (const t of TARGETS) {
    for (const d of Object.keys(t.fits)) assert.ok(ids.has(d), `${t.id} aponta para doença inexistente ${d}`);
    for (const d of t.hidden) assert.ok(d in t.fits, `${t.id}: indicação oculta ${d} sem aderência`);
    for (const r of t.risks) assert.ok(SIDE_EFFECTS[r], `${t.id}: efeito ${r} inexistente`);
    for (const [se, d] of Object.entries(t.beneficial)) {
      assert.equal(SIDE_EFFECTS[se]?.severity, 0, `${t.id}: ${se} deveria ser benéfico`);
      assert.ok(t.hidden.includes(d), `${t.id}: ${se} deveria revelar uma indicação oculta`);
    }
  }
  const s = newGame({ seed: 1 });
  const orphanDiseases = DISEASES.filter((d) => !targetsFor(s, d.id).length).map((d) => d.id);
  assert.deepEqual(orphanDiseases.sort(), ['alopecia', 'de'], 'só disfunção erétil e alopecia dependem de reposicionamento');
});

test('novo jogo é serializável em todos os cenários', () => {
  for (const scenario of ['startup', 'media', 'big']) {
    const s = newGame({ scenario, seed: 42 });
    const copy = JSON.parse(JSON.stringify(s));
    assert.deepEqual(copy, s);
    assert.ok(s.marketCap > 0);
    if (scenario !== 'startup') assert.ok(s.stats.initialRev12 > 500, `${scenario} deveria começar com receita`);
  }
});

test('a simulação é determinística pela semente, inclusive após salvar e carregar', () => {
  const a = run(newGame({ scenario: 'media', seed: 7 }), 24, false);
  const b = run(newGame({ scenario: 'media', seed: 7 }), 12, false);
  const reloaded = JSON.parse(JSON.stringify(b));
  run(reloaded, 12, false);
  assert.equal(reloaded.cash.toFixed(6), a.cash.toFixed(6));
  assert.equal(reloaded.news.length, a.news.length);
});

test('partidas longas não produzem valores inválidos', () => {
  for (const scenario of ['startup', 'media', 'big']) {
    const s = run(newGame({ scenario, seed: 99 }), 180);
    for (const h of s.history) {
      for (const k of ['revenue', 'profit', 'cash', 'debt', 'marketCap', 'sharePrice']) {
        assert.ok(Number.isFinite(h[k]), `${scenario}: ${k} inválido no mês ${h.month}`);
      }
    }
    assert.ok(s.history.length > 0);
  }
});

test('planejamento de ensaios responde às escolhas', () => {
  const s = newGame({ scenario: 'media', seed: 3 });
  const a = s.assets.find((x) => x.stage === 'clinico' && Object.keys(x.inds).length);
  const d = a.originDisease;
  const base = trialPlan(s, a, d, 'fase3', { regions: ['US', 'EU'], size: 'padrao' });
  const big = trialPlan(s, a, d, 'fase3', { regions: ['US', 'EU'], size: 'grande' });
  const cro = trialPlan(s, a, d, 'fase3', { regions: ['US', 'EU'], size: 'padrao', cro: true });
  const active = trialPlan(s, a, d, 'fase3', { regions: ['US', 'EU'], size: 'padrao', comparator: 'ativo' });
  const more = trialPlan(s, a, d, 'fase3', { regions: ['US', 'EU', 'JP', 'CN', 'BR'], size: 'padrao' });
  assert.ok(big.patients > base.patients && big.cost > base.cost);
  assert.ok(cro.months < base.months && cro.cost > base.cost);
  assert.ok(active.cost > base.cost);
  assert.ok(more.months < base.months);
});

test('ensaios maiores estimam a eficácia com mais precisão', () => {
  const s = newGame({ scenario: 'media', seed: 5 });
  const a = s.assets.find((x) => x.stage === 'clinico');
  const d = a.originDisease;
  const spread = (n) => {
    const obs = Array.from({ length: 300 }, () => evaluateTrial(s, a, d, n, 'placebo', 'fase2').obs);
    const mean = obs.reduce((x, y) => x + y, 0) / obs.length;
    return Math.sqrt(obs.reduce((x, y) => x + (y - mean) ** 2, 0) / obs.length);
  };
  assert.ok(spread(3000) < spread(150) / 2);
});

test('preço acima do valor clínico reduz o acesso, mais na Europa do que nos EUA', () => {
  const s = newGame({ seed: 1 });
  const vpUS = valuePrice(s, 0.6, 'ar', 'US');
  const vpEU = valuePrice(s, 0.6, 'ar', 'EU');
  assert.ok(accessFor(vpUS * 1.5, vpUS, MARKET_BY_ID.US) < accessFor(vpUS, vpUS, MARKET_BY_ID.US));
  assert.ok(accessFor(vpEU * 1.3, vpEU, MARKET_BY_ID.EU) < accessFor(vpUS * 1.3, vpUS, MARKET_BY_ID.US));
});

test('genéricos entram quando patente e exclusividade acabam', () => {
  const s = newGame({ scenario: 'media', seed: 11 });
  const product = s.assets.find((a) => a.targetId === 'arni');
  const end = exclusivity(s, product, 'US').end;
  assert.ok(end > 0 && end < 40, `exclusividade inesperada: ${end}`);
  run(s, end + 2, false);
  assert.ok(product.markets.US.genericSince != null, 'genéricos deveriam ter entrado nos EUA');
  const before = product.revHist[product.revHist.length - 3];
  run(s, 12, false);
  const after = product.revHist[product.revHist.length - 1];
  assert.ok(after < before * 0.5, `receita deveria despencar: ${before} -> ${after}`);
});

test('ações validam regras do jogo', () => {
  const s = newGame({ scenario: 'startup', seed: 2 });
  const lead = s.assets[0];
  assert.equal(lead.stage, 'lead');
  assert.equal(A.startPhase1(s, lead.id).ok, false, 'Fase I exige pré-clínico');
  assert.ok(A.filePatent(s, lead.id).ok);
  assert.equal(A.filePatent(s, lead.id).ok, false, 'patente duplicada');
  assert.ok(A.startPreclinical(s, lead.id).ok);
  const opts = DISEASES.flatMap((D) => targetsFor(s, D.id).map((x) => ({ d: D.id, t: x.target.id })));
  let started = 0;
  for (const o of opts) if (A.startProgram(s, { diseaseId: o.d, targetId: o.t }).ok) started++;
  assert.equal(s.programs.length, A.labSlots(s), 'programas limitados pelas vagas de laboratório');
  assert.ok(started >= 1);
  assert.equal(A.takeLoan(s, 1e9).ok, false, 'limite de crédito');
  assert.equal(A.setPrice(s, lead.id, 'US', 100).ok, false, 'sem mercado ainda');
});

test('submissão regulatória leva à aprovação e ao lançamento', () => {
  const s = newGame({ scenario: 'media', seed: 21 });
  const a = s.assets.find((x) => x.stage === 'clinico' && Object.values(x.inds).some((i) => i.status === 'fase3'));
  const ind = Object.values(a.inds).find((i) => i.status === 'fase3');
  ind.trial.monthsLeft = 1;
  a.eff[ind.diseaseId] = 0.8;
  a.p3f[ind.diseaseId] = 1;
  run(s, 1, false);
  assert.equal(ind.status, 'registro', 'Fase III com eficácia alta deveria ter sucesso');
  assert.ok(A.submit(s, a.id, ind.diseaseId, 'US').ok);
  s.agencies.US = 100;
  const months = ind.reg.US.decisionAt - s.month;
  run(s, months + 1, false);
  assert.ok(['aprovado', 'crl', 'rejeitado', 'adicional'].includes(ind.reg.US.status));
  if (ind.reg.US.status === 'aprovado') {
    assert.ok(a.markets.US?.launched != null, 'deveria ser lançado nos EUA, onde há subsidiária');
    assert.ok(a.brand);
  }
});

test('todos os eventos podem ser descritos e resolvidos', () => {
  const s = newGame({ scenario: 'big', seed: 8 });
  run(s, 6, false);
  const product = s.assets.find((a) => Object.keys(a.markets).length);
  const pipe = s.assets.find((a) => a.stage === 'clinico' && Object.values(a.inds).some((i) => i.trial));
  const ind = Object.values(pipe.inds).find((i) => i.trial);
  const cp = product.patents[0];
  const se = product.ses.find((x) => SIDE_EFFECTS[x.id].severity >= 3) || product.ses[0];
  ind.reg.CN = { status: 'revisao', decisionAt: s.month + 10, submitted: s.month, bonus: 0 };
  ind.reg.US = { status: 'revisao', decisionAt: s.month + 2, submitted: s.month, bonus: 0 };
  ind.reg.EU = { status: 'crl', decisionAt: s.month, submitted: s.month - 12, bonus: 0 };
  const params = {
    pv_signal: { assetId: product.id, seId: se.id },
    class_action: { assetId: product.id, seId: se.id, amount: 100 },
    coverup_exposed: { assetId: product.id, seId: se.id, fine: 300 },
    crl: { assetId: pipe.id, diseaseId: ind.diseaseId, m: 'EU' },
    advisory: { assetId: pipe.id, diseaseId: ind.diseaseId, m: 'US' },
    patent_challenge: { assetId: product.id, patentId: cp.id, challenger: 'Tevalis' },
    antitrust: { assetId: product.id, pay: 50 },
    compulsory: { assetId: s.assets.find((a) => a.markets.BR && a.markets.BR.genericSince == null).id, m: 'BR' },
    price_hearing: { assetId: product.id },
    ira: { assetId: product.id },
    license_offer: { assetId: pipe.id, partner: 'Novacura', upfront: 300, royalty: 0.1 },
    offlabel_investigation: { fine: 200 },
    fcpa: { m: 'CN' },
    pandemic: {},
    crisis: {},
    scientist_poach: { area: 'onco', who: 'Dra. Teste', rival: 'Helix' },
    cyberattack: {},
    cro_failure: { assetId: pipe.id, diseaseId: ind.diseaseId },
    api_shortage: {},
    ngo_donation: { assetId: product.id, cost: 10 },
    site_fraud: { assetId: pipe.id, diseaseId: ind.diseaseId },
    activist_investor: {},
    award: { assetId: product.id },
    viral_demand: { assetId: product.id, diseaseId: Object.keys(product.inds)[0] },
    lobby_offer: {},
    bribe_request: { assetId: pipe.id, diseaseId: ind.diseaseId, m: 'CN' },
    tax_reform: { rate: 0.2 },
    science_publication: { targetId: 'jak', diseaseId: 'alopecia' },
    acquisition_offer: { buyer: 'Medivant', price: 1000 },
  };
  for (const type of Object.keys(EVENT_DEFS)) assert.ok(params[type], `faltam parâmetros de teste para ${type}`);
  for (const [type, p] of Object.entries(params)) {
    const copy = JSON.parse(JSON.stringify(s));
    const desc = describeEvent(copy, { type, params: p });
    assert.ok(desc.title && desc.options.length, `${type} sem descrição`);
    assert.notEqual(desc.title, 'Situação resolvida', `${type} foi tratado como expirado`);
    for (let i = 0; i < desc.options.length; i++) {
      const c = JSON.parse(JSON.stringify(s));
      c.events = [{ id: 'e1', type, params: p }];
      resolveEvent(c, 'e1', i);
      assert.ok(Number.isFinite(c.cash), `${type}#${i} deixou o caixa inválido`);
      if (type !== 'acquisition_offer') run(c, 1, false);
    }
  }
});

test('preço sugerido cobre o custo de produção', () => {
  const s = newGame({ scenario: 'big', seed: 4 });
  for (const a of s.assets.filter((x) => Object.keys(x.markets).length)) {
    for (const m of Object.keys(a.markets)) assert.ok(suggestedPrice(s, a, m) >= a.cogs * 2, `${a.code} em ${m}`);
  }
});
