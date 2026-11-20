import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Compra } from "../../shared/types/compra";
import type { AuthUser } from "../../shared/types/auth";
import { MODAIS_ENVIO } from "../../shared/constants/processos";
import { autorizarApi, permissoesTudoNenhum, type NivelPermissao, type Permissoes } from "../../shared/utils/permissoesPagina";
import type { Role } from "../../shared/utils/rbac";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { semearConsultores } from "./helpers/consultoresFixtures";

// As rotas de /api/compras/** com h3 e o Supabase simulados. Duas camadas de acesso são provadas, rota por rota:
//  1. o middleware (autorizarApi: caminho + método → seção "compras"), e
//  2. o próprio handler (exigirLeituraCompras / exigirEscritaCompras), chamado direto, sem o middleware.
// Um scanner garante que NENHUM arquivo novo em server/api/compras/ fique sem teste de permissão. Dados fictícios (TESTE).

const h = vi.hoisted(() => ({
  body: {} as unknown,
  params: {} as Record<string, string>,
  query: {} as Record<string, unknown>,
  status: 0,
}));

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return {
    ...real,
    readBody: vi.fn(async () => h.body),
    getRouterParam: vi.fn((_e: unknown, nome: string) => h.params[nome]),
    getQuery: vi.fn(() => h.query),
    setResponseStatus: vi.fn((_e: unknown, codigo: number) => {
      h.status = codigo;
    }),
  };
});

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

import listaGet from "../../server/api/compras/index.get";
import criarPost from "../../server/api/compras/index.post";
import detalheGet from "../../server/api/compras/[id].get";
import salvarPatch from "../../server/api/compras/[id].patch";
import duplicarPost from "../../server/api/compras/[id]/duplicar.post";
import cancelarPost from "../../server/api/compras/[id]/cancelar.post";
import opcoesGet from "../../server/api/compras/opcoes.get";
import medicamentosGet from "../../server/api/compras/opcoes/medicamentos.get";
import temperaturasPost from "../../server/api/compras/temperaturas.post";
import preCadastroPost from "../../server/api/compras/pre-cadastro-medicamentos.post";

type Handler = (e: never) => Promise<unknown>;

interface Rota {
  /** Caminho como o app chama (para o middleware). */
  caminho: string;
  metodo: "GET" | "POST" | "PATCH";
  handler: Handler;
  /** Arquivo em server/api/compras/ (para o scanner). */
  arquivo: string;
  escrita: boolean;
}

const ID = "cmp_teste_000001";
const ROTAS: Rota[] = [
  { caminho: "/api/compras", metodo: "GET", handler: listaGet as Handler, arquivo: "index.get.ts", escrita: false },
  { caminho: "/api/compras", metodo: "POST", handler: criarPost as Handler, arquivo: "index.post.ts", escrita: true },
  { caminho: `/api/compras/${ID}`, metodo: "GET", handler: detalheGet as Handler, arquivo: "[id].get.ts", escrita: false },
  { caminho: `/api/compras/${ID}`, metodo: "PATCH", handler: salvarPatch as Handler, arquivo: "[id].patch.ts", escrita: true },
  { caminho: `/api/compras/${ID}/duplicar`, metodo: "POST", handler: duplicarPost as Handler, arquivo: "[id]/duplicar.post.ts", escrita: true },
  { caminho: `/api/compras/${ID}/cancelar`, metodo: "POST", handler: cancelarPost as Handler, arquivo: "[id]/cancelar.post.ts", escrita: true },
  { caminho: "/api/compras/opcoes", metodo: "GET", handler: opcoesGet as Handler, arquivo: "opcoes.get.ts", escrita: false },
  { caminho: "/api/compras/opcoes/medicamentos", metodo: "GET", handler: medicamentosGet as Handler, arquivo: "opcoes/medicamentos.get.ts", escrita: false },
  { caminho: "/api/compras/temperaturas", metodo: "POST", handler: temperaturasPost as Handler, arquivo: "temperaturas.post.ts", escrita: true },
  { caminho: "/api/compras/pre-cadastro-medicamentos", metodo: "POST", handler: preCadastroPost as Handler, arquivo: "pre-cadastro-medicamentos.post.ts", escrita: true },
];

