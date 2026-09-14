import { describe, expect, it } from "vitest";
import type { Medicamento } from "#shared/types/processo";
import {
  buildBasePayload,
  buildDatas,
  buildTransportadoraNacional,
  precisaDespachanteTransportadora,
  validarProcessoForm,
  type ProcessoFormState,
} from "../../app/utils/processoFormPayload";

// Caracterização (Round 9) — funções puras extraídas de ProcessoFormModal.vue.
// Documenta o comportamento ATUAL, sem corrigir nada — achados suspeitos vão
// no relatório da extração, não aqui.

function emptyForm(): ProcessoFormState {
  return {
    paciente: "",
    ordem: "",
    pasta: "",
    empresa: "FARMAURORA",
    consultor: "",
    responsavelOperacional: "",
    despachante: "",
    transportadoraNome: "",
    transportadoraCotacao: "",
    transportadoraValor: "",
    modalEnvio: "",
    companhiaAerea: "",
    numeroAwb: "",
    codigoRastreio: "",
    status: "elaboracao_fornecedores",
    dataCompraPO: "",
    dataEmbarque: "",
    aberturaThread: "",
    dataChegadaBrasil: "",
    registroRadar: "",
    registroDuimp: "",
    registroLpco: "",
    previsaoEntrega: "",
    supostaEstimativa: "",
    localEntrega: "",
    numeroProcesso: "",
    statusPagamento: "",
  };
}

function medicamento(nome: string, dosagem = "", quantidade = ""): Medicamento {
  return { nome, dosagem, quantidade };
}

describe("precisaDespachanteTransportadora", () => {
  it("Courier Simples: false (esconde os campos)", () => {
    expect(precisaDespachanteTransportadora("Courier Simples")).toBe(false);
  });

  it("Air Cargo: true", () => {
    expect(precisaDespachanteTransportadora("Air Cargo")).toBe(true);
  });

  it("Courier Formal: true", () => {
    expect(precisaDespachanteTransportadora("Courier Formal")).toBe(true);
  });

  it("vazio (nada selecionado ainda): true, não esconde por padrão", () => {
    expect(precisaDespachanteTransportadora("")).toBe(true);
  });

  it("valor legado 'Courier' (registro migrado): true, não reconhece e não esconde", () => {
    expect(precisaDespachanteTransportadora("Courier")).toBe(true);
  });
});

describe("buildDatas", () => {
  it("todos os campos preenchidos: mantém todos, com trim", () => {
    const form = { ...emptyForm(), dataCompraPO: " 01/02 ", dataEmbarque: "03/02" };
    expect(buildDatas(form)).toEqual({
      dataCompraPO: "01/02",
      dataEmbarque: "03/02",
      aberturaThread: undefined,
      dataChegadaBrasil: undefined,
      registroRadar: undefined,
      registroDuimp: undefined,
      registroLpco: undefined,
      previsaoEntrega: undefined,
      supostaEstimativa: undefined,
    });
  });

  it("todos vazios: todos undefined", () => {
    expect(buildDatas(emptyForm())).toEqual({
      dataCompraPO: undefined,
      dataEmbarque: undefined,
      aberturaThread: undefined,
      dataChegadaBrasil: undefined,
      registroRadar: undefined,
      registroDuimp: undefined,
      registroLpco: undefined,
      previsaoEntrega: undefined,
      supostaEstimativa: undefined,
    });
  });

  it("só espaços em branco conta como vazio (undefined)", () => {
    const form = { ...emptyForm(), registroRadar: "   " };
    expect(buildDatas(form).registroRadar).toBeUndefined();
  });
});

