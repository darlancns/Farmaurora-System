import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Medicamento } from "#shared/types/processo";
import { CAMPOS_PROCESSO_LIMPAVEIS } from "../../shared/constants/processos";
import {
  paraPatchDeEdicao,
  validarProcessoForm,
  type ProcessoFormState,
} from "../../app/utils/processoFormPayload";
import { FakeSupabase } from "./helpers/fakeSupabase";

// BUG: esvaziar um campo opcional no "Editar processo" salvava com sucesso, mas o valor antigo
// continuava no banco. Causa: o payload do formulário omite (undefined) os opcionais vazios, e o
// JSON.stringify do PATCH DESCARTA `undefined` — a chave nunca chegava ao servidor, e colunasDeDTO só
// monta coluna de chave presente. A correção manda `null` (paraPatchDeEdicao) e o servidor limpa a coluna.
//
// O handler do PATCH e o processosStore são os REAIS; só h3 (readBody/getRouterParam) e o Supabase (em
// memória) são simulados. O corpo passa por JSON.stringify/parse, como na rede.

const h = vi.hoisted(() => ({ body: {} as unknown }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => "proc_1") };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: handler } = await import("../../server/api/processos/[id].patch");
const { isValidProcessoPatch, isValidProcessoPayload } = await import("../../server/utils/processoValidation");

const T = "follow_up";
const VERSAO = "2026-11-05T10:00:00.123456+00:00";
const ATUALIZACOES = [{ data: "01/09", texto: "Antiga" }];

// Linha COMPLETA: todos os opcionais preenchidos + coisas que o formulário não controla.
function linhaCompleta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "proc_1",
    paciente: "Fulano",
    ordem: "Ordem 2",
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavel_operacional: "Bruno",
    despachante: "Marcelo Lima",
    fornecedor: "Poros - Turquia",
    transportadora_nacional_nome: "AJC",
    transportadora_nacional_cotacao: "COT-9",
    transportadora_nacional_valor: 1500,
    modal_envio: "Air Cargo",
    companhia_aerea: "LATAM Cargo",
    numero_awb: "957-12345678",
    codigo_rastreio: "LA123BR",
    medicamentos: [{ nome: "DROGA", dosagem: "10MG", quantidade: "2" }],
    status: "em_transito",
    status_outro: null,
    data_compra_po: "01/09",
    data_embarque: "05/09",
    abertura_thread: "06/09",
    data_chegada_brasil: "10/09",
    registro_radar: "11/09",
    registro_duimp: "12/09",
    registro_lpco: "13/09",
    previsao_entrega: "20/09",
    suposta_estimativa: "fim de setembro",
    local_entrega: "Clínica X",
    numero_processo: "123456",
    pendencias: ["Enviar laudo"],
    status_pagamento: "pendente",
    alerta_fornecedor_resolvido: true,
    alerta_mandado_resolvido: true,
    atualizacoes: ATUALIZACOES,
    created_at: "2026-01-01T00:00:00.000000+00:00",
    updated_at: VERSAO,
    ...extra,
  };
}

// Formulário preenchido igual à linha acima (o que o "Editar processo" carrega).
function formCompleto(): ProcessoFormState {
  return {
    paciente: "Fulano",
    ordem: "2",
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavelOperacional: "Bruno",
    despachante: "Marcelo Lima",
    transportadoraNome: "AJC",
    transportadoraCotacao: "COT-9",
    transportadoraValor: "1500",
    modalEnvio: "Air Cargo",
    companhiaAerea: "LATAM Cargo",
    numeroAwb: "957-12345678",
    codigoRastreio: "LA123BR",
    status: "em_transito",
    statusOutro: "",
    dataCompraPO: "01/09",
    dataEmbarque: "05/09",
    aberturaThread: "06/09",
    dataChegadaBrasil: "10/09",
    registroRadar: "11/09",
    registroDuimp: "12/09",
    registroLpco: "13/09",
    previsaoEntrega: "20/09",
    supostaEstimativa: "fim de setembro",
    localEntrega: "Clínica X",
    numeroProcesso: "123456",
    statusPagamento: "pendente",
  };
}

