// Eventos com decisões do jogador: crises de segurança, litígios, governos, mercado e dilemas éticos.
import { DISEASE_BY_ID as DIS } from '../data/diseases.js';
import { MARKET_BY_ID as MKT } from '../data/markets.js';
import { TARGETS, TARGET_BY_ID as TGT } from '../data/targets.js';
import { SIDE_EFFECTS as SE } from '../data/sideEffects.js';
import { RIVALS } from '../data/names.js';
import { assetName, exclusivity, trialPlan, hiddenFitsLeft, socEff, peakSales } from './model.js';
import { createAsset, fileCompositionPatent, setPrior } from './assets.js';
import { revealFit } from './knowledge.js';
import { approvalProbability } from './regulatory.js';
import { createDeal } from './competitors.js';
import { assetValue, yearsToMarket } from './finance.js';
import { clamp, sum, chance, randInt, randRange, pick, weightedPick, book, news, queueEvent, addTimer, dateLabel, uid } from './util.js';

const fmt = (v) => (Math.abs(v) >= 1000 ? `US$ ${(v / 1000).toFixed(1).replace('.', ',')} bi` : `US$ ${Math.round(v)} mi`);
const findAsset = (state, id) => state.assets.find((a) => a.id === id);
const rep = (state, dv) => {
  state.reputation = clamp(state.reputation + dv, 0, 100);
};
const agencies = (state, dv, only) => {
  for (const m of Object.keys(state.agencies)) if (!only || only.includes(m)) state.agencies[m] = clamp(state.agencies[m] + dv, 0, 100);
};
const expired = { title: 'Situação resolvida', text: 'Este assunto não exige mais decisão.', options: [{ label: 'Ok' }] };

function annualRev(a, m) {
  return (a.markets[m]?.rev || 0) * 12;
}

