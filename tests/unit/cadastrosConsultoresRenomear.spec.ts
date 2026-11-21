import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import type { ConsultorAtualizado, ImpactoRenomearConsultor, ResultadoContasConsultor } from "../../shared/types/Cadastro";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { linhaConsultor, TABELA_CONSULTORES as T } from "./helpers/consultoresFixtures";
import { aplicarRenomearConsultor } from "./helpers/renomearConsultorFake";

// RENOMEAR um consultor (a única lista cujo nome muda): PATCH /api/cadastros/consultores/:id com `nome`, o endpoint de impacto
// (só leitura, para a confirmação) e o "tentar de novo" das contas. Handlers e stores REAIS; só h3, o Supabase em memória (com a
// função SQL emulada em helpers/renomearConsultorFake.ts) e o Supabase Auth (contas em memória) são simulados.
// Só itens "TESTE": nenhum nome de paciente — as linhas de follow_up/prestacao/dir/compras levam só id e o consultor.

const h = vi.hoisted(() => ({
  body: {} as unknown,
  params: {} as Record<string, string | undefined>,
  contas: new Map<string, { email: string; app_metadata: Record<string, unknown> }>(),
  falhar: new Set<string>(),
  updates: [] as Array<{ id: string; app_metadata: Record<string, unknown> }>,
}));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return {
    ...real,
    readBody: vi.fn(async () => h.body),
    getRouterParam: vi.fn((_event: unknown, nome: string) => h.params[nome]),
  };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => ({
    from: (tabela: string) => fake.from(tabela),
    rpc: (nome: string, args: Record<string, unknown>) => fake.rpc(nome, args),
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: [...h.contas].map(([id, c]) => ({ id, email: c.email, app_metadata: c.app_metadata })), nextPage: null },
          error: null,
        }),
        updateUserById: async (id: string, atributos: { app_metadata: Record<string, unknown> }) => {
          if (h.falhar.has(id)) return { data: null, error: { message: "auth fora do ar" } };
          h.updates.push({ id, app_metadata: atributos.app_metadata });
          const conta = h.contas.get(id)!;
          conta.app_metadata = atributos.app_metadata;
          return { data: { user: { id } }, error: null };
        },
      },
    },
  }),
}));

const { default: alterar } = await import("../../server/api/cadastros/[lista]/[id].patch");
const { default: impacto } = await import("../../server/api/cadastros/[lista]/[id]/impacto.get");
const { default: renomearContas } = await import("../../server/api/cadastros/[lista]/[id]/renomear-contas.post");
const { consultorExisteNoCadastro, esquecerConsultorEmCache } = await import("../../server/utils/consultoresCadastro");

const LISTA = { lista: "consultores" };

const conta = (role: AuthUser["role"], nome?: string): AuthUser => ({
  id: `u_${role}`,
  email: `${role}@x.com`,
  role,
  nome,
  isAdmin: role === "administrador",
});
const admin = conta("administrador", "Cris Admin");
const NAO_ADMIN: AuthUser["role"][] = ["socio", "operacional", "consultor"];