describe("buildTransportadoraNacional", () => {
  it("nome vazio: undefined (a função inteira, não só o campo)", () => {
    const form = { ...emptyForm(), transportadoraCotacao: "USD 100", transportadoraValor: "50" };
    expect(buildTransportadoraNacional(form)).toBeUndefined();
  });

  it("nome preenchido, cotação/valor vazios: objeto com os opcionais undefined", () => {
    const form = { ...emptyForm(), transportadoraNome: "  Transportes X  " };
    expect(buildTransportadoraNacional(form)).toEqual({
      nome: "Transportes X",
      cotacao: undefined,
      valor: undefined,
    });
  });

  it("todos preenchidos: valor convertido pra number", () => {
    const form = {
      ...emptyForm(),
      transportadoraNome: "Transportes X",
      transportadoraCotacao: "USD 100",
      transportadoraValor: "150.5",
    };
    expect(buildTransportadoraNacional(form)).toEqual({
      nome: "Transportes X",
      cotacao: "USD 100",
      valor: 150.5,
    });
  });

  it("achado: valor '0' vira undefined, não 0 (0 é falsy em '|| undefined')", () => {
    const form = { ...emptyForm(), transportadoraNome: "Transportes X", transportadoraValor: "0" };
    expect(buildTransportadoraNacional(form)?.valor).toBeUndefined();
  });

  it("achado: valor não-numérico ('abc') também vira undefined (Number('abc') é NaN, falsy)", () => {
    const form = { ...emptyForm(), transportadoraNome: "Transportes X", transportadoraValor: "abc" };
    expect(buildTransportadoraNacional(form)?.valor).toBeUndefined();
  });
});

describe("buildBasePayload", () => {
  it("dados completos: monta o payload inteiro", () => {
    const form: ProcessoFormState = {
      ...emptyForm(),
      paciente: "  Maria Silva  ",
      ordem: "2",
      pasta: "2026 - 234",
      empresa: "FARMAURORA",
      consultor: "André Vitório",
      responsavelOperacional: "Bruno",
      despachante: "Marcelo Lima",
      transportadoraNome: "Transportes X",
      modalEnvio: "Air Cargo",
      companhiaAerea: "LATAM",
      numeroAwb: "AWB123",
      codigoRastreio: "RASTR123",
      status: "em_transito",
      localEntrega: "Farmácia Central",
      numeroProcesso: "PROC-1",
      statusPagamento: "pago",
    };
    const medicamentos = [medicamento("Dipirona", "500mg", "10"), medicamento("")];
    const pendencias = ["Enviar nota", "  ", ""];

    const payload = buildBasePayload(form, medicamentos, pendencias, "Beldimed - Bélgica");

    expect(payload).toEqual({
      paciente: "Maria Silva",
      ordem: "Ordem 2",
      pasta: "2026 - 234",
      empresa: "FARMAURORA",
      consultor: "André Vitório",
      responsavelOperacional: "Bruno",
      despachante: "Marcelo Lima",
      fornecedor: "Beldimed - Bélgica",
      transportadoraNacional: { nome: "Transportes X", cotacao: undefined, valor: undefined },
      modalEnvio: "Air Cargo",
      companhiaAerea: "LATAM",
      numeroAwb: "AWB123",
      codigoRastreio: "RASTR123",
      medicamentos: [{ nome: "Dipirona", dosagem: "500mg", quantidade: "10" }],
      status: "em_transito",
      datas: {
        dataCompraPO: undefined,
        dataEmbarque: undefined,
        aberturaThread: undefined,
        dataChegadaBrasil: undefined,
        registroRadar: undefined,
        registroDuimp: undefined,
        registroLpco: undefined,
        previsaoEntrega: undefined,
        supostaEstimativa: undefined,
      },
      localEntrega: "Farmácia Central",
      numeroProcesso: "PROC-1",
      pendencias: ["Enviar nota"],
      statusPagamento: "pago",
    });
  });

  it("campos opcionais ausentes: tudo undefined onde esperado, sem quebrar", () => {
    const form: ProcessoFormState = {
      ...emptyForm(),
      paciente: "Maria Silva",
      pasta: "2026 - 234",
      consultor: "André Vitório",
      status: "elaboracao_fornecedores",
    };
    const payload = buildBasePayload(form, [medicamento("")], [], "");

    expect(payload.ordem).toBeUndefined();
    expect(payload.responsavelOperacional).toBeUndefined();
    expect(payload.despachante).toBeUndefined();
    expect(payload.fornecedor).toBeUndefined();
    expect(payload.transportadoraNacional).toBeUndefined();
    expect(payload.modalEnvio).toBeUndefined();
    expect(payload.medicamentos).toEqual([]);
    expect(payload.pendencias).toEqual([]);
    expect(payload.statusPagamento).toBeUndefined();
  });
});

