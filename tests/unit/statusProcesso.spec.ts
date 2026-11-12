import { describe, expect, it } from "vitest";
import {
  isStatusProcesso,
  isStatusProcessoLegado,
  mensagemStatusLegado,
  normalizarStatusProcesso,
  STATUS_PROCESSO_LABELS,
  STATUS_PROCESSO_LEGADO_PARA,
  STATUS_PROCESSO_ORDER,
} from "#shared/constants/processos";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { erroStatusLegado, isValidProcessoPatch, isValidProcessoPayload } from "../../server/utils/processoValidation";
import { colunasDeDTO, montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { metaDoStatus, rotuloStatusProcesso, STATUS_PROCESSO_META } from "../../app/utils/processoStatus";
import { STATUS_FILTER_OPTIONS, STATUS_OPTIONS } from "../../app/utils/processoOptions";
import { filtrarPorStatus, separarAbas } from "../../app/utils/processoListas";
import { buildBasePayload, type ProcessoFormState } from "../../app/utils/processoFormPayload";

// Os 5 status do Follow-Up (Na origem, Em trânsito, Desembaraço, Liberado, Entregue) e o legado que saiu do app
// (aguardando_inicio, liberado_parcial, outro): continua no enum do Postgres, é normalizado na LEITURA e recusado
// na ESCRITA. O antigo texto livre do "Outro" (statusOutro / status_outro) não é mais lido nem gravado.

const LEGADOS = ["aguardando_inicio", "liberado_parcial", "outro"] as const;

function payload(status: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    paciente: "Fulano de Tal",
    pasta: "2026 - 400",
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    status,
    medicamentos: [],
    pendencias: [],
    atualizacoes: [],
    datas: {},
    ...extra,
  };
}

describe("os 5 status: ordem do fluxo, rótulos e cores", () => {
  it("ordem do fluxo", () => {
    expect(STATUS_PROCESSO_ORDER).toEqual(["elaboracao_fornecedores", "em_transito", "desembaraco", "liberado", "entregue"]);
  });

  it("rótulos (elaboracao_fornecedores aparece como 'Na origem')", () => {
    expect(STATUS_PROCESSO_ORDER.map((s) => STATUS_PROCESSO_LABELS[s])).toEqual([
      "Na origem",
      "Em trânsito",
      "Desembaraço",
      "Liberado",
      "Entregue",
    ]);
  });

  it("todo status tem badge com fundo e texto", () => {
    for (const s of STATUS_PROCESSO_ORDER) {
      expect(STATUS_PROCESSO_META[s].badgeClass).toMatch(/^bg-\S+ text-\S+$/);
      expect(STATUS_PROCESSO_META[s].label).toBe(STATUS_PROCESSO_LABELS[s]);
    }
  });

  it("select do formulário e filtro da toolbar têm só os 5, na ordem", () => {
    expect(STATUS_OPTIONS.map((o) => o.value)).toEqual(STATUS_PROCESSO_ORDER);
    expect(STATUS_OPTIONS[0]).toEqual({ value: "elaboracao_fornecedores", label: "Na origem" });
    expect(STATUS_FILTER_OPTIONS[0]).toEqual({ value: "", label: "Todos os status" });
    expect(STATUS_FILTER_OPTIONS.slice(1).map((o) => o.value)).toEqual(STATUS_PROCESSO_ORDER);
  });

  it("isStatusProcesso aceita só os 5; isStatusProcessoLegado só os 3 que saíram", () => {
    for (const s of STATUS_PROCESSO_ORDER) {
      expect(isStatusProcesso(s)).toBe(true);
      expect(isStatusProcessoLegado(s)).toBe(false);
    }
    for (const s of LEGADOS) {
      expect(isStatusProcesso(s)).toBe(false);
      expect(isStatusProcessoLegado(s)).toBe(true);
    }
    for (const s of ["", "Outro", "toString", "constructor", 1, null, undefined]) {
      expect(isStatusProcesso(s)).toBe(false);
      expect(isStatusProcessoLegado(s)).toBe(false);
    }
  });
});

describe("legado — normalização na leitura", () => {
  it("aguardando_inicio → Na origem; liberado_parcial e outro → Desembaraço", () => {
    expect(STATUS_PROCESSO_LEGADO_PARA).toEqual({
      aguardando_inicio: "elaboracao_fornecedores",
      liberado_parcial: "desembaraco",
      outro: "desembaraco",
    });
    expect(normalizarStatusProcesso("aguardando_inicio")).toBe("elaboracao_fornecedores");
    expect(normalizarStatusProcesso("liberado_parcial")).toBe("desembaraco");
    expect(normalizarStatusProcesso("outro")).toBe("desembaraco");
  });

  it("os 5 ficam como estão; valor desconhecido cai em Na origem (nunca quebra um Record)", () => {
    for (const s of STATUS_PROCESSO_ORDER) expect(normalizarStatusProcesso(s)).toBe(s);
    expect(normalizarStatusProcesso("qualquer")).toBe("elaboracao_fornecedores");
    expect(normalizarStatusProcesso(undefined)).toBe("elaboracao_fornecedores");
  });

  it("metaDoStatus/rotuloStatusProcesso não quebram com um legado que escape", () => {
    expect(metaDoStatus("outro").label).toBe("Desembaraço");
    expect(rotuloStatusProcesso({ status: "aguardando_inicio" as unknown as StatusProcesso })).toBe("Na origem");
  });
});