function usuario(role: Role, permissoes?: Permissoes): AuthUser {
  return {
    id: `u_${role}`,
    email: `${role}@x.com`,
    role,
    nome: `Pessoa ${role}`,
    isAdmin: role === "administrador",
    ...(role === "consultor" ? { consultorNome: "Dani" } : {}),
    ...(permissoes ? { permissoes } : {}),
  };
}

const mapa = (compras?: NivelPermissao): Permissoes => ({ ...permissoesTudoNenhum(), ...(compras ? { compras } : {}) });

async function statusDe(promessa: Promise<unknown>): Promise<number> {
  try {
    await promessa;
    return 200;
  } catch (e) {
    return (e as { statusCode?: number }).statusCode ?? 500;
  }
}

async function erroDe(promessa: Promise<unknown>): Promise<{ status: number; msg: string; data?: unknown }> {
  try {
    await promessa;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string; data?: unknown };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "", data: err.data };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

function chamar<T = unknown>(rota: Rota | Handler, user: AuthUser | null | undefined): Promise<T> {
  const handler = typeof rota === "function" ? rota : rota.handler;
  return handler({ context: { user } } as never) as Promise<T>;
}

function semear(): void {
  for (const t of ["compras", "compra_ordens", "compra_itens", "cadastro_despachantes", "cadastro_fornecedores", "cadastro_cias_aereas"]) fake.tabelas[t] = [];
  semearConsultores(fake);
  const cadastro = (id: string, nome: string, ativo = true) => ({
    id,
    nome,
    nome_chave: nome.toLowerCase(),
    ativo,
    chave_pix: "CHAVE-PIX-SECRETA-DO-DESPACHANTE",
    atualizado_por: null,
    created_at: "2026-11-18T00:00:00.000Z",
    updated_at: "2026-11-18T00:00:00.000Z",
  });
  fake.tabelas.cadastro_despachantes = [cadastro("d1", "Despachante Teste"), cadastro("d2", "Despachante Velho", false)];
  fake.tabelas.cadastro_fornecedores = [cadastro("f1", "Fornecedor Teste"), cadastro("f2", "Fornecedor Velho", false)];
  fake.tabelas.cadastro_cias_aereas = [cadastro("c1", "Cia Teste")];
}

beforeEach(() => {
  semear();
  fake.chamadas.length = 0;
  h.body = {};
  h.params = { id: ID };
  h.query = {};
  h.status = 0;
});

// ── Permissões ──────────────────────────────────────────────────────────────────────────────────────────────

describe("o scanner: toda rota de server/api/compras/ tem teste de permissão", () => {
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const caminho = join(dir, nome);
      return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
    });
  }

  it("a lista de ROTAS deste spec é exatamente a pasta (nada a mais, nada a menos)", () => {
    const raiz = join(process.cwd(), "server", "api", "compras");
    const naPasta = arquivos(raiz)
      .map((a) => relative(raiz, a).replaceAll("\\", "/"))
      .sort();
    expect(naPasta).toEqual(ROTAS.map((r) => r.arquivo).sort());
  });
});

describe("middleware (autorizarApi): GET = ver, os outros métodos = editar", () => {
  const casos: Array<[string, AuthUser | null, boolean, boolean]> = [
    // [quem, usuário, pode ler, pode escrever]
    ["administrador", usuario("administrador"), true, true],
    ["operacional sem mapa", usuario("operacional"), true, true],
    ["sócio sem mapa (só lê)", usuario("socio"), true, false],
    ["consultor", usuario("consultor"), false, false],
    ["sócio com compras=editar", usuario("socio", mapa("editar")), true, true],
    ["sócio com compras=ver", usuario("socio", mapa("ver")), true, false],
    ["sócio com compras=nenhum", usuario("socio", mapa("nenhum")), false, false],
    ["sócio com mapa SEM a chave compras (fail-closed)", usuario("socio", { processos: "editar" }), false, false],
    ["operacional com compras=ver", usuario("operacional", mapa("ver")), true, false],
    ["operacional com compras=nenhum", usuario("operacional", mapa("nenhum")), false, false],
    ["operacional com mapa SEM a chave compras", usuario("operacional", { processos: "editar" }), false, false],
    ["sem sessão", null, false, false],
  ];

  for (const rota of ROTAS) {
    it.each(casos)(`${rota.metodo} ${rota.caminho.replace(ID, ":id")} — %s`, (_nome, user, lê, escreve) => {
      const decisao = autorizarApi(user, rota.caminho, rota.metodo);
      const esperado = rota.escrita ? escreve : lê;
      expect(decisao.permitido).toBe(esperado);
      if (!esperado) expect(decisao).toMatchObject({ status: user ? 403 : 401 });
    });
  }
});

