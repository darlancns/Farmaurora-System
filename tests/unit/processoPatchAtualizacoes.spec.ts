import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIMITE_ATUALIZACAO_DATA,
  LIMITE_ATUALIZACAO_TEXTO,
  LIMITE_ATUALIZACOES_POR_PROCESSO,
} from "../../shared/constants/processos";
import { FakeSupabase } from "./helpers/fakeSupabase";

// PATCH /api/processos/:id com `atualizacoes` — conferência de versão (optimistic locking). O handler
// e o processosStore são os REAIS; só h3 (readBody/getRouterParam) e o cliente Supabase (em memória,
// tests/unit/helpers/fakeSupabase.ts) são simulados. O fake confere `eq("updated_at", versao)` por
// igualdade de string, como o PostgREST faz com a coluna timestamptz.

const h = vi.hoisted(() => ({ body: {} as unknown, id: "proc_1" as string | undefined }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => h.id) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: handler } = await import("../../server/api/processos/[id].patch");
const { proximoUpdatedAt } = await import("../../server/utils/processosStore");
const { isValidProcessoPatch, isValidProcessoPayload } = await import("../../server/utils/processoValidation");

const T = "follow_up";
// Como o Postgres devolve um timestamptz(6): microssegundos e "+00:00".
const VERSAO = "2026-11-05T10:00:00.123456+00:00";

function linha(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "proc_1",
    paciente: "Fulano",
    numero_remessa: 1,
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "Dani",
    status: "em_transito",
    status_outro: null,
    status_pagamento: null,
    medicamentos: [],
    pendencias: [],
    atualizacoes: [{ data: "01/09", texto: "Antiga" }],
    created_at: "2026-01-01T00:00:00.000000+00:00",
    updated_at: VERSAO,
    ...extra,
  };
}

const row = () => fake.linhas(T).find((r) => r.id === "proc_1")!;