export const EVENT_DEFS = {
  pv_signal: {
    describe(state, { assetId, seId }) {
      const a = findAsset(state, assetId);
      if (!a) return expired;
      const se = a.ses.find((s) => s.id === seId);
      const sev = SE[seId].severity;
      const per = Math.round(1 / se.freq).toLocaleString('pt-BR');
      const harmed = Math.max(1, Math.round(se.unwarnedHarm || 0));
      const options = [
        { label: 'Atualizar a bula com advertência e alertar os médicos', hint: 'As vendas caem um pouco, mas você protege pacientes, a reputação e a relação com as agências.' },
        { label: 'Recolher o produto e suspender as vendas por 9 meses', hint: 'Receita zero por 9 meses e US$ 40 mi de custos. Volta com plano de gestão de riscos (REMS). Ganho de reputação.' },
      ];
      if (sev >= 4) options.push({ label: 'Retirar o produto do mercado definitivamente', hint: 'Encerra o risco aos pacientes e o faturamento do produto.' });
      options.push({ label: 'Contestar o sinal e manter a bula como está', hint: 'Sem custo agora. Se a omissão vier à tona, as multas e o dano à reputação serão devastadores.', unethical: true });
      return {
        title: `Alerta de farmacovigilância: ${assetName(a)}`,
        text: `Relatos pós-comercialização apontam ${SE[seId].name.toLowerCase()} em pacientes tratados com ${assetName(a)} — cerca de 1 caso a cada ${per} pacientes-ano. O efeito era raro demais para aparecer nos ensaios clínicos. Estima-se que ${harmed} pacientes já foram afetados.`,
        options,
      };
    },
    resolve(state, { assetId, seId }, idx) {
      const a = findAsset(state, assetId);
      if (!a) return '';
      const se = a.ses.find((s) => s.id === seId);
      const sev = SE[seId].severity;
      const options = sev >= 4 ? ['label', 'recall', 'withdraw', 'deny'] : ['label', 'recall', 'deny'];
      const choice = options[idx];
      const lawsuit = (factor) => {
        if (sev >= 3 && (se.unwarnedHarm || 0) >= 3) addTimer(state, state.month + randInt(state, 8, 20), 'class_action', { assetId, seId, factor });
      };
      if (choice === 'label') {
        a.boxed = a.boxed || sev >= 3;
        if (sev >= 4) a.flags.rems = true;
        rep(state, 1);
        agencies(state, 3);
        lawsuit(0.6);
        return `Bula de ${assetName(a)} atualizada com advertência sobre ${SE[seId].name.toLowerCase()}.`;
      }
      if (choice === 'recall') {
        a.flags.recalledUntil = state.month + 9;
        a.flags.rems = true;
        a.boxed = true;
        book(state, 'outras', -40);
        rep(state, 4);
        agencies(state, 5);
        lawsuit(0.35);
        return `${assetName(a)} recolhido voluntariamente. Retorno previsto em ${dateLabel(state.month + 9)}.`;
      }
      if (choice === 'withdraw') {
        a.flags.withdrawn = true;
        rep(state, 3);
        agencies(state, 4);
        lawsuit(0.35);
        return `${assetName(a)} foi retirado definitivamente do mercado.`;
      }
      se.revealed = false;
      se.suppressed = true;
      state.ethics.coverups.push({ assetId, seId, month: state.month, exposed: false });
      return `A empresa contesta o sinal de segurança de ${assetName(a)}. A bula não muda.`;
    },
  },

  class_action: {
    describe(state, { assetId, seId, amount }) {
      const a = findAsset(state, assetId);
      if (!a) return expired;
      return {
        title: `Ação coletiva contra ${assetName(a)}`,
        text: `Escritórios de advocacia reuniram milhares de pacientes que sofreram ${SE[seId].name.toLowerCase()} e processam a empresa. Estimativa de indenizações: ${fmt(amount)}.`,
        options: [
          { label: `Fazer acordo (${fmt(amount * 0.7)})`, hint: 'Encerra o caso agora, com dano moderado à reputação.' },
          { label: 'Litigar (US$ 20 mi em custas)', hint: 'Cerca de 45% de chance de vitória. Se perder, paga 130% do valor e sofre na reputação.' },
        ],
      };
    },
    resolve(state, { assetId, seId, amount }, idx) {
      const a = findAsset(state, assetId);
      if (idx === 0) {
        book(state, 'juridico', -amount * 0.7);
        rep(state, -2);
        return `Acordo de ${fmt(amount * 0.7)} encerra a ação coletiva${a ? ` contra ${assetName(a)}` : ''}.`;
      }
      book(state, 'juridico', -20);
      addTimer(state, state.month + randInt(state, 12, 24), 'class_verdict', { assetId, seId, amount });
      return 'A empresa vai aos tribunais. Veredito esperado em 1 a 2 anos.';
    },
  },

  coverup_exposed: {
    describe(state, { assetId, seId, fine }) {
      const a = findAsset(state, assetId);
      return {
        title: 'Escândalo: omissão de dados de segurança',
        text: `Documentos internos vazados mostram que a empresa sabia de casos de ${SE[seId].name.toLowerCase()} com ${a ? assetName(a) : 'um produto'} e não alterou a bula. Agências abrem investigação e a imprensa exige respostas. Multas e indenizações estimadas: ${fmt(fine)}.`,
        options: [
          { label: 'Pedir desculpas publicamente e criar um fundo de indenização', hint: 'Paga 120% da estimativa, mas limita o dano à reputação.' },
          { label: 'Negar irregularidades e enfrentar as investigações', hint: 'Paga a multa base e sofre dano severo à reputação e às relações com agências.' },
        ],
      };
    },
    resolve(state, { assetId, seId, fine }, idx) {
      const a = findAsset(state, assetId);
      if (a) {
        const se = a.ses.find((s) => s.id === seId);
        se.revealed = true;
        se.suppressed = false;
        a.boxed = true;
        a.flags.rems = true;
      }
      state.sentiment = clamp(state.sentiment - 0.1, 0.65, 1.35);
      if (idx === 0) {
        book(state, 'multas', -fine * 1.2);
        rep(state, -15);
        agencies(state, -20);
        return 'A empresa assume a culpa e cria um fundo de indenização.';
      }
      book(state, 'multas', -fine);
      rep(state, -30);
      agencies(state, -35);
      return 'A empresa nega as acusações; as agências reagem com rigor máximo.';
    },
  },

  crl: {
    describe(state, { assetId, diseaseId, m }) {
      const a = findAsset(state, assetId);
      if (a?.inds[diseaseId]?.reg[m]?.status !== 'crl') return expired;
      const plan = trialPlan(state, a, diseaseId, 'adicional', { regions: [m], size: 'padrao' });
      const risky = a.ses.some((s) => s.revealed && SE[s.id].severity >= 3);
      const reason = risky ? 'dúvidas sobre o perfil de segurança' : 'a eficácia não foi demonstrada de forma convincente';
      return {
        title: `Carta de resposta completa: ${assetName(a)} (${MKT[m].agency})`,
        text: `A ${MKT[m].agency} não aprovou ${assetName(a)} para ${DIS[diseaseId].name.toLowerCase()}: ${reason}. A agência aceita reavaliar o pedido mediante um estudo adicional.`,
        options: [
          { label: `Conduzir estudo adicional (${fmt(plan.cost)}, ${plan.months} meses)`, hint: 'Aumenta bastante a chance de aprovação na nova análise.' },
          { label: 'Desistir deste mercado para esta indicação', hint: 'Nenhum custo adicional.' },
        ],
      };
    },
    resolve(state, { assetId, diseaseId, m }, idx) {
      const a = findAsset(state, assetId);
      const r = a?.inds[diseaseId]?.reg[m];
      if (!r) return '';
      if (idx === 0) {
        const plan = trialPlan(state, a, diseaseId, 'adicional', { regions: [m], size: 'padrao' });
        r.status = 'adicional';
        r.study = { kind: 'adicional', monthsLeft: plan.months, monthly: plan.monthly };
        return `Estudo adicional de ${assetName(a)} iniciado para responder à ${MKT[m].agency}.`;
      }
      r.status = 'rejeitado';
      return `${assetName(a)} não será mais oferecido à ${MKT[m].agency} para esta indicação.`;
    },
  },

  advisory: {
    describe(state, { assetId, diseaseId, m }) {
      const a = findAsset(state, assetId);
      const ind = a?.inds[diseaseId];
      if (!ind || ind.reg[m]?.status !== 'revisao') return expired;
      const p = approvalProbability(state, a, ind, m);
      return {
        title: `Comitê consultivo da FDA: ${assetName(a)}`,
        text: `Especialistas independentes vão debater ${assetName(a)} para ${DIS[diseaseId].name.toLowerCase()} em sessão pública. A FDA costuma seguir o voto. Chance estimada de aprovação hoje: ${Math.round(p * 100)}%.`,
        options: [
          { label: 'Preparação intensiva com especialistas (US$ 4 mi)', hint: '+10 pontos percentuais na chance de aprovação.' },
          { label: 'Apresentação padrão', hint: 'Sem custo adicional.' },
          { label: 'Pedir adiamento para reanalisar os dados (US$ 2 mi, +3 meses)', hint: '+6 pontos percentuais, mas atrasa a decisão.' },
        ],
      };
    },
    resolve(state, { assetId, diseaseId, m }, idx) {
      const a = findAsset(state, assetId);
      const r = a?.inds[diseaseId]?.reg[m];
      if (!r) return '';
      if (idx === 0) {
        book(state, 'pd', -4);
        r.bonus = (r.bonus || 0) + 0.1;
      } else if (idx === 2) {
        book(state, 'pd', -2);
        r.bonus = (r.bonus || 0) + 0.06;
        r.decisionAt += 3;
      }
      const p = approvalProbability(state, a, a.inds[diseaseId], m);
      const yes = clamp(Math.round(p * 14 + randRange(state, -2, 2)), 1, 14);
      r.advisoryVote = `${yes} a ${15 - yes}`;
      return `Comitê consultivo marcado para ${assetName(a)}.`;
    },
  },

  patent_challenge: {
    describe(state, { assetId, patentId, challenger }) {
      const a = findAsset(state, assetId);
      const p = a?.patents.find((x) => x.id === patentId);
      if (!p || p.status !== 'ativa') return expired;
      const ex = exclusivity(state, a, 'US');
      const usRev = annualRev(a, 'US');
      return {
        title: `Desafio de patente: ${assetName(a)}`,
        text: `${challenger} contestou na Justiça a patente de ${p.kind === 'composto' ? 'composto' : p.kind} de ${assetName(a)} e pediu autorização para lançar um genérico antes do prazo. A patente protege o produto até ${dateLabel(ex.patentEnd)}; a exclusividade regulatória acaba em ${dateLabel(ex.dataEnd)}. Força jurídica estimada da patente: ${Math.round(p.strength * 100)}%.`,
        options: [
          { label: 'Litigar até o fim (US$ 25 mi)', hint: `Chance de vitória ≈ ${Math.round((p.strength * 0.9 + 0.05) * 100)}%. Se perder, a patente cai.` },
          { label: 'Acordo: o genérico entra na metade do prazo restante', hint: 'Sem risco, mas abre mão de parte da exclusividade.' },
          { label: `Pagar para o genérico adiar a entrada (${fmt(usRev / 6)})`, hint: 'Mantém a exclusividade, mas é prática anticoncorrencial: risco de investigação antitruste.', unethical: true },
          { label: 'Não contestar', hint: 'A patente é invalidada.' },
        ],
      };
    },
    resolve(state, { assetId, patentId, challenger }, idx) {
      const a = findAsset(state, assetId);
      const p = a?.patents.find((x) => x.id === patentId);
      if (!p) return '';
      if (idx === 0) {
        book(state, 'juridico', -25);
        state.litigations.push({ id: uid(state, 'l'), assetId, patentId, challenger, resolveAt: state.month + randInt(state, 18, 30), winP: p.strength * 0.9 + 0.05, done: false });
        return `Litígio de patente de ${assetName(a)} contra ${challenger} em andamento.`;
      }
      if (idx === 1) {
        const ex = exclusivity(state, a, 'US');
        p.settleAt = state.month + Math.floor((ex.patentEnd - state.month) / 2);
        return `Acordo: ${challenger} poderá lançar genérico de ${assetName(a)} em ${dateLabel(p.settleAt)}.`;
      }
      if (idx === 2) {
        const pay = annualRev(a, 'US') / 6;
        book(state, 'juridico', -pay);
        state.ethics.payForDelay.push({ assetId, month: state.month });
        if (chance(state, 0.35)) addTimer(state, state.month + randInt(state, 12, 36), 'antitrust', { assetId, pay });
        return `Acordo confidencial com ${challenger} adia a entrada do genérico de ${assetName(a)}.`;
      }
      p.status = 'invalidada';
      return `A patente de ${assetName(a)} foi invalidada sem contestação.`;
    },
  },

  antitrust: {
    describe(state, { pay }) {
      const fine = Math.max(150, pay * 3);
      return {
        title: 'Investigação antitruste',
        text: `A autoridade de concorrência investiga o acordo "pay-for-delay" que adiou genéricos e encareceu tratamentos. Multa proposta: ${fmt(fine)}.`,
        options: [
          { label: 'Fazer acordo e pagar a multa', hint: 'Dano moderado à reputação.' },
          { label: 'Contestar (US$ 15 mi)', hint: '40% de chance de reduzir a multa à metade; senão paga 150%.' },
        ],
      };
    },
    resolve(state, { pay }, idx) {
      const fine = Math.max(150, pay * 3);
      if (idx === 0) {
        book(state, 'multas', -fine);
        rep(state, -5);
        return `Multa antitruste de ${fmt(fine)} paga.`;
      }
      book(state, 'juridico', -15);
      const win = chance(state, 0.4);
      book(state, 'multas', -fine * (win ? 0.5 : 1.5));
      rep(state, win ? -3 : -8);
      return win ? 'Tribunal reduz a multa antitruste pela metade.' : 'Tribunal mantém a condenação antitruste e aumenta a multa.';
    },
  },

  compulsory: {
    describe(state, { assetId, m }) {
      const a = findAsset(state, assetId);
      const pm = a?.markets[m];
      if (!pm || pm.genericSince != null) return expired;
      const M = MKT[m];
      const options = [
        { label: 'Reduzir o preço em 40%', hint: 'Mantém a patente e melhora a reputação.' },
        { label: 'Oferecer licença voluntária a fabricantes locais (royalty de 5%)', hint: 'Genéricos licenciados entram, mas você recebe royalties e ganha reputação.' },
      ];
      if (m === 'BR') options.push({ label: 'Parceria de Desenvolvimento Produtivo com laboratório público', hint: 'Preço 30% menor e compra garantida pelo SUS por 5 anos; depois, a tecnologia é transferida.' });
      options.push({ label: 'Recusar e defender a patente', hint: 'O governo pode cumprir a ameaça (≈65%): genéricos imediatos com royalty de 1,5%.' });
      return {
        title: `Ameaça de licença compulsória em ${M.name}`,
        text: `O governo de ${M.name} considera o preço de ${assetName(a)} (US$ ${pm.price.toLocaleString('pt-BR')}) incompatível com o sistema público de saúde e ameaça emitir uma licença compulsória — a "quebra de patente" por interesse público, prevista no acordo TRIPS.`,
        options,
      };
    },
    resolve(state, { assetId, m }, idx) {
      const a = findAsset(state, assetId);
      const pm = a?.markets[m];
      if (!pm) return '';
      const key = m === 'BR' ? ['cut', 'vol', 'pdp', 'refuse'][idx] : ['cut', 'vol', 'refuse'][idx];
      if (key === 'cut') {
        pm.price = Math.round(pm.price * 0.6);
        rep(state, 2);
        return `Preço de ${assetName(a)} em ${MKT[m].name} reduzido em 40%.`;
      }
      if (key === 'vol') {
        pm.licensed = { rate: 0.05, kind: 'voluntária' };
        pm.genericSince = state.month;
        pm.priceAtLoss = pm.price;
        rep(state, 4);
        return `Licença voluntária de ${assetName(a)} concedida em ${MKT[m].name}.`;
      }
      if (key === 'pdp') {
        pm.price = Math.round(pm.price * 0.7);
        pm.pdpUntil = state.month + 60;
        rep(state, 4);
        agencies(state, 5, ['BR']);
        return `PDP firmada: ${assetName(a)} será comprado pelo SUS e produzido localmente a partir de ${dateLabel(pm.pdpUntil)}.`;
      }
      if (chance(state, 0.65)) {
        pm.compulsorySince = state.month;
        pm.genericSince = state.month;
        pm.priceAtLoss = pm.price;
        pm.licensed = { rate: 0.015, kind: 'compulsória' };
        rep(state, -4);
        agencies(state, -10, [m]);
        return `${MKT[m].name} decreta licença compulsória de ${assetName(a)}. Genéricos chegam imediatamente.`;
      }
      rep(state, -2);
      return `O governo de ${MKT[m].name} recua da ameaça contra ${assetName(a)}.`;
    },
  },

  price_hearing: {
    describe(state, { assetId }) {
      const a = findAsset(state, assetId);
      if (!a?.markets.US) return expired;
      return {
        title: 'Audiência no Senado dos EUA',
        text: `Senadores convocam o CEO para explicar por que ${assetName(a)} custa US$ ${a.markets.US.price.toLocaleString('pt-BR')} por mês nos EUA, várias vezes mais que em outros países. Pacientes contam ter abandonado o tratamento por falta de dinheiro.`,
        options: [
          { label: 'Anunciar corte de 25% no preço', hint: 'Reputação sobe; receita nos EUA cai.' },
          { label: 'Criar um programa de assistência ao paciente', hint: 'Custa 3% da receita do produto e reduz a pressão política.' },
          { label: 'Defender o preço como reflexo do custo da inovação', hint: 'Dano à reputação e ao humor do mercado.' },
        ],
      };
    },
    resolve(state, { assetId }, idx) {
      const a = findAsset(state, assetId);
      if (!a?.markets.US) return '';
      if (idx === 0) {
        a.markets.US.price = Math.round(a.markets.US.price * 0.75);
        rep(state, 3);
        return `Preço de ${assetName(a)} nos EUA cai 25%.`;
      }
      if (idx === 1) {
        a.flags.pap = true;
        rep(state, 2);
        return `Programa de assistência ao paciente criado para ${assetName(a)}.`;
      }
      rep(state, -4);
      state.sentiment = clamp(state.sentiment - 0.03, 0.65, 1.35);
      return 'O depoimento do CEO viraliza — e não de um jeito bom.';
    },
  },

  ira: {
    describe(state, { assetId }) {
      const a = findAsset(state, assetId);
      if (!a?.markets.US) return expired;
      return {
        title: `Negociação de preço do Medicare: ${assetName(a)}`,
        text: `${assetName(a)} está entre os medicamentos de maior gasto do Medicare e foi selecionado para negociação obrigatória de preço. O governo propõe um preço máximo que reduz a receita líquida nos EUA em cerca de 30%.`,
        options: [
          { label: 'Aceitar o preço negociado', hint: 'Receita líquida nos EUA −30%.' },
          { label: 'Contestar judicialmente (US$ 15 mi)', hint: '15% de chance de isenção; senão, a redução é de 35%.' },
        ],
      };
    },
    resolve(state, { assetId }, idx) {
      const a = findAsset(state, assetId);
      const pm = a?.markets.US;
      if (!pm) return '';
      a.flags.ira = 'negociado';
      if (idx === 0) {
        pm.ira = 0.7;
        return `Preço de ${assetName(a)} no Medicare negociado.`;
      }
      book(state, 'juridico', -15);
      if (chance(state, 0.15)) {
        a.flags.ira = 'isento';
        return `Justiça isenta ${assetName(a)} da negociação do Medicare.`;
      }
      pm.ira = 0.65;
      return `A contestação de ${assetName(a)} falhou; preço imposto pelo Medicare.`;
    },
  },

  license_offer: {
    describe(state, { assetId, partner, upfront, royalty }) {
      const a = findAsset(state, assetId);
      if (!a || a.owner !== 'player' || a.stage === 'vendido') return expired;
      return {
        title: `Proposta de licenciamento: ${assetName(a)}`,
        text: `${partner} quer os direitos globais de ${assetName(a)} (${TGT[a.targetId].name}). Oferta: ${fmt(upfront)} à vista e royalties de ${Math.round(royalty * 100)}% sobre as vendas, se o parceiro levar o produto ao mercado. Você deixa de arcar com os custos de desenvolvimento.`,
        options: [
          { label: 'Aceitar o acordo', hint: 'Caixa imediato e royalties futuros; o ativo sai do seu pipeline.' },
          { label: 'Recusar', hint: 'Você continua desenvolvendo sozinho.' },
        ],
      };
    },
    resolve(state, { assetId, partner, upfront, royalty }, idx) {
      const a = findAsset(state, assetId);
      if (!a || idx === 1) return 'Proposta de licenciamento recusada.';
      return licenseOut(state, a, partner, upfront, royalty);
    },
  },

  offlabel_investigation: {
    describe(state, { fine }) {
      return {
        title: 'Investigação de promoção off-label',
        text: `O Departamento de Justiça dos EUA e agências de outros países investigam a promoção de seus produtos para usos não aprovados. Ex-representantes de vendas colaboram com a investigação. Multa estimada: ${fmt(fine)}.`,
        options: [
          { label: 'Fazer acordo e assinar termo de integridade corporativa', hint: 'Paga a multa; a promoção off-label é encerrada.' },
          { label: 'Contestar (US$ 30 mi)', hint: '35% de chance de pagar só 30%; senão paga 150%.' },
        ],
      };
    },
    resolve(state, { fine }, idx) {
      for (const a of state.assets) a.flags.offLabel = false;
      state.ethics.offLabelRevenue = 0;
      agencies(state, -15, ['US']);
      if (idx === 0) {
        book(state, 'multas', -fine);
        rep(state, -10);
        return `Acordo de ${fmt(fine)} encerra a investigação de promoção off-label.`;
      }
      book(state, 'juridico', -30);
      const win = chance(state, 0.35);
      book(state, 'multas', -fine * (win ? 0.3 : 1.5));
      rep(state, win ? -6 : -14);
      return win ? 'A empresa consegue reduzir a multa por promoção off-label.' : 'Condenação pesada por promoção off-label.';
    },
  },

  fcpa: {
    describe(state, { m }) {
      return {
        title: 'Investigação por suborno no exterior',
        text: `Autoridades americanas (FCPA) descobriram "pagamentos de facilitação" a funcionários em ${MKT[m].name}. Multa proposta: US$ 150 mi.`,
        options: [{ label: 'Pagar a multa e reformular o compliance', hint: 'Reputação e relação com a agência local caem.' }],
      };
    },
    resolve(state, { m }) {
      book(state, 'multas', -150);
      rep(state, -10);
      agencies(state, -20, [m]);
      return 'Multa por suborno internacional paga.';
    },
  },

  // ----- eventos aleatórios -----
  pandemic: {
    describe() {
      return {
        title: 'Nova pandemia de influenza',
        text: 'Uma cepa de influenza aviária passou a circular entre humanos. Governos correm atrás de vacinas e antivirais. A demanda por vacinas de influenza deve quadruplicar pelos próximos 18 meses. O governo oferece US$ 400 mi para empresas que desenvolverem uma vacina em regime de urgência.',
        options: [
          { label: 'Aceitar o financiamento e desenvolver uma vacina de mRNA', hint: 'Recebe US$ 400 mi e um novo ativo com ensaios e revisão acelerados.' },
          { label: 'Focar no portfólio atual', hint: 'Pequena perda de reputação.' },
        ],
      };
    },
    resolve(state, params, idx) {
      state.flags.pandemicDone = true;
      state.diseases.influenza.mult = 4;
      state.diseases.influenza.multUntil = state.month + 18;
      if (idx === 1) {
        rep(state, -1);
        return 'A empresa se mantém fora da corrida pela vacina.';
      }
      book(state, 'outras', 400);
      const a = createAsset(state, { targetId: 'mrnaflu', diseaseId: 'influenza', qualityBonus: 0.15 });
      a.flags.pandemic = true;
      a.stage = 'pre_ok';
      a.toxEst = a.tox;
      fileCompositionPatent(state, a);
      setPrior(state, a, 'influenza');
      state.assets.push(a);
      rep(state, 3);
      return `Contrato fechado: a vacina ${a.code} entra em desenvolvimento acelerado.`;
    },
  },

  crisis: {
    describe() {
      return {
        title: 'Crise financeira global',
        text: 'Bancos centrais sobem juros, bolsas despencam e o capital para biotecnologia seca. Os próximos 12 meses serão difíceis: valuations mais baixos e crédito mais caro.',
        options: [
          { label: 'Manter os investimentos', hint: 'Nada muda na operação.' },
          { label: 'Congelar contratações e cortar despesas', hint: 'Economiza US$ 30 mi agora; a reputação cai um pouco.' },
        ],
      };
    },
    resolve(state, params, idx) {
      state.crisisUntil = state.month + 12;
      if (idx === 1) {
        book(state, 'sga', 30);
        rep(state, -2);
        return 'Plano de contenção de custos anunciado.';
      }
      return 'A empresa mantém o rumo durante a crise.';
    },
  },

  scientist_poach: {
    describe(state, { area, who, rival }) {
      return {
        title: 'Cientista-chefe assediado',
        text: `${who}, que lidera a pesquisa em ${areaName(area)}, recebeu uma proposta milionária da ${rival}.`,
        options: [
          { label: 'Cobrir a oferta (US$ 8 mi em bônus de retenção)', hint: 'Mantém a expertise da área.' },
          { label: 'Deixar ir', hint: 'A expertise da área cai bastante.' },
        ],
      };
    },
    resolve(state, { area }, idx) {
      if (idx === 0) {
        book(state, 'sga', -8);
        return 'Cientista-chefe permanece na empresa.';
      }
      state.expertise[area] = Math.max(5, state.expertise[area] - 12);
      return 'Cientista-chefe deixa a empresa e leva parte do conhecimento da equipe.';
    },
  },

  cyberattack: {
    describe() {
      return {
        title: 'Ataque de ransomware',
        text: 'Hackers criptografaram os servidores de dados clínicos e exigem pagamento em criptomoedas. Os backups existem, mas a restauração vai paralisar os ensaios.',
        options: [
          { label: 'Pagar o resgate (US$ 25 mi)', hint: 'Recupera tudo rapidamente; financiar criminosos é eticamente questionável.', unethical: true },
          { label: 'Restaurar os backups (US$ 10 mi)', hint: 'Todos os ensaios em andamento atrasam 2 meses.' },
        ],
      };
    },
    resolve(state, params, idx) {
      if (idx === 0) {
        book(state, 'outras', -25);
        rep(state, -1);
        return 'Resgate pago; sistemas restaurados.';
      }
      book(state, 'outras', -10);
      for (const a of state.assets) {
        if (a.trial) a.trial.monthsLeft += 2;
        for (const ind of Object.values(a.inds)) if (ind.trial) ind.trial.monthsLeft += 2;
      }
      return 'Backups restaurados; ensaios atrasados em 2 meses.';
    },
  },

  cro_failure: {
    describe(state, { assetId, diseaseId }) {
      const a = findAsset(state, assetId);
      if (!a?.inds[diseaseId]?.trial) return expired;
      return {
        title: 'Problema na CRO',
        text: `A organização de pesquisa contratada (CRO) que conduz o estudo de ${assetName(a)} em ${DIS[diseaseId].name.toLowerCase()} perdeu centros de pesquisa e está atrasando o recrutamento.`,
        options: [
          { label: 'Trocar de CRO (US$ 5 mi, +2 meses)', hint: 'Atraso menor.' },
          { label: 'Esperar a recuperação (+5 meses)', hint: 'Sem custo extra.' },
        ],
      };
    },
    resolve(state, { assetId, diseaseId }, idx) {
      const tr = findAsset(state, assetId)?.inds[diseaseId]?.trial;
      if (!tr) return '';
      if (idx === 0) book(state, 'pd', -5);
      tr.monthsLeft += idx === 0 ? 2 : 5;
      return 'Cronograma do estudo revisado.';
    },
  },

  api_shortage: {
    describe() {
      return {
        title: 'Escassez de insumos farmacêuticos',
        text: 'Restrições de exportação na Ásia cortaram o fornecimento de insumos farmacêuticos ativos (IFAs). Sua produção química pode cair 30% pelos próximos 3 meses.',
        options: [
          { label: 'Pagar preço premium a fornecedores alternativos (US$ 20 mi)', hint: 'Produção normal.' },
          { label: 'Racionar a produção', hint: 'Vendas de produtos químicos −30% por 3 meses.' },
        ],
      };
    },
    resolve(state, params, idx) {
      if (idx === 0) {
        book(state, 'producao', -20);
        return 'Fornecimento garantido a preço premium.';
      }
      state.supplyShockUntil = state.month + 3;
      return 'Produção química racionada por 3 meses.';
    },
  },

  ngo_donation: {
    describe(state, { assetId, cost }) {
      const a = findAsset(state, assetId);
      if (!a) return expired;
      return {
        title: 'Pedido de doação humanitária',
        text: `Uma organização humanitária pede a doação de tratamentos com ${assetName(a)} para pacientes em países de baixa renda que não têm acesso ao medicamento.`,
        options: [
          { label: `Doar (custo de produção: ${fmt(cost)})`, hint: 'Ganho expressivo de reputação.' },
          { label: 'Recusar', hint: 'Pequena perda de reputação.' },
        ],
      };
    },
    resolve(state, { cost }, idx) {
      if (idx === 0) {
        book(state, 'outras', -cost);
        rep(state, 6);
        return 'Doação humanitária anunciada.';
      }
      rep(state, -2);
      return 'Pedido de doação recusado.';
    },
  },

  site_fraud: {
    describe(state, { assetId, diseaseId }) {
      const a = findAsset(state, assetId);
      if (!a?.inds[diseaseId]?.trial) return expired;
      return {
        title: 'Fraude em centro de pesquisa',
        text: `Uma auditoria descobriu que um centro do estudo de ${assetName(a)} em ${DIS[diseaseId].name.toLowerCase()} fabricou dados de pacientes.`,
        options: [
          { label: 'Descartar os dados do centro e recrutar novamente (+4 meses)', hint: 'Dados íntegros.' },
          { label: 'Reportar à agência e seguir com análise de sensibilidade (+2 meses)', hint: 'A transparência melhora a relação com as agências.' },
          { label: 'Ignorar e seguir o cronograma', hint: 'Se as agências descobrirem na revisão, a aprovação fica bem mais difícil.', unethical: true },
        ],
      };
    },
    resolve(state, { assetId, diseaseId }, idx) {
      const ind = findAsset(state, assetId)?.inds[diseaseId];
      if (!ind?.trial) return '';
      if (idx === 0) ind.trial.monthsLeft += 4;
      if (idx === 1) {
        ind.trial.monthsLeft += 2;
        agencies(state, 4);
      }
      if (idx === 2) ind.fraudHidden = true;
      return 'Decisão sobre a fraude registrada.';
    },
  },

  activist_investor: {
    describe() {
      return {
        title: 'Investidor ativista',
        text: 'Um fundo ativista comprou 5% das ações e exige cortes na pesquisa para "destravar valor" para os acionistas.',
        options: [
          { label: 'Cancelar o programa de pesquisa mais recente', hint: 'O mercado aplaude.' },
          { label: 'Resistir e defender a estratégia de longo prazo', hint: 'As ações caem.' },
        ],
      };
    },
    resolve(state, params, idx) {
      if (idx === 0) {
        state.programs.pop();
        state.sentiment = clamp(state.sentiment + 0.05, 0.65, 1.35);
        return 'Programa de pesquisa cancelado por pressão dos acionistas.';
      }
      state.sentiment = clamp(state.sentiment - 0.06, 0.65, 1.35);
      return 'A diretoria rejeita as exigências do fundo ativista.';
    },
  },

  award: {
    describe(state, { assetId }) {
      const a = findAsset(state, assetId);
      return {
        title: 'Prêmio de inovação',
        text: `${a ? assetName(a) : 'Seu produto'} recebeu o prêmio internacional de inovação farmacêutica do ano.`,
        options: [{ label: 'Comemorar', hint: 'Reputação +5.' }],
      };
    },
    resolve(state) {
      rep(state, 5);
      state.lastAward = state.month;
      return 'Prêmio de inovação recebido.';
    },
  },

  viral_demand: {
    describe(state, { assetId, diseaseId }) {
      const a = findAsset(state, assetId);
      if (!a) return expired;
      return {
        title: 'Demanda viral nas redes sociais',
        text: `Celebridades e influenciadores divulgam ${assetName(a)} para ${DIS[diseaseId].name.toLowerCase()}. A procura deve subir 60% pelos próximos 6 meses — talvez além da sua capacidade de produção.`,
        options: [
          { label: 'Subir o preço em 20% aproveitando a demanda', hint: 'Mais margem; reputação −3.' },
          { label: 'Manter o preço e alertar sobre o uso adequado', hint: 'Reputação +1.' },
        ],
      };
    },
    resolve(state, { assetId, diseaseId }, idx) {
      const a = findAsset(state, assetId);
      state.diseases[diseaseId].mult = 1.6;
      state.diseases[diseaseId].multUntil = state.month + 6;
      if (idx === 0 && a) {
        for (const pm of Object.values(a.markets)) pm.price = Math.round(pm.price * 1.2);
        rep(state, -3);
        return `Preço de ${assetName(a)} sobe 20% em meio à euforia.`;
      }
      rep(state, 1);
      return 'Campanha de uso responsável lançada.';
    },
  },

  lobby_offer: {
    describe() {
      return {
        title: 'Proposta de lobby',
        text: 'Uma consultoria de Washington oferece "facilitar o diálogo" com reguladores e congressistas americanos.',
        options: [
          { label: 'Contratar (US$ 15 mi)', hint: 'Melhora a relação com a FDA; aumenta o risco reputacional.' },
          { label: 'Recusar', hint: 'Nada muda.' },
        ],
      };
    },
    resolve(state, params, idx) {
      if (idx === 1) return 'Proposta de lobby recusada.';
      book(state, 'sga', -15);
      agencies(state, 6, ['US']);
      if (chance(state, 0.15)) {
        rep(state, -5);
        return 'A imprensa revela o contrato de lobby; reputação abalada.';
      }
      return 'Consultoria de lobby contratada.';
    },
  },

  bribe_request: {
    describe(state, { assetId, diseaseId, m }) {
      const a = findAsset(state, assetId);
      if (a?.inds[diseaseId]?.reg[m]?.status !== 'revisao') return expired;
      return {
        title: `Pedido de "taxa de facilitação" em ${MKT[m].name}`,
        text: `Um intermediário sugere que um pagamento de US$ 2 mi a funcionários da ${MKT[m].agency} aceleraria em 4 meses a aprovação de ${assetName(a)}.`,
        options: [
          { label: 'Pagar', hint: 'Revisão 4 meses mais rápida. É suborno: risco de investigação internacional.', unethical: true },
          { label: 'Recusar', hint: 'A revisão pode atrasar 2 meses.' },
        ],
      };
    },
    resolve(state, { assetId, diseaseId, m }, idx) {
      const r = findAsset(state, assetId)?.inds[diseaseId]?.reg[m];
      if (!r) return '';
      if (idx === 0) {
        book(state, 'outras', -2);
        r.decisionAt = Math.max(state.month + 1, r.decisionAt - 4);
        state.ethics.bribes += 1;
        if (chance(state, 0.3)) addTimer(state, state.month + randInt(state, 12, 40), 'fcpa', { m });
        return 'Pagamento realizado.';
      }
      r.decisionAt += 2;
      return 'Pedido de suborno recusado.';
    },
  },

  tax_reform: {
    describe(state, { rate }) {
      return {
        title: 'Reforma tributária',
        text: `O governo aprovou uma reforma que muda a alíquota de imposto sobre lucros de ${Math.round(state.taxRate * 100)}% para ${Math.round(rate * 100)}%.`,
        options: [{ label: 'Entendido' }],
      };
    },
    resolve(state, { rate }) {
      state.taxRate = rate;
      return `Nova alíquota de imposto: ${Math.round(rate * 100)}%.`;
    },
  },

  science_publication: {
    describe(state, { targetId, diseaseId }) {
      return {
        title: 'Publicação científica',
        text: `Um estudo publicado em revista de alto impacto sugere que o mecanismo "${TGT[targetId].name}" pode ser útil em ${DIS[diseaseId].name.toLowerCase()}. A nova indicação está disponível para qualquer molécula desse alvo.`,
        options: [{ label: 'Interessante' }],
      };
    },
    resolve(state, { targetId, diseaseId }) {
      revealFit(state, targetId, diseaseId, 'literatura científica');
      return '';
    },
  },

  acquisition_offer: {
    describe(state, { buyer, price }) {
      return {
        title: 'Oferta de aquisição',
        text: `${buyer} oferece comprar a sua empresa por ${fmt(price)}, um prêmio de 35% sobre o valor de mercado. Aceitar encerra o jogo com a venda.`,
        options: [
          { label: 'Aceitar e vender a empresa', hint: 'Fim de jogo: a pontuação final considera o valor da venda.' },
          { label: 'Recusar', hint: 'Seguir independente.' },
        ],
      };
    },
    resolve(state, { buyer, price }, idx) {
      if (idx === 1) return `Oferta de ${buyer} recusada.`;
      state.gameOver = { reason: 'vendida', month: state.month, buyer, price };
      return `Empresa vendida para ${buyer} por ${fmt(price)}.`;
    },
  },
};

