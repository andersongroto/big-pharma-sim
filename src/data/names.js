export const RIVALS = [
  { id: 'novacura', name: 'Novacura', country: 'Suíça', strength: 1.0, areas: ['onco', 'imuno', 'neuro'] },
  { id: 'helix', name: 'Helix Therapeutics', country: 'EUA', strength: 0.9, areas: ['onco', 'raras', 'imuno'] },
  { id: 'medivant', name: 'Medivant', country: 'EUA', strength: 1.0, areas: ['cardio', 'resp', 'imuno'] },
  { id: 'sanovita', name: 'Sanovita', country: 'França', strength: 0.8, areas: ['cardio', 'infecto', 'neuro'] },
  { id: 'kyoto', name: 'Kyoto Seiyaku', country: 'Japão', strength: 0.7, areas: ['neuro', 'cardio', 'onco'] },
  { id: 'nordbio', name: 'Nordbio', country: 'Dinamarca', strength: 0.6, areas: ['cardio', 'raras', 'geral'] },
  { id: 'shenzhen', name: 'Shenzhen BioGen', country: 'China', strength: 0.7, areas: ['onco', 'infecto', 'imuno'] },
];

export const GENERIC_MAKERS = ['Genéricos Aurora', 'Medfarma Genéricos', 'Tevalis', 'Cipra Labs', 'Sandora Biossimilares', 'Lupin Prime'];

export const BIOTECHS = [
  'Lumina Bio', 'Arcadia Therapeutics', 'Ventral Bio', 'Quorum Gene', 'Halcyon RNA', 'Brisa Biotech',
  'Ipê Biociências', 'Tamarind Tx', 'Nautilus Bio', 'Cerrado Genômica', 'Kestrel Oncology', 'Pampa Biologics',
  'Mosaic Immune', 'Atlas Neuro', 'Juniper Cell', 'Orla Therapeutics', 'Vértice Bio', 'Selene Pharma',
];

const PRE = ['Zen', 'Cor', 'Vel', 'Ax', 'Lu', 'Tri', 'Ner', 'Ori', 'Sol', 'Pra', 'Ky', 'Ima', 'Ven', 'Qua', 'Fla', 'Dal', 'Ely', 'Rho', 'Tav', 'Ziv', 'Bre', 'Ond', 'Myl', 'Exo', 'Har'];
const MID = ['ra', 've', 'li', 'to', 'xa', 'mi', 'no', 'pre', 'si', 'ta', 'de', 'lo', 'ri', ''];
const SUF = ['via', 'xa', 'dra', 'lix', 'nex', 'tra', 'zol', 'vin', 'fy', 'tiq', 'lor', 'mira', 'vance', 'tal', 'quel'];

export function brandName(rng) {
  return PRE[Math.floor(rng() * PRE.length)] + MID[Math.floor(rng() * MID.length)] + SUF[Math.floor(rng() * SUF.length)];
}
