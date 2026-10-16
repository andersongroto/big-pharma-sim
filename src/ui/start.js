// Tela inicial: fundação da empresa.
import { SCENARIOS, DIFFICULTIES } from '../engine/newGame.js';
import { AREAS } from '../data/diseases.js';
import { esc } from './format.js';

export function startScreen(ui, hasSave) {
  const f = ui.setup;
  const cards = Object.entries(SCENARIOS).map(([k, s]) => `<button type="button" class="scenario ${f.scenario === k ? 'on' : ''}" data-act="pickScenario" data-value="${k}" aria-pressed="${f.scenario === k}">
    <span class="scenario-tag">${{ startup: 'Desafio alto', media: 'Equilibrado', big: 'Gestão de crise' }[k]}</span>
    <b>${esc(s.name)}</b><span>${esc(s.blurb)}</span></button>`).join('');
  const diffs = Object.entries(DIFFICULTIES).map(([k, d]) => `<button type="button" class="${f.difficulty === k ? 'on' : ''}" data-act="pickDifficulty" data-value="${k}">${d.label}</button>`).join('');
  return `<main class="start">
    <div class="start-hero">
      <div class="logo-capsule" aria-hidden="true"><span></span><span></span></div>
      <p class="eyebrow">Simulador da indústria farmacêutica</p>
      <h1>Big Pharma Sim</h1>
      <p class="lede">Descubra moléculas, conduza ensaios clínicos, enfrente agências reguladoras, defenda patentes, defina preços e decida o que fazer quando um efeito adverso raro aparece em milhões de pacientes. Você tem 25 anos de mandato.</p>
    </div>
    <form class="start-form" data-form="start">
      <div class="field"><label class="field-label" for="companyName">Nome da empresa</label>
        <input id="companyName" type="text" maxlength="28" value="${esc(f.name)}" autocomplete="off"></div>
      <div class="field"><span class="field-label">Ponto de partida</span><div class="scenarios">${cards}</div></div>
      <div class="start-row">
        ${f.scenario === 'startup' ? `<div class="field"><label class="field-label" for="focusArea">Área de foco da startup</label>
          <select id="focusArea">${Object.entries(AREAS).filter(([k]) => k !== 'geral').map(([k, a]) => `<option value="${k}" ${f.focus === k ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>` : ''}
        <div class="field"><span class="field-label">Dificuldade</span><div class="seg">${diffs}</div></div>
        <div class="field"><label class="field-label" for="seed">Semente (opcional)</label><input id="seed" type="number" min="0" placeholder="aleatória" value="${esc(f.seed ?? '')}"></div>
      </div>
      <div class="start-actions">
        ${hasSave ? '<button type="button" class="btn ghost" data-act="resumeGame">Continuar jogo salvo</button>' : ''}
        <button type="submit" class="btn primary big" data-act="startGame">Fundar a empresa</button>
      </div>
    </form>
  </main>`;
}