async function chamar(body: unknown) {
  h.body = body;
  const evento = { context: { user: null } } as unknown as Parameters<typeof handler>[0];
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

const NOVAS = [
  { data: "01/09", texto: "Antiga" },
  { data: "", texto: "Nova" },
];

beforeEach(() => {
  h.id = "proc_1";
  fake.tabelas[T] = [linha()];
  fake.chamadas.length = 0;
});

describe("PATCH com atualizacoes — conferência de versão", () => {
  it("200 quando a versão é a da linha: grava, devolve o processo e troca o updated_at", async () => {
    const res = await chamar({ atualizacoes: NOVAS, versao: VERSAO });

    expect(res.atualizacoes).toEqual(NOVAS);
    expect(row().atualizacoes).toEqual(NOVAS);
    expect(row().updated_at).not.toBe(VERSAO);
    expect(res.updatedAt).toBe(row().updated_at);
    expect(Date.parse(res.updatedAt)).toBeGreaterThan(Date.parse(VERSAO));
  });

  it("a gravação é UM UPDATE com filtro de versão (atômico, sem ler-e-gravar)", async () => {
    await chamar({ atualizacoes: NOVAS, versao: VERSAO });
    // A única ESCRITA é o UPDATE condicional. Há uma leitura ANTES só para o aviso ao consultor (saber o que é
    // novo; ver notificacaoProcessoServidor.spec.ts) — ela não decide nada na gravação, que segue conferindo a versão.
    expect(fake.chamadas.filter((c) => c.op !== "select").map((c) => c.op)).toEqual(["update"]);
    expect(fake.chamadas.map((c) => c.op)).toEqual(["select", "update"]);
  });

  it("`versao` não vira coluna", async () => {
    await chamar({ atualizacoes: NOVAS, versao: VERSAO });
    expect(row()).not.toHaveProperty("versao");
  });

  it("409 com mensagem clara quando a versão está desatualizada, e NADA é gravado", async () => {
    const erro = await erroDe(chamar({ atualizacoes: NOVAS, versao: "2026-11-05T09:00:00.000000+00:00" }));

    expect(erro.status).toBe(409);
    expect(erro.msg).toContain("alterado por outra pessoa");
    expect(row().atualizacoes).toEqual([{ data: "01/09", texto: "Antiga" }]);
    expect(row().updated_at).toBe(VERSAO);
  });

  it("a versão é string OPACA: a mesma instante sem os microssegundos (passou por Date) dá 409", async () => {
    const viaDate = new Date(VERSAO).toISOString(); // 2026-11-05T10:00:00.123Z
    expect((await erroDe(chamar({ atualizacoes: NOVAS, versao: viaDate }))).status).toBe(409);
    expect((await chamar({ atualizacoes: NOVAS, versao: VERSAO })).atualizacoes).toEqual(NOVAS);
  });

  it("dois clientes com a mesma versão: o primeiro grava (200), o segundo recebe 409", async () => {
    await chamar({ atualizacoes: NOVAS, versao: VERSAO });
    const segundo = await erroDe(chamar({ atualizacoes: [{ data: "", texto: "Concorrente" }], versao: VERSAO }));
    expect(segundo.status).toBe(409);
    expect(row().atualizacoes).toEqual(NOVAS);
  });

  it("outro PATCH (pagamento) muda o updated_at: uma versão lida antes dele dá 409 legítimo", async () => {
    await chamar({ statusPagamento: "pago" });
    expect(row().updated_at).not.toBe(VERSAO);
    expect((await erroDe(chamar({ atualizacoes: NOVAS, versao: VERSAO }))).status).toBe(409);
  });

  it("404 quando o processo não existe", async () => {
    h.id = "inexistente";
    expect((await erroDe(chamar({ atualizacoes: NOVAS, versao: VERSAO }))).status).toBe(404);
  });

  it("400 (mensagem própria) quando `atualizacoes` vem sem `versao`; nada é gravado", async () => {
    for (const body of [{ atualizacoes: NOVAS }, { atualizacoes: NOVAS, versao: "" }, { atualizacoes: NOVAS, versao: "  " }]) {
      const erro = await erroDe(chamar(body));
      expect(erro.status).toBe(400);
      expect(erro.msg).toBe("Atualize a página (Ctrl+Shift+R) e tente de novo.");
    }
    expect(row().atualizacoes).toEqual([{ data: "01/09", texto: "Antiga" }]);
  });

  it("400 quando `versao` não é string", async () => {
    expect((await erroDe(chamar({ atualizacoes: NOVAS, versao: 123 }))).status).toBe(400);
  });

  it("PATCH SEM atualizacoes não exige versão (200)", async () => {
    const res = await chamar({ statusPagamento: "pago" });
    expect(res.statusPagamento).toBe("pago");
    const res2 = await chamar({ alertaFornecedorResolvido: true });
    expect(res2.alertaFornecedorResolvido).toBe(true);
  });

  it("PATCH sem atualizacoes que traga `versao` ignora a versão (não confere, não grava)", async () => {
    const res = await chamar({ statusPagamento: "pago", versao: "qualquer" });
    expect(res.statusPagamento).toBe("pago");
    expect(row()).not.toHaveProperty("versao");
  });

  it("itens inválidos → 400 (item sem texto, texto vazio, tipos errados)", async () => {
    const invalidos: unknown[] = [
      [{ data: "x" }],
      [{ data: "x", texto: "" }],
      [{ data: "x", texto: "   " }],
      [{ data: 1, texto: "ok" }],
      [{ data: "x", texto: 2 }],
      ["texto solto"],
      [null],
      "não é lista",
    ];
    for (const atualizacoes of invalidos) {
      expect((await erroDe(chamar({ atualizacoes, versao: VERSAO }))).status).toBe(400);
    }
    expect(row().updated_at).toBe(VERSAO);
  });

  it("lista vazia é válida (excluir o último item)", async () => {
    const res = await chamar({ atualizacoes: [], versao: VERSAO });
    expect(res.atualizacoes).toEqual([]);
  });
});

describe("validação de atualizacoes (limites)", () => {
  const ok = { data: "31/08", texto: "Texto" };

  it("data pode ser vazia; texto não", () => {
    expect(isValidProcessoPatch({ atualizacoes: [{ data: "", texto: "x" }], versao: "v" })).toBe(true);
    expect(isValidProcessoPatch({ atualizacoes: [{ data: "", texto: "" }], versao: "v" })).toBe(false);
  });

  it("limite de texto: exatamente o limite passa, um a mais não", () => {
    const item = (n: number) => ({ atualizacoes: [{ data: "", texto: "a".repeat(n) }], versao: "v" });
    expect(isValidProcessoPatch(item(LIMITE_ATUALIZACAO_TEXTO))).toBe(true);
    expect(isValidProcessoPatch(item(LIMITE_ATUALIZACAO_TEXTO + 1))).toBe(false);
  });

  it("limite de data: exatamente o limite passa, um a mais não", () => {
    const item = (n: number) => ({ atualizacoes: [{ data: "9".repeat(n), texto: "x" }], versao: "v" });
    expect(isValidProcessoPatch(item(LIMITE_ATUALIZACAO_DATA))).toBe(true);
    expect(isValidProcessoPatch(item(LIMITE_ATUALIZACAO_DATA + 1))).toBe(false);
  });

  it("limite de itens: exatamente o limite passa, um a mais não", () => {
    const lista = (n: number) => ({ atualizacoes: Array.from({ length: n }, () => ok), versao: "v" });
    expect(isValidProcessoPatch(lista(LIMITE_ATUALIZACOES_POR_PROCESSO))).toBe(true);
    expect(isValidProcessoPatch(lista(LIMITE_ATUALIZACOES_POR_PROCESSO + 1))).toBe(false);
  });

  it("os limites têm folga sobre a produção (maior texto 296, maior data 5, mais itens 16)", () => {
    expect(LIMITE_ATUALIZACAO_TEXTO).toBeGreaterThan(296 * 5);
    expect(LIMITE_ATUALIZACAO_DATA).toBeGreaterThan(5 * 5);
    expect(LIMITE_ATUALIZACOES_POR_PROCESSO).toBeGreaterThan(16 * 5);
  });

  it("a criação (POST) usa a mesma regra dos itens", () => {
    const base = {
      paciente: "P",
      pasta: "1",
      empresa: "FARMAURORA",
      consultor: "Dani",
      status: "em_transito",
      medicamentos: [],
      pendencias: [],
      datas: {},
      atualizacoes: [{ data: "", texto: "ok" }],
    };
    expect(isValidProcessoPayload(base)).toBe(true);
    expect(isValidProcessoPayload({ ...base, atualizacoes: [{ data: "", texto: " " }] })).toBe(false);
  });
});

describe("proximoUpdatedAt", () => {
  it("usa o relógio quando ele é posterior à versão anterior", () => {
    const agora = Date.parse("2026-11-06T12:00:00.000Z");
    expect(proximoUpdatedAt(VERSAO, agora)).toBe("2026-11-06T12:00:00.000Z");
  });

  it("nunca devolve um instante igual ou anterior à versão (mesmo milissegundo)", () => {
    const agora = Date.parse("2026-11-05T10:00:00.123Z");
    const novo = proximoUpdatedAt(VERSAO, agora);
    expect(Date.parse(novo)).toBeGreaterThan(Date.parse(VERSAO));
  });

  it("versão ilegível → relógio", () => {
    expect(proximoUpdatedAt("lixo", 0)).toBe("1970-01-01T00:00:00.000Z");
  });
});
