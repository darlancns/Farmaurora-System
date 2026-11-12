import { describe, expect, it } from "vitest";
// @ts-expect-error — script de migração em .mjs (sem tipos); só usado por este teste e pelos scripts one-time.
import { parseFollowUpSource } from "../../scripts/migration/followUpParser.mjs";

// Fixtures SINTÉTICOS (nenhum dado real de paciente): reproduzem só o formato do doc.
const SEP = "_".repeat(70);

function parse(texto: string) {
  return parseFollowUpSource(texto) as {
    erros: string[];
    entradas: Array<{
      record: Record<string, any> | null;
      recordParcial?: Record<string, any>;
      motivos: string[];
      notas: string[];
      courier: boolean;
    }>;
  };
}

describe("parser do Follow-Up — seções e consultor", () => {
  const texto = [
    "André",
    "1. fulano de tal - Ordem 3 - (2026 - 234) - FARMAURORA",
    "Status: liberada",
    "Medicamento: Drogax 100mg - 6 caixas",
    SEP,
    "Gabi Santana",
    "1. Beltrano da Silva (2026 - 11) -  MAINZFARMA",
    "Status: desembaraço",
    SEP,
    "Paulinho - Bráulio - Bolívar",
    "Rodrigão - Alessandra - Daniel - Flávia",
    "",
    "1. Ciclano Souza (2026 - 276) - Bráulio - FARMAURORA",
    "Status: desembaraço",
    "2. Maria Souza (2026 - 366)- Flávia -  FARMAURORA",
    "Status: desembaraço",
    "3. Joao Souza (2026 - 321) - Bolívar",
    "Status: desembaraço",
    "4. Ana Souza (2026 - 322) - FARMAURORA",
    "Status: desembaraço",
    "5. Rita Souza (2026 - 323) - Daniel - FARMAURORA",
    "Status: desembaraço",
    SEP,
    "Entregues",
    "1. Paciente Sem Pasta - Farmaurora - 07/10 - AJC - Cotação 1 - R$ 1,00 - pago",
  ].join("\n");

  const { entradas, erros } = parse(texto);

  it("sem erros de parsing", () => expect(erros).toEqual([]));

  it("consultor vem do cabeçalho da seção; nome em Title Case; ordem como rótulo; pasta normalizada", () => {
    const r = entradas[0]!.record!;
    expect(r.consultor).toBe("André Vitório");
    expect(r.paciente).toBe("Fulano de Tal");
    expect(r.ordem).toBe("Ordem 3");
    expect(r.pasta).toBe("2026 - 234");
    expect(r.status).toBe("liberado");
    expect(r.medicamentos).toEqual([{ nome: "Drogax 100mg", quantidade: "6 caixas" }]);
  });

  it('"Gabi Santana" → Gabriela Santana; pasta com 2 dígitos e MAINZFARMA preservados', () => {
    const r = entradas[1]!.record!;
    expect(r.consultor).toBe("Gabriela Santana");
    expect(r.pasta).toBe("2026 - 11");
    expect(r.empresa).toBe("MAINZFARMA");
  });

  it("grupo: consultor = rótulo da entrada, sem normalizar Dani/Daniel", () => {
    expect(entradas[2]!.record!.consultor).toBe("Bráulio");
    expect(entradas[3]!.record!.consultor).toBe("Flávia");
  });

  it("grupo: sem empresa → pula; sem rótulo → pula; rótulo fora da lista (Daniel) → pula", () => {
    expect(entradas[4]!.record).toBeNull();
    expect(entradas[4]!.motivos.join(" ")).toMatch(/sem empresa/);
    expect(entradas[5]!.record).toBeNull();
    expect(entradas[5]!.motivos.join(" ")).toMatch(/SEM rótulo/);
    expect(entradas[6]!.record).toBeNull();
    expect(entradas[6]!.motivos.join(" ")).toMatch(/não corresponde a nenhum consultor/);
  });

  it("Entregues sem pasta → pulada, nada inventado", () => {
    const e = entradas[7]!;
    expect(e.record).toBeNull();
    expect(e.motivos.join(" ")).toMatch(/sem pasta/);
  });
});