function areaName(area) {
  return { onco: 'oncologia', cardio: 'cardiometabolismo', neuro: 'neurociências', imuno: 'imunologia', infecto: 'infectologia', raras: 'doenças raras', resp: 'doenças respiratórias', geral: 'saúde geral' }[area] || area;
}

export function licenseOut(state, a, partner, upfront, royalty) {
  const inds = Object.values(a.inds);
  const ind = inds[0];
  const pos = ind ? Math.max(0.05, ...inds.map((i) => (i.status === 'registro' ? 0.85 : i.status === 'fase3' ? 0.55 : i.results.fase2?.verdict === 'positivo' ? 0.45 : 0.25))) : 0.1;
  const peak = peakSales(state, a, ind?.diseaseId || a.originDisease);
  book(state, 'outras', upfront);
  createDeal(state, a, partner, upfront, royalty, pos, peak, yearsToMarket(a, ind));
  a.stage = 'vendido';
  a.owner = 'parceiro';
  for (const i of inds) i.trial = null;
  a.trial = null;
  if (upfront >= 500) state.achievements.licenciador ??= state.month;
  return `${assetName(a)} licenciado para ${partner} por ${fmt(upfront)} + royalties de ${Math.round(royalty * 100)}%.`;
}

// ----- sorteio de eventos aleatórios -----
function randomCandidates(state) {
  const players = state.assets.filter((a) => a.owner === 'player');
  const launched = players.filter((a) => Object.values(a.markets).some((pm) => pm.launched != null));
  const indTrials = players.flatMap((a) => Object.values(a.inds).filter((i) => i.trial).map((i) => ({ a, i })));
  const list = [];
  if (state.month > 24 && !state.flags.pandemicDone) list.push({ type: 'pandemic', w: 0.25 });
  if (state.month > 12 && state.month >= state.crisisUntil + 48) list.push({ type: 'crisis', w: 0.5 });
  if (state.programs.length || indTrials.length) {
    const area = Object.entries(state.expertise).sort((x, y) => y[1] - x[1])[0][0];
    const who = pick(state, ['Dra. Helena Martins', 'Dr. Kenji Watanabe', 'Dra. Amara Okafor', 'Dr. Lucas Ferreira', 'Dra. Ingrid Sørensen']);
    list.push({ type: 'scientist_poach', w: 0.8, params: { area, who, rival: pick(state, RIVALS).name } });
  }
  list.push({ type: 'cyberattack', w: 0.35 });
  const croTrials = indTrials.filter((x) => x.i.trial.cfg?.cro);
  if (croTrials.length) {
    const x = pick(state, croTrials);
    list.push({ type: 'cro_failure', w: 1, params: { assetId: x.a.id, diseaseId: x.i.diseaseId } });
  }
  if ((state.production?.quimico?.demand || 0) > 0) list.push({ type: 'api_shortage', w: 0.5 });
  if (launched.length) {
    const a = pick(state, launched);
    const units = sum(Object.values(a.markets), (pm) => pm.units);
    const cost = clamp((Math.max(units, 1000) * 6 * a.cogs) / 1e6, 2, 60);
    list.push({ type: 'ngo_donation', w: 0.6, params: { assetId: a.id, cost } });
  }
  if (indTrials.length) {
    const x = pick(state, indTrials);
    list.push({ type: 'site_fraud', w: 0.6, params: { assetId: x.a.id, diseaseId: x.i.diseaseId } });
  }
  if (state.marketCap > 3000 && state.stats.profit12 < 0 && state.programs.length) list.push({ type: 'activist_investor', w: 0.5 });
  const innovative = launched.filter((a) => Object.values(a.inds).some((i) => i.approvedAt != null && state.month - i.approvedAt < 24 && (a.eff[i.diseaseId] ?? 0) - socEff(state, i.diseaseId) > 0.15));
  if (innovative.length && state.month - (state.lastAward ?? -99) > 36) list.push({ type: 'award', w: 0.7, params: { assetId: pick(state, innovative).id } });
  const viral = launched.flatMap((a) => ['obesidade', 'de', 'alopecia'].filter((d) => Object.values(a.markets).some((pm) => pm.share[d] > 0)).map((d) => ({ a, d })));
  if (viral.length) {
    const x = pick(state, viral);
    list.push({ type: 'viral_demand', w: 0.6, params: { assetId: x.a.id, diseaseId: x.d } });
  }
  list.push({ type: 'lobby_offer', w: 0.3 });
  const pending = players.flatMap((a) => Object.values(a.inds).flatMap((i) => Object.entries(i.reg).filter(([m, r]) => r.status === 'revisao' && ['CN', 'IN', 'BR'].includes(m) && r.decisionAt - state.month > 5).map(([m]) => ({ a, i, m }))));
  if (pending.length) {
    const x = pick(state, pending);
    list.push({ type: 'bribe_request', w: 0.7, params: { assetId: x.a.id, diseaseId: x.i.diseaseId, m: x.m } });
  }
  if (state.month > 36) list.push({ type: 'tax_reform', w: 0.15, params: { rate: Math.round(randRange(state, 0.15, 0.27) * 100) / 100 } });
  const hidden = TARGETS.flatMap((t) => hiddenFitsLeft(state, t.id).map((d) => ({ t: t.id, d })));
  if (hidden.length) {
    const x = pick(state, hidden);
    list.push({ type: 'science_publication', w: 0.5, params: { targetId: x.t, diseaseId: x.d } });
  }
  if (state.scenario !== 'big' && state.month > 36 && state.marketCap > 1500) {
    list.push({ type: 'acquisition_offer', w: 0.25, params: { buyer: pick(state, RIVALS).name, price: Math.round(state.marketCap * 1.35) } });
  }
  const licensable = players.filter((a) => a.stage === 'clinico' && !Object.keys(a.markets).length && Object.values(a.inds).some((i) => ['fase2_ok', 'fase3', 'registro'].includes(i.status) && i.results.fase2?.verdict !== 'negativo'));
  if (licensable.length) {
    const a = pick(state, licensable);
    const value = assetValue(state, a);
    if (value > 20) {
      list.push({ type: 'license_offer', w: 1.2, params: { assetId: a.id, partner: pick(state, RIVALS).name, upfront: Math.round(value * randRange(state, 0.35, 0.7)), royalty: Math.round(randRange(state, 0.06, 0.14) * 100) / 100 } });
    }
  }
  return list;
}

