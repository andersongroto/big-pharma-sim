# Big Pharma Sim

Simulador de gestão de uma empresa farmacêutica, em português. Você é o CEO por 25 anos (um turno = um mês) e cuida de todo o ciclo de vida de um medicamento: descoberta, ensaios clínicos, agências reguladoras, patentes, preço, marketing, efeitos adversos, genéricos e novas indicações.

Roda direto no navegador, sem dependências nem etapa de build.

## Como jogar

```bash
npm start          # abre em http://localhost:8080
```

Qualquer servidor estático serve (`python3 -m http.server`, por exemplo). Abrir o `index.html` direto do disco não funciona, porque o navegador bloqueia módulos JavaScript em `file://`.

O jogo salva automaticamente no navegador a cada mês. No menu (☰) dá para exportar e importar o jogo salvo. Atalhos: <kbd>Espaço</kbd> avança um mês, <kbd>Esc</kbd> fecha diálogos.

### Cenários

| Cenário | Ponto de partida | Desafio |
| --- | --- | --- |
| Startup de biotecnologia | US$ 400 mi, um laboratório e uma molécula | Chegar à primeira aprovação sem quebrar |
| Farmacêutica de médio porte | Dois produtos, um deles perdendo a patente em 2,5 anos | Repor a receita e crescer |
| Big Pharma | Cinco blockbusters, presença global | Atravessar o penhasco de patentes |

Há três níveis de dificuldade e uma semente opcional para repetir partidas.

## O que está simulado

**Pesquisa e descoberta.** 41 doenças em oito áreas terapêuticas e 43 alvos (mecanismos de ação) em cinco modalidades: molécula pequena, biológico, RNA, terapia gênica/celular e vacina. Cada laboratório comporta dois programas de descoberta; orçamento, experiência da equipe e dificuldade da doença definem o ritmo. Cada molécula tem atributos ocultos (eficácia real por doença, toxicidade, efeitos adversos com frequências próprias) que só se revelam com os ensaios.

**Ensaios clínicos.** Pré-clínico, Fase I (segurança), Fase II (prova de conceito) e Fase III (confirmação). Você escolhe os países (custo, velocidade e exigência de dados locais), o tamanho do estudo (precisão estatística e detecção de efeitos raros), o comparador (placebo ou tratamento padrão, com chance de provar superioridade) e a terceirização para CRO. Os resultados são estatísticos: o efeito observado tem ruído proporcional a 1/√n. Alvos pouco validados falham na prova de conceito, e desfechos substitutos da Fase II nem sempre se confirmam na Fase III.

**Agências reguladoras.** FDA, EMA, PMDA, NMPA, ANVISA e CDSCO, cada uma com prazos, rigor, taxas e regras próprias. Designações de medicamento órfão, Fast Track e terapia inovadora (Breakthrough). Aprovação acelerada com estudo confirmatório obrigatório. Comitês consultivos, cartas de resposta completa (CRL), estudos-ponte exigidos por Japão, China e Índia, advertência em tarja preta, planos de gestão de risco e vouchers de revisão prioritária (que podem ser vendidos).

**Patentes e exclusividade.** A patente de composto vale 20 anos a partir do depósito e o prazo corre durante o desenvolvimento; depositar tarde arrisca perder a molécula para um concorrente. Extensão de prazo nos EUA, Europa e Japão (o Brasil não tem), exclusividade regulatória de dados e de medicamento órfão, estudo pediátrico (+6 meses nos EUA), patentes secundárias (formulação, forma cristalina, segundo uso médico), desafios judiciais de fabricantes de genéricos com opção de litigar, fazer acordo ou pagar pela demora (pay-for-delay, com risco antitruste). A Índia não reconhece patentes secundárias.

**Quebra de patente.** Governos com sistemas públicos de saúde (Brasil, Índia, China) ameaçam licença compulsória quando o preço de um medicamento de interesse público é alto. Dá para baixar o preço, licenciar voluntariamente, firmar uma Parceria de Desenvolvimento Produtivo com laboratório público (no Brasil) ou pagar para ver.

**Mercado e preço.** Participação de mercado por um modelo de escolha entre o seu produto, marcas concorrentes e o tratamento padrão genérico, com base em eficácia, segurança, conveniência, conhecimento entre médicos, acesso e preço. O preço justo pelo valor clínico depende do ganho sobre o tratamento padrão e da gravidade da doença. Preço acima do valor reduz o reembolso (com rigor diferente em cada mercado), e o impacto orçamentário limita o acesso em doenças muito prevalentes. Há teto de preço da CMED no Brasil, revisão bienal no Japão, negociação do Medicare nos EUA, audiências públicas sobre preço e programas de assistência ao paciente.