function um(corpo: string[], cab = "1. Fulano Teste (2026 - 100) - FARMAURORA") {
  const { entradas } = parse(["André", cab, ...corpo].join("\n"));
  return entradas[0]!;
}

describe("parser do Follow-Up — status", () => {
  const casos: Array<[string, string, string | null, string?]> = [
    ["elaboração dos fornecedores", "elaboracao_fornecedores", null],
    ["aguardando para iniciar o processo - pagamento pendente", "aguardando_inicio", null, "pagamento pendente"],
    ["em trânsito - chega dia 14/10, às 8:30 em GRU", "em_transito", null, "chega dia 14/10, às 8:30 em GRU"],
    ["Desembaraço", "desembaraco", null],
    ["desembaraço (VCP)", "desembaraco", null],
    ["liberada", "liberado", null],
    ["liberado parcialmente", "liberado_parcial", null],
    ["liberada parcialmente", "liberado_parcial", null],
  ];
  for (const [texto, status, , pendencia] of casos) {
    it(`"${texto}" → ${status}`, () => {
      const e = um([`Status: ${texto}`]);
      expect(e.record?.status).toBe(status);
      expect(e.record?.pendencias).toEqual(pendencia ? [pendencia] : []);
    });
  }

  it("INDEFERIDO (e variações) → status 'outro' com o texto LITERAL, sem pendência extra", () => {
    for (const t of ["INDEFERIDO", "INDEFERIDO - réu plano de saúde"]) {
      const r = um([`Status: ${t}`]).record!;
      expect(r.status).toBe("outro");
      expect(r.statusOutro).toBe(t);
      expect(r.pendencias).toEqual([]);
    }
  });

  it('"aguardando embarque" → elaboracao_fornecedores (sem pendência)', () => {
    const r = um(["Status: aguardando embarque"]).record!;
    expect(r.status).toBe("elaboracao_fornecedores");
    expect(r.pendencias).toEqual([]);
    expect(r.statusOutro).toBeUndefined();
  });

  it('"liberado na ANVISA // Aguardando SEFAZ" → desembaraco; pendência = texto original completo', () => {
    const r = um(["Status: liberado na ANVISA // Aguardando SEFAZ"]).record!;
    expect(r.status).toBe("desembaraco");
    expect(r.pendencias).toEqual(["liberado na ANVISA // Aguardando SEFAZ"]);
  });

  it('"liberado por mandado de segurança" continua liberado + pendência com o que sobra', () => {
    const r = um(["Status: liberado por mandado de segurança"]).record!;
    expect(r.status).toBe("liberado");
    expect(r.pendencias).toEqual(["por mandado de segurança"]);
  });

  it("status realmente desconhecido ainda pula com o texto literal", () => {
    const e = um(["Status: situação nova qualquer"]);
    expect(e.record).toBeNull();
    expect(e.motivos.join(" ")).toContain("situação nova qualquer");
  });
});

