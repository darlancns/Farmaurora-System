import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { MEDICAMENTOS, VERSAO, linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Item 12 — PATCH /api/processos/:id com PENDÊNCIAS ou MEDICAMENTOS: conferência de versão (optimistic
// locking), como já era com `atualizacoes`. Cada lista é gravada INTEIRA; sem a conferência, quem salva por
// último apagaria sem aviso a lista que outra pessoa gravou. O handler e o processosStore são os REAIS; só h3
// (readBody/getRouterParam) e o Supabase (em memória, tests/unit/helpers/fakeSupabase.ts) são simulados.

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
const { MENSAGEM_VERSAO_AUSENTE, isValidProcessoPatch, patchExigeVersao } = await import(
  "../../server/utils/processoValidation"
);

const T = "follow_up";
const VERSAO_VELHA = "2026-11-05T09:00:00.000000+00:00";
const MENSAGEM_PEDIR_ATUALIZAR = "Atualize a página (Ctrl+Shift+R) e tente de novo.";

const row = () => fake.linhas(T).find((r) => r.id === "proc_1")!;
const evento = { context: { user: null } } as unknown as Parameters<typeof handler>[0];

async function chamar(corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo)); // como na rede: `undefined` some
  return handler(evento);
}

async function erroDe(promessa: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await promessa;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

const PENDENCIAS_NOVAS = ["Enviar laudo", "Ligar para a clínica"];
const MEDICAMENTOS_NOVOS = [{ nome: "DROGA", dosagem: "10MG", quantidade: "2" }, { nome: "OUTRA" }];

beforeEach(() => {
  fake.tabelas[T] = [linhaCompleta()];
  fake.chamadas.length = 0;
  // O aviso ao consultor (item 10) tenta o Supabase de contas, que o fake não tem: o erro é engolido e logado.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("409 — a versão está desatualizada: NADA é gravado", () => {
  it("pendências", async () => {
    const erro = await erroDe(chamar({ pendencias: PENDENCIAS_NOVAS, versao: VERSAO_VELHA, parcial: true }));

    expect(erro.status).toBe(409);
    expect(erro.msg).toContain("alterado por outra pessoa");
    expect(row().pendencias).toEqual(["Enviar laudo"]);
    expect(row().updated_at).toBe(VERSAO);
  });

  it("medicamentos", async () => {
    const erro = await erroDe(chamar({ medicamentos: MEDICAMENTOS_NOVOS, versao: VERSAO_VELHA, parcial: true }));

    expect(erro.status).toBe(409);
    expect(row().medicamentos).toEqual(MEDICAMENTOS);
    expect(row().updated_at).toBe(VERSAO);
  });

  it("os demais campos do mesmo patch também NÃO são gravados (o UPDATE é um só, condicional)", async () => {
    const erro = await erroDe(
      chamar({
        pendencias: PENDENCIAS_NOVAS,
        localEntrega: "Outro lugar",
        datas: { dataEmbarque: "06/09" },
        versao: VERSAO_VELHA,
        parcial: true,
      }),
    );

    expect(erro.status).toBe(409);
    expect(row().local_entrega).toBe("Clínica X");
    expect(row().data_embarque).toBe("05/09");
  });

  it("outra pessoa gravou a lista no meio tempo: a versão que esta pessoa viu já não vale e a lista dela é preservada", async () => {
    // A e B abrem o processo (versão VERSAO). B salva primeiro; a linha ganha uma versão nova.
    await chamar({ pendencias: ["Pendência de B"], versao: VERSAO, parcial: true });
    expect(row().updated_at).not.toBe(VERSAO);

    // A salva com a versão de ABERTURA: 409, e a lista de B continua lá.
    const erro = await erroDe(chamar({ pendencias: ["Pendência de A"], versao: VERSAO, parcial: true }));
    expect(erro.status).toBe(409);
    expect(row().pendencias).toEqual(["Pendência de B"]);
  });
});

describe("200 — a versão é a da linha", () => {
  it("pendências: grava, devolve o processo e troca o updated_at", async () => {
    const res = await chamar({ pendencias: PENDENCIAS_NOVAS, versao: VERSAO, parcial: true });

    expect(res.pendencias).toEqual(PENDENCIAS_NOVAS);
    expect(row().pendencias).toEqual(PENDENCIAS_NOVAS);
    expect(row().updated_at).not.toBe(VERSAO);
    expect(res.updatedAt).toBe(row().updated_at);
  });

  it("medicamentos: grava e troca o updated_at", async () => {
    const res = await chamar({ medicamentos: MEDICAMENTOS_NOVOS, versao: VERSAO, parcial: true });

    expect(res.medicamentos).toEqual(MEDICAMENTOS_NOVOS);
    expect(row().medicamentos).toEqual(MEDICAMENTOS_NOVOS);
    expect(row().updated_at).not.toBe(VERSAO);
  });

  it("`versao` e `parcial` não viram coluna", async () => {
    await chamar({ pendencias: PENDENCIAS_NOVAS, versao: VERSAO, parcial: true });
    expect(row()).not.toHaveProperty("versao");
    expect(row()).not.toHaveProperty("parcial");
  });
});

describe("duas gravações com a MESMA versão: a primeira vale, a segunda leva 409", () => {
  it("pendências", async () => {
    await chamar({ pendencias: ["Primeira"], versao: VERSAO, parcial: true });
    const segunda = await erroDe(chamar({ pendencias: ["Segunda"], versao: VERSAO, parcial: true }));

    expect(segunda.status).toBe(409);
    expect(row().pendencias).toEqual(["Primeira"]);
  });

  it("medicamentos", async () => {
    await chamar({ medicamentos: [{ nome: "PRIMEIRO" }], versao: VERSAO, parcial: true });
    const segunda = await erroDe(chamar({ medicamentos: [{ nome: "SEGUNDO" }], versao: VERSAO, parcial: true }));

    expect(segunda.status).toBe(409);
    expect(row().medicamentos).toEqual([{ nome: "PRIMEIRO" }]);
  });

  it("pendências de um, medicamentos do outro: a versão é da LINHA, então o segundo também leva 409", async () => {
    await chamar({ pendencias: ["Primeira"], versao: VERSAO, parcial: true });
    const segunda = await erroDe(chamar({ medicamentos: [{ nome: "SEGUNDO" }], versao: VERSAO, parcial: true }));

    expect(segunda.status).toBe(409);
    expect(row().medicamentos).toEqual(MEDICAMENTOS);
  });
});

describe("400 — lista sem versão (aba antiga): sem tolerância", () => {
  const CASOS: Array<[string, Record<string, unknown>]> = [
    ["pendências", { pendencias: PENDENCIAS_NOVAS }],
    ["pendências vazias (apagar todas)", { pendencias: [] }],
    ["medicamentos", { medicamentos: MEDICAMENTOS_NOVOS }],
    ["medicamentos vazios", { medicamentos: [] }],
    ["pendências no formato parcial", { pendencias: PENDENCIAS_NOVAS, parcial: true }],
    ["pendências e campos simples", { pendencias: PENDENCIAS_NOVAS, localEntrega: "Outro lugar", parcial: true }],
  ];

  it.each(CASOS)("%s: 400 com a mensagem de atualizar a página, e nada é gravado", async (_nome, corpo) => {
    const erro = await erroDe(chamar(corpo));

    expect(erro.status).toBe(400);
    expect(erro.msg).toBe(MENSAGEM_PEDIR_ATUALIZAR);
    expect(MENSAGEM_VERSAO_AUSENTE).toBe(MENSAGEM_PEDIR_ATUALIZAR);
    expect(row().pendencias).toEqual(["Enviar laudo"]);
    expect(row().medicamentos).toEqual(MEDICAMENTOS);
    expect(row().local_entrega).toBe("Clínica X");
    expect(row().updated_at).toBe(VERSAO);
  });

  it("versão vazia, só espaços ou que não é texto também é 400", async () => {
    for (const versao of ["", "   ", 123, null]) {
      expect((await erroDe(chamar({ pendencias: PENDENCIAS_NOVAS, versao }))).status).toBe(400);
    }
    expect(row().pendencias).toEqual(["Enviar laudo"]);
  });
});

describe("sem listas: continua SEM exigir versão", () => {
  it("campos simples (formato parcial) gravam sem versão", async () => {
    const res = await chamar({ localEntrega: "Outro lugar", numeroAwb: "AWB-1", parcial: true });
    expect(res.localEntrega).toBe("Outro lugar");
    expect(row().numero_awb).toBe("AWB-1");
  });

  // (O alerta de Mandado exige administrador/operacional responsável: coberto em processoPatchMandado.spec.ts.)
  it("formato legado, pagamento e alerta do fornecedor (sino) gravam sem versão", async () => {
    expect((await chamar({ paciente: "Outro Nome" })).paciente).toBe("Outro Nome");
    expect((await chamar({ statusPagamento: "pago" })).statusPagamento).toBe("pago");
    expect((await chamar({ alertaFornecedorResolvido: true })).alertaFornecedorResolvido).toBe(true);
  });

  it("`versao` solta (sem listas) é ignorada: não confere e não grava coluna", async () => {
    const res = await chamar({ localEntrega: "Outro lugar", versao: VERSAO_VELHA, parcial: true });
    expect(res.localEntrega).toBe("Outro lugar");
    expect(row()).not.toHaveProperty("versao");
  });

  it("patchExigeVersao: só as três listas exigem", () => {
    expect(patchExigeVersao({ atualizacoes: [] })).toBe(true);
    expect(patchExigeVersao({ pendencias: [] })).toBe(true);
    expect(patchExigeVersao({ medicamentos: [] })).toBe(true);
    expect(patchExigeVersao({ localEntrega: "x", datas: {}, transportadoraNacional: null })).toBe(false);
    expect(patchExigeVersao({})).toBe(false);
    expect(patchExigeVersao(null)).toBe(false);
    expect(isValidProcessoPatch({ pendencias: ["x"], versao: VERSAO })).toBe(true);
    expect(isValidProcessoPatch({ medicamentos: [], versao: VERSAO })).toBe(true);
    expect(isValidProcessoPatch({ medicamentos: [] })).toBe(false);
  });
});

// ARMADILHA: o ramo versionado chamava colunasDeDTO sem `parcial`. Sem repassá-lo, `datas` e
// `transportadoraNacional` por chave virariam "substitui tudo" e as chaves ausentes gravariam NULL.
describe("`parcial` é preservado no ramo versionado: datas e transportadora ausentes NÃO viram NULL", () => {
  it("só uma data no patch: as outras oito permanecem", async () => {
    await chamar({ pendencias: PENDENCIAS_NOVAS, datas: { dataEmbarque: "06/09" }, versao: VERSAO, parcial: true });

    expect(row().data_embarque).toBe("06/09");
    expect(row().data_compra_po).toBe("01/09");
    expect(row().abertura_thread).toBe("06/09");
    expect(row().data_chegada_brasil).toBe("10/09");
    expect(row().registro_radar).toBe("11/09");
    expect(row().registro_duimp).toBe("12/09");
    expect(row().registro_lpco).toBe("13/09");
    expect(row().previsao_entrega).toBe("20/09");
    expect(row().suposta_estimativa).toBe("fim de setembro");
    expect(row().pendencias).toEqual(PENDENCIAS_NOVAS);
  });

  it("só o valor da transportadora no patch: nome e cotação permanecem", async () => {
    await chamar({
      medicamentos: MEDICAMENTOS_NOVOS,
      transportadoraNacional: { valor: 2000 },
      versao: VERSAO,
      parcial: true,
    });

    expect(row().transportadora_nacional_valor).toBe(2000);
    expect(row().transportadora_nacional_nome).toBe("AJC");
    expect(row().transportadora_nacional_cotacao).toBe("COT-9");
  });

  it("datas vazias no formato parcial (`datas: {}`) não tocam em nenhuma data", async () => {
    await chamar({ pendencias: PENDENCIAS_NOVAS, datas: {}, versao: VERSAO, parcial: true });
    expect(row().data_embarque).toBe("05/09");
    expect(row().previsao_entrega).toBe("20/09");
  });

  it("`null` continua limpando só a chave pedida", async () => {
    await chamar({ pendencias: PENDENCIAS_NOVAS, datas: { dataEmbarque: null }, versao: VERSAO, parcial: true });
    expect(row().data_embarque).toBeNull();
    expect(row().data_compra_po).toBe("01/09");
  });

  it("controle: SEM `parcial` o formato antigo continua como sempre (chave ausente limpa) — o teste é sensível", async () => {
    await chamar({ pendencias: PENDENCIAS_NOVAS, datas: { dataEmbarque: "06/09" }, versao: VERSAO });
    expect(row().data_embarque).toBe("06/09");
    expect(row().data_compra_po).toBeNull();
  });
});