describe("handler (2ª camada), chamado direto sem o middleware: o mesmo quadro", () => {
  const casos: Array<[string, AuthUser | null | undefined, boolean, boolean]> = [
    ["administrador", usuario("administrador"), true, true],
    ["operacional", usuario("operacional"), true, true],
    ["sócio sem mapa", usuario("socio"), true, false],
    ["consultor", usuario("consultor"), false, false],
    ["sócio compras=editar", usuario("socio", mapa("editar")), true, true],
    ["sócio compras=ver", usuario("socio", mapa("ver")), true, false],
    ["sócio compras=nenhum", usuario("socio", mapa("nenhum")), false, false],
    ["operacional compras=nenhum", usuario("operacional", mapa("nenhum")), false, false],
    ["mapa sem a chave compras", usuario("operacional", { dir: "editar" }), false, false],
    ["sem usuário", null, false, false],
    ["usuário indefinido", undefined, false, false],
  ];

  for (const rota of ROTAS) {
    it.each(casos)(`${rota.metodo} ${rota.caminho.replace(ID, ":id")} — %s`, async (_nome, user, lê, escreve) => {
      const permitido = rota.escrita ? escreve : lê;
      // A compra do id existe, para que "permitido" não termine em 404 por outro motivo.
      const base = await criarCompraDireta();
      h.params = { id: base.id };
      h.body = { atualizadoEm: base.updatedAt };
      const status = await statusDe(chamar(rota, user));
      if (permitido) expect([401, 403], `${rota.metodo} ${rota.arquivo}`).not.toContain(status);
      else expect(status).toBe(user ? 403 : 401);
    });
  }

  it("quem é barrado não toca no banco (nenhuma chamada ao Supabase)", async () => {
    for (const rota of ROTAS) {
      fake.chamadas.length = 0;
      await statusDe(chamar(rota, usuario("consultor")));
      expect(fake.chamadas, rota.arquivo).toEqual([]);
    }
    for (const rota of ROTAS.filter((r) => r.escrita)) {
      fake.chamadas.length = 0;
      await statusDe(chamar(rota, usuario("socio")));
      expect(fake.chamadas, rota.arquivo).toEqual([]);
    }
  });
});

// ── Comportamento ───────────────────────────────────────────────────────────────────────────────────────────

const adm = usuario("administrador");

async function criarCompraDireta(): Promise<Compra> {
  h.status = 0;
  const c = await chamar<Compra>(criarPost, adm);
  h.status = 0;
  return c;
}

describe("POST /api/compras", () => {
  it("201, rascunho vazio, responsável e criado_por = nome do usuário logado, número 1 do mês", async () => {
    const c = await chamar<Compra>(criarPost, usuario("operacional"));
    expect(h.status).toBe(201);
    expect(c).toMatchObject({ sequencia: 1, cancelada: false, paciente: "", responsavel: "Pessoa operacional", criadoPor: "Pessoa operacional", ordens: [] });
    expect((await chamar<Compra>(criarPost, adm)).sequencia).toBe(2);
  });
});

