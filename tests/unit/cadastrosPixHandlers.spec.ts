import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import type { Permissoes } from "../../shared/utils/permissoesPagina";
import { FakeSupabase } from "./helpers/fakeSupabase";

// Chave PIX dos Cadastros (despachantes e transportadoras) = dado financeiro. Handlers e store REAIS; só h3
// (readBody/getRouterParam) e o Supabase (em memória) são simulados. Prova: (1) quem recebe o campo e quem NÃO recebe
// (a propriedade nem existe), por cargo e por mapa de permissões; (2) só o administrador grava; (3) "" limpa; 140 no
// máximo; (4) a chave nunca aparece em mensagem de erro nem em log. Todos os valores são FICTÍCIOS.

const h = vi.hoisted(() => ({ body: {} as unknown, params: {} as Record<string, string | undefined> }));
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
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: listar } = await import("../../server/api/cadastros/[lista]/index.get");
const { default: criar } = await import("../../server/api/cadastros/[lista]/index.post");
const { default: alterar } = await import("../../server/api/cadastros/[lista]/[id].patch");

const T_DESP = "cadastro_despachantes";
const T_TRANSP = "cadastro_transportadoras";
const PIX_DESP = "chave-ficticia-despachante-0001";
const PIX_TRANSP = "chave-ficticia-transportadora-0002";

const conta = (role: AuthUser["role"], permissoes?: Permissoes, nome?: string): AuthUser => ({
  id: `u_${role}`,
  email: `${role}@x.com`,
  role,
  nome,
  isAdmin: role === "administrador",
  ...(permissoes ? { permissoes } : {}),
});
const admin = conta("administrador", undefined, "Cris Admin");
const mapaPagamentos = (nivel: "nenhum" | "ver" | "editar"): Permissoes => ({ processos: "editar", pagamentos: nivel, patients: "editar" });

async function chamar<R>(handler: (e: never) => Promise<R>, user: AuthUser | null, params: Record<string, string>, body?: unknown) {
  h.body = body;
  h.params = params;
  return handler({ context: { user } } as never);
}

async function erroDe(promessa: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await promessa;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string; message?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? err.message ?? "" };
  }
  throw new Error("esperava um erro, mas a chamada passou");
}

const AGORA = "2026-11-18T12:00:00.000Z";
function semear(): void {
  fake.tabelas[T_DESP] = [
    {
      id: "desp_1",
      nome: "STAR CUSTOMS",
      nome_chave: "star customs",
      contato_nome: "Fulano",
      telefone: null,
      email: null,
      chave_pix: PIX_DESP,
      ativo: true,
      atualizado_por: null,
      created_at: AGORA,
      updated_at: AGORA,
    },
  ];
  fake.tabelas[T_TRANSP] = [
    { id: "transp_1", nome: "DHL", nome_chave: "dhl", chave_pix: PIX_TRANSP, ativo: true, atualizado_por: null, created_at: AGORA, updated_at: AGORA },
    { id: "transp_2", nome: "FedEx", nome_chave: "fedex", chave_pix: null, ativo: false, atualizado_por: null, created_at: AGORA, updated_at: AGORA },
  ];
}

const espioes: Array<ReturnType<typeof vi.spyOn>> = [];
beforeEach(() => {
  semear();
  fake.chamadas.length = 0;
  fake.selects.length = 0;
  for (const metodo of ["log", "info", "warn", "error", "debug"] as const) {
    espioes.push(vi.spyOn(console, metodo).mockImplementation(() => undefined));
  }
});
afterEach(() => {
  // Nada do que foi logado pode conter uma chave.
  const logado = JSON.stringify(espioes.flatMap((e) => e.mock.calls.map((c) => c.map(String))));
  expect(logado).not.toContain(PIX_DESP);
  expect(logado).not.toContain(PIX_TRANSP);
  while (espioes.length) espioes.pop()!.mockRestore();
});

