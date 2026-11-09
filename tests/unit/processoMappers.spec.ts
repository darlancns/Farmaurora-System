import { describe, expect, it } from "vitest";
import type { NewProcessoDTO } from "#shared/types/processo";
import { colunasDeDTO, montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";

// Mapeadores puros linha (Supabase, tabela follow_up) ↔ modelo Processo,
// extraídos de processosStore.ts na Round 8b — cobertura de caracterização.

function buildFullDTO(): NewProcessoDTO {
  return {
    paciente: "Maria Silva",
    numeroRemessa: 2,
    pasta: "2026 - 234",
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    responsavelOperacional: "Bruno",
    despachante: "Andreza Faconi",
    fornecedor: "Poros - Turquia",
    transportadoraNacional: { nome: "Transportadora X", cotacao: "cotação-1", valor: 1500 },
    modalEnvio: "Air Cargo",
    companhiaAerea: "LATAM",
    numeroAwb: "AWB-123",
    medicamentos: [{ nome: "MED A", dosagem: "10mg", quantidade: "2" }],
    status: "em_transito",
    datas: { dataCompraPO: "2026-01-01", dataEmbarque: "2026-01-05" },
    localEntrega: "SP",
    numeroProcesso: "PROC-1",
    pendencias: ["pendência 1"],
    statusPagamento: "pendente",
    alertaFornecedorResolvido: true,
    atualizacoes: [{ data: "2026-01-10", texto: "chegou" }],
  };
}

describe("colunasDeDTO", () => {
  it("mapeia todos os campos presentes pro shape de coluna do follow_up", () => {
    const col = colunasDeDTO(buildFullDTO());

    expect(col).toMatchObject({
      paciente: "Maria Silva",
      pasta: "2026 - 234",
      empresa: "FARMAURORA",
      consultor: "André Vitório",
      status: "em_transito",
      numero_remessa: 2,
      responsavel_operacional: "Bruno",
      despachante: "Andreza Faconi",
      fornecedor: "Poros - Turquia",
      modal_envio: "Air Cargo",
      companhia_aerea: "LATAM",
      numero_awb: "AWB-123",
      local_entrega: "SP",
      numero_processo: "PROC-1",
      status_pagamento: "pendente",
      alerta_fornecedor_resolvido: true,
      medicamentos: [{ nome: "MED A", dosagem: "10mg", quantidade: "2" }],
      pendencias: ["pendência 1"],
      atualizacoes: [{ data: "2026-01-10", texto: "chegou" }],
      data_compra_po: "2026-01-01",
      data_embarque: "2026-01-05",
      transportadora_nacional_nome: "Transportadora X",
      transportadora_nacional_cotacao: "cotação-1",
      transportadora_nacional_valor: 1500,
    });
  });

  it("transportadoraNacional.valor ausente vira transportadora_nacional_valor: null — a CHAVE fica presente com valor null, não desaparece", () => {
    const dto = buildFullDTO();
    dto.transportadoraNacional = { nome: "Transportadora X" }; // sem valor

    const col = colunasDeDTO(dto);

    expect("transportadora_nacional_valor" in col).toBe(true);
    expect(col.transportadora_nacional_valor).toBeNull();
  });

  it("codigoRastreio (campo removido, vindo de aba antiga) é ignorado: nenhuma coluna de rastreio é gerada", () => {
    const legado = { paciente: "X", numeroAwb: "AWB-9", codigoRastreio: "LA123BR" } as unknown as Parameters<typeof colunasDeDTO>[0];

    const col = colunasDeDTO(legado);
    expect(col).toEqual({ paciente: "X", numero_awb: "AWB-9" });
    expect("codigo_rastreio" in col).toBe(false);

    const soRastreio = colunasDeDTO({ codigoRastreio: null } as unknown as Parameters<typeof colunasDeDTO>[0]);
    expect(soRastreio).toEqual({});
  });

  it("Nº Ordem: grava numero_remessa como inteiro; só entra quando a chave está presente (patch seletivo)", () => {
    expect(colunasDeDTO({ numeroRemessa: 5 })).toEqual({ numero_remessa: 5 });
    expect("numero_remessa" in colunasDeDTO({ paciente: "X" })).toBe(false);
  });

  it("Nº Ordem nulo, vazio ou 0 vira 1 (a coluna é NOT NULL e nunca recebe null)", () => {
    for (const vazio of [null, "", 0, "0", "  "]) {
      const col = colunasDeDTO({ numeroRemessa: vazio } as unknown as Parameters<typeof colunasDeDTO>[0]);
      expect(col, String(vazio)).toEqual({ numero_remessa: 1 });
    }
  });

  it("a coluna antiga `ordem` NUNCA é gravada: nem a chave `ordem` de aba antiga (nem null) gera coluna", () => {
    const legado = { paciente: "X", ordem: "Ordem 7" } as unknown as Parameters<typeof colunasDeDTO>[0];
    const col = colunasDeDTO(legado);
    expect(col).toEqual({ paciente: "X" });
    expect("ordem" in col).toBe(false);

    expect(colunasDeDTO({ ordem: null } as unknown as Parameters<typeof colunasDeDTO>[0])).toEqual({});
    expect("ordem" in colunasDeDTO({ ...buildFullDTO(), ordem: "Ordem 2" } as unknown as Parameters<typeof colunasDeDTO>[0])).toBe(false);
  });

  it("campo ausente do DTO (patch parcial) não gera a chave correspondente — patch seletivo", () => {
    const col = colunasDeDTO({ paciente: "Novo Nome" });

    expect(col).toEqual({ paciente: "Novo Nome" });
    expect("pasta" in col).toBe(false);
    expect("transportadora_nacional_valor" in col).toBe(false);
  });

  it("alertaFornecedorResolvido ausente do patch não mexe na coluna; presente e false grava false", () => {
    expect("alerta_fornecedor_resolvido" in colunasDeDTO({ paciente: "X" })).toBe(false);
    expect(colunasDeDTO({ alertaFornecedorResolvido: false }).alerta_fornecedor_resolvido).toBe(false);
  });

  it("alertaMandadoResolvido ausente do patch não mexe na coluna; presente grava true/false; não toca no alerta do fornecedor", () => {
    expect("alerta_mandado_resolvido" in colunasDeDTO({ paciente: "X" })).toBe(false);
    expect(colunasDeDTO({ alertaMandadoResolvido: true })).toEqual({ alerta_mandado_resolvido: true });
    expect(colunasDeDTO({ alertaMandadoResolvido: false }).alerta_mandado_resolvido).toBe(false);
  });
});

describe("montarProcesso", () => {
  function buildFullRow(): FollowUpRow {
    return {
      id: "proc_1",
      paciente: "Maria Silva",
      numero_remessa: 2,
      pasta: "2026 - 234",
      empresa: "FARMAURORA",
      consultor: "André Vitório",
      responsavel_operacional: "Bruno",
      despachante: "Andreza Faconi",
      fornecedor: "Poros - Turquia",
      transportadora_nacional_nome: "Transportadora X",
      transportadora_nacional_cotacao: "cotação-1",
      transportadora_nacional_valor: "1500", // Supabase às vezes devolve numeric como string
      modal_envio: "Air Cargo",
      companhia_aerea: "LATAM",
      numero_awb: "AWB-123",
      medicamentos: [{ nome: "MED A", dosagem: "10mg", quantidade: "2" }],
      status: "em_transito",
      data_compra_po: "2026-01-01",
      data_embarque: "2026-01-05",
      abertura_thread: null,
      data_chegada_brasil: null,
      registro_radar: null,
      registro_duimp: null,
      registro_lpco: null,
      previsao_entrega: null,
      suposta_estimativa: null,
      local_entrega: "SP",
      numero_processo: "PROC-1",
      pendencias: ["pendência 1"],
      status_pagamento: "pendente",
      alerta_fornecedor_resolvido: true,
      alerta_mandado_resolvido: true,
      atualizacoes: [{ data: "2026-01-10", texto: "chegou" }],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-10T00:00:00.000Z",
    };
  }

  it("mapeia uma row completa (ida: row → objeto)", () => {
    const processo = montarProcesso(buildFullRow());

    expect(processo).toEqual({
      id: "proc_1",
      paciente: "Maria Silva",
      numeroRemessa: 2,
      pasta: "2026 - 234",
      empresa: "FARMAURORA",
      consultor: "André Vitório",
      responsavelOperacional: "Bruno",
      despachante: "Andreza Faconi",
      fornecedor: "Poros - Turquia",
      transportadoraNacional: { nome: "Transportadora X", cotacao: "cotação-1", valor: 1500 },
      modalEnvio: "Air Cargo",
      companhiaAerea: "LATAM",
      numeroAwb: "AWB-123",
      medicamentos: [{ nome: "MED A", dosagem: "10mg", quantidade: "2" }],
      status: "em_transito",
      datas: { dataCompraPO: "2026-01-01", dataEmbarque: "2026-01-05" },
      localEntrega: "SP",
      numeroProcesso: "PROC-1",
      pendencias: ["pendência 1"],
      statusPagamento: "pendente",
      alertaFornecedorResolvido: true,
      alertaMandadoResolvido: true,
      atualizacoes: [{ data: "2026-01-10", texto: "chegou" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-10T00:00:00.000Z",
    });
  });

  it("row que ainda traz codigo_rastreio (coluna a ser apagada) não vira codigoRastreio no objeto", () => {
    const row = { ...buildFullRow(), codigo_rastreio: "LA123BR" } as unknown as FollowUpRow;

    const processo = montarProcesso(row) as unknown as Record<string, unknown>;

    expect("codigoRastreio" in processo).toBe(false);
    expect(processo.numeroAwb).toBe("AWB-123");
  });

  it("transportadora_nacional_valor null → a chave 'valor' fica OMITIDA do objeto (não vira valor: null)", () => {
    const row = buildFullRow();
    row.transportadora_nacional_valor = null;

    const processo = montarProcesso(row);

    expect(processo.transportadoraNacional).toEqual({ nome: "Transportadora X", cotacao: "cotação-1" });
    expect("valor" in (processo.transportadoraNacional ?? {})).toBe(false);
  });

  it("transportadora_nacional_nome null → a chave transportadoraNacional inteira fica ausente do objeto", () => {
    const row = buildFullRow();
    row.transportadora_nacional_nome = null;
    row.transportadora_nacional_cotacao = null;
    row.transportadora_nacional_valor = null;

    expect(montarProcesso(row).transportadoraNacional).toBeUndefined();
  });

  it("campos opcionais com coluna NULL viram chaves ausentes no objeto (não null)", () => {
    const row = buildFullRow();
    row.responsavel_operacional = null;
    row.alerta_fornecedor_resolvido = false;
    row.alerta_mandado_resolvido = false;

    const processo = montarProcesso(row);

    expect("responsavelOperacional" in processo).toBe(false);
    expect("alertaFornecedorResolvido" in processo).toBe(false);
    expect("alertaMandadoResolvido" in processo).toBe(false);
  });

  it("Nº Ordem: lê numero_remessa da linha", () => {
    const row = buildFullRow();
    row.numero_remessa = 12;
    expect(montarProcesso(row).numeroRemessa).toBe(12);
  });

  it("linha SEM a coluna numero_remessa (ou null) → numeroRemessa 1 (sempre presente)", () => {
    const semColuna = buildFullRow();
    delete semColuna.numero_remessa;
    expect(montarProcesso(semColuna).numeroRemessa).toBe(1);

    const nula = buildFullRow();
    nula.numero_remessa = null;
    expect(montarProcesso(nula).numeroRemessa).toBe(1);
  });

  it("a coluna antiga `ordem` nunca é lida: com ordem preenchida e SEM numero_remessa, vale 1; sem chave `ordem` no objeto", () => {
    const row = { ...buildFullRow(), ordem: "Ordem 5" } as unknown as FollowUpRow;
    delete row.numero_remessa;

    const processo = montarProcesso(row) as unknown as Record<string, unknown>;

    expect(processo.numeroRemessa).toBe(1); // não vira 5
    expect("ordem" in processo).toBe(false);
    expect(montarProcesso({ ...row, numero_remessa: 3 }).numeroRemessa).toBe(3);
  });

  it("medicamentos/pendencias/atualizacoes null viram array vazio (nunca null)", () => {
    const row = buildFullRow();
    row.medicamentos = null;
    row.pendencias = null;
    row.atualizacoes = null;

    const processo = montarProcesso(row);

    expect(processo.medicamentos).toEqual([]);
    expect(processo.pendencias).toEqual([]);
    expect(processo.atualizacoes).toEqual([]);
  });
});