async function chamar<R>(handler: (e: never) => Promise<R>, user: AuthUser | null, params: Record<string, string>, body?: unknown) {
  h.body = body;
  h.params = params;
  return handler({ context: { user } } as never);
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

const NOME_ANTIGO = "Consultor Teste";

function semear(): void {
  fake.tabelas[T] = [
    linhaConsultor(NOME_ANTIGO, true, { id: "cons_a" }),
    linhaConsultor("Outro Teste", true, { id: "cons_b" }),
    linhaConsultor("Inativo Teste", false, { id: "cons_c" }),
  ];
  // Só id e consultor: nenhum dado de paciente.
  fake.tabelas["follow_up"] = [
    { id: "p1", consultor: NOME_ANTIGO },
    { id: "p2", consultor: NOME_ANTIGO },
    { id: "p3", consultor: "Outro Teste" },
  ];
  fake.tabelas["prestacao_pacientes"] = [
    { id: "r1", consultor: NOME_ANTIGO },
    { id: "r2", consultor: null },
  ];
  fake.tabelas["dir"] = [
    { id: "d1", vendedor: NOME_ANTIGO },
    { id: "d2", vendedor: NOME_ANTIGO },
    { id: "d3", vendedor: NOME_ANTIGO },
    { id: "d4", vendedor: "Braulio (3RB)" },
  ];
  fake.tabelas["compras"] = [
    { id: "k1", consultor: NOME_ANTIGO },
    { id: "k2", consultor: NOME_ANTIGO },
    { id: "k3", consultor: "Outro Teste" },
    { id: "k4", consultor: "" },
  ];
  h.contas.clear();
  h.contas.set("c1", { email: "c1@x.com", app_metadata: { role: "consultor", consultorNome: NOME_ANTIGO, nome: "Conta Um" } });
  h.contas.set("c2", { email: "c2@x.com", app_metadata: { role: "consultor", consultorNome: NOME_ANTIGO, nome: "Conta Dois" } });
  h.contas.set("c3", { email: "c3@x.com", app_metadata: { role: "consultor", consultorNome: "Outro Teste" } });
  h.contas.set("a1", { email: "a1@x.com", app_metadata: { role: "administrador", consultorNome: null } });
}

const valores = (tabela: string, coluna: string) => (fake.tabelas[tabela] ?? []).map((r) => r[coluna]);
const consultorDe = (id: string) => String(h.contas.get(id)!.app_metadata.consultorNome);

beforeEach(() => {
  semear();
  aplicarRenomearConsultor(fake);
  fake.chamadas.length = 0;
  fake.chamadasRpc.length = 0;
  h.falhar.clear();
  h.updates.length = 0;
  esquecerConsultorEmCache();
});

describe("PATCH renomear consultor — só administrador", () => {
  it("sócio, operacional, consultor e sem login levam 403 — nada muda (nem banco, nem contas)", async () => {
    const proibidos: Array<AuthUser | null> = [...NAO_ADMIN.map((r) => conta(r)), null];
    for (const user of proibidos) {
      expect((await erroDe(chamar(alterar, user, { ...LISTA, id: "cons_a" }, { nome: "Novo Teste" }))).status, user?.role ?? "sem login").toBe(403);
    }
    expect(fake.chamadasRpc).toHaveLength(0);
    expect(valores("follow_up", "consultor")).toEqual([NOME_ANTIGO, NOME_ANTIGO, "Outro Teste"]);
    expect(h.updates).toHaveLength(0);
  });

  it("administrador renomeia: o Cadastro, follow_up, prestacao_pacientes, dir, compras e as contas passam a ter o nome novo (só onde era IGUAL ao antigo)", async () => {
    const r = (await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: "Novo Teste" })) as ConsultorAtualizado;

    expect(r).toMatchObject({ id: "cons_a", nome: "Novo Teste", ativo: true, atualizadoPor: "Cris Admin" });
    expect(fake.linhas(T).find((l) => l.id === "cons_a")).toMatchObject({ nome: "Novo Teste", nome_chave: "novo teste" });
    expect(valores("follow_up", "consultor")).toEqual(["Novo Teste", "Novo Teste", "Outro Teste"]);
    expect(valores("prestacao_pacientes", "consultor")).toEqual(["Novo Teste", null]);
    expect(valores("dir", "vendedor")).toEqual(["Novo Teste", "Novo Teste", "Novo Teste", "Braulio (3RB)"]);
    expect(valores("compras", "consultor")).toEqual(["Novo Teste", "Novo Teste", "Outro Teste", ""]);
    // Contas: só as que tinham o nome antigo; o resto do app_metadata é preservado (merge).
    expect(consultorDe("c1")).toBe("Novo Teste");
    expect(consultorDe("c2")).toBe("Novo Teste");
    expect(consultorDe("c3")).toBe("Outro Teste");
    expect(h.contas.get("c1")!.app_metadata).toEqual({ role: "consultor", consultorNome: "Novo Teste", nome: "Conta Um" });
    expect(h.contas.get("a1")!.app_metadata).toEqual({ role: "administrador", consultorNome: null });
    // Resposta: contagens (só números) e o resultado das contas.
    expect(r.renomeacao).toEqual({
      nomeAntigo: NOME_ANTIGO,
      processos: 2,
      pacientes: 1,
      dir: 3,
      compras: 2,
      contas: { atualizadas: 2, falhas: [] },
    });
  });

  it("a função SQL recebe id, nome novo, a CHAVE do nome novo e quem gravou (uma única chamada)", async () => {
    await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: "  André   Novo " });
    expect(fake.chamadasRpc).toEqual([
      { nome: "renomear_consultor", args: { p_id: "cons_a", p_nome_novo: "André Novo", p_nome_chave: "andre novo", p_por: "Cris Admin" } },
    ]);
  });

  it("corrigir só acento/caixa (mesma chave, texto diferente) é permitido e propaga o texto novo", async () => {
    const r = (await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: "CONSULTOR TESTÉ" })) as ConsultorAtualizado;
    expect(r.nome).toBe("CONSULTOR TESTÉ");
    expect(fake.linhas(T).find((l) => l.id === "cons_a")).toMatchObject({ nome: "CONSULTOR TESTÉ", nome_chave: "consultor teste" });
    expect(valores("follow_up", "consultor")).toEqual(["CONSULTOR TESTÉ", "CONSULTOR TESTÉ", "Outro Teste"]);
    expect(consultorDe("c1")).toBe("CONSULTOR TESTÉ");
  });

  it("nome igual ao atual: nada é propagado (sem RPC de verdade, sem contas), o item volta como está", async () => {
    const r = (await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: NOME_ANTIGO })) as ConsultorAtualizado;
    expect(r.nome).toBe(NOME_ANTIGO);
    expect(r.renomeacao).toBeUndefined();
    expect(fake.chamadasRpc).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });

  it("nome (pela chave) de OUTRO consultor, ativo ou inativo, é 409 e NADA muda", async () => {
    for (const nome of ["outro teste", "OUTRO   TÉSTE", "inativo teste"]) {
      const e = await erroDe(chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome }));
      expect(e.status, nome).toBe(409);
      expect(e.msg, nome).toBe("Já existe outro consultor com esse nome.");
    }
    expect(fake.linhas(T).find((l) => l.id === "cons_a")).toMatchObject({ nome: NOME_ANTIGO });
    expect(valores("follow_up", "consultor")).toEqual([NOME_ANTIGO, NOME_ANTIGO, "Outro Teste"]);
    expect(h.updates).toHaveLength(0);
  });

  it('"Outro" é reservado (400, qualquer caixa), nome vazio e nome comprido também; nada chega ao banco', async () => {
    for (const nome of ["Outro", "outro", "   ", "x".repeat(121)]) {
      expect((await erroDe(chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome }))).status, nome).toBe(400);
    }
    expect(fake.chamadasRpc).toHaveLength(0);
  });

  it("as OUTRAS listas continuam com nome imutável (422): só consultores renomeiam", async () => {
    for (const [lista, tabela, id] of [
      ["cias-aereas", "cadastro_cias_aereas", "cia_1"],
      ["fornecedores", "cadastro_fornecedores", "forn_1"],
    ] as const) {
      fake.tabelas[tabela] = [
        {
          id,
          nome: "Item",
          nome_chave: "item",
          ativo: true,
          pais: null,
          prazo_alerta_dias: null,
          sem_alerta: true,
          atualizado_por: null,
          created_at: "2026-11-01T00:00:00.000Z",
          updated_at: "2026-11-01T00:00:00.000Z",
        },
      ];
      const e = await erroDe(chamar(alterar, admin, { lista, id }, { nome: "Item Novo" }));
      expect(e.status, lista).toBe(422);
      expect(e.msg, lista).toMatch(/nome não pode ser alterado/i);
      expect(fake.linhas(tabela)[0], lista).toMatchObject({ nome: "Item" });
    }
    expect(fake.chamadasRpc).toHaveLength(0);
  });

  it("404 para consultor inexistente; ativo continua valendo como antes (desativar não mexe em nada nas tabelas)", async () => {
    expect((await erroDe(chamar(alterar, admin, { ...LISTA, id: "nao-existe" }, { nome: "Qualquer Teste" }))).status).toBe(404);
    const r = (await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { ativo: false })) as ConsultorAtualizado;
    expect(r).toMatchObject({ nome: NOME_ANTIGO, ativo: false });
    expect(r.renomeacao).toBeUndefined();
    expect(valores("follow_up", "consultor")).toEqual([NOME_ANTIGO, NOME_ANTIGO, "Outro Teste"]);
  });

  it("função SQL não aplicada (migration pendente): 503 claro, nada muda e nenhuma conta é tocada", async () => {
    delete fake.rpcs["renomear_consultor"];
    const e = await erroDe(chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: "Novo Teste" }));
    expect(e.status).toBe(503);
    expect(e.msg).toMatch(/renomear_consultor/);
    expect(h.updates).toHaveLength(0);
    expect(valores("dir", "vendedor")[0]).toBe(NOME_ANTIGO);
  });

  it("o nome antigo deixa de valer na hora (cache de acertos) e o novo passa a valer", async () => {
    expect(await consultorExisteNoCadastro(NOME_ANTIGO)).toBe(true); // entra no cache
    await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: "Novo Teste" });
    expect(await consultorExisteNoCadastro(NOME_ANTIGO)).toBe(false);
    expect(await consultorExisteNoCadastro("Novo Teste")).toBe(true);
  });
});