function linha(over: Partial<FollowUpRow>): FollowUpRow {
  return {
    id: "proc_1",
    paciente: "Fulano",
    numero_remessa: 1,
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
    medicamentos: [],
    status: "em_transito",
    status_outro: null,
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
    alerta_mandado_resolvido: false,
    atualizacoes: [],
    created_at: "2026-10-14T00:00:00.000Z",
    updated_at: "2026-10-14T00:00:00.000Z",
    ...over,
  };
}

describe("mappers", () => {
  it("montarProcesso normaliza o legado e nunca expõe statusOutro", () => {
    const outro = montarProcesso(linha({ status: "outro", status_outro: "INDEFERIDO" }));
    expect(outro.status).toBe("desembaraco");
    expect("statusOutro" in outro).toBe(false);
    expect(montarProcesso(linha({ status: "aguardando_inicio" })).status).toBe("elaboracao_fornecedores");
    expect(montarProcesso(linha({ status: "liberado_parcial" })).status).toBe("desembaraco");
    expect(montarProcesso(linha({ status: "liberado" })).status).toBe("liberado");
  });

  it("colunasDeDTO grava o status e NUNCA status_outro (nem com statusOutro de aba antiga)", () => {
    const col = colunasDeDTO({ status: "liberado", statusOutro: "x" } as never);
    expect(col).toEqual({ status: "liberado" });
    expect("status_outro" in colunasDeDTO({ pendencias: ["x"] })).toBe(false);
  });
});

describe("validação no servidor", () => {
  it("criação: os 5 passam; os 3 legados não passam e têm mensagem própria", () => {
    for (const s of STATUS_PROCESSO_ORDER) {
      expect(isValidProcessoPayload(payload(s))).toBe(true);
      expect(erroStatusLegado(payload(s))).toBeNull();
    }
    for (const s of LEGADOS) {
      expect(isValidProcessoPayload(payload(s))).toBe(false);
      expect(erroStatusLegado(payload(s))).toBe(mensagemStatusLegado(s));
    }
    expect(mensagemStatusLegado("outro")).toBe(
      'O status "outro" não é mais usado. Escolha um destes: Na origem, Em trânsito, Desembaraço, Liberado, Entregue.',
    );
  });

  it("edição: os 5 passam; os 3 legados não; statusOutro (aba antiga) é ignorado, com ou sem status", () => {
    for (const s of STATUS_PROCESSO_ORDER) expect(isValidProcessoPatch({ status: s })).toBe(true);
    for (const s of LEGADOS) {
      expect(isValidProcessoPatch({ status: s, statusOutro: "INDEFERIDO" })).toBe(false);
      expect(erroStatusLegado({ status: s })).toContain("não é mais usado");
    }
    expect(isValidProcessoPatch({ statusOutro: "INDEFERIDO" })).toBe(true);
    expect(isValidProcessoPatch({ status: "entregue", statusOutro: "sobra" })).toBe(true);
    expect(erroStatusLegado({})).toBeNull();
    expect(erroStatusLegado(null)).toBeNull();
  });
});

function proc(status: StatusProcesso, id = `proc_${status}`): Processo {
  return {
    id,
    paciente: "Fulano",
    numeroRemessa: 1,
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    medicamentos: [],
    status,
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
  };
}

describe("filtro e abas da Lista", () => {
  const lista = [proc("em_transito"), proc("elaboracao_fornecedores"), proc("entregue"), proc("liberado")];

  it("filtrar por status; vazio devolve tudo", () => {
    expect(filtrarPorStatus(lista, "elaboracao_fornecedores").map((p) => p.id)).toEqual(["proc_elaboracao_fornecedores"]);
    expect(filtrarPorStatus(lista, "")).toHaveLength(4);
  });

  it("Em andamento = os 4 status antes de Entregue", () => {
    const { andamento, entregues } = separarAbas(lista);
    expect(andamento.map((p) => p.status)).toEqual(["em_transito", "elaboracao_fornecedores", "liberado"]);
    expect(entregues.map((p) => p.status)).toEqual(["entregue"]);
  });
});

describe("formulário", () => {
  it("o payload não tem mais statusOutro", () => {
    const form = {
      paciente: "Fulano",
      numeroRemessa: "1",
      numeroPo: "",
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
      status: "em_transito",
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
    } satisfies ProcessoFormState;
    const p = buildBasePayload(form, [], [], "");
    expect(p.status).toBe("em_transito");
    expect("statusOutro" in p).toBe(false);
  });
});