describe("parser do Follow-Up — campos", () => {
  it('ASD nunca vira valor ("ASD" → ausente)', () => {
    const e = um([
      "Status: desembaraço",
      "Previsão de entrega: ASD",
      "Registro Radar pelo despachante: ASD",
      "Fornecedor: ASD",
      "Transportadora: ASD",
      "Local da entrega: ASD",
    ]);
    const r = e.record!;
    expect(r.datas).toEqual({});
    expect(r.fornecedor).toBeUndefined();
    expect(r.transportadoraNacional).toBeUndefined();
    expect(r.localEntrega).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain("ASD");
  });

  it("fornecedor normaliza para o enum completo e extrai modal/observação", () => {
    const casos: Array<[string, string, string | undefined]> = [
      ["Speciality - Air Cargo", "Speciality - Índia", "Air Cargo"],
      ["Poros - Air Cargo - pagamento após envio da AWB", "Poros - Turquia", "Air Cargo"],
      ["Pharyx - Air Cargo - ", "Pharyx - China", "Air Cargo"],
      ["Beldimed - Air Cargo ", "Beldimed - Bélgica", "Air Cargo"],
    ];
    for (const [entrada, fornecedor, modal] of casos) {
      const r = um(["Status: liberada", `Fornecedor: ${entrada}`]).record!;
      expect(r.fornecedor, entrada).toBe(fornecedor);
      expect(r.modalEnvio, entrada).toBe(modal);
    }
    const obs = um(["Status: liberada", "Fornecedor: Poros - Air Cargo - venda a prazo"]).record!;
    expect(obs.atualizacoes).toEqual([{ data: "", texto: "venda a prazo" }]);
  });

  it("fornecedor fora do enum fica literal", () => {
    const r = um(["Status: liberada", "Fornecedor: Upharm - Air Cargo"]).record!;
    expect(r.fornecedor).toBe("Upharm");
  });

  it("courier: NÃO classifica o modal, guarda o rastreio e marca para revisão", () => {
    const e = um(["Status: liberada", "Fornecedor: Poros - Courier (FedEx) - pagamento após envio da AWB", "FedEx: 878436374674"]);
    expect(e.courier).toBe(true);
    expect(e.record!.modalEnvio).toBeUndefined();
    expect(e.record!.codigoRastreio).toBe("878436374674");
    expect(e.record!.fornecedor).toBe("Poros - Turquia");
  });

  it('courier cujo texto diz "Formal" → Courier Formal; sem dizer → modal vazio', () => {
    const formal = um(["Status: liberada", "Fornecedor: Poros - Fedex Formal", "Fedex Formal: 8774 0305 9921"]).record!;
    expect(formal.modalEnvio).toBe("Courier Formal");
    expect(formal.codigoRastreio).toBe("8774 0305 9921");
    const generico = um(["Status: liberada", "Fornecedor: Speciality - Courier Fedex", "Fedex Courier: 8779 0435 9323"]).record!;
    expect(generico.modalEnvio).toBeUndefined();
  });

  it('conflito: fornecedor "Air Cargo" + rastreio "Fedex Formal" → modal VAZIO, código mantido e atualização p/ classificar', () => {
    const r = um(["Status: desembaraço", "Fornecedor: Poros - Air Cargo - venda a prazo", "Fedex Formal: 8774 8667 6114"]).record!;
    expect(r.modalEnvio).toBeUndefined();
    expect(r.codigoRastreio).toBe("8774 8667 6114");
    expect(r.atualizacoes.some((a: { texto: string }) => /Classificar o modal/.test(a.texto) && /Air Cargo/.test(a.texto) && /Fedex Formal/.test(a.texto))).toBe(true);
  });

  it("companhia aérea + AWB (com e sem dois-pontos)", () => {
    expect(um(["Status: liberada", "Lufthansa: 020-50680906"]).record).toMatchObject({ companhiaAerea: "Lufthansa", numeroAwb: "020-50680906" });
    expect(um(["Status: liberada", "Emirates 176-62700212"]).record).toMatchObject({ companhiaAerea: "Emirates", numeroAwb: "176-62700212" });
    expect(um(["Status: liberada", "Turkish Cargo: 235-38910491 "]).record).toMatchObject({ companhiaAerea: "Turkish Cargo", numeroAwb: "235-38910491" });
  });

  it("transportadora: milhar/vírgula, sem espaço no R$, cotação com traço, sufixo de pagamento", () => {
    expect(um(["Status: liberada", "Transportadora: Doctor - Cotação 10688 - R$ 1.808,56"]).record!.transportadoraNacional).toEqual({
      nome: "Doctor",
      cotacao: "10688",
      valor: 1808.56,
    });
    expect(um(["Status: liberada", "Transportadora: AJC - Cotação 13349 - R$922,74"]).record!.transportadoraNacional).toEqual({
      nome: "AJC",
      cotacao: "13349",
      valor: 922.74,
    });
    expect(um(["Status: liberada", "Transportadora: AJC - Cotação 12762-1 - R$ 10,00 - pagamento pendente"]).record).toMatchObject({
      transportadoraNacional: { nome: "AJC", cotacao: "12762-1", valor: 10 },
      statusPagamento: "pendente",
    });
  });

  it("despachante normaliza; trecho extra vai para atualizações; fora do enum fica literal", () => {
    expect(um(["Status: liberada", "Despachante: Andreza"]).record!.despachante).toBe("Andreza Faconi");
    expect(um(["Status: liberada", "Despachante: Marcelo Lopes"]).record!.despachante).toBe("Marcelo Lima");
    const r = um(["Status: liberada", "Despachante: Marcelo Lima - isenção de imposto"]).record!;
    expect(r.despachante).toBe("Marcelo Lima");
    expect(r.atualizacoes).toEqual([{ data: "", texto: "isenção de imposto" }]);
    expect(um(["Status: liberada", "Despachante: Andreza Bernardes"]).record!.despachante).toBe("Andreza Bernardes");
  });

  it("pendências divididas por ';' (vazias descartadas) + datas literais + local/processo literais", () => {
    const r = um([
      "Status: liberada",
      "Pendente: a; b ; c;",
      "Data de chegada no Brasil: 06/09 (China adiantou o processo)",
      "Registro LPCO pelo despachante: 29/09 - agd. análise - prazo até dia 13/10",
      "Local da entrega: pendente",
      "Número do processo:8005462-79.2025.8.05.0074",
    ]).record!;
    expect(r.pendencias).toEqual(["a", "b", "c"]);
    expect(r.datas.dataChegadaBrasil).toBe("06/09 (China adiantou o processo)");
    expect(r.datas.registroLpco).toBe("29/09 - agd. análise - prazo até dia 13/10");
    expect(r.localEntrega).toBe("pendente");
    expect(r.numeroProcesso).toBe("8005462-79.2025.8.05.0074");
  });

  it("linhas soltas viram atualizações (nada descartado); data DD/MM quando reconhecível", () => {
    const r = um([
      "Status: liberada",
      "05/08 LPCO distribuída em análise",
      "Exigência 10/08 - elaborando estratégia de resposta",
      "Mandado de segurança",
      "Obs.: não seguir com a entrega",
      "Documentos de embarque: AWB, CI e PL",
    ]).record!;
    expect(r.atualizacoes).toEqual([
      { data: "05/08", texto: "LPCO distribuída em análise" },
      { data: "10/08", texto: "Exigência 10/08 - elaborando estratégia de resposta" },
      { data: "", texto: "Mandado de segurança" },
      { data: "", texto: "Obs.: não seguir com a entrega" },
      { data: "", texto: "Documentos de embarque: AWB, CI e PL" },
    ]);
  });

  it("medicamentos: separa só a quantidade final segura; senão tudo em nome", () => {
    const r = um([
      "Status: liberada",
      "Medicamento 1: Sutinat 12,5MG - 6 caixas",
      "Medicamento 2: Keytruda 100mg - 1 vial - 10 ampolas",
      "Medicamento 3: Remedio Sem Quantidade 10mg",
    ]).record!;
    expect(r.medicamentos).toEqual([
      { nome: "Sutinat 12,5MG", quantidade: "6 caixas" },
      { nome: "Keytruda 100mg - 1 vial", quantidade: "10 ampolas" },
      { nome: "Remedio Sem Quantidade 10mg" },
    ]);
  });
});