describe("GET /api/compras (lista)", () => {
  it("sem ?ano_mes usa o mês atual de Brasília; devolve { anoMes, compras } sem as ordens", async () => {
    const c = await criarCompraDireta();
    const r = await chamar<{ anoMes: string; compras: Array<{ id: string }> }>(listaGet, adm);
    expect(r.anoMes).toBe(c.anoMes);
    expect(r.compras.map((x) => x.id)).toEqual([c.id]);
    expect(r.compras[0]).not.toHaveProperty("ordens");
  });

  it("?ano_mes inválido → 400; mês sem compras → lista vazia (com os totais zerados); o sócio lê", async () => {
    h.query = { ano_mes: "2026-13" };
    expect(await erroDe(chamar(listaGet, adm))).toMatchObject({ status: 400, msg: "Mês inválido: use AAAA-MM." });
    h.query = { ano_mes: "2000-01" };
    expect(await chamar(listaGet, usuario("socio"))).toMatchObject({
      anoMes: "2000-01",
      compras: [],
      temMais: false,
      total: 0,
      totais: { rascunho: 0, pronta: 0, parcial: 0, encaminhada: 0, cancelada: 0 },
    });
  });

  it("?status= e ?pagina= são validados (400) e repassados; a resposta traz totais, total, pagina e limite", async () => {
    const c = await criarCompraDireta();
    h.query = { ano_mes: c.anoMes, status: "rascunho" };
    const r = await chamar<{ compras: Array<{ id: string; status: string; pendencias: number }>; status: string; pagina: number; limite: number; temMais: boolean; total: number; totais: Record<string, number> }>(listaGet, adm);
    expect(r).toMatchObject({ status: "rascunho", pagina: 1, limite: 50, temMais: false, total: 1, totais: { rascunho: 1, pronta: 0, parcial: 0, encaminhada: 0, cancelada: 0 } });
    expect(r.compras[0]).toMatchObject({ id: c.id, status: "rascunho" });
    h.query = { ano_mes: c.anoMes, status: "pronta" };
    expect((await chamar<{ compras: unknown[] }>(listaGet, adm)).compras).toEqual([]);
    for (const ruim of [{ status: "todas" }, { status: "PRONTA" }, { pagina: "0" }, { pagina: "x" }]) {
      h.query = { ano_mes: c.anoMes, ...ruim };
      expect((await erroDe(chamar(listaGet, adm))).status, JSON.stringify(ruim)).toBe(400);
    }
  });

  it("canceladas só aparecem com ?incluir_canceladas=1", async () => {
    const c = await criarCompraDireta();
    h.params = { id: c.id };
    await chamar(cancelarPost, adm);
    h.query = { ano_mes: c.anoMes };
    expect((await chamar<{ compras: unknown[] }>(listaGet, adm)).compras).toHaveLength(0);
    h.query = { ano_mes: c.anoMes, incluir_canceladas: "1" };
    expect((await chamar<{ compras: unknown[] }>(listaGet, adm)).compras).toHaveLength(1);
  });
});

describe("GET /api/compras/:id", () => {
  it("devolve a compra; 404 se não existe; 400 se o id é inválido", async () => {
    const c = await criarCompraDireta();
    h.params = { id: c.id };
    expect(await chamar<Compra>(detalheGet, usuario("socio"))).toMatchObject({ id: c.id, sequencia: 1 });
    h.params = { id: "cmp_nao_existe" };
    expect(await erroDe(chamar(detalheGet, adm))).toMatchObject({ status: 404, msg: "Compra não encontrada." });
    for (const ruim of ["../x", "a b", "a/b", "x".repeat(65)]) {
      h.params = { id: ruim };
      expect((await erroDe(chamar(detalheGet, adm))).status, ruim).toBe(400);
    }
  });
});

