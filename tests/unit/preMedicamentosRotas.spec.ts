import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import type { ListaPreCadastros, RespostaDecisaoPreCadastro } from "../../shared/types/PreCadastro";
import { MENSAGEM_API_SEM_PERMISSAO, autorizarApi, permissoesTudoNenhum, type Permissoes } from "../../shared/utils/permissoesPagina";
import type { Role } from "../../shared/utils/rbac";
import { FakeSupabase } from "./helpers/fakeSupabase";

// GET /api/cadastros/pre-medicamentos, POST .../[id]/aprovar e POST .../[id]/rejeitar com h3 e o Supabase simulados. A permissão é a MESMA de
// escrever nos Cadastros (só o administrador): inclusive a LISTA, que o middleware deixaria todos os cargos lerem. Dados fictícios (TESTE).

const h = vi.hoisted(() => ({ body: undefined as unknown, params: {} as Record<string, string>, query: {} as Record<string, unknown> }));

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return {
    ...real,
    readBody: vi.fn(async () => h.body),
    getRouterParam: vi.fn((_e: unknown, nome: string) => h.params[nome]),
    getQuery: vi.fn(() => h.query),
  };
});

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

import listaGet from "../../server/api/cadastros/pre-medicamentos/index.get";
import aprovarPost from "../../server/api/cadastros/pre-medicamentos/[id]/aprovar.post";
import rejeitarPost from "../../server/api/cadastros/pre-medicamentos/[id]/rejeitar.post";

type Handler = (e: never) => Promise<unknown>;
const ANTIGA = "2026-11-10T10:00:00.000Z";

function usuario(role: Role, permissoes?: Permissoes): AuthUser {
  return { id: `u_${role}`, email: `${role}@x.com`, role, nome: `Pessoa ${role}`, isAdmin: role === "administrador", ...(role === "consultor" ? { consultorNome: "Dani" } : {}), ...(permissoes ? { permissoes } : {}) };
}
const chamar = <T = unknown>(handler: unknown, user: AuthUser | null | undefined): Promise<T> => (handler as Handler)({ context: { user } } as never) as Promise<T>;

async function erroDe(p: Promise<unknown>): Promise<{ status: number; msg: string; data: Record<string, unknown> }> {
  try {
    await p;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string; data?: unknown };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "", data: (err.data ?? {}) as Record<string, unknown> };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}
const statusDe = async (p: Promise<unknown>): Promise<number> => {
  try {
    await p;
    return 200;
  } catch (e) {
    return (e as { statusCode?: number }).statusCode ?? 500;
  }
};

const administrador = usuario("administrador");
const escritas = (): Array<{ tabela: string; op: string }> => fake.chamadas.filter((c) => c.op !== "select");

function semear(): void {
  for (const k of Object.keys(fake.tabelas)) delete fake.tabelas[k];
  fake.chamadas.length = 0;
  fake.semear("cadastro_temperaturas", [{ id: "temp_1", nome: "2°C a 8°C", nome_chave: "2°c a 8°c", ativo: true, created_at: ANTIGA, updated_at: ANTIGA }]);
  fake.semear("cadastro_medicamentos", []);
  fake.semear("compras", [{ id: "compra_1", ano_mes: "2026-11", sequencia: 7, updated_at: ANTIGA }]);
  fake.semear("compra_itens", [{ id: "it_1", compra_id: "compra_1", posicao: 1, medicamento: "TESTE MEDICAMENTO ALFA", medicamento_cadastro_id: null, pre_cadastro_id: "pre_teste_alfa" }]);
  fake.semear("pre_cadastro_medicamentos", [
    { id: "pre_teste_alfa", nome: "TESTE MEDICAMENTO ALFA", nome_chave: "teste medicamento alfa", temperatura: "2°C a 8°C", status: "pendente", compra_id: "compra_1", cadastro_id: null, solicitado_por: "Op Teste", decidido_por: null, decidido_em: null, created_at: "2026-11-12T12:00:00.000Z", updated_at: "2026-11-12T12:00:00.000Z" },
  ]);
}

beforeEach(() => {
  semear();
  h.body = undefined;
  h.params = { id: "pre_teste_alfa" };
  h.query = {};
});

