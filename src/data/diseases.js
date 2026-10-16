export const AREAS = {
  onco: { name: 'Oncologia', short: 'Onco' },
  cardio: { name: 'Cardiometabólica', short: 'Cardio' },
  neuro: { name: 'Neurociências', short: 'Neuro' },
  imuno: { name: 'Imunologia', short: 'Imuno' },
  infecto: { name: 'Infectologia', short: 'Infecto' },
  raras: { name: 'Doenças raras', short: 'Raras' },
  resp: { name: 'Respiratória', short: 'Resp' },
  geral: { name: 'Saúde geral', short: 'Geral' },
};

// patients: milhares de pacientes em tratamento (doenças crônicas, course = 0)
//           ou milhares de tratamentos por ano (course > 0 = meses por tratamento).
// refPrice: preço de referência nos EUA, em US$ por mês de tratamento
//           (para terapias de dose única, course = 1, é o preço do tratamento inteiro).
// soc: eficácia do tratamento padrão atual (0–1). placebo: resposta ao placebo.
// difficulty: dificuldade biológica. publicHealth: prioridade de saúde pública (risco de licença compulsória).
// trialMult: custo por paciente nos ensaios. trialSize: tamanho relativo dos ensaios de Fase II/III.
// regions: distribuição regional específica (fora do padrão de cada mercado).
function d(id, name, area, patients, course, refPrice, severity, soc, placebo, difficulty, orphan, publicHealth, trialMult, trialSize, extra = {}) {
  return { id, name, area, patients, course, refPrice, severity, soc, placebo, difficulty, orphan, publicHealth, trialMult, trialSize, ...extra };
}