describe("PATCH /api/compras/:id (autosave)", () => {
  async function salvar(c: Compra, corpo: Record<string, unknown>, user: AuthUser = adm): Promise<Compra> {
    h.params = { id: c.id };
    h.body = { atualizadoEm: c.updatedAt, ...corpo };
    return chamar<Compra>(salvarPatch, user);
  }

  it("rascunho parcial é salvo; a versão avança; atualizado_por é quem salvou; os outros campos ficam", async () => {
    const c = await criarCompraDireta();
    const s = await salvar(c, { paciente: "  PACIENTE TESTE ", pendencias: ["Receita"] }, usuario("operacional"));
    expect(s).toMatchObject({ paciente: "PACIENTE TESTE", pendencias: ["Receita"], atualizadoPor: "Pessoa operacional", responsavel: "Pessoa administrador" });
    expect(s.updatedAt > c.updatedAt).toBe(true);
  });

  it("corpo inválido → 400 e nada muda", async () => {
    const c = await criarCompraDireta();
    for (const corpo of [{ campoNovo: 1 }, { paciente: 5 }, { ordens: "x" }, { cancelada: true }, { sequencia: 99 }]) {
      expect((await erroDe(salvar(c, corpo))).status, JSON.stringify(corpo)).toBe(400);
    }
    h.params = { id: c.id };
    h.body = {};
    expect((await erroDe(chamar(salvarPatch, adm))).status).toBe(400); // sem atualizadoEm
    expect(await chamar<Compra>(detalheGet, adm)).toMatchObject({ paciente: "", sequencia: 1, cancelada: false });
  });

  it("404 se a compra não existe", async () => {
    h.params = { id: "cmp_nao_existe" };
    h.body = { atualizadoEm: "2026-11-19T15:00:00.000Z" };
    expect((await erroDe(chamar(salvarPatch, adm))).status).toBe(404);
  });

  it("409 com a versão atual em data.atual quando o cliente está com a versão antiga", async () => {
    const c = await criarCompraDireta();
    const primeira = await salvar(c, { paciente: "PRIMEIRO" });
    const e = await erroDe(salvar(c, { paciente: "SEGUNDO (versão antiga)" }));
    expect(e.status).toBe(409);
    expect((e.data as { atual: Compra }).atual).toMatchObject({ id: c.id, paciente: "PRIMEIRO", updatedAt: primeira.updatedAt });
  });

  it("compra cancelada não é editada: 409", async () => {
    const c = await criarCompraDireta();
    h.params = { id: c.id };
    const cancelada = await chamar<Compra>(cancelarPost, adm);
    expect((await erroDe(salvar(cancelada, { paciente: "X" }))).status).toBe(409);
  });

  it("ordem com itens: grava, e `ordens: []` apaga; dirId e encaminhadaEm do corpo são ignorados", async () => {
    const c = await criarCompraDireta();
    const comOrdem = await salvar(c, {
      ordens: [
        {
          id: "ord_teste_01",
          dirId: "dir_forjado",
          encaminhadaEm: "2026-11-19T10:00:00Z",
          po: "po26-11-0001",
          frete: 10,
          itens: [{ id: "itm_teste_01", medicamento: "MEDICAMENTO TESTE", quantidade: "2 caixas", valorUnitario: 5 }],
        },
      ],
    });
    expect(comOrdem.ordens).toHaveLength(1);
    expect(comOrdem.ordens[0]).toMatchObject({ id: "ord_teste_01", po: "PO26-11-0001", frete: 10, dirId: null, encaminhadaEm: null });
    expect(comOrdem.ordens[0]!.itens[0]).toMatchObject({ medicamento: "MEDICAMENTO TESTE", valorUnitario: 5 });
    const vazia = await salvar(comOrdem, { ordens: [] });
    expect(vazia.ordens).toEqual([]);
  });

  it("limites: 11 ordens e 31 itens → 400", async () => {
    const c = await criarCompraDireta();
    const ordens = Array.from({ length: 11 }, (_, i) => ({ id: `ord_teste_${String(i).padStart(2, "0")}`, itens: [] }));
    expect((await erroDe(salvar(c, { ordens }))).status).toBe(400);
    const itens = Array.from({ length: 31 }, (_, i) => ({ id: `itm_teste_${String(i).padStart(2, "0")}` }));
    expect((await erroDe(salvar(c, { ordens: [{ id: "ord_teste_01", itens }] }))).status).toBe(400);
  });

  describe("validação contra o Cadastro (422)", () => {
    it("vendedor: consultor ativo é aceito (grava o nome do Cadastro); desconhecido e inativo → 422", async () => {
      const c = await criarCompraDireta();
      expect((await salvar(c, { vendedor: "  mateus   MORAIS " })).vendedor).toBe("Mateus Morais");
      const atual = await chamar<Compra>(detalheGet, adm);
      for (const ruim of ["Fulano Qualquer", "Junior"]) {
        expect(await erroDe(salvar(atual, { vendedor: ruim })), ruim).toMatchObject({ status: 422, msg: "Vendedor inválido: escolha um consultor ativo do Cadastro." });
      }
    });

    it("despachante: ativo aceito; inativo ou desconhecido → 422", async () => {
      const c = await criarCompraDireta();
      expect((await salvar(c, { despachante: "despachante teste" })).despachante).toBe("Despachante Teste");
      const atual = await chamar<Compra>(detalheGet, adm);
      for (const ruim of ["Despachante Velho", "Outro Despachante"]) {
        expect((await erroDe(salvar(atual, { despachante: ruim }))).status, ruim).toBe(422);
      }
    });

    it("ordem: fornecedor e cia ativos aceitos; inativo/desconhecido → 422 dizendo o número da ordem; envio só os modais fixos", async () => {
      const c = await criarCompraDireta();
      const ok = await salvar(c, { ordens: [{ id: "ord_teste_01", fornecedor: "fornecedor teste", cia: "CIA TESTE", envio: MODAIS_ENVIO[0], itens: [] }] });
      expect(ok.ordens[0]).toMatchObject({ fornecedor: "Fornecedor Teste", cia: "Cia Teste", envio: MODAIS_ENVIO[0] });
      const base = { id: "ord_teste_01", itens: [] };
      expect(await erroDe(salvar(ok, { ordens: [{ ...base, fornecedor: "Fornecedor Velho" }] }))).toMatchObject({ status: 422, msg: expect.stringContaining("Ordem 1: fornecedor inválido") });
      expect((await erroDe(salvar(ok, { ordens: [{ ...base, cia: "Cia Inexistente" }] }))).msg).toContain("Ordem 1: cia aérea inválida");
      expect((await erroDe(salvar(ok, { ordens: [{ ...base, envio: "Pombo-correio" }] }))).msg).toContain("Ordem 1: envio inválido");
      expect((await erroDe(salvar(ok, { ordens: [{ ...base, itens: [], fornecedor: "Fornecedor Teste" }, { id: "ord_teste_02", itens: [], cia: "Nada" }] }))).msg).toContain("Ordem 2:");
    });

    it("tolerância a dado antigo: o valor igual ao que a compra já tem passa mesmo se o item foi desativado", async () => {
      const c = await criarCompraDireta();
      const com = await salvar(c, { despachante: "Despachante Teste" });
      const linha = fake.tabelas.cadastro_despachantes!.find((l) => l.nome === "Despachante Teste")!;
      linha.ativo = false; // desativado no Cadastro depois
      expect((await salvar(com, { despachante: "Despachante Teste", paciente: "SEGUE SALVANDO" })).paciente).toBe("SEGUE SALVANDO");
      const atual = await chamar<Compra>(detalheGet, adm);
      expect((await erroDe(salvar(atual, { despachante: "Despachante Velho" }))).status).toBe(422); // trocar por outro inativo não
    });

    it("campo vazio nunca é validado (rascunho parcial); medicamento e temperatura livres passam", async () => {
      const c = await criarCompraDireta();
      const s = await salvar(c, { vendedor: "", despachante: "", ordens: [{ id: "ord_teste_01", itens: [{ id: "itm_teste_01", medicamento: "Medicamento fora do Cadastro", temperatura: "Temperatura nova" }] }] });
      expect(s.ordens[0]!.itens[0]).toMatchObject({ medicamento: "Medicamento fora do Cadastro", temperatura: "Temperatura nova" });
    });

    it("um 422 não grava nada (nem a versão avança)", async () => {
      const c = await criarCompraDireta();
      await erroDe(salvar(c, { paciente: "NÃO DEVE GRAVAR", vendedor: "Ninguém" }));
      expect(await chamar<Compra>(detalheGet, adm)).toMatchObject({ paciente: "", updatedAt: c.updatedAt });
    });
  });
});

