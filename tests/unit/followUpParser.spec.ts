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
    "2. Maria Souza (2026 - 366)- Flavinha -  FARMAURORA",
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

  it("grupo: consultor = rótulo da entrada, sem normalizar Dani/Flavinha", () => {
    expect(entradas[2]!.record!.consultor).toBe("Bráulio");
    expect(entradas[3]!.record!.consultor).toBe("Flavinha");
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

// ── Paridade da linha de carga com o mapper real ────────────────────────────
// @ts-expect-error — .mjs sem tipos (scripts de migração one-time)
import { COLUNAS_FOLLOW_UP, idCarga, registroParaLinha } from "../../scripts/migration/followUpRows.mjs";
import { existsSync, readFileSync } from "node:fs";
import { colunasDeDTO } from "../../server/utils/processoMappers";
import { isValidProcessoPayload } from "../../server/utils/processoValidation";
import type { NewProcessoDTO } from "#shared/types/processo";

const FONTE_REAL = "scripts/migration/follow-up-source.txt";
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
])("linha de carga × colunasDeDTO (%s)", (_nome, texto) => {
  const pares = linhasDe(texto);

  it("gera registros", () => expect(pares.length).toBeGreaterThan(0));

  it("tem exatamente as 36 colunas da tabela, na ordem", () => {
    for (const { linha } of pares) expect(Object.keys(linha)).toEqual(COLUNAS_FOLLOW_UP);
    expect(COLUNAS_FOLLOW_UP).toHaveLength(36);
  });

  it("cada coluna que o mapper real grava tem o MESMO valor na linha de carga", () => {
    for (const { rec, linha } of pares) {
      const col = colunasDeDTO(rec as unknown as NewProcessoDTO);
      for (const [k, v] of Object.entries(col)) {
        expect(linha[k], `${rec.pasta} › ${k}`).toEqual(v);
      }
    }
  });

  it("registros passam na validação do servidor (API)", () => {
    for (const { rec } of pares) expect(isValidProcessoPayload(rec), rec.pasta).toBe(true);
  });

  it("alertaFornecedorResolvido começa false; created_at = updated_at; ids únicos", () => {
    for (const { linha } of pares) {
      expect(linha.alerta_fornecedor_resolvido).toBe(false);
      expect(linha.created_at).toBe(linha.updated_at);
    }
    expect(new Set(pares.map((p) => p.linha.id)).size).toBe(pares.length);
  });
});