export function eventsTick(state) {
  // timers agendados
  const due = state.timers.filter((t) => t.at <= state.month);
  state.timers = state.timers.filter((t) => t.at > state.month);
  for (const t of due) handleTimer(state, t);

  // fim de efeitos temporários de demanda
  for (const [d, ds] of Object.entries(state.diseases)) {
    if (ds.multUntil != null && state.month >= ds.multUntil) {
      ds.mult = 1;
      ds.multUntil = null;
      if (d === 'influenza') news(state, 'A pandemia de influenza perde força; a demanda por vacinas volta ao normal.', 'info');
    }
  }

  // omissões podem vir à tona
  for (const c of state.ethics.coverups) {
    if (c.exposed) continue;
    if (chance(state, 0.035)) {
      c.exposed = true;
      const a = findAsset(state, c.assetId);
      const se = a?.ses.find((s) => s.id === c.seId);
      const fine = Math.max(300, (se?.unwarnedHarm || 0) * 1.0 + sum(a?.revHist.slice(-12) || []) * 0.3);
      queueEvent(state, 'coverup_exposed', { assetId: c.assetId, seId: c.seId, fine: Math.round(fine) });
    }
  }

  // promoção off-label
  const offLabel = state.assets.filter((a) => a.owner === 'player' && a.flags.offLabel);
  if (offLabel.length && state.month >= (state.ethics.offLabelCooldown ?? 0) && chance(state, 0.025 * offLabel.length)) {
    state.ethics.offLabelCooldown = state.month + 24;
    queueEvent(state, 'offlabel_investigation', { fine: Math.round(150 + state.ethics.offLabelRevenue * 3) });
  }

  // evento aleatório do mês
  if (chance(state, 0.16 * state.diff.eventMult)) {
    const c = weightedPick(state, randomCandidates(state), (x) => x.w);
    if (c) queueEvent(state, c.type, c.params || {});
  }
}