describe("renomear: falha parcial das contas e 'tentar de novo'", () => {
  it("se uma conta falha, as outras são atualizadas, a resposta lista QUAIS falharam e o banco já está renomeado", async () => {
    h.falhar.add("c2");
    const r = (await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: "Novo Teste" })) as ConsultorAtualizado;

    expect(r.nome).toBe("Novo Teste");
    expect(valores("follow_up", "consultor")).toEqual(["Novo Teste", "Novo Teste", "Outro Teste"]);
    expect(r.renomeacao!.contas).toEqual({ atualizadas: 1, falhas: [{ id: "c2", email: "c2@x.com" }] });
    expect(consultorDe("c1")).toBe("Novo Teste");
    expect(consultorDe("c2")).toBe(NOME_ANTIGO); // continua com o nome antigo até tentar de novo
  });

  it("tentar de novo: atualiza só quem ainda tem o nome antigo; é IDEMPOTENTE (repetir não mexe em mais nada)", async () => {
    h.falhar.add("c2");
    await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: "Novo Teste" });
    h.falhar.clear();
    h.updates.length = 0;

    const um = (await chamar(renomearContas, admin, { ...LISTA, id: "cons_a" }, { nomeAntigo: NOME_ANTIGO })) as ResultadoContasConsultor;
    expect(um).toEqual({ atualizadas: 1, falhas: [] });
    expect(consultorDe("c2")).toBe("Novo Teste");
    expect(h.updates.map((u) => u.id)).toEqual(["c2"]); // c1 já estava atualizada: não é tocada de novo

    h.updates.length = 0;
    const dois = (await chamar(renomearContas, admin, { ...LISTA, id: "cons_a" }, { nomeAntigo: NOME_ANTIGO })) as ResultadoContasConsultor;
    expect(dois).toEqual({ atualizadas: 0, falhas: [] });
    expect(h.updates).toHaveLength(0);
  });

  it("tentar de novo: continua falhando → volta a lista de quem falhou", async () => {
    h.falhar.add("c1");
    h.falhar.add("c2");
    await chamar(alterar, admin, { ...LISTA, id: "cons_a" }, { nome: "Novo Teste" });
    const r = (await chamar(renomearContas, admin, { ...LISTA, id: "cons_a" }, { nomeAntigo: NOME_ANTIGO })) as ResultadoContasConsultor;
    expect(r.atualizadas).toBe(0);
    expect(r.falhas.map((f) => f.id).sort()).toEqual(["c1", "c2"]);
  });

  it("tentar de novo: só administrador, só consultores; nome antigo obrigatório; 409 se o nome antigo é de OUTRO consultor; 404 sem o item", async () => {
    for (const user of [...NAO_ADMIN.map((r) => conta(r)), null]) {
      expect((await erroDe(chamar(renomearContas, user, { ...LISTA, id: "cons_a" }, { nomeAntigo: "X" }))).status, user?.role ?? "sem login").toBe(403);
    }
    expect((await erroDe(chamar(renomearContas, admin, { lista: "cias-aereas", id: "cia_1" }, { nomeAntigo: "X" }))).status).toBe(404);
    expect((await erroDe(chamar(renomearContas, admin, { ...LISTA, id: "cons_a" }, {}))).status).toBe(400);
    expect((await erroDe(chamar(renomearContas, admin, { ...LISTA, id: "cons_a" }, { nomeAntigo: "  " }))).status).toBe(400);
    expect((await erroDe(chamar(renomearContas, admin, { ...LISTA, id: "nao-existe" }, { nomeAntigo: "X" }))).status).toBe(404);
    // "Outro Teste" é o nome de OUTRO consultor: as contas dele não podem ser jogadas para cons_a.
    expect((await erroDe(chamar(renomearContas, admin, { ...LISTA, id: "cons_a" }, { nomeAntigo: "Outro Teste" }))).status).toBe(409);
    expect(consultorDe("c3")).toBe("Outro Teste");
    expect(h.updates).toHaveLength(0);
  });
});

