import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import { FakeSupabase } from "./helpers/fakeSupabase";

// POST /api/processos com `id` opcional (gerado pelo formulário ao abrir): formato estrito, INSERT apenas, 23505 → 409 "já
// criado" sem devolver a linha existente, sem `id` tudo como sempre, e o aviso ao consultor só depois do INSERT que deu certo.
// Handler e store REAIS; só h3 (readBody) e o Supabase (em memória, com a chave primária de follow_up ligada) são simulados.

const h = vi.hoisted(() => ({
  body: {} as unknown,
  contas: [] as unknown[],
  inserts: [] as Array<Array<Record<string, unknown>>>,
  listUsersChamadas: 0,
}));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        listUsers: async () => {
          h.listUsersChamadas++;
          return { data: { users: h.contas, nextPage: null }, error: null };
        },
      },
    },
    from: (tabela: string) =>
      tabela === "notificacoes"
        ? {
            insert: async (rows: Array<Record<string, unknown>>) => {
              h.inserts.push(rows);
              return { error: null };
            },
          }
        : fake.from(tabela),
  }),
}));

const { default: postHandler } = await import("../../server/api/processos/index.post");
const { erroIdProcesso } = await import("../../server/utils/processoValidation");
const { createProcesso } = await import("../../server/utils/processosStore");
const { MENSAGEM_ID_PROCESSO_INVALIDO, MENSAGEM_PROCESSO_JA_CRIADO } = await import("../../shared/utils/idNovoProcesso");

const T = "follow_up";
const ID = "proc_3f2b8c1e-5a47-4d9e-8b21-0c6d7e9a1f34";
const OUTRO_ID = "proc_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const admin: AuthUser = { id: "adm-1", email: "adm@farmaurora.com.br", role: "administrador", nome: "Admin", isAdmin: true };

function corpo(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    paciente: "Beltrana",
    pasta: "2026 - 99",
    empresa: "FARMAURORA",
    consultor: "Dani",
    status: "em_transito",
    medicamentos: [],
    pendencias: [],
    atualizacoes: [],
    datas: {},
    ...extra,
  };
}

async function postar(body: unknown): Promise<{ id: string; paciente: string }> {
  h.body = body;
  return (await postHandler({ context: { user: admin } } as never)) as { id: string; paciente: string };
}

async function erroDe(body: unknown): Promise<Record<string, unknown>> {
  try {
    await postar(body);
  } catch (e) {
    return e as Record<string, unknown>;
  }
  throw new Error("era esperado um erro");
}

const linhas = () => fake.linhas(T);