// ── Formato da fonte de 2026-11-05 ──────────────────────────────────────────

describe("parser do Follow-Up — formato novo (seção de grupo, rótulos por medicamento, asteriscos)", () => {
  const SEP_ = "_".repeat(70);
  const grupo = [
    "Paulinho - Bráulio - Bolívar",
    "Rodrigão - Alessandra - Daniel - Flávia",
    "",
    "1. Ciclano Souza (2026 - 276) - Bráulio - FARMAURORA",
    "Status: desembaraço",
    "2. Maria Souza (2026 - 366)- Flávia -  FARMAURORA",
    "Status: desembaraço",
    "3. Rita Souza (2026 - 369) - Dani - FARMAURORA",
    "Status: liberado",
    "4. Ana Souza (2026 - 361) - Alessandra - FARMAURORA",
    "Status: liberado",
    "5. Joao Souza (2026 - 322) - Daniel - FARMAURORA",
    "Status: liberado",
    "6. Pedro Souza (2026 - 323) - FARMAURORA",
    "Status: liberado",
    SEP_,
    "André",
    "1. Fulano Teste - Ordem 1 (2026 - 409) - FARMAURORA",
    "Status: desembaraço",
    "2. Fulano Teste - Ordem 2 (2026 - 409) - FARMAURORA",
    "Status: desembaraço",
  ].join("\n");
  const { entradas, erros } = parse(grupo);

  it("cabeçalho com vários nomes em 2 linhas vira seção de grupo (sem erro de parsing)", () => expect(erros).toEqual([]));

  it("consultor de cada item vem do título do item: Dani e Flávia continuam distintos", () => {
    expect(entradas.map((e) => e.record?.consultor)).toEqual([
      "Bráulio",
      "Flávia",
      "Dani",
      "Alessandra",
      undefined, // "Daniel" não é consultor cadastrado
      undefined, // sem rótulo
      "André Vitório",
      "André Vitório",
    ]);
    expect(entradas[4]!.motivos.join(" ")).toMatch(/não corresponde a nenhum consultor/);
    expect(entradas[5]!.motivos.join(" ")).toMatch(/SEM rótulo/);
  });

  it("avisa (nota) quando o rótulo do item não aparece literalmente no cabeçalho (Dani × Daniel)", () => {
    expect(entradas[2]!.notas.join(" ")).toMatch(/"Dani".*não aparece literalmente no cabeçalho/);
    expect(entradas[0]!.notas.join(" ")).not.toMatch(/não aparece literalmente/);
  });

  it("mesma pasta com Ordem 1 e Ordem 2 são processos separados (chave = pasta + ordem)", () => {
    const [a, b] = [entradas[6]!.record!, entradas[7]!.record!];
    expect(a.pasta).toBe(b.pasta);
    expect([a.ordem, b.ordem]).toEqual(["Ordem 1", "Ordem 2"]);
  });

  it('rótulos com nome do medicamento ("Status X", "Fornecedor X", "Previsão de entrega X", "Documentos de embarque X")', () => {
    const e = um([
      "Status Verzenios: elaboração dos fornecedores",
      "Medicamento: Verzenios (Abemaciclibe) 150mg - 14 comp. - 13 caixas",
      "Data de embarque: 10/11",
      "Previsão de entrega Verzenios: 30/11",
      "Fornecedor Verzenios: Baiyue - Courier",
      "Documentos de embarque Verzenios: AWB, CI e PL",
    ]);
    const r = e.record!;
    expect(r.status).toBe("elaboracao_fornecedores");
    expect(r.datas).toEqual({ dataEmbarque: "10/11", previsaoEntrega: "30/11" });
    expect(r.fornecedor).toBe("Baiyue");
    expect(r.atualizacoes.map((a: { texto: string }) => a.texto)).toContain("Documentos de embarque Verzenios: AWB, CI e PL");
  });

  it("sufixo que NÃO é um dos medicamentos do item → item não interpretado (nada de adivinhar)", () => {
    const e = um(["Status: desembaraço", "Medicamento: Keytruda 100mg - 10 ampolas", "Fornecedor Opdivo: Poros - Air Cargo"]);
    expect(e.record).toBeNull();
    expect(e.motivos.join(" ")).toMatch(/Fornecedor Opdivo.*não é nenhum dos medicamentos/);
  });

  it('asteriscos de destaque saem do texto ("R$ 886,95***", "***Obs.: …")', () => {
    const r = um([
      "Status: desembaraço",
      "Transportadora: AJC - Cotação 13151 - R$ 886,95***",
      "***Obs.: não seguir com a entrega antes de ter a decisão judicial",
    ]).record!;
    expect(r.transportadoraNacional).toEqual({ nome: "AJC", cotacao: "13151", valor: 886.95 });
    expect(r.atualizacoes).toEqual([{ data: "", texto: "Obs.: não seguir com a entrega antes de ter a decisão judicial" }]);
    expect(JSON.stringify(r)).not.toContain("*");
  });

  it("modal: Courier simples → Courier Simples; FedEx Formal → Courier Formal; Courier sem qualificar → vazio + atualização", () => {
    const simples = um(["Status: desembaraço", "Fornecedor: Pharyx - Courier simples", "FedEX: 8793 3511 1009"]).record!;
    expect(simples.modalEnvio).toBe("Courier Simples");
    expect(simples.fornecedor).toBe("Pharyx - China");
    expect(simples.codigoRastreio).toBe("8793 3511 1009");
    expect(um(["Status: desembaraço", "Fornecedor: Venecza - FedEx Courier simples", "Fedex: 1"]).record!.modalEnvio).toBe("Courier Simples");
    expect(um(["Status: desembaraço", "Fornecedor: Beldimed - FedEx Formal", "Swiss: 724-90455282"]).record!.modalEnvio).toBe("Courier Formal");
    const cru = um(["Status: elaboração dos fornecedores", "Fornecedor: Baiyue - Courier"]).record!;
    expect(cru.modalEnvio).toBeUndefined();
    expect(cru.atualizacoes.some((a: { texto: string }) => /Classificar o modal/.test(a.texto) && /Baiyue - Courier/.test(a.texto))).toBe(true);
  });

  it('"Simples" e "Formal" no mesmo item → não interpretado (modal ambíguo)', () => {
    const e = um(["Status: desembaraço", "Fornecedor: Poros - Courier simples", "Fedex Formal: 1"]);
    expect(e.record).toBeNull();
    expect(e.motivos.join(" ")).toMatch(/modal ambíguo/);
  });

  it('fornecedor do enum colado ao modal sem hífen ("Speciality Courier"); fornecedor novo fica literal', () => {
    const colado = um(["Status: desembaraço", "Fornecedor: Speciality Courier", "Fedex: 8787 6804 6810"]).record!;
    expect(colado.fornecedor).toBe("Speciality - Índia");
    const novo = um(["Status: desembaraço", "Fornecedor: Can Pharma - Air Cargo - pagamento após AWB"]).record!;
    expect(novo.fornecedor).toBe("Can Pharma");
    expect(novo.modalEnvio).toBe("Air Cargo");
    expect(novo.atualizacoes).toEqual([{ data: "", texto: "pagamento após AWB" }]);
  });

  it('normalização explícita: "Veneza" → "Venecza" (só esse caso); "Venecza" e "Andreza Bernardes" ficam como estão', () => {
    const r = um(["Status: desembaraço", "Fornecedor: Veneza - Air Cargo"]).record!;
    expect(r.fornecedor).toBe("Venecza");
    expect(r.modalEnvio).toBe("Air Cargo");
    expect(um(["Status: desembaraço", "Fornecedor: Venecza - Air Cargo"]).record!.fornecedor).toBe("Venecza");
    // sem aproximação genérica: nomes parecidos continuam literais
    expect(um(["Status: desembaraço", "Fornecedor: Venezza - Air Cargo"]).record!.fornecedor).toBe("Venezza");
    expect(um(["Status: desembaraço", "Fornecedor: Baiyue - Air Cargo"]).record!.fornecedor).toBe("Baiyue");
    expect(um(["Status: desembaraço", "Despachante: Andreza Bernardes"]).record!.despachante).toBe("Andreza Bernardes");
  });

  it('status: "VCP" (com/sem parênteses) é descartado; "(GRU)" e "(GRU) - Anvisa" ficam como pendência', () => {
    for (const t of ["desembaraço (VCP)", "desembaraço VCP"]) {
      const r = um([`Status: ${t}`]).record!;
      expect(r.status, t).toBe("desembaraco");
      expect(r.pendencias, t).toEqual([]);
    }
    expect(um(["Status: desembaraço (GRU)"]).record!.pendencias).toEqual(["(GRU)"]);
    expect(um(["Status: desembaraço (GRU) - Anvisa"]).record!.pendencias).toEqual(["(GRU) - Anvisa"]);
    const r = um(["Status: elaboração dos fornecedores - AWB emitida; aguardando confirmação de embarque"]).record!;
    expect(r.status).toBe("elaboracao_fornecedores");
    expect(r.pendencias).toEqual(["AWB emitida; aguardando confirmação de embarque"]);
  });

  it('rótulo "Registro da DUMP pelo despachante" (grafia) é lido como DUIMP, com nota', () => {
    const e = um(["Status: desembaraço", "Registro da DUMP pelo despachante: 04/11"]);
    expect(e.record!.datas.registroDuimp).toBe("04/11");
    expect(e.notas.join(" ")).toMatch(/DUMP/);
  });

  it("despachante com texto extra (isenção) → nome canônico + texto nas atualizações", () => {
    const r = um(["Status: desembaraço", "Despachante: Andreza Faconi - solicitar isenção do imposto"]).record!;
    expect(r.despachante).toBe("Andreza Faconi");
    expect(r.atualizacoes).toEqual([{ data: "", texto: "solicitar isenção do imposto" }]);
  });

  it('"Protocolo:" e linhas soltas após o nº do processo (com data) vão para as atualizações', () => {
    const r = um([
      "Status: desembaraço",
      "Número do processo: 123",
      "Protocolo: 264319142",
      "Nova exigência 22/10",
      "28/10 Protocolo: C-263188097",
    ]).record!;
    expect(r.atualizacoes).toEqual([
      { data: "", texto: "Protocolo: 264319142" },
      { data: "22/10", texto: "Nova exigência 22/10" },
      { data: "28/10", texto: "Protocolo: C-263188097" },
    ]);
  });

  it("transportadora sem nome (só cotação e valor) NÃO inventa nome: vai para atualizações", () => {
    const e = um(["Status: desembaraço", "Transportadora: Cotação 13716 - R$ 1.708,48"]);
    expect(e.record!.transportadoraNacional).toBeUndefined();
    expect(e.record!.atualizacoes).toEqual([{ data: "", texto: "Transportadora: Cotação 13716 - R$ 1.708,48" }]);
    expect(e.fallback[0]!.motivo).toMatch(/transportadora fora do formato/);
  });

  it("Suposta estimativa e Data de embarque têm coluna própria", () => {
    const r = um(["Status: elaboração dos fornecedores", "Suposta estimativa: 30/11", "Data de embarque: 04/11"]).record!;
    expect(r.datas).toEqual({ supostaEstimativa: "30/11", dataEmbarque: "04/11" });
  });
});