describe("recorrente pelas rotas", () => {
  it("PATCH grava, GET devolve, duplicar copia; valor que não é booleano → 400", async () => {
    const c = await criarCompraDireta();
    h.params = { id: c.id };
    h.body = { atualizadoEm: c.updatedAt, recorrente: true };
    const salvo = await chamar<Compra>(salvarPatch, adm);
    expect(salvo.recorrente).toBe(true);
    expect((await chamar<Compra>(detalheGet, usuario("socio"))).recorrente).toBe(true);
    expect((await chamar<Compra>(duplicarPost, adm)).recorrente).toBe(true);
    for (const ruim of ["true", 1, null]) {
      h.params = { id: c.id };
      h.body = { atualizadoEm: salvo.updatedAt, recorrente: ruim };
      expect((await erroDe(chamar(salvarPatch, adm))).status, String(ruim)).toBe(400);
    }
  });
});

describe("POST /api/compras/:id/duplicar", () => {
  it("201, nova compra com o próximo número, mesmos dados e ordens com ids novos; 404 se a original não existe", async () => {
    const c = await criarCompraDireta();
    h.params = { id: c.id };
    h.body = { atualizadoEm: c.updatedAt, paciente: "PACIENTE TESTE", ordens: [{ id: "ord_teste_01", po: "PO26-11-0001", itens: [{ id: "itm_teste_01", medicamento: "MED TESTE" }] }] };
    await chamar(salvarPatch, adm);
    h.status = 0;
    const copia = await chamar<Compra>(duplicarPost, usuario("operacional"));
    expect(h.status).toBe(201);
    expect(copia).toMatchObject({ sequencia: 2, paciente: "PACIENTE TESTE", cancelada: false, criadoPor: "Pessoa operacional" });
    expect(copia.id).not.toBe(c.id);
    expect(copia.ordens[0]!.id).not.toBe("ord_teste_01");
    expect(copia.ordens[0]).toMatchObject({ po: "", dirId: null, encaminhadaEm: null });
    expect(copia.ordens[0]!.itens[0]).toMatchObject({ medicamento: "MED TESTE" });

    h.params = { id: "cmp_nao_existe" };
    expect((await erroDe(chamar(duplicarPost, adm))).status).toBe(404);
  });
});