describe("GET impacto do renomear (só leitura)", () => {
  it("administrador recebe as contagens: processos, prestações, POs da DIR, compras e contas com o nome atual — só números", async () => {
    const r = (await chamar(impacto, admin, { ...LISTA, id: "cons_a" })) as ImpactoRenomearConsultor;
    expect(r).toEqual({ nome: NOME_ANTIGO, processos: 2, pacientes: 1, dir: 3, compras: 2, contas: 2 });
    expect(Object.keys(r).sort()).toEqual(["compras", "contas", "dir", "nome", "pacientes", "processos"]); // só o nome do consultor e números
    expect(JSON.stringify(r)).not.toMatch(/@x\.com/); // nem e-mails de conta
  });

  it("não escreve nada: nenhum insert/update/delete/rpc, e as contas ficam como estão", async () => {
    await chamar(impacto, admin, { ...LISTA, id: "cons_a" });
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
    expect(fake.chamadasRpc).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });

  it("consultor sem registros: zeros", async () => {
    const r = (await chamar(impacto, admin, { ...LISTA, id: "cons_c" })) as ImpactoRenomearConsultor;
    expect(r).toEqual({ nome: "Inativo Teste", processos: 0, pacientes: 0, dir: 0, compras: 0, contas: 0 });
  });

  it("sócio, operacional, consultor e sem login levam 403 (as contagens são só do administrador); outra lista e item inexistente são 404", async () => {
    for (const user of [...NAO_ADMIN.map((r) => conta(r)), null]) {
      expect((await erroDe(chamar(impacto, user, { ...LISTA, id: "cons_a" }))).status, user?.role ?? "sem login").toBe(403);
    }
    expect((await erroDe(chamar(impacto, admin, { lista: "fornecedores", id: "forn_1" }))).status).toBe(404);
    expect((await erroDe(chamar(impacto, admin, { ...LISTA, id: "nao-existe" }))).status).toBe(404);
  });
});
