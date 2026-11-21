import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Compra } from "../../shared/types/compra";
import type { AuthUser } from "../../shared/types/auth";
import { MODAIS_ENVIO } from "../../shared/constants/processos";
import { NUMERO_REMESSA_ERRO } from "../../shared/utils/numeroRemessa";
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
  for (const t of ["compras", "compra_itens", "cadastro_despachantes", "cadastro_fornecedores", "cadastro_medicamentos", "pre_cadastro_medicamentos"]) fake.tabelas[t] = [];
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
    it.each(casos)(`${rota.metodo} ${rota.caminho.replace(ID, ":id")} — %s`, async (nome, user, lê, escreve) => {
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

/** As chaves do contrato da compra (GET, POST, PATCH, duplicar e cancelar devolvem exatamente isto). */
const CHAVES_DA_COMPRA = [
  "id", "anoMes", "sequencia", "cancelada", "fornecedor", "envio", "cia", "empresa", "numeroOrdens", "frete", "freteReal", "paciente",
  "processoNumero", "compraParticular", "recorrente", "medico", "localAplicacao", "entrega", "contatos", "despachante", "pagamentoAlvara",
  "pagamentoMomento", "termoPosterior", "termoObservacao", "isencao", "documentos", "pendencias", "observacoes", "consultor", "responsavel",
  "criadoPor", "atualizadoPor", "createdAt", "updatedAt", "itens",
];
const CHAVES_DO_ITEM = [
  "id", "posicao", "medicamento", "medicamentoCadastroId", "medicamentoCadastroNome", "preCadastroId", "laboratorio", "brand", "quantidade",
  "temperatura", "valorUnitario", "valorReal",
];

describe("POST /api/compras", () => {
  it("201, rascunho vazio, responsável e criado_por = nome do usuário logado, empresa FARMAURORA, 1 ordem, sem itens, número 1 do mês", async () => {
    const c = await chamar<Compra>(criarPost, usuario("operacional"));
    expect(h.status).toBe(201);
    expect(c).toMatchObject({ sequencia: 1, cancelada: false, paciente: "", responsavel: "Pessoa operacional", criadoPor: "Pessoa operacional", empresa: "FARMAURORA", numeroOrdens: 1, itens: [] });
    expect((await chamar<Compra>(criarPost, adm)).sequencia).toBe(2);
  });

  it("a resposta tem exatamente as chaves do contrato (e nenhuma das que saíram)", async () => {
    const c = await criarCompraDireta();
    expect(Object.keys(c).sort()).toEqual([...CHAVES_DA_COMPRA].sort());
  });
});

describe("GET /api/compras (lista)", () => {
  it("sem ?ano_mes usa o mês atual de Brasília; cada compra vem só com o necessário: id, anoMes, sequencia, cancelada, paciente, medicamentos, numeroOrdens, atualizadoEm", async () => {
    const c = await criarCompraDireta();
    const r = await chamar<{ anoMes: string; compras: Array<Record<string, unknown>> }>(listaGet, adm);
    expect(r.anoMes).toBe(c.anoMes);
    expect(r.compras.map((x) => x.id)).toEqual([c.id]);
    expect(Object.keys(r.compras[0]!).sort()).toEqual(["anoMes", "atualizadoEm", "cancelada", "id", "medicamentos", "numeroOrdens", "paciente", "sequencia"]);
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
      totais: { ativas: 0, canceladas: 0 },
    });
  });

  it("a resposta traz pagina, limite, temMais, total e os totais { ativas, canceladas } (sem status nem pendências)", async () => {
    const c = await criarCompraDireta();
    h.query = { ano_mes: c.anoMes };
    const r = await chamar<Record<string, unknown>>(listaGet, adm);
    expect(Object.keys(r).sort()).toEqual(["anoMes", "compras", "limite", "pagina", "temMais", "total", "totais"].sort());
    expect(r).toMatchObject({ pagina: 1, limite: 50, temMais: false, total: 1, totais: { ativas: 1, canceladas: 0 } });
  });

  it("?status= (que saiu) é IGNORADO como qualquer parâmetro desconhecido: mesma resposta, sem 400", async () => {
    const c = await criarCompraDireta();
    h.query = { ano_mes: c.anoMes };
    const sem = await chamar(listaGet, adm);
    for (const status of ["rascunho", "pronta", "parcial", "encaminhada", "cancelada", "lixo"]) {
      h.query = { ano_mes: c.anoMes, status };
      expect(await chamar(listaGet, adm), status).toEqual(sem);
    }
  });

  it("?pagina= inválida → 400", async () => {
    const c = await criarCompraDireta();
    for (const ruim of [{ pagina: "0" }, { pagina: "x" }, { pagina: "-1" }]) {
      h.query = { ano_mes: c.anoMes, ...ruim };
      expect((await erroDe(chamar(listaGet, adm))).status, JSON.stringify(ruim)).toBe(400);
    }
  });

  it("canceladas só aparecem com ?incluir_canceladas=1, e os totais contam as duas", async () => {
    const c = await criarCompraDireta();
    await criarCompraDireta();
    h.params = { id: c.id };
    await chamar(cancelarPost, adm);
    h.query = { ano_mes: c.anoMes };
    const sem = await chamar<{ compras: unknown[]; total: number; totais: unknown }>(listaGet, adm);
    expect(sem.compras).toHaveLength(1);
    expect(sem.total).toBe(1);
    expect(sem.totais).toEqual({ ativas: 1, canceladas: 1 });
    h.query = { ano_mes: c.anoMes, incluir_canceladas: "1" };
    const com = await chamar<{ compras: unknown[]; total: number }>(listaGet, adm);
    expect(com.compras).toHaveLength(2);
    expect(com.total).toBe(2);
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

  it("o item traz as chaves do contrato, inclusive medicamentoCadastroNome (do Cadastro, 1 consulta extra)", async () => {
    const c = await criarCompraDireta();
    fake.semear("cadastro_medicamentos", [{ id: "med_1", nome: "KEYTRUDA 100MG", temperatura: "2°C a 8°C", ativo: true }]);
    fake.semear("compra_itens", [{ id: "itm_teste_01", compra_id: c.id, posicao: 1, medicamento: "KEYTRUDA 100MG - 2 vials per box", medicamento_cadastro_id: "med_1", brand: "referencia" }]);
    h.params = { id: c.id };
    const lida = await chamar<Compra>(detalheGet, adm);
    expect(Object.keys(lida.itens[0]!).sort()).toEqual([...CHAVES_DO_ITEM].sort());
    expect(lida.itens[0]).toMatchObject({ medicamentoCadastroId: "med_1", medicamentoCadastroNome: "KEYTRUDA 100MG", brand: "referencia" });
  });
});

describe("PATCH /api/compras/:id (autosave)", () => {
  async function salvar(c: Compra, corpo: Record<string, unknown>, user: AuthUser = adm): Promise<Compra> {
    h.params = { id: c.id };
    h.body = { atualizadoEm: c.updatedAt, ...corpo };
    return chamar<Compra>(salvarPatch, user);
  }
  const itemDe = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, medicamento: "MEDICAMENTO TESTE", ...extra });

  it("rascunho parcial é salvo; a versão avança; atualizado_por é quem salvou; os outros campos ficam", async () => {
    const c = await criarCompraDireta();
    const s = await salvar(c, { paciente: "  PACIENTE TESTE ", pendencias: ["Receita"] }, usuario("operacional"));
    expect(s).toMatchObject({ paciente: "PACIENTE TESTE", pendencias: ["Receita"], atualizadoPor: "Pessoa operacional", responsavel: "Pessoa administrador" });
    expect(s.updatedAt > c.updatedAt).toBe(true);
  });

  it("corpo inválido → 400 e nada muda (inclusive as chaves que saíram do modelo e as só de leitura)", async () => {
    const c = await criarCompraDireta();
    const ruins = [
      { campoNovo: 1 }, { paciente: 5 }, { itens: "x" }, { cancelada: true }, { sequencia: 99 },
      { vendedor: "X" }, { ordens: [] }, { courierSimples: true }, { localDeclarado: true }, { isencaoPara: "X" }, { po: "PO26-11-0001" },
      { itens: [itemDe("itm_teste_01", { medicamentoCadastroNome: "X" })] }, { itens: [itemDe("itm_teste_01", { apresentacao: "10 mg" })] },
    ];
    for (const corpo of ruins) expect((await erroDe(salvar(c, corpo))).status, JSON.stringify(corpo)).toBe(400);
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

  it("item de OUTRA compra: 409 e nada muda", async () => {
    const a = await criarCompraDireta();
    const b = await criarCompraDireta();
    await salvar(b, { itens: [itemDe("itm_da_b01")] });
    const e = await erroDe(salvar(a, { paciente: "NAO_GRAVA", itens: [itemDe("itm_da_b01")] }));
    expect(e.status).toBe(409);
    h.params = { id: a.id };
    expect(await chamar<Compra>(detalheGet, adm)).toMatchObject({ paciente: "", itens: [] });
  });

  it("os campos da compra única (fornecedor, envio, cia, empresa, numeroOrdens, frete, freteReal, consultor) e os itens: grava, e `itens: []` apaga", async () => {
    const c = await criarCompraDireta();
    const s = await salvar(c, {
      fornecedor: "fornecedor teste",
      envio: MODAIS_ENVIO[0],
      cia: "emirates",
      empresa: "MAINZFARMA",
      numeroOrdens: 2,
      frete: 10,
      freteReal: 9.5,
      consultor: "mateus morais",
      itens: [itemDe("itm_teste_01", { quantidade: "2 caixas", valorUnitario: 5, laboratorio: "LAB", brand: "bioequivalente" })],
    });
    expect(s).toMatchObject({ fornecedor: "Fornecedor Teste", envio: "Air Cargo", cia: "Emirates", empresa: "MAINZFARMA", numeroOrdens: 2, frete: 10, freteReal: 9.5, consultor: "Mateus Morais" });
    expect(s.itens).toHaveLength(1);
    expect(s.itens[0]).toMatchObject({ id: "itm_teste_01", posicao: 1, medicamento: "MEDICAMENTO TESTE", valorUnitario: 5, laboratorio: "LAB", brand: "bioequivalente", medicamentoCadastroNome: null });
    const vazia = await salvar(s, { itens: [] });
    expect(vazia.itens).toEqual([]);
  });

  it("os itens que não vierem são apagados (estado completo) e a posição é a ordem do array", async () => {
    const c = await criarCompraDireta();
    const tres = await salvar(c, { itens: [itemDe("itm_teste_01"), itemDe("itm_teste_02"), itemDe("itm_teste_03")] });
    const reordenado = await salvar(tres, { itens: [itemDe("itm_teste_03"), itemDe("itm_teste_01")] });
    expect(reordenado.itens.map((i) => [i.id, i.posicao])).toEqual([["itm_teste_03", 1], ["itm_teste_01", 2]]);
    expect(fake.tabelas.compra_itens!.map((i) => i.id).sort()).toEqual(["itm_teste_01", "itm_teste_03"]);
  });

  it("limites: numeroOrdens só de 1 a 10 e 31 itens → 400 (a mensagem do Nº Ordem)", async () => {
    const c = await criarCompraDireta();
    expect((await salvar(c, { numeroOrdens: 10 })).numeroOrdens).toBe(10);
    const atual = await chamar<Compra>(detalheGet, adm);
    for (const ruim of [11, 0, -1, 1.5, "2", null]) {
      expect(await erroDe(salvar(atual, { numeroOrdens: ruim })), String(ruim)).toMatchObject({ status: 400, msg: NUMERO_REMESSA_ERRO });
    }
    const itens = Array.from({ length: 31 }, (_, i) => ({ id: `itm_teste_${String(i).padStart(2, "0")}` }));
    expect((await erroDe(salvar(atual, { itens }))).status).toBe(400);
  });

  describe("validação contra o Cadastro e as constantes (422)", () => {
    it("consultor: ativo é aceito (grava o nome do Cadastro); desconhecido e inativo → 422 'Consultor inválido'", async () => {
      const c = await criarCompraDireta();
      expect((await salvar(c, { consultor: "  mateus   MORAIS " })).consultor).toBe("Mateus Morais");
      const atual = await chamar<Compra>(detalheGet, adm);
      for (const ruim of ["Fulano Qualquer", "Junior"]) {
        expect(await erroDe(salvar(atual, { consultor: ruim })), ruim).toMatchObject({ status: 422, msg: "Consultor inválido: escolha um consultor ativo do Cadastro." });
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

    it("fornecedor (da compra): ativo aceito; inativo ou desconhecido → 422", async () => {
      const c = await criarCompraDireta();
      expect((await salvar(c, { fornecedor: "FORNECEDOR TESTE" })).fornecedor).toBe("Fornecedor Teste");
      const atual = await chamar<Compra>(detalheGet, adm);
      for (const ruim of ["Fornecedor Velho", "Outro Fornecedor"]) {
        expect(await erroDe(salvar(atual, { fornecedor: ruim })), ruim).toMatchObject({ status: 422, msg: "Fornecedor inválido: escolha um fornecedor ativo do Cadastro." });
      }
    });

    it("envio: só os modais fixos (MODAIS_ENVIO); qualquer outro → 422", async () => {
      let atual = await criarCompraDireta();
      for (const bom of MODAIS_ENVIO) atual = await salvar(atual, { envio: bom });
      expect(atual.envio).toBe(MODAIS_ENVIO[MODAIS_ENVIO.length - 1]);
      expect(await erroDe(salvar(atual, { envio: "Pombo-correio" }))).toMatchObject({ status: 422, msg: expect.stringContaining("Envio inválido") });
    });

    it("cia: vem da constante POR MODAL (não do Cadastro de cias aéreas): vale a do modal; a de outro modal, a de ninguém e a sem envio → 422", async () => {
      const c = await criarCompraDireta();
      fake.chamadas.length = 0;
      const ok = await salvar(c, { envio: "Air Cargo", cia: "Emirates" });
      expect(ok).toMatchObject({ envio: "Air Cargo", cia: "Emirates" });
      expect(fake.chamadas.filter((x) => x.tabela === "cadastro_cias_aereas")).toEqual([]); // o Cadastro de cias aéreas não é mais lido
      const courier = await salvar(ok, { envio: "Courier Formal", cia: "DHL" });
      expect(courier).toMatchObject({ envio: "Courier Formal", cia: "DHL" });
      const vazia = await salvar(courier, { cia: "" });
      expect(vazia.cia).toBe("");
      for (const [envio, cia] of [["Air Cargo", "DHL"], ["Courier Simples", "Emirates"], ["Air Cargo", "Cia Teste"], ["", "Emirates"]] as const) {
        expect(await erroDe(salvar(vazia, { envio, cia })), `${envio} + ${cia}`).toMatchObject({ status: 422, msg: "Cia aérea inválida: escolha uma cia que vale para o envio (e escolha o envio primeiro)." });
      }
    });

    it("trocar só o envio quando a cia que a compra já tem deixa de valer para o novo modal → 422; trocar para um em que vale passa", async () => {
      const c = await criarCompraDireta();
      const air = await salvar(c, { envio: "Air Cargo", cia: "Emirates" });
      expect((await erroDe(salvar(air, { envio: "Courier Formal" }))).status).toBe(422); // Emirates não faz Courier Formal
      expect((await salvar(air, { envio: "Air Cargo", paciente: "MESMO PAR" })).paciente).toBe("MESMO PAR");
    });

    it("empresa: FARMAURORA e MAINZFARMA aceitas; qualquer outra → 422", async () => {
      const c = await criarCompraDireta();
      const m = await salvar(c, { empresa: "MAINZFARMA" });
      expect(m.empresa).toBe("MAINZFARMA");
      for (const ruim of ["OUTRA", "farmaurora", ""]) {
        expect(await erroDe(salvar(m, { empresa: ruim })), ruim).toMatchObject({ status: 422, msg: "Empresa inválida: escolha FARMAURORA ou MAINZFARMA." });
      }
    });

    it("brand de cada medicamento: '' e os valores de BRANDS_MEDICAMENTO aceitos; qualquer outro → 422 dizendo o número do medicamento", async () => {
      const c = await criarCompraDireta();
      const ok = await salvar(c, { itens: [itemDe("itm_teste_01", { brand: "" }), itemDe("itm_teste_02", { brand: "referencia" }), itemDe("itm_teste_03", { brand: "bioequivalente" })] });
      expect(ok.itens.map((i) => i.brand)).toEqual(["", "referencia", "bioequivalente"]);
      expect(await erroDe(salvar(ok, { itens: [itemDe("itm_teste_01"), itemDe("itm_teste_02", { brand: "xpto" })] }))).toMatchObject({ status: 422, msg: "Medicamento 2: brand inválido: escolha bioequivalente ou referencia." });
      expect((await erroDe(salvar(ok, { itens: [itemDe("itm_teste_01", { brand: "Referência" })] }))).status).toBe(422);
    });

    it("tolerância a dado antigo: o valor igual ao que a compra já tem passa mesmo se o item foi desativado; brand antigo vira vazio na leitura", async () => {
      const c = await criarCompraDireta();
      const com = await salvar(c, { despachante: "Despachante Teste", fornecedor: "Fornecedor Teste", consultor: "Mateus Morais", itens: [itemDe("itm_teste_01")] });
      fake.tabelas.cadastro_despachantes!.find((l) => l.nome === "Despachante Teste")!.ativo = false;
      fake.tabelas.cadastro_fornecedores!.find((l) => l.nome === "Fornecedor Teste")!.ativo = false;
      fake.tabelas.cadastro_consultores!.find((l) => l.nome === "Mateus Morais")!.ativo = false;
      const segue = await salvar(com, { despachante: "Despachante Teste", fornecedor: "Fornecedor Teste", consultor: "Mateus Morais", paciente: "SEGUE SALVANDO" });
      expect(segue).toMatchObject({ paciente: "SEGUE SALVANDO", despachante: "Despachante Teste", fornecedor: "Fornecedor Teste", consultor: "Mateus Morais" });
      expect((await erroDe(salvar(segue, { despachante: "Despachante Velho" }))).status).toBe(422); // trocar por outro inativo não
      // Brand antigo que não vale (o banco não tem check): a leitura o devolve como "" e o salvamento segue normal.
      fake.tabelas.compra_itens![0]!.brand = "legado";
      const lida = await chamar<Compra>(detalheGet, adm);
      expect(lida.itens[0]!.brand).toBe("");
      expect((await salvar(lida, { itens: [itemDe("itm_teste_01", { brand: lida.itens[0]!.brand })] })).itens[0]!.brand).toBe("");
    });

    it("campo vazio nunca é validado (rascunho parcial); medicamento e temperatura livres passam", async () => {
      const c = await criarCompraDireta();
      const s = await salvar(c, { consultor: "", despachante: "", fornecedor: "", envio: "", cia: "", itens: [itemDe("itm_teste_01", { medicamento: "Medicamento fora do Cadastro", temperatura: "Temperatura nova" })] });
      expect(s.itens[0]).toMatchObject({ medicamento: "Medicamento fora do Cadastro", temperatura: "Temperatura nova" });
    });

    it("um 422 não grava nada (nem a versão avança)", async () => {
      const c = await criarCompraDireta();
      await erroDe(salvar(c, { paciente: "NÃO DEVE GRAVAR", consultor: "Ninguém", itens: [itemDe("itm_teste_01")] }));
      expect(await chamar<Compra>(detalheGet, adm)).toMatchObject({ paciente: "", updatedAt: c.updatedAt, itens: [] });
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
  it("201, nova compra com o próximo número, mesmos dados e medicamentos com ids novos; 404 se a original não existe", async () => {
    const c = await criarCompraDireta();
    h.params = { id: c.id };
    h.body = { atualizadoEm: c.updatedAt, paciente: "PACIENTE TESTE", fornecedor: "Fornecedor Teste", envio: "Air Cargo", numeroOrdens: 3, itens: [{ id: "itm_teste_01", medicamento: "MED TESTE", brand: "referencia" }] };
    await chamar(salvarPatch, adm);
    h.status = 0;
    const copia = await chamar<Compra>(duplicarPost, usuario("operacional"));
    expect(h.status).toBe(201);
    expect(copia).toMatchObject({ sequencia: 2, paciente: "PACIENTE TESTE", fornecedor: "Fornecedor Teste", envio: "Air Cargo", numeroOrdens: 3, cancelada: false, criadoPor: "Pessoa operacional" });
    expect(copia.id).not.toBe(c.id);
    expect(copia.itens[0]!.id).not.toBe("itm_teste_01");
    expect(copia.itens[0]).toMatchObject({ medicamento: "MED TESTE", brand: "referencia" });
    expect(Object.keys(copia).sort()).toEqual([...CHAVES_DA_COMPRA].sort());

    h.params = { id: "cmp_nao_existe" };
    expect((await erroDe(chamar(duplicarPost, adm))).status).toBe(404);
  });
});

describe("POST /api/compras/:id/cancelar", () => {
  it("cancela (não apaga), é idempotente, devolve a compra do contrato e 404 se não existe", async () => {
    const c = await criarCompraDireta();
    h.params = { id: c.id };
    const a = await chamar<Compra>(cancelarPost, adm);
    expect(a.cancelada).toBe(true);
    expect(Object.keys(a).sort()).toEqual([...CHAVES_DA_COMPRA].sort());
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
    h.body = { atualizadoEm: c.updatedAt, despachante: "Despachante Teste", fornecedor: "Fornecedor Teste", itens: [] };
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
