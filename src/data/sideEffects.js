// Efeitos adversos. severity: 0 = efeito inesperado benéfico, 1 leve, 2 moderado, 3 grave, 4 potencialmente fatal.
export const SIDE_EFFECTS = {
  nausea: { name: 'Náusea', severity: 1 },
  cefaleia: { name: 'Cefaleia', severity: 1 },
  diarreia: { name: 'Diarreia', severity: 1 },
  fadiga: { name: 'Fadiga', severity: 1 },
  tontura: { name: 'Tontura', severity: 1 },
  insonia: { name: 'Insônia', severity: 1 },
  rash: { name: 'Erupção cutânea', severity: 1 },
  constipacao: { name: 'Constipação', severity: 1 },
  conjuntivite: { name: 'Conjuntivite', severity: 1 },
  reacao_injecao: { name: 'Reação no local da injeção', severity: 1 },
  ganho_peso: { name: 'Ganho de peso', severity: 1 },
  perda_peso: { name: 'Perda de peso acentuada', severity: 1 },

  enzimas_hepaticas: { name: 'Elevação de enzimas hepáticas', severity: 2 },
  hipoglicemia: { name: 'Hipoglicemia', severity: 2 },
  pressao_baixa: { name: 'Hipotensão', severity: 2 },
  dissociacao: { name: 'Sintomas dissociativos', severity: 2 },

  infeccao: { name: 'Infecções graves', severity: 3 },
  qt: { name: 'Prolongamento do intervalo QT', severity: 3 },
  tromboembolismo: { name: 'Tromboembolismo', severity: 3 },
  pancreatite: { name: 'Pancreatite', severity: 3 },
  suicidio: { name: 'Ideação suicida', severity: 3 },
  neutropenia: { name: 'Neutropenia', severity: 3 },
  crs: { name: 'Síndrome de liberação de citocinas', severity: 3 },
  aria: { name: 'Edema cerebral (ARIA)', severity: 3 },
  cetoacidose: { name: 'Cetoacidose', severity: 3 },
  angioedema: { name: 'Angioedema', severity: 3 },
  hipercalemia: { name: 'Hipercalemia', severity: 3 },
  reacao_imune: { name: 'Reações imunomediadas graves', severity: 3 },
  pneumonite: { name: 'Pneumonite', severity: 3 },
  neurotoxicidade: { name: 'Neurotoxicidade', severity: 3 },
  lesao_renal: { name: 'Lesão renal aguda', severity: 3 },

  hepatotox: { name: 'Insuficiência hepática aguda', severity: 4 },
  linfoma: { name: 'Linfoma secundário', severity: 4 },
  arritmia_fatal: { name: 'Arritmia fatal', severity: 4 },
  pml: { name: 'Leucoencefalopatia multifocal progressiva', severity: 4 },
  anafilaxia: { name: 'Anafilaxia', severity: 4 },
  perda_visao: { name: 'Perda súbita de visão', severity: 4 },
  miocardite: { name: 'Miocardite', severity: 4 },

  // Efeitos inesperados que sugerem novas indicações (serendipidade).
  erecao: { name: 'Ereções espontâneas', severity: 0 },
  crescimento_capilar: { name: 'Crescimento de cabelo', severity: 0 },
  melhora_respiratoria: { name: 'Melhora da função respiratória', severity: 0 },
  melhora_cognitiva: { name: 'Melhora cognitiva', severity: 0 },
  protecao_renal: { name: 'Redução de proteinúria', severity: 0 },
  melhora_cardiaca: { name: 'Menos internações por insuficiência cardíaca', severity: 0 },
  reducao_colesterol: { name: 'Queda do colesterol LDL', severity: 0 },
};

export const MILD_POOL = ['nausea', 'cefaleia', 'diarreia', 'fadiga', 'tontura', 'insonia', 'rash', 'constipacao'];
export const SERIOUS_POOL = ['enzimas_hepaticas', 'infeccao', 'qt', 'neutropenia', 'lesao_renal', 'pneumonite', 'tromboembolismo'];
export const SEVERE_POOL = ['hepatotox', 'arritmia_fatal', 'anafilaxia', 'perda_visao', 'miocardite'];