const MEDICAMENTOS: Medicamento[] = [{ nome: "DROGA", dosagem: "10MG", quantidade: "2" }];

const row = () => fake.linhas(T).find((r) => r.id === "proc_1")!;
const evento = { context: { user: null } } as unknown as Parameters<typeof handler>[0];

// O que o formulário faz ao salvar: validar → payload de edição → JSON na rede → PATCH.
function corpoDeEdicao(form: ProcessoFormState, pendencias: string[] = ["Enviar laudo"]): Record<string, unknown> {
  const r = validarProcessoForm(form, MEDICAMENTOS, pendencias, "Poros - Turquia");
  if (!r.valido) throw new Error(`form inválido: ${r.erro}`);
  return JSON.parse(JSON.stringify(paraPatchDeEdicao(r.payload))) as Record<string, unknown>;
}

async function salvar(corpo: Record<string, unknown>) {
  h.body = corpo;
  return handler(evento);
}

async function editar(mudar: (f: ProcessoFormState) => void, pendencias?: string[]) {
  const form = formCompleto();
  mudar(form);
  return salvar(corpoDeEdicao(form, pendencias));
}

beforeEach(() => {
  fake.tabelas[T] = [linhaCompleta()];
  fake.chamadas.length = 0;
});

describe("causa raiz — o payload cru perde o esvaziamento na rede", () => {
  it("sem paraPatchDeEdicao, a chave some do JSON e a coluna antiga NÃO é limpa (o bug)", async () => {
    const form = { ...formCompleto(), transportadoraNome: "", companhiaAerea: "" };
    const r = validarProcessoForm(form, MEDICAMENTOS, ["Enviar laudo"], "Poros - Turquia");
    if (!r.valido) throw new Error(r.erro);

    const naRede = JSON.parse(JSON.stringify(r.payload)) as Record<string, unknown>;
    expect("companhiaAerea" in naRede).toBe(false);
    expect("transportadoraNacional" in naRede).toBe(false);

    await salvar(naRede);
    expect(row().companhia_aerea).toBe("LATAM Cargo");
    expect(row().transportadora_nacional_nome).toBe("AJC");
  });
});

describe("paraPatchDeEdicao", () => {
  it("campo opcional vazio vira null; preenchido segue como está", () => {
    const r = validarProcessoForm(
      { ...formCompleto(), companhiaAerea: "", transportadoraNome: "" },
      MEDICAMENTOS,
      [],
      "",
    );
    if (!r.valido) throw new Error(r.erro);
    const patch = paraPatchDeEdicao(r.payload);

    expect(patch.companhiaAerea).toBeNull();
    expect(patch.transportadoraNacional).toBeNull();
    expect(patch.fornecedor).toBeNull(); // fornecedor "" no payload
    expect(patch.numeroAwb).toBe("957-12345678");
  });

  it("TODOS os campos da lista de limpáveis vão no corpo, nunca como undefined", () => {
    const vazio: ProcessoFormState = {
      ...formCompleto(),
      ordem: "",
      responsavelOperacional: "",
      despachante: "",
      transportadoraNome: "",
      modalEnvio: "",
      companhiaAerea: "",
      numeroAwb: "",
      codigoRastreio: "",
      localEntrega: "",
      numeroProcesso: "",
      statusPagamento: "",
    };
    const r = validarProcessoForm(vazio, [], [], "");
    if (!r.valido) throw new Error(r.erro);
    const naRede = JSON.parse(JSON.stringify(paraPatchDeEdicao(r.payload))) as Record<string, unknown>;

    for (const campo of CAMPOS_PROCESSO_LIMPAVEIS) {
      expect(campo in naRede, campo).toBe(true);
      expect(naRede[campo], campo).toBeNull();
    }
  });

  it("não inclui o que o formulário não controla (atualizações, alertas, versão)", () => {
    const corpo = corpoDeEdicao(formCompleto());
    for (const chave of ["atualizacoes", "alertaFornecedorResolvido", "alertaMandadoResolvido", "versao", "id"]) {
      expect(chave in corpo, chave).toBe(false);
    }
  });
});

