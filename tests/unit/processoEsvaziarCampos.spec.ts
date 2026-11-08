import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPOS_PROCESSO_LIMPAVEIS } from "../../shared/constants/processos";
import {
  montarPatchDiferencial,
  validarProcessoForm,
  type EstadoEdicao,
} from "../../app/utils/processoFormPayload";
import { FakeSupabase } from "./helpers/fakeSupabase";
import {
  ATUALIZACOES,
  MEDICAMENTOS,
  VERSAO,
  editado,
  estadoCompleto,
  formCompleto,
  linhaCompleta,
} from "./helpers/processoEdicaoFixtures";

// BUG (item 1c): esvaziar um campo opcional no "Editar processo" salvava com sucesso, mas o valor antigo
// continuava no banco. Causa: o payload omitia (undefined) os opcionais vazios, e o JSON.stringify do
// PATCH DESCARTA `undefined` — a chave nunca chegava ao servidor, e colunasDeDTO só monta coluna de chave
// presente. Correção: o esvaziamento vai como `null`. No item 1d o patch virou DIFERENCIAL (só o que o
// usuário alterou); estes testes seguem provando que o esvaziamento persiste, agora por esse caminho.
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
const row = () => fake.linhas(T).find((r) => r.id === "proc_1")!;
const evento = { context: { user: null } } as unknown as Parameters<typeof handler>[0];

async function salvar(corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo)); // como na rede: `undefined` some
  return handler(evento);
}

// O que o formulário faz ao salvar uma edição: patch diferencial do estado inicial para o editado.
async function editar(mudar: (e: EstadoEdicao) => void) {
  const patch = montarPatchDiferencial(estadoCompleto(), editado(mudar));
  if (!patch) throw new Error("esperava alguma alteração");
  return salvar(patch);
}

beforeEach(() => {
  fake.tabelas[T] = [linhaCompleta()];
  fake.chamadas.length = 0;
});