// ── Paridade da linha de carga com o mapper real ────────────────────────────
// @ts-expect-error — .mjs sem tipos (scripts de migração one-time)
import { COLUNAS_FOLLOW_UP, idCarga, registroParaLinha } from "../../scripts/migration/followUpRows.mjs";
import { existsSync, readFileSync } from "node:fs";
import { colunasDeDTO } from "../../server/utils/processoMappers";
import { erroStatusLegado, isValidProcessoPayload } from "../../server/utils/processoValidation";
import { isStatusProcessoLegado, normalizarStatusProcesso } from "#shared/constants/processos";
import type { NewProcessoDTO } from "#shared/types/processo";

// Fontes reais (dados de pacientes, podem não existir na máquina): cada uma entra só se o arquivo existir.
const FONTE_REAL = "scripts/migration/follow-up-source.txt";
const FONTE_REAL_2026_11 = "scripts/migration/follow-up-source-2026-11-05.txt";
const SINTETICO = [
  "André",
  "1. Fulano Teste - Ordem 2 (2026 - 100) - FARMAURORA",
  "Status: INDEFERIDO - réu plano de saúde",
  "Medicamento: Drogax 100mg - 6 caixas",
  "Previsão de entrega: ASD",
  "Despachante: Andreza",
  "Fornecedor: Speciality - Air Cargo - venda a prazo",
  "Pendente: a; b",
  "Emirates: 176-1",
  "Transportadora: AJC - Cotação 1 - R$ 1.234,50 - pagamento pendente",
  "Mandado de segurança",
].join("\n");