function semChavePix(r: unknown): void {
  expect(JSON.stringify(r)).not.toContain("chavePix");
  expect(JSON.stringify(r)).not.toContain(PIX_DESP);
  expect(JSON.stringify(r)).not.toContain(PIX_TRANSP);
  for (const item of r as Array<Record<string, unknown>>) expect(item).not.toHaveProperty("chavePix");
}

// ── 1. Visibilidade no GET ─────────────────────────────────────────────────────────────────────────────────────
describe("GET /api/cadastros/:lista — quem recebe a chave PIX", () => {
  const VEEM: Array<[string, AuthUser]> = [
    ["administrador", admin],
    ["administrador (o mapa não vale para ele)", conta("administrador", mapaPagamentos("nenhum"))],
    ["operacional sem mapa (o cargo lê Pagamentos)", conta("operacional")],
    ["operacional com Pagamentos 'ver' (só leitura)", conta("operacional", mapaPagamentos("ver"))],
    ["operacional com Pagamentos 'editar'", conta("operacional", mapaPagamentos("editar"))],
    ["sócio sem mapa (o cargo lê Pagamentos)", conta("socio")],
    ["sócio com Pagamentos 'ver' (só leitura)", conta("socio", mapaPagamentos("ver"))],
    ["sócio com Pagamentos 'editar'", conta("socio", mapaPagamentos("editar"))],
  ];
  const NAO_VEEM: Array<[string, AuthUser | null]> = [
    ["operacional com Pagamentos 'nenhum'", conta("operacional", mapaPagamentos("nenhum"))],
    ["operacional com mapa sem a seção Pagamentos", conta("operacional", { processos: "editar", patients: "editar" })],
    ["operacional com mapa vazio", conta("operacional", {})],
    ["sócio com Pagamentos 'nenhum'", conta("socio", mapaPagamentos("nenhum"))],
    ["sócio com mapa sem a seção Pagamentos", conta("socio", { processos: "ver" })],
    ["consultor", conta("consultor")],
    ["consultor com mapa forjado liberando Pagamentos (o mapa não vale para ele)", conta("consultor", mapaPagamentos("editar"))],
    ["sem login", null],
  ];

  it.each(VEEM)("%s: recebe chavePix em despachantes e transportadoras", async (_nome, user) => {
    const desp = (await chamar(listar, user, { lista: "despachantes" })) as Array<Record<string, unknown>>;
    expect(desp[0]).toMatchObject({ nome: "STAR CUSTOMS", chavePix: PIX_DESP });
    const transp = (await chamar(listar, user, { lista: "transportadoras" })) as Array<Record<string, unknown>>;
    const porNome = Object.fromEntries(transp.map((t) => [t.nome, t]));
    expect(porNome.DHL).toMatchObject({ chavePix: PIX_TRANSP });
    // Sem chave gravada: a pessoa pode ver o campo, e ele vem vazio ("" — não há chave), nunca ausente.
    expect(porNome.FedEx).toMatchObject({ chavePix: "" });
  });

  it.each(NAO_VEEM)("%s: o campo NÃO existe na resposta (nem null) e a coluna nem é lida", async (_nome, user) => {
    for (const lista of ["despachantes", "transportadoras"]) {
      fake.selects.length = 0;
      const r = await chamar(listar, user, { lista });
      expect(r as unknown[], lista).not.toHaveLength(0); // a lista continua sendo entregue (leitura aberta a todos os cargos)
      semChavePix(r);
      const lidas = fake.selects.map((s) => s.colunas ?? "*").join(" | ");
      expect(lidas, lista).not.toContain("chave_pix");
      expect(lidas, lista).not.toBe("*");
    }
  });

  it("quem recebe a chave lê a tabela inteira (colunas '*'); quem não recebe, uma lista explícita sem chave_pix", async () => {
    await chamar(listar, admin, { lista: "transportadoras" });
    expect(fake.selects.at(-1)?.colunas).toBe("*");
    await chamar(listar, conta("consultor"), { lista: "transportadoras" });
    const colunas = fake.selects.at(-1)?.colunas ?? "";
    expect(colunas).toContain("nome_chave");
    expect(colunas).not.toContain("chave_pix");
  });

  it("fornecedores e cias aéreas nunca trazem chavePix, para ninguém", async () => {
    fake.tabelas.cadastro_cias_aereas = [{ id: "cia_1", nome: "Lufthansa", nome_chave: "lufthansa", ativo: true, atualizado_por: null, created_at: AGORA, updated_at: AGORA }];
    fake.tabelas.cadastro_fornecedores = [
      { id: "f1", nome: "Poros", nome_chave: "poros", pais: null, prazo_alerta_dias: null, sem_alerta: true, ativo: true, atualizado_por: null, created_at: AGORA, updated_at: AGORA },
    ];
    for (const lista of ["fornecedores", "cias-aereas"]) {
      for (const user of [admin, conta("operacional"), conta("socio"), conta("consultor")]) {
        const r = await chamar(listar, user, { lista });
        expect(JSON.stringify(r), `${lista} ${user.role}`).not.toContain("chavePix");
      }
    }
  });

  it("lista desconhecida continua 404", async () => {
    expect((await erroDe(chamar(listar, admin, { lista: "bancos" }))).status).toBe(404);
  });
});