describe("esvaziar na edição persiste como NULL no banco", () => {
  it("nome da transportadora vazio limpa nome, cotação e valor (as 3 colunas)", async () => {
    // cotação e valor continuam digitados: sem nome não há transportadora, e as 3 colunas são limpas.
    const res = await editar((f) => {
      f.transportadoraNome = "";
    });

    expect(row().transportadora_nacional_nome).toBeNull();
    expect(row().transportadora_nacional_cotacao).toBeNull();
    expect(row().transportadora_nacional_valor).toBeNull();
    expect(res.transportadoraNacional).toBeUndefined();
  });

  it("esvaziar só cotação e valor (mantendo o nome) limpa só essas duas colunas", async () => {
    await editar((f) => {
      f.transportadoraCotacao = "";
      f.transportadoraValor = "";
    });

    expect(row().transportadora_nacional_nome).toBe("AJC");
    expect(row().transportadora_nacional_cotacao).toBeNull();
    expect(row().transportadora_nacional_valor).toBeNull();
  });

  const CASOS: Array<[string, (f: ProcessoFormState) => void, string]> = [
    ["cia aérea", (f) => (f.companhiaAerea = ""), "companhia_aerea"],
    ["AWB", (f) => (f.numeroAwb = ""), "numero_awb"],
    ["rastreio", (f) => (f.codigoRastreio = ""), "codigo_rastreio"],
    ["local de entrega", (f) => (f.localEntrega = ""), "local_entrega"],
    ["nº do processo", (f) => (f.numeroProcesso = ""), "numero_processo"],
    ["despachante", (f) => (f.despachante = ""), "despachante"],
    ["responsável", (f) => (f.responsavelOperacional = ""), "responsavel_operacional"],
    ["ordem", (f) => (f.ordem = ""), "ordem"],
    ["status de pagamento", (f) => (f.statusPagamento = ""), "status_pagamento"],
  ];

  // despachante só é obrigatório em Air Cargo/Courier Formal: para esvaziá-lo, o modal é Courier Simples.
  it.each(CASOS)("%s", async (_nome, mudar, coluna) => {
    await editar((f) => {
      f.modalEnvio = "Courier Simples";
      mudar(f);
    });

    expect(row()[coluna]).toBeNull();
  });

  it("modal de envio vazio limpa modal_envio", async () => {
    await editar((f) => {
      f.modalEnvio = "";
    });
    expect(row().modal_envio).toBeNull();
  });

  it("uma data esvaziada vira NULL; as outras 8 ficam como estavam", async () => {
    await editar((f) => {
      f.dataEmbarque = "";
    });

    expect(row().data_embarque).toBeNull();
    expect(row().data_compra_po).toBe("01/09");
    expect(row().abertura_thread).toBe("06/09");
    expect(row().data_chegada_brasil).toBe("10/09");
    expect(row().registro_radar).toBe("11/09");
    expect(row().registro_duimp).toBe("12/09");
    expect(row().registro_lpco).toBe("13/09");
    expect(row().previsao_entrega).toBe("20/09");
    expect(row().suposta_estimativa).toBe("fim de setembro");
  });

  it("pendências esvaziadas (array vazio) viram []", async () => {
    await editar(() => {}, []);
    expect(row().pendencias).toEqual([]);
  });

  it("fornecedor esvaziado limpa a coluna", async () => {
    const f = formCompleto();
    const r = validarProcessoForm(f, MEDICAMENTOS, ["Enviar laudo"], ""); // fornecedor "" (select em "Selecione")
    if (!r.valido) throw new Error(r.erro);
    await salvar(JSON.parse(JSON.stringify(paraPatchDeEdicao(r.payload))));
    expect(row().fornecedor).toBeNull();
  });
});