function handleTimer(state, t) {
  const p = t.params;
  if (t.type === 'class_action') {
    const a = findAsset(state, p.assetId);
    const se = a?.ses.find((s) => s.id === p.seId);
    const amount = Math.max(20, Math.round((se?.unwarnedHarm || 0) * 0.4 * p.factor));
    queueEvent(state, 'class_action', { assetId: p.assetId, seId: p.seId, amount });
  } else if (t.type === 'class_verdict') {
    const a = findAsset(state, p.assetId);
    if (chance(state, 0.45)) {
      news(state, `Vitória no tribunal: a ação coletiva${a ? ` contra ${assetName(a)}` : ''} foi julgada improcedente.`, 'bom');
    } else {
      book(state, 'juridico', -p.amount * 1.3);
      rep(state, -5);
      news(state, `Júri condena a empresa a pagar ${fmt(p.amount * 1.3)} na ação coletiva${a ? ` contra ${assetName(a)}` : ''}.`, 'ruim');
    }
  } else if (t.type === 'antitrust') {
    queueEvent(state, 'antitrust', p);
  } else if (t.type === 'fcpa') {
    queueEvent(state, 'fcpa', p);
  }
}

export function describeEvent(state, ev) {
  const def = EVENT_DEFS[ev.type];
  if (!def) return expired;
  return def.describe(state, ev.params);
}

export function resolveEvent(state, eventId, idx) {
  const i = state.events.findIndex((e) => e.id === eventId);
  if (i < 0) return '';
  const ev = state.events[i];
  state.events.splice(i, 1);
  const desc = describeEvent(state, ev);
  if (desc === expired) return '';
  const msg = EVENT_DEFS[ev.type].resolve(state, ev.params, idx) || '';
  if (desc.options[idx]?.unethical) state.ethics.risk += 1;
  if (msg) news(state, msg, 'info');
  return msg;
}
