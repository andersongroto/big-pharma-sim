// Mercados e suas agências regulatórias.
// patientShare: fração dos pacientes globais endereçáveis que vivem no mercado.
// priceIndex: nível de preço relativo aos EUA. priceSens: elasticidade-preço da demanda.
// slack/k: tolerância e rigor do pagador (ATS/HTA) a preços acima do preço justo pelo valor.
export const MARKETS = [
  {
    id: 'US', name: 'Estados Unidos', short: 'EUA', agency: 'FDA',
    agencyName: 'Food and Drug Administration',
    budget: 45, patientShare: 0.22, priceIndex: 1.0, priceSens: 0.3, slack: 0.55, k: 5, netFactor: 0.65,
    reviewMonths: 12, priorityMonths: 8, strictness: 0.62, filingFee: 4,
    dataExcl: { small: 60, bio: 144 }, orphanExcl: 84, pte: true,
    dtc: true, mktScale: 8, subsidiary: { setup: 40, monthly: 3 }, distributorCut: 0.35,
    compulsoryRisk: 0, localData: false, trialCost: 1.4, genericSpeed: 1.0,
    evergreenBlocked: false, priceCeiling: false,
    note: 'Maior mercado do mundo e preços livres, mas com descontos pesados para os planos de saúde (PBMs). É o único que permite propaganda direta ao consumidor.',
  },
  {
    id: 'EU', name: 'União Europeia', short: 'UE', agency: 'EMA',
    agencyName: 'European Medicines Agency',
    budget: 25, patientShare: 0.24, priceIndex: 0.55, priceSens: 0.45, slack: 0.12, k: 9, netFactor: 0.92,
    reviewMonths: 14, priorityMonths: 9, strictness: 0.66, filingFee: 1.5,
    dataExcl: { small: 120, bio: 120 }, orphanExcl: 120, pte: true,
    dtc: false, mktScale: 7, subsidiary: { setup: 35, monthly: 2.5 }, distributorCut: 0.35,
    compulsoryRisk: 0.02, localData: false, trialCost: 1.0, genericSpeed: 0.9,
    evergreenBlocked: false, priceCeiling: false,
    note: 'Avaliação de tecnologias em saúde rigorosa: preço acima do valor clínico reduz drasticamente o reembolso.',
  },
  {
    id: 'JP', name: 'Japão', short: 'JP', agency: 'PMDA',
    agencyName: 'Pharmaceuticals and Medical Devices Agency',
    budget: 10, patientShare: 0.07, priceIndex: 0.6, priceSens: 0.3, slack: 0.3, k: 6, netFactor: 0.95,
    reviewMonths: 12, priorityMonths: 9, strictness: 0.7, filingFee: 1,
    dataExcl: { small: 96, bio: 96 }, orphanExcl: 120, pte: true,
    dtc: false, mktScale: 3, subsidiary: { setup: 25, monthly: 1.5 }, distributorCut: 0.3,
    compulsoryRisk: 0, localData: true, trialCost: 1.3, genericSpeed: 0.7,
    evergreenBlocked: false, priceCeiling: false, biennialCut: true,
    note: 'Exige dados de pacientes japoneses (estudo-ponte) e revisa preços para baixo a cada dois anos.',
  },
  {
    id: 'CN', name: 'China', short: 'CN', agency: 'NMPA',
    agencyName: 'National Medical Products Administration',
    budget: 8, patientShare: 0.2, priceIndex: 0.28, priceSens: 0.9, slack: 0, k: 8, netFactor: 0.9,
    reviewMonths: 18, priorityMonths: 12, strictness: 0.55, filingFee: 0.5,
    dataExcl: { small: 72, bio: 72 }, orphanExcl: 0, pte: false,
    dtc: false, mktScale: 4, subsidiary: { setup: 30, monthly: 2 }, distributorCut: 0.4,
    compulsoryRisk: 0.08, localData: true, trialCost: 0.55, genericSpeed: 1.3,
    evergreenBlocked: false, priceCeiling: false,
    note: 'Enorme volume, mas a lista nacional de reembolso exige grandes cortes de preço. Requer dados de pacientes chineses.',
  },
  {
    id: 'BR', name: 'Brasil', short: 'BR', agency: 'ANVISA',
    agencyName: 'Agência Nacional de Vigilância Sanitária',
    budget: 3.5, patientShare: 0.1, priceIndex: 0.38, priceSens: 0.8, slack: 0.1, k: 7, netFactor: 0.9,
    reviewMonths: 16, priorityMonths: 10, strictness: 0.58, filingFee: 0.3,
    dataExcl: { small: 0, bio: 0 }, orphanExcl: 0, pte: false,
    dtc: false, mktScale: 1.8, subsidiary: { setup: 15, monthly: 1 }, distributorCut: 0.35,
    compulsoryRisk: 0.25, localData: false, trialCost: 0.65, genericSpeed: 1.1,
    evergreenBlocked: false, priceCeiling: true,
    note: 'Preço máximo definido pela CMED, incorporação ao SUS via CONITEC e histórico de licença compulsória (efavirenz, 2007). Sem extensão de prazo de patente.',
  },
  {
    id: 'IN', name: 'Índia', short: 'IN', agency: 'CDSCO',
    agencyName: 'Central Drugs Standard Control Organisation',
    budget: 2, patientShare: 0.17, priceIndex: 0.1, priceSens: 1.25, slack: 0.5, k: 3, netFactor: 0.95,
    reviewMonths: 14, priorityMonths: 9, strictness: 0.45, filingFee: 0.1,
    dataExcl: { small: 0, bio: 0 }, orphanExcl: 0, pte: false,
    dtc: false, mktScale: 1.2, subsidiary: { setup: 10, monthly: 0.8 }, distributorCut: 0.3,
    compulsoryRisk: 0.35, localData: true, trialCost: 0.4, genericSpeed: 1.6,
    evergreenBlocked: true, priceCeiling: false,
    note: 'A "farmácia do mundo": genéricos fortíssimos, pagamento do próprio bolso e a Seção 3(d) que nega patentes secundárias (evergreening).',
  },
];

export const MARKET_BY_ID = Object.fromEntries(MARKETS.map((m) => [m.id, m]));
export const MARKET_IDS = MARKETS.map((m) => m.id);