**Marketing e operação comercial.** Para vender é preciso uma subsidiária ou um distribuidor em cada país. Orçamento de marketing por produto e mercado, propaganda direta ao consumidor (só nos EUA) e promoção off-label: ilegal, lucrativa e sujeita a investigação.

**Efeitos adversos e farmacovigilância.** Efeitos raros (1 em 10 mil pacientes) só aparecem depois do lançamento, com milhões de pacientes expostos. Diante de um sinal de segurança você pode atualizar a bula, recolher o produto, retirá-lo do mercado ou esconder o problema, com risco de escândalo, multas e ações coletivas.

**Reposicionamento.** Efeitos inesperados nos ensaios revelam novas indicações. Um inibidor de PDE5 testado para hipertensão pulmonar provoca ereções espontâneas, como na história real do sildenafil; um inibidor de JAK faz crescer cabelo. Triagens de reposicionamento e publicações científicas também revelam usos novos. Depois da Fase I, a mesma molécula pode ser estudada em outras doenças do mesmo mecanismo.

**Ciclo de vida.** Genéricos derrubam até 90% das vendas de uma molécula pequena em poucos meses; biossimilares e terapias gênicas perdem mercado mais devagar. Para responder há genérico autorizado, nova formulação, novas indicações e o próximo lançamento.

**Concorrência e negócios.** Sete rivais desenvolvem e lançam produtos; quando as patentes deles caem, o tratamento padrão melhora e a barreira para novos medicamentos sobe. Biotechs vendem ativos, parceiros oferecem licenciamento com pagamento à vista e royalties, e há ofertas de aquisição da sua empresa.

**Produção.** Fábricas de síntese química, biológicos e terapias avançadas, com capacidade, inspeções de boas práticas, cartas de advertência e interdições, ou produção terceirizada mais cara.

**Finanças.** Demonstração de resultados, impostos com prejuízo fiscal acumulado e crédito para drogas órfãs, dívida com limite e juros que variam com a alavancagem, emissão e recompra de ações e valor de mercado calculado pelo valor presente ajustado ao risco do pipeline. Três meses de insolvência levam à falência.

**Eventos.** Pandemia, crise financeira, ataque hacker, falha de CRO, fraude em centro de pesquisa, escassez de insumos, assédio a cientistas, investidores ativistas, lobby, pedidos de suborno, doações humanitárias, prêmios, reforma tributária e outros dilemas.

**Pontuação.** Valor de mercado, pacientes tratados, aprovações, reputação, conquistas (22) e metas do cenário.

## Estrutura do código

```
index.html            página do jogo
css/style.css         estilos (tema claro e escuro)
src/data/             mercados, doenças, alvos, modalidades, efeitos adversos, nomes
src/engine/           motor da simulação, sem dependência do navegador
  newGame.js          cenários iniciais
  sim.js              laço mensal
  research.js         descoberta
  clinical.js         ensaios e resultados estatísticos
  regulatory.js       submissões, revisões e aprovações
  market.js           participação de mercado, vendas, produção e farmacovigilância
  ip.js               patentes, genéricos, litígios, licença compulsória, controle de preço
  competitors.js      rivais, ofertas de biotechs e royalties
  production.js       fábricas e inspeções
  finance.js          custos, impostos, crédito e valor de mercado
  events.js           eventos com decisões
  actions.js          ações do jogador, com validação
  model.js            cálculos derivados (preço justo, acesso, exclusividade, planejamento de ensaios)
src/ui/               interface (HTML gerado por funções, sem framework)
scripts/              servidor local, bot de testes e script de balanceamento
tests/                testes do motor (node:test)
```

O estado do jogo é um único objeto JSON, inclusive o gerador de números aleatórios, e por isso salvar e carregar preserva a sequência de sorteios.

## Desenvolvimento

```bash
npm test                              # testes do motor
npm run balance -- startup 6 300      # simula partidas com um bot: cenário, partidas, meses
```

O script de balanceamento imprime receita e valor de mercado a cada cinco anos, aprovações, fracassos e falências, para calibrar a dificuldade.