describe("validarProcessoForm", () => {
  const formValido = (): ProcessoFormState => ({
    ...emptyForm(),
    paciente: "Maria Silva",
    pasta: "2026 - 234",
    consultor: "André Vitório",
  });

  it("caminho válido completo: valido true com o payload montado", () => {
    const resultado = validarProcessoForm(formValido(), [], [], "");
    expect(resultado.valido).toBe(true);
    if (resultado.valido) {
      expect(resultado.payload.paciente).toBe("Maria Silva");
    }
  });

  it("paciente ausente: erro específico", () => {
    const form = { ...formValido(), paciente: "  " };
    expect(validarProcessoForm(form, [], [], "")).toEqual({
      valido: false,
      erro: "Informe o nome do paciente.",
    });
  });

  it("pasta ausente: erro específico", () => {
    const form = { ...formValido(), pasta: "" };
    expect(validarProcessoForm(form, [], [], "")).toEqual({
      valido: false,
      erro: "Informe a pasta do processo.",
    });
  });

  it("consultor ausente: erro específico", () => {
    const form = { ...formValido(), consultor: "" as const };
    expect(validarProcessoForm(form, [], [], "")).toEqual({
      valido: false,
      erro: "Selecione o consultor responsável.",
    });
  });

  it("ordem de checagem: paciente E pasta ausentes ao mesmo tempo → erro é o de paciente (primeiro checado)", () => {
    const form = { ...formValido(), paciente: "", pasta: "" };
    expect(validarProcessoForm(form, [], [], "")).toEqual({
      valido: false,
      erro: "Informe o nome do paciente.",
    });
  });

  it("Air Cargo sem despachante: erro", () => {
    const form = { ...formValido(), modalEnvio: "Air Cargo", despachante: "", transportadoraNome: "Transportes X" };
    expect(validarProcessoForm(form, [], [], "")).toEqual({
      valido: false,
      erro: "Despachante é obrigatório para o modal de envio selecionado.",
    });
  });

  it("Air Cargo sem transportadora: erro", () => {
    const form = { ...formValido(), modalEnvio: "Air Cargo", despachante: "Marcelo Lima", transportadoraNome: "" };
    expect(validarProcessoForm(form, [], [], "")).toEqual({
      valido: false,
      erro: "Transportadora é obrigatória para o modal de envio selecionado.",
    });
  });

  it("Courier Simples sem despachante/transportadora: válido (não exige)", () => {
    const form = {
      ...formValido(),
      modalEnvio: "Courier Simples",
      despachante: "",
      transportadoraNome: "",
    };
    expect(validarProcessoForm(form, [], [], "").valido).toBe(true);
  });

  it("Courier Formal com despachante e transportadora: válido", () => {
    const form = {
      ...formValido(),
      modalEnvio: "Courier Formal",
      despachante: "Marcelo Lima",
      transportadoraNome: "Transportes X",
    };
    expect(validarProcessoForm(form, [], [], "").valido).toBe(true);
  });

  it("Courier Formal sem despachante: erro (exige igual Air Cargo)", () => {
    const form = { ...formValido(), modalEnvio: "Courier Formal", despachante: "", transportadoraNome: "Transportes X" };
    expect(validarProcessoForm(form, [], [], "")).toEqual({
      valido: false,
      erro: "Despachante é obrigatório para o modal de envio selecionado.",
    });
  });
});