// ── 2. Escrita: só administrador ───────────────────────────────────────────────────────────────────────────────
describe("POST/PATCH — só o administrador grava a chave PIX", () => {
  const SEM_ESCRITA: Array<[string, AuthUser | null]> = [
    ["sócio sem mapa", conta("socio")],
    ["sócio com Pagamentos 'editar'", conta("socio", mapaPagamentos("editar"))],
    ["operacional sem mapa", conta("operacional")],
    ["operacional só-leitura em Pagamentos ('ver')", conta("operacional", mapaPagamentos("ver"))],
    ["operacional com Pagamentos 'editar'", conta("operacional", mapaPagamentos("editar"))],
    ["consultor", conta("consultor")],
    ["sem login", null],
  ];

  it.each(SEM_ESCRITA)("%s: POST leva 403, nada é gravado e o erro não traz a chave", async (_nome, user) => {
    const NOVA = "chave-ficticia-tentativa-0003";
    for (const lista of ["despachantes", "transportadoras"]) {
      const e = await erroDe(chamar(criar, user, { lista }, { nome: "Nova Empresa", chavePix: NOVA }));
      expect(e.status, lista).toBe(403);
      expect(e.msg).not.toContain(NOVA);
    }
    expect(fake.linhas(T_TRANSP)).toHaveLength(2);
    expect(fake.linhas(T_DESP)).toHaveLength(1);
  });

  it.each(SEM_ESCRITA)("%s: PATCH leva 403 e a chave gravada não muda", async (_nome, user) => {
    const NOVA = "chave-ficticia-tentativa-0004";
    const e1 = await erroDe(chamar(alterar, user, { lista: "transportadoras", id: "transp_1" }, { chavePix: NOVA }));
    const e2 = await erroDe(chamar(alterar, user, { lista: "despachantes", id: "desp_1" }, { chavePix: "" }));
    expect(e1.status).toBe(403);
    expect(e2.status).toBe(403);
    expect(e1.msg + e2.msg).not.toContain(NOVA);
    expect(fake.linhas(T_TRANSP)[0]).toMatchObject({ chave_pix: PIX_TRANSP });
    expect(fake.linhas(T_DESP)[0]).toMatchObject({ chave_pix: PIX_DESP });
  });

  it("administrador cria despachante e transportadora com chave: aparada, gravada, devolvida e auditada", async () => {
    const t = await chamar(criar, admin, { lista: "transportadoras" }, { nome: "Fast Log", chavePix: "  chave-ficticia-nova-0005  " });
    expect(t).toMatchObject({ nome: "Fast Log", ativo: true, atualizadoPor: "Cris Admin", chavePix: "chave-ficticia-nova-0005" });
    expect((t as { id: string }).id).toMatch(/^transp_/);
    expect(fake.linhas(T_TRANSP).at(-1)).toMatchObject({ nome_chave: "fast log", chave_pix: "chave-ficticia-nova-0005", atualizado_por: "Cris Admin" });

    const d = await chamar(criar, admin, { lista: "despachantes" }, { nome: "SOUTH AMERICA", chavePix: "chave-ficticia-nova-0006" });
    expect(d).toMatchObject({ nome: "SOUTH AMERICA", chavePix: "chave-ficticia-nova-0006" });
    expect(fake.linhas(T_DESP).at(-1)).toMatchObject({ chave_pix: "chave-ficticia-nova-0006" });
  });

  it("criar SEM chave grava NULL e devolve '' (administrador vê o campo, vazio)", async () => {
    const t = await chamar(criar, admin, { lista: "transportadoras" }, { nome: "Sem Pix" });
    expect(t).toMatchObject({ chavePix: "" });
    expect(fake.linhas(T_TRANSP).at(-1)).toMatchObject({ chave_pix: null });
  });

  it("PATCH do administrador: grava, troca e limpa ('' vira NULL); atualizado_por e updated_at mudam", async () => {
    const trocada = await chamar(alterar, admin, { lista: "transportadoras", id: "transp_1" }, { chavePix: "  chave-ficticia-trocada-0007 " });
    expect(trocada).toMatchObject({ chavePix: "chave-ficticia-trocada-0007", atualizadoPor: "Cris Admin" });
    expect(fake.linhas(T_TRANSP)[0]).toMatchObject({ chave_pix: "chave-ficticia-trocada-0007", atualizado_por: "Cris Admin" });
    expect(fake.linhas(T_TRANSP)[0]!.updated_at).not.toBe(AGORA);

    const limpa = await chamar(alterar, admin, { lista: "transportadoras", id: "transp_1" }, { chavePix: "" });
    expect(limpa).toMatchObject({ chavePix: "" });
    expect(fake.linhas(T_TRANSP)[0]).toMatchObject({ chave_pix: null });

    const desp = await chamar(alterar, admin, { lista: "despachantes", id: "desp_1" }, { chavePix: "" });
    expect(desp).toMatchObject({ chavePix: "" });
    expect(fake.linhas(T_DESP)[0]).toMatchObject({ chave_pix: null });
  });

  it("alterar OUTRO campo mantém a chave gravada (e o administrador a recebe de volta)", async () => {
    const r = await chamar(alterar, admin, { lista: "despachantes", id: "desp_1" }, { telefone: "11 99999-0000" });
    expect(r).toMatchObject({ telefone: "11 99999-0000", chavePix: PIX_DESP });
    expect(fake.linhas(T_DESP)[0]).toMatchObject({ chave_pix: PIX_DESP });
  });

  it("mais de 140 caracteres: 400, nada é gravado e a mensagem não cita a chave", async () => {
    const longa = `chave-ficticia-longa-${"z".repeat(140)}`;
    const e1 = await erroDe(chamar(criar, admin, { lista: "transportadoras" }, { nome: "Longa", chavePix: longa }));
    const e2 = await erroDe(chamar(alterar, admin, { lista: "despachantes", id: "desp_1" }, { chavePix: longa }));
    expect(e1.status).toBe(400);
    expect(e2.status).toBe(400);
    expect(e1.msg + e2.msg).not.toContain("zzzz");
    expect(e1.msg + e2.msg).not.toContain("chave-ficticia-longa");
    expect(fake.linhas(T_TRANSP)).toHaveLength(2);
    expect(fake.linhas(T_DESP)[0]).toMatchObject({ chave_pix: PIX_DESP });
  });

  it("falha do banco numa lista com PIX: o erro não repassa a mensagem do banco (que poderia trazer a linha)", async () => {
    const vazamento = `new row violates check constraint — Failing row contains (${PIX_TRANSP})`;
    fake.falhar(T_TRANSP, "insert", vazamento);
    const e = await erroDe(chamar(criar, admin, { lista: "transportadoras" }, { nome: "Quebra", chavePix: PIX_TRANSP }));
    expect(e.msg).not.toContain(PIX_TRANSP);
    expect(e.msg).not.toContain("Failing row");

    fake.falhar(T_DESP, "update", vazamento);
    const e2 = await erroDe(chamar(alterar, admin, { lista: "despachantes", id: "desp_1" }, { chavePix: PIX_DESP }));
    expect(e2.msg).not.toContain(PIX_DESP);
    expect(e2.msg).not.toContain("Failing row");

    fake.falhar(T_DESP, "select", vazamento);
    const e3 = await erroDe(chamar(listar, admin, { lista: "despachantes" }));
    expect(e3.msg).not.toContain("Failing row");
  });
});

