// Conquistas, metas de cenário e pontuação.
import { clamp } from './util.js';

export const ACHIEVEMENTS = [
  { id: 'descoberta', name: 'Eureka', desc: 'Descubra sua primeira molécula líder.' },
  { id: 'fase3', name: 'Aposta alta', desc: 'Inicie um ensaio de Fase III.' },
  { id: 'aprovacao', name: 'Aprovado!', desc: 'Obtenha uma aprovação regulatória.' },
  { id: 'blockbuster', name: 'Blockbuster', desc: 'Tenha um produto com US$ 1 bi de vendas anuais.' },
  { id: 'mega', name: 'Megablockbuster', desc: 'Tenha um produto com US$ 10 bi de vendas anuais.' },
  { id: 'serendipidade', name: 'Serendipidade', desc: 'Descubra uma nova indicação por um efeito inesperado.' },
  { id: 'reposicionamento', name: 'Segunda vida', desc: 'Aprove um medicamento para uma doença diferente da original.' },
  { id: 'orfa', name: 'Nenhum paciente esquecido', desc: 'Aprove um medicamento para doença rara.' },
  { id: 'cura', name: 'Dose única', desc: 'Aprove uma terapia gênica ou celular.' },
  { id: 'saude_global', name: 'Saúde global', desc: 'Aprove um tratamento para tuberculose ou malária.' },
  { id: 'prv', name: 'Bilhete dourado', desc: 'Ganhe um voucher de revisão prioritária.' },
  { id: 'global', name: 'Presença global', desc: 'Aprove um produto nos seis mercados.' },
  { id: 'superioridade', name: 'Cabeça a cabeça', desc: 'Vença o tratamento padrão em um estudo comparativo.' },
  { id: 'vitoria_judicial', name: 'Patente blindada', desc: 'Vença um litígio de patente.' },
  { id: 'licenciador', name: 'Negociador', desc: 'Licencie um ativo por US$ 500 mi ou mais à vista.' },
  { id: 'fabrica', name: 'Chão de fábrica', desc: 'Inaugure uma fábrica própria.' },
  { id: 'milhao', name: 'Um milhão de pacientes', desc: 'Trate 1 milhão de pacientes por ano.' },
  { id: 'valor10', name: 'Decacórnio', desc: 'Alcance US$ 10 bi de valor de mercado.' },
  { id: 'valor100', name: 'Gigante', desc: 'Alcance US$ 100 bi de valor de mercado.' },
  { id: 'reputacao', name: 'Empresa admirada', desc: 'Chegue a 85 pontos de reputação.' },
  { id: 'vilao', name: 'Vilão da indústria', desc: 'Deixe a reputação cair abaixo de 15.' },
  { id: 'penhasco', name: 'Além do penhasco', desc: 'Volte ao pico de receita depois de perder a exclusividade de um produto importante.' },
];

export const OBJECTIVES = {
  startup: [
    { id: 'o1', text: 'Conquiste a primeira aprovação regulatória', check: (s) => s.stats.approvals >= 1 },
    { id: 'o2', text: 'Alcance US$ 1 bi de receita anual', check: (s) => s.stats.rev12 >= 1000 },
    { id: 'o3', text: 'Chegue a US$ 25 bi de valor de mercado', check: (s) => s.marketCap >= 25000 },
  ],
  media: [
    { id: 'o1', text: 'Aprove 2 novos medicamentos ou indicações', check: (s) => s.stats.newApprovals >= 2 },
    { id: 'o2', text: 'Dobre a receita anual inicial', check: (s) => s.stats.rev12 >= 2 * s.stats.initialRev12 },
    { id: 'o3', text: 'Chegue a US$ 60 bi de valor de mercado', check: (s) => s.marketCap >= 60000 },
  ],
  big: [
    { id: 'o1', text: 'Aprove 5 novos medicamentos ou indicações', check: (s) => s.stats.newApprovals >= 5 },
    { id: 'o2', text: 'Após o 5º ano, mantenha a receita acima da inicial', check: (s) => s.month >= 60 && s.stats.rev12 >= s.stats.initialRev12 },
    { id: 'o3', text: 'Chegue a US$ 250 bi de valor de mercado', check: (s) => s.marketCap >= 250000 },
  ],
};

export function checkAchievements(state) {
  const A = state.achievements;
  const now = state.month;
  for (const a of state.assets) {
    if (a.peakAnnual >= 1000) A.blockbuster ??= now;
    if (a.peakAnnual >= 10000) A.mega ??= now;
  }
  if (state.stats.patientsNow >= 1e6) A.milhao ??= now;
  if (state.marketCap >= 10000) A.valor10 ??= now;
  if (state.marketCap >= 100000) A.valor100 ??= now;
  if (state.reputation >= 85) A.reputacao ??= now;
  if (state.reputation < 15) A.vilao ??= now;
  if (state.assets.some((a) => Object.values(a.inds).some((i) => i.trial?.phase === 'fase3'))) A.fase3 ??= now;
  for (const lost of state.stats.lostExclusivity) {
    if (lost.annual > 500 && state.month - lost.month <= 72 && state.month > lost.month + 12 && state.stats.rev12 >= lost.companyRev) A.penhasco ??= now;
  }
  state.objectivesDone ||= {};
  for (const o of OBJECTIVES[state.scenario]) {
    if (!state.objectivesDone[o.id] && o.check(state)) state.objectivesDone[o.id] = now;
  }
}

export function score(state) {
  const capB = state.marketCap / 1000;
  const parts = {
    valor: Math.round(Math.sqrt(Math.max(0, capB)) * 120),
    pacientes: Math.round(Math.sqrt(state.stats.patientYears / 1e5) * 40),
    aprovacoes: state.stats.newApprovals * 60,
    reputacao: Math.round(state.reputation * 4),
    conquistas: Object.keys(state.achievements).filter((k) => k !== 'vilao').length * 25,
    metas: Object.keys(state.objectivesDone || {}).length * 150,
  };
  const total = Object.values(parts).reduce((s, x) => s + x, 0);
  return { parts, total };
}

export function rankFor(total) {
  const ranks = [
    [0, 'Estagiário de bancada'],
    [500, 'Gerente de projeto'],
    [1000, 'Diretor de P&D'],
    [1600, 'Vice-presidente'],
    [2300, 'CEO respeitado'],
    [3200, 'Lenda da indústria'],
  ];
  let r = ranks[0][1];
  for (const [min, name] of ranks) if (total >= min) r = name;
  return r;
}

export const GAME_LENGTH = 300; // 25 anos
export const progress = (s) => clamp(s.month / GAME_LENGTH, 0, 1);