beforeEach(() => {
  fake.tabelas[T] = [];
  fake.chaveUnica(T, "id"); // a chave primária do banco
  fake.chamadas.length = 0;
  h.inserts = [];
  h.listUsersChamadas = 0;
  h.contas = [
    {
      id: "cons-dani",
      email: "dani@farmaurora.com.br",
      app_metadata: { role: "consultor", consultorNome: "Dani" },
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("erroIdProcesso (validação do id do corpo)", () => {
  it("ausente, undefined e null não são erro (o servidor gera o id)", () => {
    expect(erroIdProcesso({})).toBeNull();
    expect(erroIdProcesso({ id: undefined })).toBeNull();
    expect(erroIdProcesso({ id: null })).toBeNull();
    expect(erroIdProcesso(null)).toBeNull();
  });

  it("proc_ + UUID em minúsculas é válido", () => {
    expect(erroIdProcesso({ id: ID })).toBeNull();
  });

  it.each([
    ["", "vazio"],
    ["proc_123", "curto"],
    ["proc_3F2B8C1E-5A47-4D9E-8B21-0C6D7E9A1F34", "maiúsculas"],
    ["3f2b8c1e-5a47-4d9e-8b21-0c6d7e9a1f34", "sem o prefixo"],
    [`${ID}x`, "com sobra no fim"],
    [` ${ID}`, "com espaço"],
    ["proc_3f2b8c1e-5a47-4d9e-8b21-0c6d7e9a1f3g", "caractere fora do hexadecimal"],
    ["p_3f2b8c1e-5a47-4d9e-8b21-0c6d7e9a1f34", "prefixo de outra tabela"],
    ["proc_'; drop table follow_up; --", "tentativa de injeção"],
    [123, "número"],
    [{}, "objeto"],
    [true, "booleano"],
  ])("inválido (%j): %s", (id) => {
    expect(erroIdProcesso({ id })).toBe(MENSAGEM_ID_PROCESSO_INVALIDO);
  });
});

describe("POST /api/processos — id do cliente", () => {
  it("id válido: grava com ESSE id e devolve o mesmo", async () => {
    const criado = await postar(corpo({ id: ID }));
    expect(criado.id).toBe(ID);
    expect(linhas()).toHaveLength(1);
    expect(linhas()[0]).toMatchObject({ id: ID, paciente: "Beltrana", consultor: "Dani" });
  });

  it("sem id (cliente antigo): o servidor gera proc_<ts>_<aleatório>, como sempre", async () => {
    const criado = await postar(corpo());
    expect(criado.id).toMatch(/^proc_\d+_[a-z0-9]+$/);
    expect(linhas()[0]!.id).toBe(criado.id);
  });

  it("id null: tratado como ausente (o servidor gera)", async () => {
    const criado = await postar(corpo({ id: null }));
    expect(criado.id).toMatch(/^proc_\d+_[a-z0-9]+$/);
    expect(linhas()).toHaveLength(1);
  });

  it("id fora do formato: 400 com mensagem própria e NADA é gravado nem consultado", async () => {
    for (const id of ["proc_123", "", 7, "proc_3F2B8C1E-5A47-4D9E-8B21-0C6D7E9A1F34", `${ID}x`]) {
      const e = await erroDe(corpo({ id, pendencias: ["Laudo"] }));
      expect(e.statusCode, JSON.stringify(id)).toBe(400);
      expect(e.statusMessage).toBe(MENSAGEM_ID_PROCESSO_INVALIDO);
    }
    expect(linhas()).toHaveLength(0);
    expect(fake.chamadas).toEqual([]);
    expect(h.listUsersChamadas).toBe(0);
  });

  it("o id NÃO vira coluna além da chave: a linha gravada só tem as colunas de sempre", async () => {
    await postar(corpo({ id: ID }));
    expect(Object.keys(linhas()[0]!)).not.toContain("id_cliente");
    expect(linhas()[0]!.id).toBe(ID);
  });
});

describe("POST /api/processos — 2º envio com o mesmo id", () => {
  it("o 2º POST recebe 409 'Esse processo já foi criado.' e a tabela fica com UMA linha", async () => {
    const primeiro = await postar(corpo({ id: ID }));
    expect(primeiro.id).toBe(ID);

    const e = await erroDe(corpo({ id: ID, paciente: "Outro nome, mesmo formulário" }));
    expect(e.statusCode).toBe(409);
    expect(e.statusMessage).toBe(MENSAGEM_PROCESSO_JA_CRIADO);
    expect(linhas()).toHaveLength(1);
    expect(linhas()[0]!.paciente, "INSERT apenas: o 2º envio não sobrescreve nada (nunca upsert)").toBe("Beltrana");
  });

  it("o 409 não devolve a linha existente nem dados dela", async () => {
    await postar(corpo({ id: ID, paciente: "Paciente Sigiloso", pendencias: ["Segredo"] }));
    const e = await erroDe(corpo({ id: ID }));
    expect(JSON.stringify(e)).not.toMatch(/Sigiloso|Segredo/);
    expect(e.data).toBeUndefined();
    // e o servidor nem leu a linha existente: só o INSERT que falhou.
    expect(fake.chamadas.filter((c) => c.tabela === T).map((c) => c.op)).toEqual(["insert", "insert"]);
  });

  it("outro id é outro processo (dois formulários abertos em sequência criam dois)", async () => {
    await postar(corpo({ id: ID }));
    await postar(corpo({ id: OUTRO_ID }));
    expect(linhas().map((l) => l.id)).toEqual([ID, OUTRO_ID]);
  });

  it("a notificação ao consultor NÃO duplica: o 2º POST (409) não avisa nem consulta as contas", async () => {
    await postar(corpo({ id: ID, pendencias: ["Laudo", "Receita"], atualizacoes: [{ data: "08/11", texto: "Aberto" }] }));
    const avisosDoPrimeiro = h.inserts.flat().length;
    const consultasDoPrimeiro = h.listUsersChamadas;
    expect(avisosDoPrimeiro).toBe(3);

    const e = await erroDe(corpo({ id: ID, pendencias: ["Laudo", "Receita"], atualizacoes: [{ data: "08/11", texto: "Aberto" }] }));
    expect(e.statusCode).toBe(409);
    expect(h.inserts.flat()).toHaveLength(avisosDoPrimeiro);
    expect(h.listUsersChamadas).toBe(consultasDoPrimeiro);
  });
});

describe("createProcesso — só o 23505 do id do cliente vira 409", () => {
  const entrada = (extra: Record<string, unknown> = {}) =>
    corpo({ numeroRemessa: 1, ...extra }) as unknown as Parameters<typeof createProcesso>[0];

  it("23505 com id do cliente → 409; os outros erros do banco continuam erro genérico (500)", async () => {
    fake.falhar(T, "insert", "duplicate key value violates unique constraint", "23505");
    await expect(createProcesso(entrada({ id: ID }))).rejects.toMatchObject({ statusCode: 409, statusMessage: MENSAGEM_PROCESSO_JA_CRIADO });

    fake.falhar(T, "insert", "connection reset", "08006");
    const e = (await createProcesso(entrada({ id: ID })).catch((x: unknown) => x)) as Error & { statusCode?: number };
    expect(e.statusCode).toBeUndefined();
    expect(e.message).toBe("Supabase: falha ao criar processo — connection reset");
  });

  it("23505 SEM id do cliente (id gerado pelo servidor) NÃO é 'já criado': segue como erro genérico", async () => {
    fake.falhar(T, "insert", "duplicate key value violates unique constraint", "23505");
    const e = (await createProcesso(entrada()).catch((x: unknown) => x)) as Error & { statusCode?: number };
    expect(e.statusCode).toBeUndefined();
    expect(e.message).toContain("falha ao criar processo");
  });

  it("o retorno não leva o `id` do cliente duplicado em outra chave e usa o id gravado", async () => {
    const r = await createProcesso(entrada({ id: ID }));
    expect(r.id).toBe(ID);
    expect(Object.keys(r).filter((k) => k === "id")).toHaveLength(1);
  });
});
