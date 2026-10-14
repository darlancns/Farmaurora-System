import { describe, expect, it } from "vitest";
import { STATUS_PROCESSO_ORDER } from "#shared/constants/processos";
import type { NewProcessoDTO, Processo, StatusProcesso } from "#shared/types/processo";
import { isValidProcessoPatch, isValidProcessoPayload } from "../../server/utils/processoValidation";
import { colunasDeDTO, montarProcesso, statusOutroDe, type FollowUpRow } from "../../server/utils/processoMappers";
import { rotuloStatusProcesso, STATUS_PROCESSO_META } from "../../app/utils/processoStatus";
import { STATUS_FILTER_OPTIONS, STATUS_OPTIONS } from "../../app/utils/processoOptions";
import { filtrarPorStatus, separarAbas } from "../../app/utils/processoListas";
import { buildBasePayload, validarProcessoForm, type ProcessoFormState } from "../../app/utils/processoFormPayload";
import { formatOrdemLabel, parseOrdemNumero } from "../../app/utils/processoFormatters";

function payload(status: string, statusOutro?: unknown): Record<string, unknown> {
  return {
    paciente: "Fulano de Tal",
    pasta: "2026 - 400",
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    status,
    ...(statusOutro !== undefined ? { statusOutro } : {}),
    medicamentos: [],
    pendencias: [],
    atualizacoes: [],
    datas: {},
  };
}

describe("status 'outro' — validação no servidor", () => {
  it("criação: 'outro' exige texto não vazio", () => {
    expect(isValidProcessoPayload(payload("outro"))).toBe(false);
    expect(isValidProcessoPayload(payload("outro", ""))).toBe(false);
    expect(isValidProcessoPayload(payload("outro", "   "))).toBe(false);
    expect(isValidProcessoPayload(payload("outro", 3))).toBe(false);
    expect(isValidProcessoPayload(payload("outro", "INDEFERIDO"))).toBe(true);
  });

  it("criação: status que não é 'outro' ignora statusOutro (aceita, com ou sem texto)", () => {
    expect(isValidProcessoPayload(payload("em_transito"))).toBe(true);
    expect(isValidProcessoPayload(payload("em_transito", "sobra"))).toBe(true);
    expect(isValidProcessoPayload(payload("em_transito", 123))).toBe(true);
  });

  it("edição: 'outro' exige texto; statusOutro sem status é rejeitado; outros status passam", () => {
    expect(isValidProcessoPatch({ status: "outro" })).toBe(false);
    expect(isValidProcessoPatch({ status: "outro", statusOutro: "  " })).toBe(false);
    expect(isValidProcessoPatch({ status: "outro", statusOutro: "INDEFERIDO" })).toBe(true);
    expect(isValidProcessoPatch({ statusOutro: "INDEFERIDO" })).toBe(false);
    expect(isValidProcessoPatch({ status: "entregue" })).toBe(true);
    expect(isValidProcessoPatch({ pendencias: ["x"] })).toBe(true); // patches sem status seguem válidos
  });
});

describe("status 'outro' — mappers", () => {
  it("statusOutroDe: só guarda (aparado) quando status é 'outro'; senão null", () => {
    expect(statusOutroDe("outro", "  INDEFERIDO - réu plano de saúde ")).toBe("INDEFERIDO - réu plano de saúde");
    expect(statusOutroDe("outro", "")).toBeNull();
    expect(statusOutroDe("outro", undefined)).toBeNull();
    expect(statusOutroDe("liberado", "texto")).toBeNull();
    expect(statusOutroDe(undefined, "texto")).toBeNull();
  });

  it("colunasDeDTO grava status_outro com 'outro' e NULL com qualquer outro status", () => {
    const base = payload("outro", "INDEFERIDO") as unknown as NewProcessoDTO;
    expect(colunasDeDTO(base)).toMatchObject({ status: "outro", status_outro: "INDEFERIDO" });
    expect(colunasDeDTO({ ...base, status: "em_transito" })).toMatchObject({ status: "em_transito", status_outro: null });
  });

  it("colunasDeDTO de um patch sem status não toca em status/status_outro", () => {
    const col = colunasDeDTO({ pendencias: ["x"] });
    expect("status" in col).toBe(false);
    expect("status_outro" in col).toBe(false);
  });

  function row(over: Partial<FollowUpRow>): FollowUpRow {
    return {
      id: "proc_1",
      paciente: "Fulano",
      ordem: null,
      pasta: "2026 - 1",
      empresa: "FARMAURORA",
      consultor: "André Vitório",
      responsavel_operacional: null,
      despachante: null,
      fornecedor: null,
      transportadora_nacional_nome: null,
      transportadora_nacional_cotacao: null,
      transportadora_nacional_valor: null,
      modal_envio: null,
      companhia_aerea: null,
      numero_awb: null,
      codigo_rastreio: null,
      medicamentos: [],
      status: "outro",
      status_outro: "INDEFERIDO",
      data_compra_po: null,
      data_embarque: null,
      abertura_thread: null,
      data_chegada_brasil: null,
      registro_radar: null,
      registro_duimp: null,
      registro_lpco: null,
      previsao_entrega: null,
      suposta_estimativa: null,
      local_entrega: null,
      numero_processo: null,
      pendencias: [],
      status_pagamento: null,
      alerta_fornecedor_resolvido: false,
      atualizacoes: [],
      created_at: "2026-10-14T00:00:00.000Z",
      updated_at: "2026-10-14T00:00:00.000Z",
      ...over,
    };
  }

  it("montarProcesso expõe statusOutro só para status 'outro'", () => {
    expect(montarProcesso(row({})).statusOutro).toBe("INDEFERIDO");
    expect("statusOutro" in montarProcesso(row({ status: "liberado", status_outro: "resíduo" }))).toBe(false);
  });

  it("registro existente (coluna NULL) continua abrindo sem erro e sem a chave", () => {
    const p = montarProcesso(row({ status: "em_transito", status_outro: null }));
    expect(p.status).toBe("em_transito");
    expect("statusOutro" in p).toBe(false);
  });
});

