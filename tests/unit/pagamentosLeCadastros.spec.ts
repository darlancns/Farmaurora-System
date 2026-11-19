import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AuthUser } from "../../shared/types/auth";
import type { Permissoes } from "../../shared/utils/permissoesPagina";
import { FakeSupabase } from "./helpers/fakeSupabase";

// Pagamentos LÊ os Cadastros (fornecedores, despachantes, transportadoras e a chave PIX). Handlers e stores REAIS; só h3
// (readBody) e o Supabase (em memória) são simulados. Todos os nomes são "TESTE" e todas as chaves são FICTÍCIAS (e nunca
// podem aparecer em log nem em mensagem de erro).

const h = vi.hoisted(() => ({ body: {} as unknown }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { createCriarGrupoHandler, createGetPixHandler, DESPACHANTE, TRANSPORTADORA } = await import(
  "../../server/utils/grupoPagamentoRouteHandlers"
);
const { default: criarLancamentoHandler } = await import("../../server/api/pagamentos/banco.post");
const { default: cadastrosHandler } = await import("../../server/api/pagamentos/cadastros.get");
const { atualizarGrupoRealizado, editarItemGrupo } = await import("../../server/utils/pagamentos/grupoStore");
const { atualizarLancamentoBanco } = await import("../../server/utils/pagamentos/bancoStore");
const { loteToRow, lancToRow } = await import("../../server/utils/pagamentos/bancoMappers");

const criarGrupoDespachante = createCriarGrupoHandler(DESPACHANTE);
const criarGrupoTransportadora = createCriarGrupoHandler(TRANSPORTADORA);
const pixDespachante = createGetPixHandler(DESPACHANTE);
const pixTransportadora = createGetPixHandler(TRANSPORTADORA);

const T_DESP = "cadastro_despachantes";
const T_TRANSP = "cadastro_transportadoras";
const T_FORN = "cadastro_fornecedores";
const T_GRUPOS = "pagamento_grupos";
const T_LOTES = "pagamento_lotes_banco";
const T_LANC = "pagamento_lancamentos_banco";

const PIX_ALFA = "chave-ficticia-despachante-alfa";
const PIX_INATIVO = "chave-ficticia-despachante-inativo";
const PIX_TRANSP = "chave-ficticia-transportadora-alfa";
const TODAS_AS_CHAVES = [PIX_ALFA, PIX_INATIVO, PIX_TRANSP];
const AGORA = "2026-11-18T12:00:00.000Z";

const conta = (role: AuthUser["role"], permissoes?: Permissoes): AuthUser => ({
  id: `u_${role}`,
  email: `${role}@x.com`,
  role,
  isAdmin: role === "administrador",
  ...(permissoes ? { permissoes } : {}),
});
const mapaPagamentos = (nivel: "nenhum" | "ver" | "editar"): Permissoes => ({ processos: "editar", pagamentos: nivel, patients: "editar" });

async function chamar<R>(handler: (e: never) => Promise<R>, user: AuthUser | null, body?: unknown): Promise<R> {
  h.body = body;
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

const base = { atualizado_por: null, created_at: AGORA, updated_at: AGORA };
function semear(): void {
  fake.tabelas[T_DESP] = [
    { id: "desp_1", nome: "TESTE Despachante Alfa", nome_chave: "teste despachante alfa", contato_nome: null, telefone: null, email: null, chave_pix: PIX_ALFA, ativo: true, ...base },
    { id: "desp_2", nome: "TESTE Despachante Beta", nome_chave: "teste despachante beta", contato_nome: null, telefone: null, email: null, chave_pix: null, ativo: true, ...base },
    { id: "desp_3", nome: "TESTE Despachante Inativo", nome_chave: "teste despachante inativo", contato_nome: null, telefone: null, email: null, chave_pix: PIX_INATIVO, ativo: false, ...base },
  ];
  fake.tabelas[T_TRANSP] = [
    { id: "transp_1", nome: "TESTE Transportadora Alfa", nome_chave: "teste transportadora alfa", chave_pix: PIX_TRANSP, ativo: true, ...base },
    { id: "transp_2", nome: "TESTE Transportadora Inativa", nome_chave: "teste transportadora inativa", chave_pix: null, ativo: false, ...base },
  ];
  fake.tabelas[T_FORN] = [
    { id: "forn_1", nome: "TESTE Fornecedor Alfa", nome_chave: "teste fornecedor alfa", pais: "Chile", prazo_alerta_dias: 30, sem_alerta: false, ativo: true, ...base },
    { id: "forn_2", nome: "TESTE Fornecedor Beta", nome_chave: "teste fornecedor beta", pais: null, prazo_alerta_dias: null, sem_alerta: true, ativo: true, ...base },
    { id: "forn_3", nome: "TESTE Fornecedor Inativo", nome_chave: "teste fornecedor inativo", pais: "Peru", prazo_alerta_dias: 10, sem_alerta: false, ativo: false, ...base },
  ];
  fake.tabelas[T_GRUPOS] = [];
  fake.tabelas[T_LOTES] = [];
  fake.tabelas[T_LANC] = [];
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
  for (const chave of TODAS_AS_CHAVES) expect(logado).not.toContain(chave);
  while (espioes.length) espioes.pop()!.mockRestore();
});

const avisos = () => espioes.flatMap((e) => e.mock.calls.map((c) => c.map(String).join(" ")));
const tocouCadastros = () => fake.chamadas.some((c) => c.tabela.startsWith("cadastro_"));

// ── 1. PIX: só leitura, vindo do Cadastro, com a regra de visibilidade ───────────────────────────────────────
describe("GET /api/pagamentos/{despachante,transportadora}-pix — lê o Cadastro", () => {
  const VEEM: Array<[string, AuthUser]> = [
    ["administrador", conta("administrador")],
    ["administrador (o mapa não vale para ele)", conta("administrador", mapaPagamentos("nenhum"))],
    ["operacional sem mapa", conta("operacional")],
    ["operacional com Pagamentos 'ver'", conta("operacional", mapaPagamentos("ver"))],
    ["operacional com Pagamentos 'editar'", conta("operacional", mapaPagamentos("editar"))],
    ["sócio sem mapa", conta("socio")],
    ["sócio com Pagamentos 'ver'", conta("socio", mapaPagamentos("ver"))],
    ["sócio com Pagamentos 'editar'", conta("socio", mapaPagamentos("editar"))],
  ];
  const NAO_VEEM: Array<[string, AuthUser | null]> = [
    ["operacional com Pagamentos 'nenhum'", conta("operacional", mapaPagamentos("nenhum"))],
    ["operacional com mapa sem a seção Pagamentos", conta("operacional", { processos: "editar" })],
    ["sócio com Pagamentos 'nenhum'", conta("socio", mapaPagamentos("nenhum"))],
    ["consultor", conta("consultor")],
    ["consultor com mapa forjado liberando Pagamentos", conta("consultor", mapaPagamentos("editar"))],
    ["sem login", null],
  ];

  it.each(VEEM)("%s: recebe { nome: chave } dos ATIVOS que têm chave", async (_n, user) => {
    expect(await chamar(pixDespachante, user)).toEqual({ "TESTE Despachante Alfa": PIX_ALFA });
    expect(await chamar(pixTransportadora, user)).toEqual({ "TESTE Transportadora Alfa": PIX_TRANSP });
  });

  it.each(NAO_VEEM)("%s: 403, e o banco nem é consultado", async (_n, user) => {
    for (const handler of [pixDespachante, pixTransportadora]) {
      fake.chamadas.length = 0;
      const e = await erroDe(chamar(handler, user));
      expect(e.status).toBe(403);
      expect(fake.chamadas).toEqual([]);
      for (const chave of TODAS_AS_CHAVES) expect(e.msg).not.toContain(chave);
    }
  });

  it("não devolve chave de item INATIVO nem de item sem chave; o aviso do log cita o nome e NÃO a chave", async () => {
    const mapa = (await chamar(pixDespachante, conta("operacional"))) as Record<string, string>;
    expect(Object.keys(mapa)).toEqual(["TESTE Despachante Alfa"]);
    expect(JSON.stringify(mapa)).not.toContain(PIX_INATIVO);
    const aviso = avisos().find((a) => a.includes("sem chave PIX"));
    expect(aviso).toContain("TESTE Despachante Beta");
    expect(aviso).toContain("despachantes");
    expect(aviso).not.toContain("TESTE Despachante Inativo");
  });

  it("lê as colunas do Cadastro (a chave só com o pedido) e NÃO usa mais pagamento_pix_chaves", async () => {
    await chamar(pixDespachante, conta("operacional"));
    expect(fake.selects.map((s) => s.tabela)).toEqual([T_DESP]);
    expect(fake.chamadas.some((c) => c.tabela === "pagamento_pix_chaves")).toBe(false);
  });
});

describe("a chave PIX em Pagamentos é SÓ LEITURA (as rotas PATCH foram removidas)", () => {
  const RAIZ = process.cwd();

  it("não existe mais despachante-pix.patch.ts nem transportadora-pix.patch.ts; os GET continuam", () => {
    const arquivos = readdirSync(join(RAIZ, "server/api/pagamentos"));
    expect(arquivos).not.toContain("despachante-pix.patch.ts");
    expect(arquivos).not.toContain("transportadora-pix.patch.ts");
    expect(arquivos.filter((a) => a.includes("-pix"))).toEqual(["despachante-pix.get.ts", "transportadora-pix.get.ts"]);
  });

  it("nenhuma rota de /api/pagamentos escreve chave PIX: o store antigo saiu e os handlers não exportam salvar PIX", () => {
    expect(existsSync(join(RAIZ, "server/utils/pagamentosPixStore.ts"))).toBe(false);
    const handlers = readFileSync(join(RAIZ, "server/utils/grupoPagamentoRouteHandlers.ts"), "utf-8");
    expect(handlers).not.toMatch(/createSalvarPixHandler|salvarPix|salvarDespachantePix|salvarTransportadoraPix/);
    const validacao = readFileSync(join(RAIZ, "server/utils/pagamentoValidation.ts"), "utf-8");
    expect(validacao).not.toContain("isValidSalvarGrupoPix");
  });
});

// ── 2. Criar grupo: nome ATIVO do Cadastro, cópia da chave, sem efeito colateral ─────────────────────────────
describe("criar grupo (Despachante / Transportadora)", () => {
  const user = conta("operacional");
  const itens = [{ paciente: "Paciente TESTE", valor: 100 }];
  const dto = (nomeGrupo: string, extra: Record<string, unknown> = {}) => ({
    data: "2026-11-18",
    empresa: "FARMAURORA",
    nomeGrupo,
    itens,
    ...extra,
  });

  it("casa o nome por chaveCadastro, grava o nome COMO ESTÁ no Cadastro e a CÓPIA da chave", async () => {
    const g = await chamar(criarGrupoDespachante, user, dto("  teste  DESPACHANTE alfa "));
    expect(g).toMatchObject({ nomeGrupo: "TESTE Despachante Alfa", chavePix: PIX_ALFA, tipo: "DESPACHANTE" });
    const linha = fake.linhas(T_GRUPOS)[0]!;
    expect(linha.nome_grupo).toBe("TESTE Despachante Alfa");
    expect(linha.chave_pix).toBe(PIX_ALFA);
  });

  it("transportadora: mesmo caminho, no Cadastro de transportadoras", async () => {
    const g = await chamar(criarGrupoTransportadora, user, dto("teste transportadora alfa"));
    expect(g).toMatchObject({ nomeGrupo: "TESTE Transportadora Alfa", chavePix: PIX_TRANSP, tipo: "TRANSPORTADORA" });
  });

  it("a chave que a tela mandar é IGNORADA: vale a do Cadastro; o Cadastro não é alterado", async () => {
    const antes = JSON.stringify(fake.linhas(T_DESP));
    const g = (await chamar(criarGrupoDespachante, user, dto("TESTE Despachante Alfa", { chavePix: "chave-forjada-pela-tela" }))) as { chavePix?: string };
    expect(g.chavePix).toBe(PIX_ALFA);
    expect(fake.linhas(T_GRUPOS)[0]!.chave_pix).toBe(PIX_ALFA);
    expect(JSON.stringify(fake.linhas(T_DESP))).toBe(antes);
    // Nenhuma escrita em tabela nenhuma de PIX/Cadastro: só o grupo é inserido.
    const escritas = fake.chamadas.filter((c) => c.op !== "select");
    expect(escritas).toEqual([{ tabela: T_GRUPOS, op: "insert" }]);
  });

  it("sem chave no Cadastro: o grupo é criado com chave_pix nula e o log cita o nome, nunca a chave", async () => {
    const g = (await chamar(criarGrupoDespachante, user, dto("TESTE Despachante Beta", { chavePix: "chave-forjada-pela-tela" }))) as { chavePix?: string };
    expect(g.chavePix).toBeUndefined();
    expect(fake.linhas(T_GRUPOS)[0]!.chave_pix).toBeNull();
    expect(avisos().some((a) => a.includes("TESTE Despachante Beta") && a.includes("sem chave PIX"))).toBe(true);
  });

  it("nome que não existe no Cadastro: 400 e nada é gravado", async () => {
    const e = await erroDe(chamar(criarGrupoDespachante, user, dto("TESTE Despachante Fantasma")));
    expect(e.status).toBe(400);
    expect(e.msg).toMatch(/não encontrado ou inativo/i);
    expect(fake.linhas(T_GRUPOS)).toEqual([]);
  });

  it("nome INATIVO no Cadastro: 400, sem vazar a chave dele", async () => {
    const e = await erroDe(chamar(criarGrupoDespachante, user, dto("TESTE Despachante Inativo")));
    expect(e.status).toBe(400);
    expect(e.msg).not.toContain(PIX_INATIVO);
    expect(fake.linhas(T_GRUPOS)).toEqual([]);
  });

  it("o nome tem de ser do Cadastro DO TIPO CERTO (despachante não vale como transportadora)", async () => {
    expect((await erroDe(chamar(criarGrupoTransportadora, user, dto("TESTE Despachante Alfa")))).status).toBe(400);
    expect((await erroDe(chamar(criarGrupoDespachante, user, dto("TESTE Transportadora Alfa")))).status).toBe(400);
  });

  it("nome antigo da lista fixa (fora do Cadastro) não cria grupo novo", async () => {
    const e = await erroDe(chamar(criarGrupoDespachante, user, dto("TESTE Nome Antigo")));
    expect(e.status).toBe(400);
  });

  it("anexa ao grupo ABERTO do mesmo nome pela chaveCadastro (caixa/acento/espaços), sem criar outro", async () => {
    await chamar(criarGrupoDespachante, user, dto("TESTE Despachante Alfa"));
    // O grupo já gravado com a grafia diferente (dado legado): o anexo ainda o encontra.
    fake.linhas(T_GRUPOS)[0]!.nome_grupo = "teste  despachante ALFA";
    const g = (await chamar(criarGrupoDespachante, user, dto("TESTE Despachante Alfa", { itens: [{ paciente: "Outro Paciente TESTE", valor: 50 }] }))) as {
      itens: unknown[];
    };
    expect(fake.linhas(T_GRUPOS)).toHaveLength(1);
    expect(g.itens).toHaveLength(2);
  });

  it("grupo de outro dia não recebe o anexo: abre um novo", async () => {
    await chamar(criarGrupoDespachante, user, dto("TESTE Despachante Alfa", { data: "2026-11-17" }));
    await chamar(criarGrupoDespachante, user, dto("TESTE Despachante Alfa"));
    expect(fake.linhas(T_GRUPOS)).toHaveLength(2);
  });
});

// ── 3. Grupo existente: NÃO valida contra o Cadastro ─────────────────────────────────────────────────────────
describe("edição de grupo já existente (nome antigo continua editável)", () => {
  function grupoAntigo(realizado: boolean): void {
    fake.tabelas[T_GRUPOS] = [
      {
        id: "grp_antigo",
        tipo: "DESPACHANTE",
        data: "2026-10-20",
        empresa: "FARMAURORA",
        nome_grupo: "TESTE Nome Antigo",
        chave_pix: null,
        itens: [{ paciente: "Paciente TESTE", valor: 10, status: "NAO_PAGO" }],
        realizado,
        pago_em: realizado ? "2026-10-21T12:00:00.000Z" : null,
        created_at: "2026-10-20T10:00:00.000Z",
      },
    ];
  }

  it("corrigir nome e data de um grupo realizado com nome que o Cadastro não conhece: passa, sem consultar o Cadastro", async () => {
    grupoAntigo(true);
    const g = await atualizarGrupoRealizado("grp_antigo", { nomeGrupo: "TESTE Outro Nome Antigo", pagoEm: "2026-10-22" });
    expect(g.nomeGrupo).toBe("TESTE Outro Nome Antigo");
    expect(tocouCadastros()).toBe(false);
  });

  it("editar item de grupo aberto com nome antigo: passa, sem consultar o Cadastro", async () => {
    grupoAntigo(false);
    const g = await editarItemGrupo("grp_antigo", { index: 0, paciente: "Paciente TESTE 2", valor: 20 });
    expect(g.itens[0]).toMatchObject({ paciente: "Paciente TESTE 2", valor: 20 });
    expect(tocouCadastros()).toBe(false);
  });
});

// ── 4. Banco: fornecedor ─────────────────────────────────────────────────────────────────────────────────────
describe("lançamento do Banco — fornecedor", () => {
  const user = conta("operacional");
  const dto = (fornecedor: string, extra: Record<string, unknown> = {}) => ({
    empresa: "FARMAURORA",
    moeda: "USD",
    fornecedor,
    invoice: "INV-TESTE",
    cliente: "Cliente TESTE",
    valorMoeda: 100,
    ...extra,
  });
  const gravado = () => fake.linhas(T_LANC).map((l) => l.fornecedor);

  it('fornecedor ATIVO: "Nome - País" (a mesma chaveCadastro) é gravado como está no Cadastro', async () => {
    await chamar(criarLancamentoHandler, user, dto("  teste FORNECEDOR alfa - chile "));
    expect(gravado()).toEqual(["TESTE Fornecedor Alfa - Chile"]);
  });

  it("fornecedor sem país no Cadastro: o texto é só o nome", async () => {
    await chamar(criarLancamentoHandler, user, dto("TESTE Fornecedor Beta"));
    expect(gravado()).toEqual(["TESTE Fornecedor Beta"]);
  });

  it("só o nome de quem TEM país não vale (o texto gravado é 'Nome - País')", async () => {
    expect((await erroDe(chamar(criarLancamentoHandler, user, dto("TESTE Fornecedor Alfa")))).status).toBe(400);
    expect(gravado()).toEqual([]);
  });

  it("fornecedor INATIVO ou inexistente: 400, nada gravado", async () => {
    expect((await erroDe(chamar(criarLancamentoHandler, user, dto("TESTE Fornecedor Inativo - Peru")))).status).toBe(400);
    expect((await erroDe(chamar(criarLancamentoHandler, user, dto("TESTE Fornecedor Fantasma - Chile")))).status).toBe(400);
    expect(gravado()).toEqual([]);
    expect(fake.linhas(T_LOTES)).toEqual([]);
  });

  it('"Outro" (fornecedorOutro: true): texto livre, como está (aparado), sem consultar o Cadastro', async () => {
    await chamar(criarLancamentoHandler, user, dto("  TESTE Fornecedor Livre - Chile ", { fornecedorOutro: true }));
    expect(gravado()).toEqual(["TESTE Fornecedor Livre - Chile"]);
    expect(tocouCadastros()).toBe(false);
  });

  it("fornecedorOutro com tipo errado é recusado", async () => {
    const e = await erroDe(chamar(criarLancamentoHandler, user, dto("TESTE x", { fornecedorOutro: "sim" })));
    expect(e.status).toBe(400);
  });

  it("editar lançamento EXISTENTE mantém o valor gravado, mesmo de fornecedor fora do Cadastro, sem consultá-lo", async () => {
    fake.tabelas[T_LOTES] = [loteToRow({
      id: "lote_a", data: "2026-10-20", empresa: "FARMAURORA", moeda: "USD", numeroLote: 1,
      opcoes: [{ banco: "XP", taxaCorretagem: 0, taxa: null }, { banco: "RENDIMENTO", taxaCorretagem: 0, taxa: null }, { banco: "INTEX", taxaCorretagem: 0, taxa: null }],
      bancoEscolhido: null, taxaEscolhida: null, realizado: false, pagoEm: null, createdAt: "2026-10-20T10:00:00.000Z",
    })];
    fake.tabelas[T_LANC] = [lancToRow({
      id: "lanc_a", loteId: "lote_a", data: "2026-10-20", empresa: "FARMAURORA", fornecedor: "TESTE Nome Antigo - Chile",
      invoice: "INV-A", cliente: "Cliente TESTE", valorMoeda: 100, moeda: "USD", valorReais: null, taxa: null, createdAt: "2026-10-20T10:00:00.000Z",
    })];
    await atualizarLancamentoBanco("lanc_a", { fornecedor: "TESTE Nome Antigo - Chile", invoice: "INV-B" });
    expect(fake.linhas(T_LANC)[0]).toMatchObject({ fornecedor: "TESTE Nome Antigo - Chile", invoice: "INV-B" });
    expect(tocouCadastros()).toBe(false);
  });
});

// ── 5. Listas para os selects, filtros e exportação ──────────────────────────────────────────────────────────
describe("GET /api/pagamentos/cadastros", () => {
  it("devolve ativos E inativos (com `ativo`) e o país do fornecedor; ativos primeiro, em ordem alfabética", async () => {
    const r = (await chamar(cadastrosHandler, conta("operacional"))) as Record<string, Array<{ nome: string; ativo: boolean; pais: string }>>;
    expect(r.despachantes.map((d) => [d.nome, d.ativo])).toEqual([
      ["TESTE Despachante Alfa", true],
      ["TESTE Despachante Beta", true],
      ["TESTE Despachante Inativo", false],
    ]);
    expect(r.transportadoras.map((t) => [t.nome, t.ativo])).toEqual([
      ["TESTE Transportadora Alfa", true],
      ["TESTE Transportadora Inativa", false],
    ]);
    expect(r.fornecedores.map((f) => [f.nome, f.pais, f.ativo])).toEqual([
      ["TESTE Fornecedor Alfa", "Chile", true],
      ["TESTE Fornecedor Beta", "", true],
      ["TESTE Fornecedor Inativo", "Peru", false],
    ]);
  });

  it("NUNCA leva chave PIX: nem no corpo nem nas colunas lidas do banco", async () => {
    const r = await chamar(cadastrosHandler, conta("operacional"));
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/chave/i);
    for (const chave of TODAS_AS_CHAVES) expect(json).not.toContain(chave);
    for (const s of fake.selects) expect(s.colunas ?? "").not.toContain("chave_pix");
  });
});