describe("o que NÃO pode ser afetado", () => {
  it("campos não tocados permanecem exatamente como estavam", async () => {
    const antes = { ...row() };
    await editar(() => {}, ["Enviar laudo"]);
    const depois = row();

    for (const [coluna, valor] of Object.entries(antes)) {
      if (coluna === "updated_at") continue;
      expect(depois[coluna], coluna).toEqual(valor);
    }
  });

  it("atualizações e alertas resolvidos ficam intactos ao esvaziar vários campos", async () => {
    await editar((f) => {
      f.companhiaAerea = "";
      f.numeroAwb = "";
      f.localEntrega = "";
      f.transportadoraNome = "";
      f.dataEmbarque = "";
    }, []);

    expect(row().atualizacoes).toEqual(ATUALIZACOES);
    expect(row().alerta_fornecedor_resolvido).toBe(true);
    expect(row().alerta_mandado_resolvido).toBe(true);
  });

  it("campos obrigatórios continuam exigidos pelo formulário e pelo servidor", async () => {
    const semPaciente = validarProcessoForm({ ...formCompleto(), paciente: "" }, [], [], "");
    expect(semPaciente.valido).toBe(false);

    for (const campo of ["paciente", "pasta", "empresa", "consultor", "status"]) {
      expect(isValidProcessoPatch({ [campo]: null }), campo).toBe(false);
    }
    expect(isValidProcessoPatch({ medicamentos: null })).toBe(false);
    expect(isValidProcessoPatch({ pendencias: null })).toBe(false);
    expect(isValidProcessoPatch({ datas: null })).toBe(false);
    expect(isValidProcessoPatch({ atualizacoes: null, versao: VERSAO })).toBe(false);
  });
});

describe("Courier Simples — valores ocultos NÃO são apagados só por estarem ocultos", () => {
  it("processo Courier Simples com despachante e transportadora antigos: salvar sem mexer mantém tudo", async () => {
    fake.tabelas[T] = [linhaCompleta({ modal_envio: "Courier Simples" })];

    // O form carrega os valores (ocultos na tela) e o payload os reenvia como estavam.
    await editar((f) => {
      f.modalEnvio = "Courier Simples";
    });

    expect(row().despachante).toBe("Marcelo Lima");
    expect(row().transportadora_nacional_nome).toBe("AJC");
    expect(row().transportadora_nacional_cotacao).toBe("COT-9");
    expect(row().transportadora_nacional_valor).toBe(1500);
  });

  it("esvaziou a transportadora ANTES de trocar para Courier Simples: o esvaziamento vale (foi ação do usuário)", async () => {
    await editar((f) => {
      f.transportadoraNome = "";
      f.modalEnvio = "Courier Simples";
    });
    expect(row().transportadora_nacional_nome).toBeNull();
    expect(row().despachante).toBe("Marcelo Lima");
  });
});

describe("contrato do PATCH (validação)", () => {
  it("transportadoraNacional: null é aceito no PATCH", () => {
    expect(isValidProcessoPatch({ transportadoraNacional: null })).toBe(true);
  });

  it("transportadoraNacional malformada continua recusada no PATCH", () => {
    expect(isValidProcessoPatch({ transportadoraNacional: "AJC" })).toBe(false);
    expect(isValidProcessoPatch({ transportadoraNacional: { cotacao: "x" } })).toBe(false);
    expect(isValidProcessoPatch({ transportadoraNacional: { nome: "AJC", valor: "1" } })).toBe(false);
  });

  it("o POST (criação) NÃO aceita transportadoraNacional: null", () => {
    const base = {
      paciente: "Fulano",
      pasta: "2026 - 1",
      empresa: "FARMAURORA",
      consultor: "Dani",
      status: "em_transito",
      medicamentos: [],
      pendencias: [],
      atualizacoes: [],
      datas: {},
    };
    expect(isValidProcessoPayload({ ...base })).toBe(true);
    expect(isValidProcessoPayload({ ...base, transportadoraNacional: null })).toBe(false);
  });

  it("o PATCH versionado de atualizações segue igual: grava só as atualizações, sem tocar nos opcionais", async () => {
    const novas = [...ATUALIZACOES, { data: "", texto: "Nova" }];
    await salvar({ atualizacoes: novas, versao: VERSAO });

    expect(row().atualizacoes).toEqual(novas);
    expect(row().companhia_aerea).toBe("LATAM Cargo");
    expect(row().transportadora_nacional_nome).toBe("AJC");
    expect(row().data_embarque).toBe("05/09");
  });
});
