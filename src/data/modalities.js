// Modalidades terapêuticas. Definem custos, conveniência, produção e a dinâmica pós-patente.
// cogsRate: custo de produção como fração do preço de referência da doença de origem (com piso cogsMin, em US$).
// prod: tipo de fábrica necessária. erosion: perda máxima de participação para genéricos/biossimilares e velocidade (tau, em meses).
export const MODALITIES = {
  pequena: {
    name: 'Molécula pequena', route: 'Oral', conv: 0.8, discovery: 1.0, preCost: 0.9, preMonths: 12,
    trialCost: 1.0, cogsRate: 0.02, cogsMin: 3, prod: 'quimico', exclClass: 'small',
    erosion: { max: 0.9, tau: 4 }, genericRatio: 0.15, injectable: false,
  },
  biologico: {
    name: 'Biológico', route: 'Injetável', conv: 0.55, discovery: 1.25, preCost: 1.4, preMonths: 15,
    trialCost: 1.3, cogsRate: 0.045, cogsMin: 20, prod: 'biologico', exclClass: 'bio',
    erosion: { max: 0.55, tau: 18 }, genericRatio: 0.65, injectable: true,
  },
  rna: {
    name: 'Oligonucleotídeo/RNA', route: 'Injeção semestral', conv: 0.7, discovery: 1.15, preCost: 1.1, preMonths: 12,
    trialCost: 1.15, cogsRate: 0.05, cogsMin: 30, prod: 'quimico', exclClass: 'small',
    erosion: { max: 0.75, tau: 8 }, genericRatio: 0.3, injectable: true,
  },
  gene: {
    name: 'Terapia gênica/celular', route: 'Infusão única', conv: 0.9, discovery: 1.6, preCost: 2.2, preMonths: 18,
    trialCost: 1.8, cogsRate: 0.15, cogsMin: 50000, prod: 'avancado', exclClass: 'bio',
    erosion: { max: 0.3, tau: 30 }, genericRatio: 0.8, injectable: true,
  },
  vacina: {
    name: 'Vacina', route: 'Injeção anual', conv: 0.75, discovery: 1.2, preCost: 1.2, preMonths: 12,
    trialCost: 0.8, cogsRate: 0.25, cogsMin: 3, prod: 'biologico', exclClass: 'bio',
    erosion: { max: 0.5, tau: 18 }, genericRatio: 0.6, injectable: true,
  },
};

export const PROD_TYPES = {
  quimico: { name: 'Síntese química', build: 200, months: 18, opex: 4, capacity: 5_000_000, unit: 'pacientes-mês' },
  biologico: { name: 'Biológicos (biorreatores)', build: 500, months: 30, opex: 10, capacity: 600_000, unit: 'pacientes-mês' },
  avancado: { name: 'Terapias avançadas', build: 300, months: 24, opex: 6, capacity: 150, unit: 'tratamentos' },
};

// Capacidade máxima mensal que fabricantes terceirizados (CMOs) conseguem absorver por tipo.
export const CMO_LIMIT = { quimico: Infinity, biologico: Infinity, avancado: 60 };
export const CMO_MARKUP = 1.8;