// ── 3. Transportadoras como lista (mesmo padrão de cias aéreas) ───────────────────────────────────────────────
describe("transportadoras — nome imutável, 'Outro' reservado, duplicado por nome_chave = 409", () => {
  it("duplicado ativo (outra caixa/acento) é 409; inativo é 409 com a dica de Reativar", async () => {
    const ativo = await erroDe(chamar(criar, admin, { lista: "transportadoras" }, { nome: "dhl" }));
    expect(ativo.status).toBe(409);
    expect(ativo.msg).toMatch(/Já existe um item com esse nome/);
    const inativo = await erroDe(chamar(criar, admin, { lista: "transportadoras" }, { nome: "  fedex " }));
    expect(inativo.status).toBe(409);
    expect(inativo.msg).toMatch(/inativo.*Reative/);
  });

  it("reativar é um PATCH { ativo: true }", async () => {
    const r = await chamar(alterar, admin, { lista: "transportadoras", id: "transp_2" }, { ativo: true });
    expect(r).toMatchObject({ nome: "FedEx", ativo: true });
    expect(fake.linhas(T_TRANSP)[1]).toMatchObject({ ativo: true });
  });

  it("o nome não muda depois de criado (422) e 'Outro' é reservado (400)", async () => {
    const e = await erroDe(chamar(alterar, admin, { lista: "transportadoras", id: "transp_1" }, { nome: "DHL Express" }));
    expect(e.status).toBe(422);
    expect(e.msg).toMatch(/nome não pode ser alterado/i);
    expect(fake.linhas(T_TRANSP)[0]).toMatchObject({ nome: "DHL", nome_chave: "dhl" });
    const reservado = await erroDe(chamar(criar, admin, { lista: "transportadoras" }, { nome: "Outro" }));
    expect(reservado.status).toBe(400);
    expect(reservado.msg).toMatch(/reservado/);
  });

  it("a lista de transportadoras é entregue a todos os cargos, em ordem (ativos primeiro), sem a chave para quem não pode", async () => {
    const r = (await chamar(listar, conta("consultor"), { lista: "transportadoras" })) as Array<{ nome: string; ativo: boolean }>;
    expect(r.map((t) => `${t.nome}:${t.ativo}`)).toEqual(["DHL:true", "FedEx:false"]);
    semChavePix(r);
  });

  it("não existe rota de exclusão: nenhuma chamada de delete ao banco", async () => {
    await chamar(criar, admin, { lista: "transportadoras" }, { nome: "Nova" });
    await chamar(alterar, admin, { lista: "transportadoras", id: "transp_1" }, { ativo: false });
    expect(fake.chamadas.filter((c) => c.op === "delete")).toEqual([]);
  });
});