// [nome, usuário] — quem NÃO pode, nas três rotas.
const SEM_PERMISSAO: Array<[string, AuthUser | null]> = [
  ["operacional sem mapa", usuario("operacional")],
  ["operacional com compras = editar e dir = editar", usuario("operacional", { ...permissoesTudoNenhum(), compras: "editar", dir: "editar", processos: "editar" })],
  ["operacional com todas as páginas em editar", usuario("operacional", { processos: "editar", pagamentos: "editar", dir: "editar", patients: "editar", compras: "editar" })],
  ["sócio", usuario("socio")],
  ["consultor", usuario("consultor")],
  ["sem usuário", null],
];

describe("permissão: só o administrador (a regra de escrever nos Cadastros), na lista e nas decisões", () => {
  it.each(SEM_PERMISSAO)("%s: 403 na lista, em aprovar e em rejeitar — e nada é lido nem gravado", async (_nome, user) => {
    expect(await statusDe(chamar(listaGet, user))).toBe(403);
    expect(await statusDe(chamar(aprovarPost, user))).toBe(403);
    expect(await statusDe(chamar(rejeitarPost, user))).toBe(403);
    expect(fake.chamadas).toEqual([]);
    expect(fake.linhas("pre_cadastro_medicamentos")[0]).toMatchObject({ status: "pendente" });
  });

  it("o administrador lista, aprova e rejeita", async () => {
    expect(await statusDe(chamar(listaGet, administrador))).toBe(200);
    expect(await statusDe(chamar(aprovarPost, administrador))).toBe(200);
    semear();
    expect(await statusDe(chamar(rejeitarPost, administrador))).toBe(200);
  });

  it("o middleware: a escrita (aprovar e rejeitar) é 403 para quem não escreve em config; a LEITURA passa para todos os cargos (por isso o handler da lista confere o administrador)", () => {
    const adm = administrador;
    for (const user of [usuario("operacional"), usuario("socio"), usuario("consultor")]) {
      for (const caminho of ["/api/cadastros/pre-medicamentos/pre_x/aprovar", "/api/cadastros/pre-medicamentos/pre_x/rejeitar"]) {
        expect(autorizarApi(user, caminho, "POST"), `${user.role} ${caminho}`).toEqual({ permitido: false, status: 403, mensagem: MENSAGEM_API_SEM_PERMISSAO });
        expect(autorizarApi(adm, caminho, "POST"), `administrador ${caminho}`).toEqual({ permitido: true });
      }
      expect(autorizarApi(user, "/api/cadastros/pre-medicamentos", "GET")).toEqual({ permitido: true });
    }
    expect(autorizarApi(null, "/api/cadastros/pre-medicamentos", "GET")).toMatchObject({ permitido: false, status: 401 });
  });
});

describe("GET /api/cadastros/pre-medicamentos", () => {
  it("padrão: os pendentes, com o título da compra e a contagem", async () => {
    const r = await chamar<ListaPreCadastros>(listaGet, administrador);
    expect(r).toMatchObject({ status: "pendente", total: 1, itens: [{ id: "pre_teste_alfa", nome: "TESTE MEDICAMENTO ALFA", compra: "Compra 07 - Novembro/2026" }] });
  });

  it("?status= escolhe o estado; status desconhecido é 400", async () => {
    h.query = { status: "aprovado" };
    expect(await chamar<ListaPreCadastros>(listaGet, administrador)).toMatchObject({ status: "aprovado", total: 0, itens: [] });
    h.query = { status: "qualquer" };
    expect((await erroDe(chamar(listaGet, administrador))).status).toBe(400);
  });

  it("é só leitura", async () => {
    await chamar(listaGet, administrador);
    expect(escritas()).toEqual([]);
  });
});

