import { describe, expect, it } from "vitest";
import type { NewProcessoDTO } from "#shared/types/processo";
import { colunasDeDTO, montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";

// Mapeadores puros linha (Supabase, tabela follow_up) ↔ modelo Processo,
// extraídos de processosStore.ts na Round 8b — cobertura de caracterização.

function buildFullDTO(): NewProcessoDTO {
  return {
    paciente: "Maria Silva",
    ordem: "Ordem 2",
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
    codigoRastreio: "TRACK-456",
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
      ordem: "Ordem 2",
      responsavel_operacional: "Bruno",
      despachante: "Andreza Faconi",
      fornecedor: "Poros - Turquia",
      modal_envio: "Air Cargo",
      companhia_aerea: "LATAM",
      numero_awb: "AWB-123",
      codigo_rastreio: "TRACK-456",
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
});

describe("montarProcesso", () => {
  function buildFullRow(): FollowUpRow {
    return {
      id: "proc_1",
      paciente: "Maria Silva",
      ordem: "Ordem 2",
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
      codigo_rastreio: "TRACK-456",
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
      ordem: "Ordem 2",
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
      codigoRastreio: "TRACK-456",
      medicamentos: [{ nome: "MED A", dosagem: "10mg", quantidade: "2" }],
      status: "em_transito",
      datas: { dataCompraPO: "2026-01-01", dataEmbarque: "2026-01-05" },
      localEntrega: "SP",
      numeroProcesso: "PROC-1",
      pendencias: ["pendência 1"],
      statusPagamento: "pendente",
      alertaFornecedorResolvido: true,
      atualizacoes: [{ data: "2026-01-10", texto: "chegou" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-10T00:00:00.000Z",
    });
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
    row.ordem = null;
    row.responsavel_operacional = null;
    row.alerta_fornecedor_resolvido = false;

    const processo = montarProcesso(row);

    expect("ordem" in processo).toBe(false);
    expect("responsavelOperacional" in processo).toBe(false);
    expect("alertaFornecedorResolvido" in processo).toBe(false);
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
