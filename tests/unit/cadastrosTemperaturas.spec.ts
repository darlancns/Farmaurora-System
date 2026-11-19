import { beforeEach, describe, expect, it, vi } from "vitest";
import { colunasNovoCadastro, colunasPatchCadastro, montarCadastro } from "../../server/utils/cadastroMappers";
import { TABELA_CADASTRO } from "../../shared/constants/cadastros";
import type { AuthUser } from "../../shared/types/auth";
import { validarNovoCadastro, validarPatchCadastro } from "../../shared/utils/cadastroValidacao";
import { colunasDaLista, linhaSecundaria } from "../../app/utils/cadastroColunas";
import { formDeItem, formVazio, listaTemEdicao, montarAlteracao, montarNovo } from "../../app/utils/cadastroForm";
import { FakeSupabase } from "./helpers/fakeSupabase";

// Lista TEMPERATURAS dos Cadastros: nome + ativo. O NOME NÃO MUDA (o medicamento guarda uma cópia do texto): só ativar e
// desativar. Mapeadores, validação, funções da tela e API (handlers e store reais sobre o Supabase em memória).

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

const T = TABELA_CADASTRO.temperaturas;
const LISTA = { lista: "temperaturas" };

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

function linha(id: string, nome: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    nome,
    nome_chave: nome.toLowerCase(),
    ativo: true,
    atualizado_por: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

beforeEach(() => {
  fake.tabelas[T] = [];
  fake.chamadas.length = 0;
});

describe("temperaturas — mapeadores (ponto silencioso 1)", () => {
  it("a tabela é cadastro_temperaturas", () => {
    expect(T).toBe("cadastro_temperaturas");
  });

  it("montarCadastro: o modelo da temperatura é só o básico (sem campo extra)", () => {
    expect(montarCadastro("temperaturas", linha("temp_1", "2°C a 8°C", { atualizado_por: "Cris" }) as never)).toEqual({
      id: "temp_1",
      nome: "2°C a 8°C",
      ativo: true,
      atualizadoPor: "Cris",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    });
  });

  it("colunasNovoCadastro: nome, nome_chave (sem acento nem caixa) e ativo — nada mais", () => {
    expect(colunasNovoCadastro("temperaturas", { nome: "Ambiente  Controlado" })).toEqual({
      nome: "Ambiente  Controlado",
      nome_chave: "ambiente controlado",
      ativo: true,
    });
  });

  it("colunasPatchCadastro: só `ativo`; o nome nunca vira coluna", () => {
    expect(colunasPatchCadastro("temperaturas", { ativo: false })).toEqual({ ativo: false });
    expect(colunasPatchCadastro("temperaturas", { nome: "Outro nome" })).toEqual({});
    expect(colunasPatchCadastro("temperaturas", { nome: "X", ativo: true })).toEqual({ ativo: true });
  });
});

describe("temperaturas — validação (ponto silencioso 2)", () => {
  it("criar: só o nome (aparado, espaços colapsados)", () => {
    expect(validarNovoCadastro("temperaturas", { nome: "  2°C   a 8°C " })).toEqual({ ok: true, valor: { nome: "2°C a 8°C" } });
  });

  it("criar: nome vazio, comprido e 'Outro' (reservado, qualquer caixa) são recusados", () => {
    for (const nome of ["", "   ", "x".repeat(121), "Outro", "OUTRO"]) {
      expect(validarNovoCadastro("temperaturas", { nome }).ok, nome).toBe(false);
    }
  });

  it("criar: campo que não é da lista é recusado (a temperatura não tem `temperatura` nem PIX)", () => {
    for (const extra of [{ temperatura: "x" }, { chavePix: "x" }, { ativo: true }]) {
      const r = validarNovoCadastro("temperaturas", { nome: "N", ...extra });
      expect(r.ok).toBe(false);
      expect((r as { erro: string }).erro).toMatch(/Campo desconhecido/);
    }
  });

  it("alterar: aceita nome (para o servidor recusar a troca) e ativo; nada além disso", () => {
    expect(validarPatchCadastro("temperaturas", { ativo: false })).toEqual({ ok: true, valor: { ativo: false } });
    expect(validarPatchCadastro("temperaturas", { nome: " X " })).toEqual({ ok: true, valor: { nome: "X" } });
    expect(validarPatchCadastro("temperaturas", { temperatura: "X" }).ok).toBe(false);
    expect(validarPatchCadastro("temperaturas", {}).ok).toBe(false);
    expect(validarPatchCadastro("temperaturas", { ativo: "sim" }).ok).toBe(false);
  });
});

describe("temperaturas — funções da tela (pontos silenciosos 3 e 4)", () => {
  const item = { id: "temp_1", nome: "2°C a 8°C", ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" };

  it("colunasDaLista e linhaSecundaria: só Nome e Ativo, sem segunda linha no celular", () => {
    expect(colunasDaLista("temperaturas")).toEqual([]);
    expect(colunasDaLista("temperaturas", true)).toEqual([]);
    expect(linhaSecundaria("temperaturas", item, true)).toBe("");
  });

  it("formulário: criar valida o nome; editar não tem campo (o nome não muda)", () => {
    expect(montarNovo("temperaturas", { ...formVazio(), nome: " Ambiente " })).toEqual({ ok: true, valor: { nome: "Ambiente" } });
    expect(montarNovo("temperaturas", { ...formVazio(), nome: "outro" }).ok).toBe(false);
    expect(formDeItem("temperaturas", item).nome).toBe("2°C a 8°C");
    expect(listaTemEdicao("temperaturas")).toBe(false);
    expect(listaTemEdicao("temperaturas", true)).toBe(false);
    expect(montarAlteracao("temperaturas", formDeItem("temperaturas", item), item).ok).toBe(false);
  });
});

describe("temperaturas — API", () => {
  it("GET: qualquer cargo lê, ativos primeiro e depois inativos, em ordem alfabética", async () => {
    fake.semear(T, [linha("temp_a", "Zeta"), linha("temp_b", "Alfa", { ativo: false }), linha("temp_c", "Beta")]);
    for (const role of ["administrador", ...NAO_ADMIN] as const) {
      const r = (await chamar(listar, conta(role), LISTA)) as Array<{ nome: string }>;
      expect(r.map((i) => i.nome), role).toEqual(["Beta", "Zeta", "Alfa"]);
    }
  });

  it("POST: o administrador cria (nasce ativa, id temp_, nome_chave, quem gravou)", async () => {
    const r = await chamar(criar, admin, LISTA, { nome: "TESTE TEMP" });
    expect(r).toMatchObject({ nome: "TESTE TEMP", ativo: true, atualizadoPor: "Cris Admin" });
    expect((r as { id: string }).id).toMatch(/^temp_/);
    expect(fake.linhas(T)[0]).toMatchObject({ nome_chave: "teste temp", ativo: true, atualizado_por: "Cris Admin" });
    expect(fake.linhas(T)[0]).not.toHaveProperty("temperatura");
  });

  it("POST: sócio, operacional, consultor e sem login levam 403 — nada é gravado", async () => {
    const proibidos: Array<AuthUser | null> = [...NAO_ADMIN.map((r) => conta(r)), null];
    for (const user of proibidos) {
      expect((await erroDe(chamar(criar, user, LISTA, { nome: "TESTE TEMP" }))).status, user?.role ?? "sem login").toBe(403);
    }
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("POST: 400 'Outro' reservado; 409 duplicado por nome_chave (sem acento/caixa), inclusive INATIVO (com a dica de reativar)", async () => {
    expect((await erroDe(chamar(criar, admin, LISTA, { nome: "Outro" }))).status).toBe(400);
    await chamar(criar, admin, LISTA, { nome: "Ambiente" });
    const dup = await erroDe(chamar(criar, admin, LISTA, { nome: "AMBIENTE" }));
    expect(dup).toMatchObject({ status: 409 });
    expect(dup.msg).toBe("Já existe um item com esse nome.");

    fake.tabelas[T]![0]!.ativo = false;
    const dupInativo = await erroDe(chamar(criar, admin, LISTA, { nome: "ambiente" }));
    expect(dupInativo.status).toBe(409);
    expect(dupInativo.msg).toMatch(/inativo.*Reative-o/);
    expect(fake.linhas(T)).toHaveLength(1);
  });

  it("PATCH: desativa e reativa sem apagar nada (nenhuma exclusão)", async () => {
    fake.semear(T, [linha("temp_1", "Ambiente")]);
    expect(await chamar(alterar, admin, { ...LISTA, id: "temp_1" }, { ativo: false })).toMatchObject({ ativo: false, atualizadoPor: "Cris Admin" });
    expect(await chamar(alterar, admin, { ...LISTA, id: "temp_1" }, { ativo: true })).toMatchObject({ ativo: true });
    expect(fake.linhas(T)).toHaveLength(1);
    expect(fake.chamadas.filter((c) => c.op === "delete")).toEqual([]);
  });

  it("PATCH: o nome NÃO muda — outro valor é 422 e nada é gravado; o mesmo valor é aceito (ignorado)", async () => {
    fake.semear(T, [linha("temp_1", "Ambiente")]);
    const r = await erroDe(chamar(alterar, admin, { ...LISTA, id: "temp_1" }, { nome: "Ambiente Controlado" }));
    expect(r.status).toBe(422);
    expect(r.msg).toMatch(/não pode ser alterado/);
    expect(fake.linhas(T)[0]).toMatchObject({ nome: "Ambiente", nome_chave: "ambiente" });

    expect(await chamar(alterar, admin, { ...LISTA, id: "temp_1" }, { nome: "Ambiente" })).toMatchObject({ nome: "Ambiente" });
  });

  it("PATCH: nem trocando só a caixa ou o acento (temperatura NÃO é renomeável nesta etapa)", async () => {
    fake.semear(T, [linha("temp_1", "Ambiente")]);
    expect((await erroDe(chamar(alterar, admin, { ...LISTA, id: "temp_1" }, { nome: "AMBIENTE" }))).status).toBe(422);
  });

  it("PATCH: sócio, operacional, consultor e sem login levam 403; item inexistente é 404", async () => {
    fake.semear(T, [linha("temp_1", "Ambiente")]);
    for (const user of [...NAO_ADMIN.map((r) => conta(r)), null]) {
      expect((await erroDe(chamar(alterar, user, { ...LISTA, id: "temp_1" }, { ativo: false }))).status).toBe(403);
    }
    expect(fake.linhas(T)[0]!.ativo).toBe(true);
    expect((await erroDe(chamar(alterar, admin, { ...LISTA, id: "nao_existe" }, { ativo: false }))).status).toBe(404);
  });
});