export const DISEASES = [
  d('nsclc', 'Câncer de pulmão (não pequenas células)', 'onco', 900, 0, 14000, 5, 0.3, 0.05, 0.55, false, 0.45, 1.6, 0.6),
  d('mama_her2', 'Câncer de mama HER2+', 'onco', 500, 0, 11000, 4, 0.45, 0.05, 0.45, false, 0.45, 1.5, 0.6),
  d('melanoma', 'Melanoma metastático', 'onco', 150, 0, 15000, 5, 0.4, 0.04, 0.5, false, 0.35, 1.6, 0.4),
  d('lmc', 'Leucemia mieloide crônica', 'onco', 150, 0, 9000, 4, 0.7, 0.03, 0.4, false, 0.5, 1.4, 0.3),
  d('mieloma', 'Mieloma múltiplo', 'onco', 300, 0, 16000, 5, 0.35, 0.04, 0.5, false, 0.35, 1.6, 0.4),
  d('pancreas', 'Câncer de pâncreas', 'onco', 250, 0, 13000, 5, 0.08, 0.03, 0.85, false, 0.35, 1.7, 0.5),

  d('dm2', 'Diabetes tipo 2', 'cardio', 35000, 0, 450, 3, 0.45, 0.1, 0.35, false, 0.6, 0.7, 1.4),
  d('obesidade', 'Obesidade', 'cardio', 15000, 0, 900, 2, 0.1, 0.08, 0.45, false, 0.4, 0.7, 1.3),
  d('ic', 'Insuficiência cardíaca', 'cardio', 8000, 0, 500, 4, 0.4, 0.06, 0.45, false, 0.5, 0.9, 1.4),
  d('hipercol', 'Hipercolesterolemia familiar', 'cardio', 6000, 0, 550, 3, 0.55, 0.05, 0.3, false, 0.4, 0.7, 1.2),
  d('has', 'Hipertensão resistente', 'cardio', 15000, 0, 250, 3, 0.35, 0.12, 0.35, false, 0.6, 0.7, 1.2),
  d('mash', 'Esteato-hepatite (MASH)', 'cardio', 6000, 0, 1200, 3, 0.05, 0.08, 0.7, false, 0.3, 0.9, 1.1),
  d('drc', 'Doença renal crônica', 'cardio', 12000, 0, 450, 4, 0.3, 0.05, 0.5, false, 0.5, 0.8, 1.3),

  d('alzheimer', 'Doença de Alzheimer', 'neuro', 5000, 0, 2200, 5, 0.05, 0.05, 0.9, false, 0.55, 1.1, 1.0),
  d('parkinson', 'Doença de Parkinson', 'neuro', 4000, 0, 900, 4, 0.4, 0.15, 0.7, false, 0.4, 1.0, 0.8),
  d('em', 'Esclerose múltipla', 'neuro', 1200, 0, 7000, 4, 0.5, 0.1, 0.5, false, 0.3, 1.1, 0.7),
  d('enxaqueca', 'Enxaqueca crônica', 'neuro', 9000, 0, 650, 2, 0.35, 0.25, 0.35, false, 0.2, 0.8, 0.9),
  d('depressao', 'Depressão resistente', 'neuro', 7000, 0, 800, 4, 0.3, 0.3, 0.6, false, 0.5, 0.9, 0.9),
  d('esquizo', 'Esquizofrenia', 'neuro', 5000, 0, 1100, 4, 0.45, 0.2, 0.6, false, 0.45, 1.0, 0.8),

  d('ar', 'Artrite reumatoide', 'imuno', 2500, 0, 4500, 3, 0.5, 0.15, 0.4, false, 0.3, 1.0, 0.9),
  d('psoriase', 'Psoríase moderada a grave', 'imuno', 2000, 0, 5000, 2, 0.55, 0.08, 0.35, false, 0.15, 0.9, 0.8),
  d('dii', 'Doença inflamatória intestinal', 'imuno', 1800, 0, 5500, 3, 0.4, 0.12, 0.45, false, 0.25, 1.0, 0.8),
  d('dermatite', 'Dermatite atópica grave', 'imuno', 2200, 0, 3500, 2, 0.35, 0.12, 0.4, false, 0.15, 0.9, 0.8),
  d('lupus', 'Lúpus eritematoso sistêmico', 'imuno', 900, 0, 4000, 4, 0.25, 0.15, 0.7, false, 0.3, 1.1, 0.6),
  d('alopecia', 'Alopecia areata', 'imuno', 1500, 0, 2500, 1, 0.05, 0.05, 0.5, false, 0.05, 0.8, 0.6),

  d('hiv', 'HIV/aids', 'infecto', 8000, 0, 3000, 5, 0.75, 0.0, 0.45, false, 1.0, 0.8, 1.0,
    { regions: { US: 0.1, EU: 0.08, JP: 0.005, CN: 0.1, BR: 0.08, IN: 0.2 } }),
  d('hepc', 'Hepatite C', 'infecto', 700, 3, 28000, 4, 0.5, 0.0, 0.5, false, 0.9, 0.8, 0.8),
  d('tb', 'Tuberculose multirresistente', 'infecto', 400, 9, 1500, 5, 0.4, 0.0, 0.6, false, 1.0, 0.7, 0.6,
    { prv: true, regions: { US: 0.005, EU: 0.02, JP: 0.005, CN: 0.2, BR: 0.03, IN: 0.45 } }),
  d('malaria', 'Malária grave', 'infecto', 8000, 1, 60, 5, 0.6, 0.0, 0.55, false, 1.0, 0.5, 0.8,
    { prv: true, regions: { US: 0.01, EU: 0.01, JP: 0, CN: 0.02, BR: 0.1, IN: 0.55 } }),
  d('superbac', 'Infecções por bactérias multirresistentes', 'infecto', 3000, 0.5, 6000, 5, 0.35, 0.05, 0.65, false, 0.8, 0.9, 0.7),
  d('influenza', 'Influenza (vacinação anual)', 'infecto', 400000, 1, 30, 2, 0.45, 0.0, 0.4, false, 0.8, 0.3, 2.0),

  d('ame', 'Atrofia muscular espinhal (AME)', 'raras', 6, 1, 2100000, 5, 0.35, 0.0, 0.6, true, 0.25, 3.0, 0.15, { prv: true }),
  d('fc', 'Fibrose cística', 'raras', 90, 0, 25000, 5, 0.55, 0.05, 0.5, true, 0.2, 2.0, 0.2),
  d('hemofilia', 'Hemofilia A', 'raras', 80, 0, 35000, 4, 0.6, 0.0, 0.45, true, 0.3, 2.0, 0.2),
  d('fabry', 'Doença de Fabry', 'raras', 25, 0, 30000, 4, 0.4, 0.05, 0.5, true, 0.1, 2.2, 0.15),
  d('duchenne', 'Distrofia muscular de Duchenne', 'raras', 30, 0, 40000, 5, 0.1, 0.05, 0.8, true, 0.2, 2.5, 0.15, { prv: true }),

  d('asma', 'Asma grave', 'resp', 2500, 0, 3200, 3, 0.45, 0.15, 0.4, false, 0.3, 0.9, 0.9),
  d('dpoc', 'DPOC', 'resp', 15000, 0, 400, 3, 0.35, 0.1, 0.45, false, 0.5, 0.8, 1.2),
  d('fpi', 'Fibrose pulmonar idiopática', 'resp', 300, 0, 9000, 5, 0.25, 0.03, 0.7, true, 0.2, 1.4, 0.4),
  d('hap', 'Hipertensão arterial pulmonar', 'resp', 200, 0, 8000, 5, 0.35, 0.05, 0.5, true, 0.2, 1.4, 0.3),

  d('de', 'Disfunção erétil', 'geral', 12000, 0, 250, 1, 0.2, 0.2, 0.4, false, 0.05, 0.6, 0.9),
];

export const DISEASE_BY_ID = Object.fromEntries(DISEASES.map((x) => [x.id, x]));
