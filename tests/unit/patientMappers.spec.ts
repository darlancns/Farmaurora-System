import { describe, expect, it } from "vitest";
import type { NewPatientDTO } from "#shared/types/Patient";
import {
  colunasComuns,
  medicamentosParaColuna,
  montarPatient,
  remessasItensParaColuna,
  type PacienteRow,
} from "../../server/utils/patientMappers";

// Mapeadores puros linha (Supabase, tabela prestacao_pacientes) ↔ modelo
// Patient, extraídos de patientsStore.ts na Round 8b — caracterização.

function buildDTO(overrides: Partial<NewPatientDTO> = {}): NewPatientDTO {
  return {
    data: "2026-01-10",
    paciente: "João Souza",
    descricaoCompra: "Compra de medicamentos",
    descricaoResumo: "Resumo",
    medicamentos: [{ qtd: "2", medicamento: "MED A" }],
    empresa: "FARMAURORA",
    consultor: "",
    alvara: 100,
    custoImportacao: 200,
    despesaTotal: 300,
    transporteTotal: 400,
    despachanteRemessas: 2,
    transporteRemessas: 2,
    despesasPorRemessa: ["10", "20"],
    transportesPorRemessa: ["5", "15"],
    remessas: 2,
    ...overrides,
  };
}

describe("medicamentosParaColuna", () => {
  it("mapeia qtd/medicamento na mesma ordem, descartando campos extras", () => {
    const dto = buildDTO({
      medicamentos: [
        { qtd: "1", medicamento: "MED A" },
        { qtd: "3", medicamento: "MED B" },
      ],
    });

    expect(medicamentosParaColuna(dto)).toEqual([
      { qtd: "1", medicamento: "MED A" },
      { qtd: "3", medicamento: "MED B" },
    ]);
  });
});

describe("remessasItensParaColuna", () => {
  it("arrays de tamanhos iguais: zip 1 a 1", () => {
    const dto = buildDTO({
      despesasPorRemessa: ["10", "20"],
      transportesPorRemessa: ["5", "15"],
    });

    expect(remessasItensParaColuna(dto)).toEqual([
      { despachante: "10", transporte: "5" },
      { despachante: "20", transporte: "15" },
    ]);
  });

  it("arrays de tamanhos diferentes: N = o MAIOR dos dois, o lado curto é preenchido com string vazia (não trunca)", () => {
    const dto = buildDTO({
      despesasPorRemessa: ["10", "20", "30"],
      transportesPorRemessa: ["5"],
    });

    expect(remessasItensParaColuna(dto)).toEqual([
      { despachante: "10", transporte: "5" },
      { despachante: "20", transporte: "" },
      { despachante: "30", transporte: "" },
    ]);
  });

  it("o inverso também vale: transportesPorRemessa maior preenche despachante com vazio", () => {
    const dto = buildDTO({
      despesasPorRemessa: ["10"],
      transportesPorRemessa: ["5", "15"],
    });

    expect(remessasItensParaColuna(dto)).toEqual([
      { despachante: "10", transporte: "5" },
      { despachante: "", transporte: "15" },
    ]);
  });

  it("os dois arrays vazios → resultado vazio", () => {
    const dto = buildDTO({ despesasPorRemessa: [], transportesPorRemessa: [] });
    expect(remessasItensParaColuna(dto)).toEqual([]);
  });
});

describe("colunasComuns", () => {
  it("mapeia todos os campos pro shape de coluna, incluindo medicamentos e remessas_itens", () => {
    const col = colunasComuns(buildDTO());

    expect(col).toEqual({
      data: "2026-01-10",
      paciente: "João Souza",
      descricao_compra: "Compra de medicamentos",
      descricao_resumo: "Resumo",
      empresa: "FARMAURORA",
      consultor: null,
      alvara: 100,
      custo_importacao: 200,
      despesa_total: 300,
      transporte_total: 400,
      despachante_remessas: 2,
      transporte_remessas: 2,
      remessas: 2,
      medicamentos: [{ qtd: "2", medicamento: "MED A" }],
      remessas_itens: [
        { despachante: "10", transporte: "5" },
        { despachante: "20", transporte: "15" },
      ],
    });
  });

  it("consultor === '' vira coluna null; um nome real passa direto", () => {
    expect(colunasComuns(buildDTO({ consultor: "" })).consultor).toBeNull();
    expect(colunasComuns(buildDTO({ consultor: "Ana" })).consultor).toBe("Ana");
  });
});

describe("montarPatient", () => {
  function buildFullRow(): PacienteRow {
    return {
      id: "p_1",
      data: "2026-01-10",
      paciente: "João Souza",
      descricao_compra: "Compra de medicamentos",
      descricao_resumo: "Resumo",
      empresa: "FARMAURORA",
      consultor: "Ana",
      alvara: "100",
      custo_importacao: "200",
      despesa_total: "300",
      transporte_total: "400",
      despachante_remessas: "2",
      transporte_remessas: "2",
      remessas: "2",
      attached_slots: ["despachante_1"],
      created_at: "2026-01-10T00:00:00.000Z",
      medicamentos: [{ qtd: "2", medicamento: "MED A" }],
      remessas_itens: [
        { despachante: "10", transporte: "5" },
        { despachante: "20", transporte: "15" },
      ],
    };
  }

  it("mapeia uma row completa, incluindo o split de remessas_itens em 2 arrays paralelos", () => {
    const patient = montarPatient(buildFullRow());

    expect(patient).toEqual({
      id: "p_1",
      data: "2026-01-10",
      paciente: "João Souza",
      descricaoCompra: "Compra de medicamentos",
      descricaoResumo: "Resumo",
      medicamentos: [{ qtd: "2", medicamento: "MED A" }],
      empresa: "FARMAURORA",
      consultor: "Ana",
      alvara: 100,
      custoImportacao: 200,
      despesaTotal: 300,
      transporteTotal: 400,
      despachanteRemessas: 2,
      transporteRemessas: 2,
      despesasPorRemessa: ["10", "20"],
      transportesPorRemessa: ["5", "15"],
      remessas: 2,
      attachedSlots: ["despachante_1"],
      createdAt: "2026-01-10T00:00:00.000Z",
    });
  });

  it("consultor null (coluna NULL) volta como string vazia, não null", () => {
    const row = buildFullRow();
    row.consultor = null;
    expect(montarPatient(row).consultor).toBe("");
  });

  it("remessas_itens/medicamentos/attached_slots null viram array vazio", () => {
    const row = buildFullRow();
    row.remessas_itens = null;
    row.medicamentos = null;
    row.attached_slots = null;

    const patient = montarPatient(row);
    expect(patient.despesasPorRemessa).toEqual([]);
    expect(patient.transportesPorRemessa).toEqual([]);
    expect(patient.medicamentos).toEqual([]);
    expect(patient.attachedSlots).toEqual([]);
  });
});
