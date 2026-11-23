import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import apagarDelete from "../../server/api/compras/[id].delete";
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
  metodo: "GET" | "POST" | "PATCH" | "DELETE";
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
  { caminho: `/api/compras/${ID}`, metodo: "DELETE", handler: apagarDelete as Handler, arquivo: "[id].delete.ts", escrita: true },
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

// O relógio (só o Date) é FIXO em novembro/2026 de Brasília: o mês corrente e o teto do mês que vem (que o servidor valida) não dependem de quando o teste roda.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T15:00:00.000Z"));
  fake.limparRestricoes();
  semear();
  fake.chamadas.length = 0;
  h.body = {};
  h.params = { id: ID };
  h.query = {};
  h.status = 0;
});

afterEach(() => {
  vi.useRealTimers();
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
      // Criar e duplicar pedem o Nº da compra digitado; as outras rotas, a versão. (Um corpo errado dá 400, nunca 401/403: a permissão vem antes.)
      h.body = rota.metodo === "POST" && (rota.arquivo === "index.post.ts" || rota.arquivo.endsWith("duplicar.post.ts")) ? { sequencia: 90 } : { atualizadoEm: base.updatedAt };
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

// O Nº da compra é DIGITADO: os testes que só precisam de uma compra usam números seguidos (1, 2, 3...) por conta do TESTE.
let proximoNumero = 1;
beforeEach(() => {
  proximoNumero = 1;
});

async function criarCompraDireta(sequencia: number = proximoNumero++): Promise<Compra> {
  h.status = 0;
  h.body = { sequencia };
  const c = await chamar<Compra>(criarPost, adm);
  h.status = 0;
  h.body = {};
  return c;
}

/** Duplica a compra de `id` com o número digitado. */
async function duplicarDireto(id: string, sequencia: number = proximoNumero++, user: AuthUser = adm): Promise<Compra> {
  h.params = { id };
  h.body = { sequencia };
  return chamar<Compra>(duplicarPost, user);
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
  it("201, rascunho vazio com o Nº DIGITADO, responsável e criado_por = nome do usuário logado, empresa FARMAURORA, 1 ordem, sem itens", async () => {
    h.body = { sequencia: 14 };
    const c = await chamar<Compra>(criarPost, usuario("operacional"));
    expect(h.status).toBe(201);
    expect(c).toMatchObject({ sequencia: 14, cancelada: false, paciente: "", responsavel: "Pessoa operacional", criadoPor: "Pessoa operacional", empresa: "FARMAURORA", numeroOrdens: 1, itens: [] });
    h.body = { sequencia: 3 }; // fora de ordem: o servidor não gera nem corrige
    expect((await chamar<Compra>(criarPost, adm)).sequencia).toBe(3);
  });

  it("a resposta tem exatamente as chaves do contrato (e nenhuma das que saíram)", async () => {
    const c = await criarCompraDireta();
    expect(Object.keys(c).sort()).toEqual([...CHAVES_DA_COMPRA].sort());
  });

  it.each([
    ["sem corpo", {}],
    ["corpo vazio", undefined],
    ["número 0", { sequencia: 0 }],
    ["número negativo", { sequencia: -3 }],
    ["decimal", { sequencia: 1.5 }],
    ["acima de 9999", { sequencia: 10000 }],
    ["texto", { sequencia: "14" }],
    ["null", { sequencia: null }],
    ["vazio", { sequencia: "" }],
    ["NaN", { sequencia: Number.NaN }],
    ["Infinity", { sequencia: Number.POSITIVE_INFINITY }],
    ["campo estranho junto", { sequencia: 14, cancelada: true }],
    ["lista", [14]],
  ])("400 com mensagem clara para o número inválido (%s) e NADA é criado", async (_nome, corpo) => {
    h.body = corpo;
    const e = await erroDe(chamar(criarPost, adm));
    expect(e.status).toBe(400);
    expect(e.msg).toMatch(/^Nº da compra|corpo|campo|inválid/i);
    expect(fake.tabelas.compras).toHaveLength(0);
  });

  it("anoMes no corpo: a compra nasce NESSE mês (não no corrente) e o número vale dentro dele", async () => {
    h.body = { sequencia: 14, anoMes: "2026-10" };
    const c = await chamar<Compra>(criarPost, adm);
    expect([c.anoMes, c.sequencia]).toEqual(["2026-10", 14]);
    expect(fake.tabelas.compras[0]).toMatchObject({ ano_mes: "2026-10", sequencia: 14 });
    // o mesmo número em novembro (sem anoMes = o mês corrente de Brasília) é outra compra
    h.body = { sequencia: 14 };
    const nov = await chamar<Compra>(criarPost, adm);
    expect([nov.anoMes, nov.sequencia]).toEqual(["2026-11", 14]);
    // e repetir o número no MESMO mês é 409, com o mês certo na mensagem
    h.body = { sequencia: 14, anoMes: "2026-10" };
    const e = await erroDe(chamar(criarPost, adm));
    expect(e.status).toBe(409);
    expect(e.msg).toBe("A Compra 14 de outubro já existe. Escolha outro número.");
  });

  it.each(["2026-13", "1900-01", "2019-12", "2027-01", "2031-05", "novembro", ""])("anoMes absurdo (%s): 400 e nada é criado", async (mes) => {
    h.body = { sequencia: 3, anoMes: mes };
    expect((await erroDe(chamar(criarPost, adm))).status).toBe(400);
    expect(fake.tabelas.compras).toHaveLength(0);
  });

  it("o mês que vem ainda vale (dezembro, estando em novembro)", async () => {
    h.body = { sequencia: 3, anoMes: "2026-12" };
    expect((await chamar<Compra>(criarPost, adm)).anoMes).toBe("2026-12");
  });

  it("os limites passam: 1 e 9999", async () => {
    expect((await criarCompraDireta(1)).sequencia).toBe(1);
    expect((await criarCompraDireta(9999)).sequencia).toBe(9999);
  });

  it("número que já existe no mês: 409 com a mensagem amigável (e o código para a tela), sem criar nada; cancelada também ocupa o número", async () => {
    const c = await criarCompraDireta(14);
    h.params = { id: c.id };
    h.body = { atualizadoEm: c.updatedAt, fornecedor: "Fornecedor Teste" };
    const salvo = await chamar<Compra>(salvarPatch, adm);
    h.body = { sequencia: 14 };
    const e = await erroDe(chamar(criarPost, adm));
    expect(e.status).toBe(409);
    expect(e.msg).toBe("A Compra 14 de novembro já existe (Fornecedor Teste). Escolha outro número.");
    expect(e.data).toMatchObject({ code: "NUMERO_JA_EXISTE", sequencia: 14 });
    expect(fake.tabelas.compras).toHaveLength(1);

    h.params = { id: salvo.id };
    await chamar(cancelarPost, adm);
    h.body = { sequencia: 14 };
    expect((await erroDe(chamar(criarPost, adm))).status).toBe(409); // a cancelada continua ocupando
  });

  it("só quem ESCREVE cria: sócio e consultor levam 403, mesmo com um número válido (e nada é criado)", async () => {
    for (const quem of [usuario("socio"), usuario("consultor"), usuario("socio", mapa("ver"))]) {
      h.body = { sequencia: 21 };
      expect(await statusDe(chamar(criarPost, quem))).toBe(403);
    }
    expect(fake.tabelas.compras).toHaveLength(0);
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
    expect(Object.keys(r).sort()).toEqual(["anoMes", "compras", "limite", "maiorSequencia", "pagina", "temMais", "total", "totais"].sort());
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
      { campoNovo: 1 }, { paciente: 5 }, { itens: "x" }, { cancelada: true }, { sequencia: 0 }, { sequencia: "99" }, { sequencia: 1.5 }, { sequencia: 10000 },
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
    expect((await duplicarDireto(c.id)).recorrente).toBe(true);
    for (const ruim of ["true", 1, null]) {
      h.params = { id: c.id };
      h.body = { atualizadoEm: salvo.updatedAt, recorrente: ruim };
      expect((await erroDe(chamar(salvarPatch, adm))).status, String(ruim)).toBe(400);
    }
  });
});

describe("POST /api/compras/:id/duplicar", () => {
  it("201, nova compra com o número DIGITADO, mesmos dados e medicamentos com ids novos; 404 se a original não existe", async () => {
    const c = await criarCompraDireta(5);
    h.params = { id: c.id };
    h.body = { atualizadoEm: c.updatedAt, paciente: "PACIENTE TESTE", fornecedor: "Fornecedor Teste", envio: "Air Cargo", numeroOrdens: 3, itens: [{ id: "itm_teste_01", medicamento: "MED TESTE", brand: "referencia" }] };
    await chamar(salvarPatch, adm);
    h.status = 0;
    const copia = await duplicarDireto(c.id, 40, usuario("operacional"));
    expect(h.status).toBe(201);
    expect(copia).toMatchObject({ sequencia: 40, paciente: "PACIENTE TESTE", fornecedor: "Fornecedor Teste", envio: "Air Cargo", numeroOrdens: 3, cancelada: false, criadoPor: "Pessoa operacional" });
    expect(copia.sequencia).not.toBe(c.sequencia); // o número da original nunca é copiado
    expect(copia.id).not.toBe(c.id);
    expect(copia.itens[0]!.id).not.toBe("itm_teste_01");
    expect(copia.itens[0]).toMatchObject({ medicamento: "MED TESTE", brand: "referencia" });
    expect(Object.keys(copia).sort()).toEqual([...CHAVES_DA_COMPRA].sort());

    expect((await erroDe(duplicarDireto("cmp_nao_existe", 41))).status).toBe(404);
  });

  it.each([
    ["sem número", {}],
    ["número 0", { sequencia: 0 }],
    ["decimal", { sequencia: 2.5 }],
    ["acima de 9999", { sequencia: 10000 }],
    ["texto", { sequencia: "9" }],
  ])("400 para o número inválido (%s) e nenhuma cópia é criada", async (_nome, corpo) => {
    const c = await criarCompraDireta(5);
    h.params = { id: c.id };
    h.body = corpo;
    expect((await erroDe(chamar(duplicarPost, adm))).status).toBe(400);
    expect(fake.tabelas.compras).toHaveLength(1);
  });

  it("número que já existe no mês (inclusive o da própria original): 409 amigável e nada é criado", async () => {
    const c = await criarCompraDireta(5);
    const e = await erroDe(duplicarDireto(c.id, 5));
    expect(e.status).toBe(409);
    expect(e.msg).toBe("A Compra 05 de novembro já existe. Escolha outro número.");
    expect(e.data).toMatchObject({ code: "NUMERO_JA_EXISTE", sequencia: 5 });
    expect(fake.tabelas.compras).toHaveLength(1);
  });

  it("anoMes no corpo: a cópia nasce nesse mês; mês absurdo é 400 e nada é copiado", async () => {
    const c = await criarCompraDireta(5);
    h.params = { id: c.id };
    h.body = { sequencia: 5, anoMes: "2026-10" }; // o mesmo número da original, mas em OUTRO mês: livre
    const copia = await chamar<Compra>(duplicarPost, adm);
    expect([copia.anoMes, copia.sequencia]).toEqual(["2026-10", 5]);
    h.params = { id: c.id };
    h.body = { sequencia: 6, anoMes: "2031-01" };
    expect((await erroDe(chamar(duplicarPost, adm))).status).toBe(400);
    expect(fake.tabelas.compras).toHaveLength(2);
  });

  it("sócio e consultor não duplicam (403)", async () => {
    const c = await criarCompraDireta(5);
    for (const quem of [usuario("socio"), usuario("consultor")]) expect(await statusDe(duplicarDireto(c.id, 6, quem))).toBe(403);
    expect(fake.tabelas.compras).toHaveLength(1);
  });
});

describe("PATCH /api/compras/:id — o Nº da compra é editável", () => {
  it("troca para um número livre (200) e devolve a compra com o número novo", async () => {
    const c = await criarCompraDireta(5);
    h.params = { id: c.id };
    h.body = { atualizadoEm: c.updatedAt, sequencia: 12 };
    expect((await chamar<Compra>(salvarPatch, adm)).sequencia).toBe(12);
  });

  it("para um número que outra compra tem: 409 amigável (com o código), e a compra fica como estava", async () => {
    const a = await criarCompraDireta(5);
    await criarCompraDireta(6);
    h.params = { id: a.id };
    h.body = { atualizadoEm: a.updatedAt, sequencia: 6 };
    const e = await erroDe(chamar(salvarPatch, adm));
    expect(e.status).toBe(409);
    expect(e.msg).toBe("A Compra 06 de novembro já existe. Escolha outro número.");
    expect(e.data).toMatchObject({ code: "NUMERO_JA_EXISTE" });
    h.params = { id: a.id };
    expect((await chamar<Compra>(detalheGet, adm)).sequencia).toBe(5);
  });

  it.each([0, -1, 1.5, 10000, "14", null])("400 para o número inválido (%s)", async (ruim) => {
    const a = await criarCompraDireta(5);
    h.params = { id: a.id };
    h.body = { atualizadoEm: a.updatedAt, sequencia: ruim };
    expect((await erroDe(chamar(salvarPatch, adm))).status).toBe(400);
  });

  it("sócio não troca o número (403)", async () => {
    const a = await criarCompraDireta(5);
    h.params = { id: a.id };
    h.body = { atualizadoEm: a.updatedAt, sequencia: 12 };
    expect(await statusDe(chamar(salvarPatch, usuario("socio")))).toBe(403);
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
    const respostas = [salvo, await chamar(listaGet, adm), await chamar(detalheGet, adm), await duplicarDireto(c.id), await chamar(cancelarPost, adm)];
    for (const r of respostas) {
      const texto = JSON.stringify(r);
      expect(texto).not.toContain("CHAVE-PIX-SECRETA");
      expect(texto.toLowerCase()).not.toMatch(/chave_?pix/);
    }
    // As colunas lidas dos Cadastros (só `nome`, nunca chave_pix nem `*`) são travadas por cadastrosPixNenhumaOutraRota.spec.ts.
  });
});

describe("GET /api/compras — ?ordem= e ?inverter=", () => {
  it("sem ordem: do maior Nº para o menor; ?ordem=recentes e ?inverter=1 mudam; ordem inventada é 400", async () => {
    // Cada passo acontece num minuto diferente (sem empate de milissegundos).
    vi.setSystemTime(new Date("2026-11-19T15:00:00.000Z"));
    const a = await criarCompraDireta(3);
    vi.setSystemTime(new Date("2026-11-19T15:01:00.000Z"));
    await criarCompraDireta(18);
    // mexe na 3 depois: ela vira a mais recente
    vi.setSystemTime(new Date("2026-11-19T15:02:00.000Z"));
    h.params = { id: a.id };
    h.body = { atualizadoEm: a.updatedAt, paciente: "MEXIDA" };
    await chamar(salvarPatch, adm);
    const lista = async (q: Record<string, unknown>): Promise<number[]> => {
      h.query = { ano_mes: a.anoMes, ...q };
      return (await chamar<{ compras: Array<{ sequencia: number }> }>(listaGet, adm)).compras.map((c) => c.sequencia);
    };
    expect(await lista({})).toEqual([18, 3]);
    expect(await lista({ ordem: "numero" })).toEqual([18, 3]);
    expect(await lista({ ordem: "numero", inverter: "1" })).toEqual([3, 18]);
    expect(await lista({ ordem: "recentes" })).toEqual([3, 18]);
    h.query = { ano_mes: a.anoMes, ordem: "data" };
    const e = await erroDe(chamar(listaGet, adm));
    expect(e.status).toBe(400);
    expect(e.msg).toBe("Ordem inválida: use recentes ou numero.");
  });

  it("o sócio (só lê) também escolhe a visão", async () => {
    await criarCompraDireta(3);
    h.query = { ordem: "recentes", inverter: "1" };
    expect((await chamar<{ compras: unknown[] }>(listaGet, usuario("socio"))).compras).toHaveLength(1);
  });
});

describe("DELETE /api/compras/:id", () => {
  /** As FKs de hoje em produção: itens em cascata; pré-cadastro sem ação. */
  function fksDeHoje(): void {
    fake.chaveEstrangeira("compra_itens", "compra_id", "compras", "id", "cascade");
    fake.chaveEstrangeira("pre_cadastro_medicamentos", "compra_id", "compras", "id", "restrict");
  }
  const apagar = async (id: string, user: AuthUser | null | undefined = adm): Promise<{ id: string }> => {
    h.params = { id };
    return chamar<{ id: string }>(apagarDelete, user);
  };

  it("200 { id }: a compra e os itens somem (GET dá 404), o número fica livre e as outras compras seguem", async () => {
    fksDeHoje();
    const a = await criarCompraDireta(14);
    const b = await criarCompraDireta(15);
    h.params = { id: a.id };
    h.body = { atualizadoEm: a.updatedAt, itens: [{ id: "itm_teste_01", medicamento: "MED TESTE" }] };
    await chamar(salvarPatch, adm);
    expect(await apagar(a.id)).toEqual({ id: a.id });
    h.params = { id: a.id };
    expect((await erroDe(chamar(detalheGet, adm))).status).toBe(404);
    expect(fake.tabelas.compra_itens ?? []).toHaveLength(0);
    h.params = { id: b.id };
    expect((await chamar<Compra>(detalheGet, adm)).sequencia).toBe(15);
    await criarCompraDireta(14); // o número voltou
  });

  it("404 se a compra não existe (inclusive depois de apagada); 400 para id inválido", async () => {
    expect((await erroDe(apagar("cmp_nao_existe"))).status).toBe(404);
    const a = await criarCompraDireta();
    await apagar(a.id);
    expect((await erroDe(apagar(a.id))).status).toBe(404);
    for (const ruim of ["../x", "a b", "a/b", ""]) expect((await erroDe(apagar(ruim))).status, ruim).toBe(400);
  });

  it("quem pode apagar: administrador e operacional (e quem tem compras=editar); sócio, consultor, 'ver', 'nenhum' e sem sessão NÃO, e a compra segue lá", async () => {
    fksDeHoje();
    const casos: Array<[string, AuthUser | null, number]> = [
      ["administrador", usuario("administrador"), 200],
      ["operacional", usuario("operacional"), 200],
      ["sócio com compras=editar", usuario("socio", mapa("editar")), 200],
      ["sócio sem mapa", usuario("socio"), 403],
      ["consultor", usuario("consultor"), 403],
      ["operacional com compras=ver", usuario("operacional", mapa("ver")), 403],
      ["operacional com compras=nenhum", usuario("operacional", mapa("nenhum")), 403],
      ["sem sessão", null, 401],
    ];
    for (const [nome, user, esperado] of casos) {
      const c = await criarCompraDireta();
      expect(await statusDe(apagar(c.id, user)), nome).toBe(esperado);
      const existe = fake.tabelas.compras!.some((r) => r.id === c.id);
      expect(existe, `${nome}: a compra ${esperado === 200 ? "sumiu" : "continua"}`).toBe(esperado !== 200);
    }
  });

  it("os pré-cadastros pedidos a partir da compra continuam existindo (sem o vínculo)", async () => {
    fksDeHoje();
    const a = await criarCompraDireta();
    fake.semear("pre_cadastro_medicamentos", [{ id: "p1", nome: "TESTE", nome_chave: "teste", temperatura: "", status: "pendente", compra_id: a.id, cadastro_id: null }]);
    await apagar(a.id);
    expect(fake.tabelas.pre_cadastro_medicamentos).toEqual([expect.objectContaining({ id: "p1", status: "pendente", compra_id: null })]);
  });

  it("banco sem o privilégio DELETE (hoje em produção): 503 com a mensagem clara e a compra continua", async () => {
    fksDeHoje();
    fake.negarPermissao("compras", "delete");
    const a = await criarCompraDireta();
    const e = await erroDe(apagar(a.id));
    expect(e.status).toBe(503);
    expect(e.msg).toMatch(/Apagar compras ainda não está liberado no banco/);
    expect(fake.tabelas.compras).toHaveLength(1);
  });

  it("depois de apagada, salvar a compra (autosave de quem a tinha aberta) dá 404, não 500", async () => {
    fksDeHoje();
    const a = await criarCompraDireta();
    await apagar(a.id);
    h.params = { id: a.id };
    h.body = { atualizadoEm: a.updatedAt, paciente: "DIGITADO DEPOIS" };
    expect((await erroDe(chamar(salvarPatch, adm))).status).toBe(404);
  });
});