function linhasDe(texto: string) {
  const { entradas } = parseFollowUpSource(texto) as { entradas: Array<{ record: Record<string, any> | null }> };
  const agora = "2026-10-14T15:00:00.000Z";
  return entradas
    .filter((e) => e.record)
    .map((e, i) => ({ rec: e.record!, linha: registroParaLinha(e.record, { id: idCarga(1, i), agora }) as Record<string, unknown> }));
}

describe.each([
  ["sintético", SINTETICO],
  ...(existsSync(FONTE_REAL) ? ([["texto-fonte real", readFileSync(FONTE_REAL, "utf-8")]] as Array<[string, string]>) : []),
  ...(existsSync(FONTE_REAL_2026_11)
    ? ([["texto-fonte real 2026-11-05", readFileSync(FONTE_REAL_2026_11, "utf-8")]] as Array<[string, string]>)
    : []),
])("linha de carga × colunasDeDTO (%s)", (_nome, texto) => {
  const pares = linhasDe(texto);

  it("gera registros", () => expect(pares.length).toBeGreaterThan(0));

  it("tem exatamente as 37 colunas da tabela (inclui alerta_mandado_resolvido)", () => {
    for (const { linha } of pares) expect(Object.keys(linha)).toEqual(COLUNAS_FOLLOW_UP);
    expect(COLUNAS_FOLLOW_UP).toHaveLength(37);
    expect(COLUNAS_FOLLOW_UP).toContain("alerta_mandado_resolvido");
  });

  it("cada coluna que o mapper real grava tem o MESMO valor na linha de carga", () => {
    for (const { rec, linha } of pares) {
      const col = colunasDeDTO(rec as unknown as NewProcessoDTO);
      for (const [k, v] of Object.entries(col)) {
        expect(linha[k], `${rec.pasta} › ${k}`).toEqual(v);
      }
    }
  });

  // A carga é histórica (já aplicada): o parser ainda produz os status que saíram do app (aguardando_inicio, outro). Hoje
  // o servidor recusa GRAVAR um desses (400 com mensagem própria); com o status normalizado (o que a leitura faz), o
  // registro passa na validação como os demais.
  it("registros passam na validação do servidor (API); status legado é recusado com mensagem própria", () => {
    for (const { rec } of pares) {
      if (isStatusProcessoLegado(rec.status)) {
        expect(erroStatusLegado(rec), rec.pasta).toContain("não é mais usado");
        expect(isValidProcessoPayload({ ...rec, status: normalizarStatusProcesso(rec.status) }), rec.pasta).toBe(true);
      } else {
        expect(isValidProcessoPayload(rec), rec.pasta).toBe(true);
      }
    }
  });

  it("as duas flags de alerta começam false; created_at = updated_at; ids únicos", () => {
    for (const { linha } of pares) {
      expect(linha.alerta_fornecedor_resolvido).toBe(false);
      expect(linha.alerta_mandado_resolvido).toBe(false);
      expect(linha.created_at).toBe(linha.updated_at);
    }
    expect(new Set(pares.map((p) => p.linha.id)).size).toBe(pares.length);
  });

  it("flags informadas (preservadas do banco / regra) vão para as colunas; qualquer outra coisa vira false", () => {
    const { rec } = pares[0]!;
    const agora = "2026-11-05T15:00:00.000Z";
    const l1 = registroParaLinha(rec, { id: "x", agora, flags: { fornecedor: true, mandado: true } }) as Record<string, unknown>;
    expect([l1.alerta_fornecedor_resolvido, l1.alerta_mandado_resolvido]).toEqual([true, true]);
    const l2 = registroParaLinha(rec, { id: "x", agora, flags: { fornecedor: false, mandado: undefined } }) as Record<string, unknown>;
    expect([l2.alerta_fornecedor_resolvido, l2.alerta_mandado_resolvido]).toEqual([false, false]);
  });
});