describe("POST .../aprovar", () => {
  it("sem corpo: aprova com o nome e a temperatura do pedido e devolve o pré-cadastro, os itens e as compras", async () => {
    const r = await chamar<RespostaDecisaoPreCadastro>(aprovarPost, administrador);
    expect(r).toMatchObject({ itens: 1, compras: 1, medicamentoCriado: true, preCadastro: { id: "pre_teste_alfa", status: "aprovado", decididoPor: "Pessoa administrador" } });
    expect(fake.linhas("cadastro_medicamentos")).toHaveLength(1);
    expect(fake.linhas("compra_itens")[0]).toMatchObject({ medicamento_cadastro_id: r.preCadastro.cadastroId });
  });

  it("com ajustes de nome e temperatura", async () => {
    h.body = { nome: "teste medicamento alfa 5 mg", temperatura: "2°C a 8°C" };
    await chamar(aprovarPost, administrador);
    expect(fake.linhas("cadastro_medicamentos")[0]).toMatchObject({ nome: "TESTE MEDICAMENTO ALFA 5 MG", temperatura: "2°C a 8°C" });
  });

  it("404 inexistente; 422 validação; 409 de nome já cadastrado (com o existente em data); 409 de já decidido (com o status em data)", async () => {
    h.params = { id: "pre_nao_existe" };
    expect((await erroDe(chamar(aprovarPost, administrador))).status).toBe(404);

    h.params = { id: "pre_teste_alfa" };
    h.body = { temperatura: "Quente" };
    expect((await erroDe(chamar(aprovarPost, administrador))).status).toBe(422);

    fake.semear("cadastro_medicamentos", [{ id: "med_gama", nome: "TESTE MEDICAMENTO GAMA", nome_chave: "teste medicamento gama", temperatura: "Ambiente", ativo: true }]);
    h.body = { nome: "TESTE MEDICAMENTO GAMA" };
    const conflito = await erroDe(chamar(aprovarPost, administrador));
    expect(conflito.status).toBe(409);
    expect(conflito.data).toMatchObject({ code: "medicamento_ja_cadastrado", existente: { id: "med_gama", ativo: true } });

    h.body = { nome: "TESTE MEDICAMENTO GAMA", vincularExistente: true };
    await chamar(aprovarPost, administrador);
    const decidida = await erroDe(chamar(aprovarPost, administrador));
    expect(decidida.status).toBe(409);
    expect(decidida.data).toMatchObject({ code: "pre_cadastro_ja_decidido", status: "aprovado" });
  });

  it("corpo que não é objeto: 422", async () => {
    h.body = ["nome"];
    expect((await erroDe(chamar(aprovarPost, administrador))).status).toBe(422);
  });

  it("sem id na rota: 400", async () => {
    h.params = {};
    expect((await erroDe(chamar(aprovarPost, administrador))).status).toBe(400);
  });
});

describe("POST .../rejeitar", () => {
  it("marca rejeitado e NÃO apaga a linha", async () => {
    const r = await chamar<RespostaDecisaoPreCadastro>(rejeitarPost, administrador);
    expect(r.preCadastro).toMatchObject({ status: "rejeitado", decididoPor: "Pessoa administrador" });
    expect(fake.linhas("pre_cadastro_medicamentos")).toHaveLength(1);
    expect(fake.chamadas.some((c) => c.op === "delete")).toBe(false);
    expect(fake.linhas("compra_itens")[0]).toMatchObject({ medicamento_cadastro_id: null, pre_cadastro_id: "pre_teste_alfa" });
  });

  it("404 inexistente e 409 já decidido (com o status atual)", async () => {
    h.params = { id: "pre_nao_existe" };
    expect((await erroDe(chamar(rejeitarPost, administrador))).status).toBe(404);
    h.params = { id: "pre_teste_alfa" };
    await chamar(rejeitarPost, administrador);
    const segunda = await erroDe(chamar(rejeitarPost, administrador));
    expect(segunda.status).toBe(409);
    expect(segunda.data).toMatchObject({ code: "pre_cadastro_ja_decidido", status: "rejeitado" });
  });

  it("sem id na rota: 400", async () => {
    h.params = {};
    expect((await erroDe(chamar(rejeitarPost, administrador))).status).toBe(400);
  });
});

describe("os arquivos das rotas", () => {
  it("ficam sob o caminho estático `pre-medicamentos` (que vence o parâmetro [lista] no roteador do Nitro; o roteamento real é conferido no build)", () => {
    for (const arquivo of ["index.get.ts", "[id]/aprovar.post.ts", "[id]/rejeitar.post.ts"]) {
      expect(() => readFileSync(resolve(process.cwd(), "server/api/cadastros/pre-medicamentos", arquivo), "utf-8"), arquivo).not.toThrow();
    }
  });
});
