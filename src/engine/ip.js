// Propriedade intelectual e acesso: patentes, genéricos, litígios, licenças compulsórias e controle de preços.
import { DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { MARKET_BY_ID as MKT } from '../data/markets.js';
import { MODALITIES } from '../data/modalities.js';
import { GENERIC_MAKERS } from '../data/names.js';
import { exclusivity, approvedIn, assetName, suggestedPrice, patentEndOf } from './model.js';
import { clamp, chance, pick, news, queueEvent } from './util.js';

const annualIn = (pm) => pm.rev * 12;

export function ipTick(state) {
  for (const a of state.assets) {
    if (a.owner !== 'player') continue;
    for (const p of a.patents) {
      if (p.status !== 'ativa') continue;
      if (state.month >= p.filed + 240 + (p.ext || 0)) {
        p.status = 'expirada';
        if (Object.keys(a.markets).length && p.kind === 'composto') {
          news(state, `A patente de composto de ${assetName(a)} expirou.`, 'alerta', { tab: 'patentes' });
        }
      }
    }
    const usPm = a.markets.US;
    for (const [m, pm] of Object.entries(a.markets)) {
      if (pm.launched == null) continue;
      const M = MKT[m];
      const ex = exclusivity(state, a, m);
      if (pm.genericSince == null && state.month >= ex.end) {
        pm.genericSince = state.month;
        pm.priceAtLoss = pm.price;
        const kind = MODALITIES[a.modality].exclClass === 'bio' ? 'Biossimilares' : 'Genéricos';
        news(state, `${kind} de ${assetName(a)} chegam ao mercado ${M.name === 'União Europeia' ? 'europeu' : `de ${M.name}`}. Espere forte queda de participação.`, 'alerta', { tab: 'patentes', id: a.id });
        if (annualIn(pm) > 50) state.stats.lostExclusivity.push({ assetId: a.id, m, month: state.month, annual: annualIn(pm), companyRev: state.stats.rev12 });
      }
      if (pm.pdpUntil != null && state.month === pm.pdpUntil) {
        pm.genericSince ??= state.month;
        pm.priceAtLoss ??= pm.price;
        news(state, `Transferência de tecnologia concluída: laboratório público passa a produzir ${assetName(a)} no Brasil.`, 'info');
      }
      if (pm.genericSince != null) continue;

      const ds = approvedIn(a, m);
      if (!ds.length) continue;
      const fair = suggestedPrice(state, a, m);
      const ratio = pm.price / Math.max(1, fair);
      const maxPH = Math.max(...ds.map((d) => DIS[d].publicHealth));
      const maxSev = Math.max(...ds.map((d) => DIS[d].severity));

      // preços abusivos em doenças graves corroem a reputação
      if (ratio > 1.4 && maxSev >= 4) {
        state.reputation = clamp(state.reputation - 0.08 * Math.min(3, ratio - 1.4) * (pm.rev > 10 ? 1 : 0.3), 0, 100);
      }

      // ameaça de licença compulsória
      if (M.compulsoryRisk > 0 && !pm.licensed && state.month >= (pm.compCooldown ?? 0)) {
        const pressure = M.compulsoryRisk * maxPH * Math.max(0, ratio - 0.8) * (1.3 - state.reputation / 100) * (a.flags.pap ? 0.5 : 1) * (annualIn(pm) > 10 ? 1 : 0.3);
        if (chance(state, clamp(pressure * 0.08, 0, 0.05))) {
          pm.compCooldown = state.month + 24;
          queueEvent(state, 'compulsory', { assetId: a.id, m });
        }
      }

      // audiência pública sobre preços nos EUA
      if (m === 'US' && ratio > 1.4 && annualIn(pm) > 500 && state.month >= (pm.hearingCooldown ?? 0) && chance(state, 0.012)) {
        pm.hearingCooldown = state.month + 36;
        queueEvent(state, 'price_hearing', { assetId: a.id });
      }
    }

    // negociação de preços do Medicare (lei de redução da inflação, EUA)
    if (usPm?.launched != null && !a.flags.ira && usPm.genericSince == null) {
      const years = MODALITIES[a.modality].exclClass === 'bio' ? 156 : 108;
      const onlyOrphan = approvedIn(a, 'US').every((d) => DIS[d].orphan);
      if (state.month - usPm.launched >= years && annualIn(usPm) > 200 && !onlyOrphan) {
        a.flags.ira = 'pendente';
        queueEvent(state, 'ira', { assetId: a.id });
      }
    }

    // desafio judicial de patente por fabricantes de genéricos
    if (usPm?.launched != null && usPm.genericSince == null && !state.litigations.some((l) => l.assetId === a.id && !l.done)) {
      const ex = exclusivity(state, a, 'US');
      const p = a.patents.find((x) => x.id === ex.patentId);
      const annualUS = annualIn(usPm);
      if (p && !p.settleAt && ex.patentEnd > ex.dataEnd + 6 && ex.patentEnd - state.month > 30 && annualUS > 300 && state.month >= (a.challengeCooldown ?? 0)) {
        const hazard = 0.02 * state.diff.compRate * (p.kind === 'composto' ? 1 : 2.5);
        if (chance(state, hazard)) {
          a.challengeCooldown = state.month + 30;
          queueEvent(state, 'patent_challenge', { assetId: a.id, patentId: p.id, challenger: pick(state, GENERIC_MAKERS) });
        }
      }
    }
  }

  // julgamentos de litígios
  for (const lit of state.litigations) {
    if (lit.done || state.month < lit.resolveAt) continue;
    lit.done = true;
    const a = state.assets.find((x) => x.id === lit.assetId);
    const p = a?.patents.find((x) => x.id === lit.patentId);
    if (!a || !p) continue;
    if (chance(state, lit.winP)) {
      p.strength = Math.min(0.98, p.strength + 0.05);
      state.achievements.vitoria_judicial ??= state.month;
      news(state, `Vitória judicial: a patente de ${assetName(a)} foi mantida contra ${lit.challenger}.`, 'bom', { tab: 'patentes' });
    } else {
      p.status = 'invalidada';
      news(state, `Derrota judicial: a patente (${p.kind}) de ${assetName(a)} foi invalidada. ${lit.challenger} pode lançar genérico.`, 'ruim', { tab: 'patentes' });
    }
  }
}

export function protectionSummary(state, a) {
  return Object.keys(a.markets).map((m) => ({ m, ...exclusivity(state, a, m) }));
}

export function strongestPatentEnd(a, m) {
  const M = MKT[m];
  const ends = a.patents.filter((p) => p.status === 'ativa' && p.kind !== 'uso').map((p) => patentEndOf(p, M));
  return ends.length ? Math.max(...ends) : -Infinity;
}

export const totalRoyaltyRate = (pm) => (pm.licensed ? pm.licensed.rate : 0);