describe("causa raiz — o payload cru perde o esvaziamento na rede", () => {
  it("sem null explícito, a chave some do JSON e a coluna antiga NÃO é limpa (o bug)", async () => {
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

describe("esvaziar na edição persiste como NULL no banco", () => {
  it("nome da transportadora vazio limpa nome, cotação e valor (as 3 colunas)", async () => {
    // cotação e valor continuam digitados: sem nome não há transportadora, e as 3 colunas são limpas.
    const res = await editar((e) => {
      e.form.transportadoraNome = "";
    });

    expect(row().transportadora_nacional_nome).toBeNull();
    expect(row().transportadora_nacional_cotacao).toBeNull();
    expect(row().transportadora_nacional_valor).toBeNull();
    expect(res.transportadoraNacional).toBeUndefined();
  });

  it("esvaziar só cotação e valor (mantendo o nome) limpa só essas duas colunas", async () => {
    await editar((e) => {
      e.form.transportadoraCotacao = "";
      e.form.transportadoraValor = "";
    });

    expect(row().transportadora_nacional_nome).toBe("AJC");
    expect(row().transportadora_nacional_cotacao).toBeNull();
    expect(row().transportadora_nacional_valor).toBeNull();
  });

  const CASOS: Array<[string, (e: EstadoEdicao) => void, string]> = [
    ["cia aérea", (e) => (e.form.companhiaAerea = ""), "companhia_aerea"],
    ["AWB", (e) => (e.form.numeroAwb = ""), "numero_awb"],
    ["local de entrega", (e) => (e.form.localEntrega = ""), "local_entrega"],
    ["nº do processo", (e) => (e.form.numeroProcesso = ""), "numero_processo"],
    ["despachante", (e) => (e.form.despachante = ""), "despachante"],
    ["responsável", (e) => (e.form.responsavelOperacional = ""), "responsavel_operacional"],
    ["ordem", (e) => (e.form.ordem = ""), "ordem"],
    ["status de pagamento", (e) => (e.form.statusPagamento = ""), "status_pagamento"],
    ["modal de envio", (e) => (e.form.modalEnvio = ""), "modal_envio"],
    ["fornecedor", (e) => (e.fornecedor = ""), "fornecedor"],
  ];

  it.each(CASOS)("%s", async (_nome, mudar, coluna) => {
    await editar(mudar);
    expect(row()[coluna]).toBeNull();
  });

  it("uma data esvaziada vira NULL; as outras 8 ficam como estavam", async () => {
    await editar((e) => {
      e.form.dataEmbarque = "";
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
    await editar((e) => {
      e.pendencias = [];
    });
    expect(row().pendencias).toEqual([]);
  });

  it("todos os campos limpáveis esvaziados de uma vez vão como null no corpo", () => {
    const patch = montarPatchDiferencial(
      estadoCompleto(),
      editado((e) => {
        Object.assign(e.form, {
          ordem: "",
          responsavelOperacional: "",
          despachante: "",
          transportadoraNome: "",
          modalEnvio: "",
          companhiaAerea: "",
          numeroAwb: "",
          localEntrega: "",
          numeroProcesso: "",
          statusPagamento: "",
        });
        e.fornecedor = "";
      }),
    );
    const naRede = JSON.parse(JSON.stringify(patch)) as Record<string, unknown>;

    for (const campo of CAMPOS_PROCESSO_LIMPAVEIS) {
      expect(campo in naRede, campo).toBe(true);
      expect(naRede[campo], campo).toBeNull();
    }
  });
});

describe("o que NÃO pode ser afetado", () => {
  it("campos não tocados permanecem exatamente como estavam (patch só com o alterado)", async () => {
    const antes = { ...row() };
    await editar((e) => {
      e.form.localEntrega = "Outro lugar";
    });
    const depois = row();

    for (const [coluna, valor] of Object.entries(antes)) {
      if (coluna === "updated_at" || coluna === "local_entrega") continue;
      expect(depois[coluna], coluna).toEqual(valor);
    }
    expect(depois.local_entrega).toBe("Outro lugar");
  });

  it("atualizações e alertas resolvidos ficam intactos ao esvaziar vários campos", async () => {
    await editar((e) => {
      e.form.companhiaAerea = "";
      e.form.numeroAwb = "";
      e.form.localEntrega = "";
      e.form.transportadoraNome = "";
      e.form.dataEmbarque = "";
      e.pendencias = [];
    });

    expect(row().atualizacoes).toEqual(ATUALIZACOES);
    expect(row().alerta_fornecedor_resolvido).toBe(true);
    expect(row().alerta_mandado_resolvido).toBe(true);
  });

  it("o corpo nunca carrega atualizações, alertas, versão ou id", () => {
    const patch = montarPatchDiferencial(
      estadoCompleto(),
      editado((e) => {
        e.form.localEntrega = "X";
      }),
    );
    for (const chave of ["atualizacoes", "alertaFornecedorResolvido", "alertaMandadoResolvido", "versao", "id"]) {
      expect(chave in (patch ?? {}), chave).toBe(false);
    }
  });

  it("campos obrigatórios continuam exigidos pelo formulário e pelo servidor", () => {
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
  it("processo Courier Simples com despachante e transportadora antigos: sem mexer neles, nada deles vai", async () => {
    fake.tabelas[T] = [linhaCompleta({ modal_envio: "Courier Simples" })];
    const base = estadoCompleto();
    base.form.modalEnvio = "Courier Simples";
    const atual = estadoCompleto();
    atual.form.modalEnvio = "Courier Simples";
    atual.form.localEntrega = "Outro lugar"; // o usuário só mexeu em outra coisa

    const patch = montarPatchDiferencial(base, atual);
    expect(patch).toEqual({ localEntrega: "Outro lugar", parcial: true });
    await salvar(patch);

    expect(row().despachante).toBe("Marcelo Lima");
    expect(row().transportadora_nacional_nome).toBe("AJC");
    expect(row().transportadora_nacional_cotacao).toBe("COT-9");
    expect(row().transportadora_nacional_valor).toBe(1500);
  });

  it("esvaziou a transportadora ANTES de trocar para Courier Simples: o esvaziamento vale (foi ação do usuário)", async () => {
    await editar((e) => {
      e.form.transportadoraNome = "";
      e.form.modalEnvio = "Courier Simples";
    });
    expect(row().transportadora_nacional_nome).toBeNull();
    expect(row().despachante).toBe("Marcelo Lima");
    expect(row().modal_envio).toBe("Courier Simples");
  });
});

describe("contrato do PATCH (validação)", () => {
  it("transportadoraNacional: null é aceito no PATCH", () => {
    expect(isValidProcessoPatch({ transportadoraNacional: null })).toBe(true);
  });

  it("transportadoraNacional malformada continua recusada no PATCH (formato antigo)", () => {
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