function proc(status: StatusProcesso, statusOutro?: string): Processo {
  return {
    id: `proc_${status}_${statusOutro ?? ""}`,
    paciente: "Fulano",
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    medicamentos: [],
    status,
    ...(statusOutro !== undefined ? { statusOutro } : {}),
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
  };
}

describe("status 'outro' — rótulo do badge", () => {
  it("mostra o texto digitado (aparado); cai em 'Outro' se vier vazio; demais status mantêm o rótulo", () => {
    expect(rotuloStatusProcesso(proc("outro", "  INDEFERIDO - réu plano de saúde "))).toBe("INDEFERIDO - réu plano de saúde");
    expect(rotuloStatusProcesso(proc("outro"))).toBe("Outro");
    expect(rotuloStatusProcesso(proc("outro", "  "))).toBe("Outro");
    expect(rotuloStatusProcesso(proc("em_transito", "ignorado"))).toBe("Em trânsito");
    expect(rotuloStatusProcesso(proc("entregue"))).toBe("Entregue");
  });

  it("cor neutra própria, diferente dos status do pipeline", () => {
    const classes = STATUS_PROCESSO_META.outro.badgeClass;
    expect(classes).toMatch(/slate/);
    for (const s of STATUS_PROCESSO_ORDER.filter((x) => x !== "outro")) {
      expect(STATUS_PROCESSO_META[s].badgeClass).not.toBe(classes);
    }
  });
});

describe("status 'outro' — opções do select e do filtro", () => {
  it("'Outro' é a ÚLTIMA opção, depois de Entregue; o resto segue a ordem do pipeline", () => {
    expect(STATUS_OPTIONS.map((o) => o.value)).toEqual([
      "elaboracao_fornecedores",
      "aguardando_inicio",
      "em_transito",
      "desembaraco",
      "liberado",
      "liberado_parcial",
      "entregue",
      "outro",
    ]);
    expect(STATUS_OPTIONS.at(-1)?.label).toBe("Outro");
  });

  it("o filtro da toolbar inclui 'Outro' (e continua começando por 'Todos os status')", () => {
    expect(STATUS_FILTER_OPTIONS[0]).toEqual({ value: "", label: "Todos os status" });
    expect(STATUS_FILTER_OPTIONS.map((o) => o.value)).toContain("outro");
  });
});

describe("status 'outro' — filtro e abas", () => {
  const lista = [proc("em_transito"), proc("outro", "INDEFERIDO"), proc("entregue"), proc("liberado")];

  it("filtrar por 'outro' devolve só os de status Outro; vazio devolve tudo", () => {
    expect(filtrarPorStatus(lista, "outro").map((p) => p.statusOutro)).toEqual(["INDEFERIDO"]);
    expect(filtrarPorStatus(lista, "")).toHaveLength(4);
  });

  it("o processo 'outro' aparece na aba 'Em andamento' (tudo menos entregue)", () => {
    const { andamento, entregues } = separarAbas(lista);
    expect(andamento.map((p) => p.status)).toEqual(["em_transito", "outro", "liberado"]);
    expect(entregues.map((p) => p.status)).toEqual(["entregue"]);
  });
});

function formBase(over: Partial<ProcessoFormState> = {}): ProcessoFormState {
  return {
    paciente: "Fulano",
    ordem: "",
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "André Vitório",
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
    statusOutro: "",
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
    ...over,
  };
}

describe("status 'outro' — formulário", () => {
  it("'outro' sem texto → inválido, com mensagem; com texto → payload com statusOutro aparado", () => {
    const sem = validarProcessoForm(formBase({ status: "outro", statusOutro: "   " }), [], [], "");
    expect(sem).toEqual({ valido: false, erro: 'Informe qual é o status (opção "Outro").' });

    const com = validarProcessoForm(formBase({ status: "outro", statusOutro: "  INDEFERIDO " }), [], [], "");
    expect(com.valido).toBe(true);
    if (com.valido) {
      expect(com.payload.status).toBe("outro");
      expect(com.payload.statusOutro).toBe("INDEFERIDO");
    }
  });

  it("status que não é 'outro' nunca manda statusOutro (mesmo com texto sobrando no form)", () => {
    const p = buildBasePayload(formBase({ status: "em_transito", statusOutro: "sobra" }), [], [], "");
    expect(p.statusOutro).toBeUndefined();
  });
});

describe("ordem — ida e volta importar → abrir no form → salvar", () => {
  // O formulário LÊ com parseOrdemNumero (só aceita o rótulo "Ordem N") e GRAVA com
  // formatOrdemLabel ("Ordem N"). Logo o formato gravado no banco tem que ser o rótulo.
  it("rótulo 'Ordem 3' sobrevive ao ciclo sem perder o valor", () => {
    const importado = "Ordem 3"; // formato que o parser de importação grava
    const noForm = parseOrdemNumero(importado);
    expect(noForm).toBe("3");
    expect(formatOrdemLabel(noForm)).toBe(importado);
  });

  it("gravar só o número PERDERIA o valor ao abrir o form (por isso não se usa)", () => {
    expect(parseOrdemNumero("3")).toBe("");
  });
});
