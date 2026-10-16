// Mercado: participação, demanda, produção, vendas e farmacovigilância.
import { MARKETS, MARKET_BY_ID as MKT } from '../data/markets.js';
import { DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { MODALITIES, CMO_LIMIT, CMO_MARKUP } from '../data/modalities.js';
import { SIDE_EFFECTS as SE } from '../data/sideEffects.js';
import {
  approvedIn, baseEntries, productWeight, poolIn, monthlyUnits, knownFits, usePatentActive,
  marketingScale, priceCeiling, assetName, socEff,
} from './model.js';
import { clamp, sum, book, news, queueEvent } from './util.js';
import { revealFit } from './knowledge.js';
import { hasPresence } from './regulatory.js';
import { TARGET_BY_ID as TGT } from '../data/targets.js';

export function isActive(state, a) {
  if (a.owner !== 'player' || a.flags.withdrawn) return false;
  return !(a.flags.recalledUntil != null && state.month < a.flags.recalledUntil);
}

export function erosion(state, a, pm, d, m) {
  if (pm.genericSince == null || state.month < pm.genericSince) return 0;
  const mod = MODALITIES[a.modality];
  const M = MKT[m];
  const t = state.month - pm.genericSince + 1;
  let e = mod.erosion.max * (1 - Math.exp((-t * M.genericSpeed) / mod.erosion.tau));
  if (M.genericSpeed > 1.2) e = Math.min(0.97, e * 1.08);
  const genericPrice = (pm.priceAtLoss || pm.price) * mod.genericRatio;
  if (pm.price <= genericPrice * 2.5) e *= 0.7;
  if (usePatentActive(state, a, d, m)) e *= 0.4;
  return clamp(e, 0, 0.97);
}

// Calcula as linhas de venda (produto × mercado × doença) e atualiza participações.
function productLines(state, { setShares = false } = {}) {
  const lines = [];
  for (const M of MARKETS) {
    const m = M.id;
    const byDisease = {};
    for (const a of state.assets) {
      const pm = a.markets[m];
      if (!pm || pm.launched == null || a.owner !== 'player') continue;
      if (!isActive(state, a) || !hasPresence(state, m)) {
        for (const d of Object.keys(pm.share)) pm.share[d] = 0;
        for (const d of Object.keys(pm.offShare)) pm.offShare[d] = 0;
        continue;
      }
      for (const d of approvedIn(a, m)) (byDisease[d] ||= []).push({ a, pm, off: false });
      if (a.flags.offLabel) {
        for (const { d } of knownFits(state, a.targetId)) {
          if (a.inds[d]?.reg[m]?.status !== 'aprovado') (byDisease[d] ||= []).push({ a, pm, off: true });
        }
      } else {
        for (const d of Object.keys(pm.offShare)) pm.offShare[d] = 0;
      }
    }
    for (const [d, prods] of Object.entries(byDisease)) {
      const D = DIS[d];
      const pool = poolIn(state, d, m);
      if (pool <= 0) continue;
      const others = sum(baseEntries(state, d, m), (e) => e.w);
      const ws = prods.map((p) => productWeight(state, p.a, d, m, p.pm, p.off));
      const total = others + sum(ws, (x) => x.w);
      prods.forEach((p, i) => {
        const target = ws[i].w / total;
        const key = p.off ? 'offShare' : 'share';
        const cur = p.pm[key][d] ?? 0;
        const speed = D.course > 0 ? 0.2 : 0.07;
        const share = setShares ? target : cur + (target - cur) * speed;
        p.pm[key][d] = share;
        if (!p.off) p.pm.access[d] = ws[i].access;
        const ero = p.off ? 0 : erosion(state, p.a, p.pm, d, m);
        const mod = MODALITIES[p.a.modality];
        const genericUnits = monthlyUnits(D, pool, share * ero);
        const genericPrice = (p.pm.priceAtLoss || p.pm.price) * mod.genericRatio;
        lines.push({
          a: p.a, m, d, pm: p.pm, off: p.off, ero,
          units: monthlyUnits(D, pool, share * (1 - ero)),
          price: p.pm.price * (m === 'US' ? p.pm.ira : 1),
          agUnits: p.pm.authGeneric ? genericUnits * 0.3 : 0,
          genericValue: genericUnits * genericPrice,
          genericPrice,
          served: 1,
          cogs: 0,
        });
      });
    }
  }
  return lines;
}

export function ownCapacity(state) {
  const cap = { quimico: 0, biologico: 0, avancado: 0 };
  for (const f of state.factories) {
    if (f.readyAt > state.month) continue;
    if (f.haltedUntil > state.month) continue;
    cap[f.type] += f.capacity * (f.warning ? 0.5 : 1);
  }
  return cap;
}

function allocateProduction(state, lines) {
  const cap = ownCapacity(state);
  const report = {};
  for (const type of Object.keys(cap)) {
    const ls = lines.filter((l) => MODALITIES[l.a.modality].prod === type);
    const demand = sum(ls, (l) => l.units + l.agUnits);
    const ownShare = demand > 0 ? Math.min(1, cap[type] / demand) : 1;
    let cmoLeft = CMO_LIMIT[type];
    let own = 0;
    let cmo = 0;
    let lost = 0;
    for (const l of ls) {
      const need = l.units + l.agUnits;
      if (need <= 0) continue;
      const o = need * ownShare;
      let c = need - o;
      let lostHere = 0;
      if (!l.a.flags.cmo) {
        lostHere = c;
        c = 0;
      } else if (c > cmoLeft) {
        lostHere = c - cmoLeft;
        c = cmoLeft;
      }
      cmoLeft -= c;
      l.served = ((o + c) / need) * (type === 'quimico' && state.supplyShockUntil > state.month ? 0.7 : 1);
      l.cogs = (o * l.a.cogs + c * l.a.cogs * CMO_MARKUP) / 1e6;
      own += o;
      cmo += c;
      lost += lostHere;
    }
    report[type] = { demand, capacity: cap[type], own, cmo, lost };
  }
  return report;
}

function updateAwareness(state, a, m, pm) {
  const scale = marketingScale(state, a, m);
  // Distribuidores fazem parte da promoção por conta própria (em troca da sua fatia da receita).
  const partner = state.presence[m].type === 'distribuidor' ? 0.5 * scale : 0;
  const intensity = (pm.marketing + partner) / scale;
  const dtc = m === 'US' && a.flags.dtc ? 1.25 : 1;
  const effs = approvedIn(a, m).map((d) => a.eff[d] ?? 0);
  const wom = 0.01 * (effs.length ? Math.max(...effs) : 0);
  const gain = (1 - pm.awareness) * (0.14 * (1 - Math.exp(-intensity)) * dtc + wom);
  pm.awareness = clamp(pm.awareness * (1 - 0.035) + gain, 0, 0.98);
}

export function marketTick(state) {
  // preço máximo, revisões bienais e marketing
  for (const a of state.assets) {
    if (a.owner !== 'player') continue;
    for (const [m, pm] of Object.entries(a.markets)) {
      pm.rev = 0;
      pm.units = 0;
      if (pm.launched == null) continue;
      const M = MKT[m];
      if (M.priceCeiling) {
        const ceil = priceCeiling(state, a, m);
        if (pm.price > ceil) {
          pm.price = Math.round(ceil);
          news(state, `CMED reduz o preço máximo de ${assetName(a)} no Brasil para US$ ${pm.price.toLocaleString('pt-BR')}.`, 'alerta', { tab: 'produtos' });
        }
      }
      if (M.biennialCut && state.month > pm.launched && (state.month - pm.launched) % 24 === 0) {
        pm.price = Math.round(pm.price * 0.95);
        news(state, `Revisão bienal de preços no Japão: ${assetName(a)} sofre corte de 5%.`, 'alerta', { tab: 'produtos' });
      }
      if (!isActive(state, a)) continue;
      updateAwareness(state, a, m, pm);
      const spend = pm.marketing * (m === 'US' && a.flags.dtc ? 1.5 : 1);
      if (spend > 0) book(state, 'marketing', -spend);
    }
  }

  const lines = productLines(state);
  state.production = allocateProduction(state, lines);

  const perAsset = new Map();
  let patientsNow = 0;
  for (const l of lines) {
    const M = MKT[l.m];
    const D = DIS[l.d];
    const cut = state.presence[l.m].type === 'distribuidor' ? 1 - M.distributorCut : 1;
    const sold = l.units * l.served;
    const agSold = l.agUnits * l.served;
    const revenue = ((sold * l.price + agSold * l.genericPrice) * M.netFactor * cut) / 1e6;
    if (revenue > 0) book(state, 'receita', revenue);
    if (l.cogs > 0) book(state, 'cogs', -l.cogs);
    if (l.pm.licensed && l.genericValue > 0) {
      book(state, 'royalties', (l.genericValue * l.pm.licensed.rate * M.netFactor) / 1e6);
    }
    l.pm.rev += revenue;
    l.pm.units += sold;
    const patients = D.course > 0 ? (sold / D.course) * 12 : sold;
    (l.off ? (l.pm.offPatients ||= {}) : l.pm.patients)[l.d] = patients;
    patientsNow += patients;
    if (l.off) state.ethics.offLabelRevenue += revenue;
    const py = D.course === 1 ? sold + agSold : (sold + agSold) / 12;
    const acc = perAsset.get(l.a) || { rev: 0, py: 0 };
    acc.rev += revenue;
    acc.py += py;
    perAsset.set(l.a, acc);
    state.stats.patientYears += py;
    state.stats.qaly += py * Math.max(0, (l.a.eff[l.d] ?? 0) - socEff(state, l.d) + 0.05) * (D.severity / 3);
  }
  state.stats.patientsNow = patientsNow;

  for (const a of state.assets) {
    if (a.owner !== 'player' || !Object.keys(a.markets).length) continue;
    const acc = perAsset.get(a) || { rev: 0, py: 0 };
    a.revHist.push(acc.rev);
    if (a.revHist.length > 60) a.revHist.shift();
    a.lifetimeRevenue += acc.rev;
    const annual = sum(a.revHist.slice(-12));
    a.peakAnnual = Math.max(a.peakAnnual, annual);
    if (a.flags.pap && acc.rev > 0) book(state, 'sga', -acc.rev * 0.03);
    if (acc.py > 0) pharmacovigilance(state, a, acc.py);
  }

  // escassez de produção
  for (const [type, r] of Object.entries(state.production)) {
    if (r.lost > r.demand * 0.02 && r.demand > 0) {
      state.reputation = clamp(state.reputation - 0.4, 0, 100);
      if (!state.shortageNotified || state.month - state.shortageNotified > 6) {
        state.shortageNotified = state.month;
        news(state, `Falta de capacidade de produção (${type}): ${Math.round((r.lost / r.demand) * 100)}% da demanda não foi atendida. Construa fábricas ou habilite fabricantes terceirizados.`, 'ruim', { tab: 'producao' });
      }
    }
  }
}

// Exposição de pacientes revela efeitos adversos raros que os ensaios não detectaram.
function pharmacovigilance(state, a, py) {
  a.exposurePY += py;
  for (const se of a.ses) {
    const sev = SE[se.id].severity;
    if (sev >= 3) {
      const harmed = py * se.freq;
      a.harm += harmed;
      if (!se.revealed || !a.boxed) se.unwarnedHarm = (se.unwarnedHarm || 0) + harmed;
    }
    if (se.revealed) continue;
    if (a.exposurePY * se.freq >= se.threshold) {
      se.revealed = true;
      se.revealedAt = state.month;
      if (sev >= 3) {
        queueEvent(state, 'pv_signal', { assetId: a.id, seId: se.id });
      } else if (sev === 0) {
        news(state, `Médicos relatam "${SE[se.id].name.toLowerCase()}" em pacientes usando ${assetName(a)}.`, 'info', { tab: 'pipeline', id: a.id });
        const d = TGT[a.targetId].beneficial[se.id];
        if (d) revealFit(state, a.targetId, d, 'serendipidade');
      } else {
        news(state, `Farmacovigilância: ${SE[se.id].name.toLowerCase()} incluída na bula de ${assetName(a)}.`, 'info', { tab: 'produtos' });
      }
    }
  }
}

// Ajusta participações diretamente no equilíbrio (início de jogo) e estima a receita mensal.
export function initShares(state) {
  const lines = productLines(state, { setShares: true });
  for (const a of state.assets) for (const pm of Object.values(a.markets)) pm.rev = 0;
  for (const l of lines) {
    const M = MKT[l.m];
    const cut = state.presence[l.m].type === 'distribuidor' ? 1 - M.distributorCut : 1;
    l.pm.rev += (l.units * l.price * M.netFactor * cut) / 1e6;
    l.pm.patients[l.d] = DIS[l.d].course > 0 ? (l.units / DIS[l.d].course) * 12 : l.units;
  }
  for (const a of state.assets) {
    const r = sum(Object.values(a.markets), (pm) => pm.rev);
    if (Object.keys(a.markets).length) {
      a.revHist = Array(12).fill(r);
      a.peakAnnual = r * 12;
    }
  }
}