describe("POST /api/compras/:id/cancelar", () => {
  it("cancela (não apaga), é idempotente e 404 se não existe", async () => {
    const c = await criarCompraDireta();
    h.params = { id: c.id };
    const a = await chamar<Compra>(cancelarPost, adm);
    expect(a.cancelada).toBe(true);
    const b = await chamar<Compra>(cancelarPost, adm);
    expect(b.cancelada).toBe(true);
    expect(fake.tabelas.compras).toHaveLength(1); // a linha continua lá
    h.params = { id: "cmp_nao_existe" };
    expect((await erroDe(chamar(cancelarPost, adm))).status).toBe(404);
  });
});

describe("nenhuma rota de Compras devolve chave PIX", () => {
  it("a resposta de qualquer rota, mesmo com despachante e PIX no Cadastro, não contém a chave nem o campo (o fake devolve a linha inteira, então o filtro está no código)", async () => {
    const c = await criarCompraDireta();
    h.params = { id: c.id };
    h.body = { atualizadoEm: c.updatedAt, despachante: "Despachante Teste", ordens: [{ id: "ord_teste_01", fornecedor: "Fornecedor Teste", itens: [] }] };
    const salvo = await chamar<Compra>(salvarPatch, adm);
    h.query = { ano_mes: c.anoMes };
    const respostas = [salvo, await chamar(listaGet, adm), await chamar(detalheGet, adm), await chamar(duplicarPost, adm), await chamar(cancelarPost, adm)];
    for (const r of respostas) {
      const texto = JSON.stringify(r);
      expect(texto).not.toContain("CHAVE-PIX-SECRETA");
      expect(texto.toLowerCase()).not.toMatch(/chave_?pix/);
    }
    // As colunas lidas dos Cadastros (só `nome`, nunca chave_pix nem `*`) são travadas por cadastrosPixNenhumaOutraRota.spec.ts.
  });
});
