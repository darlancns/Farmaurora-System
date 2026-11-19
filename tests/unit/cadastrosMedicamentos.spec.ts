import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  colunasNovoCadastro,
  colunasPatchCadastro,
  colunasRenomearMedicamento,
  montarCadastro,
} from "../../server/utils/cadastroMappers";
import { LISTAS_NOME_MAIUSCULO, LISTAS_RENOMEAVEIS, TABELA_CADASTRO } from "../../shared/constants/cadastros";
import type { AuthUser } from "../../shared/types/auth";
import { nomeEmMaiusculas } from "../../shared/utils/cadastroNome";
import { validarNovoCadastro, validarPatchCadastro } from "../../shared/utils/cadastroValidacao";
import { FakeSupabase } from "./helpers/fakeSupabase";

// Lista MEDICAMENTOS dos Cadastros: nome em MAIÚSCULAS (renomeável pelo administrador, por UM UPDATE, sem RPC nem propagação) e
// temperatura = cópia do nome de uma temperatura ATIVA do Cadastro de Temperaturas (422 se não existe ou está inativa). Mapeadores
// e validação (puros) e API (handlers e store reais sobre o Supabase em memória). Só nomes "TESTE" e de medicamentos de exemplo.

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
const { default: impacto } = await import("../../server/api/cadastros/[lista]/[id]/impacto.get");
const { default: renomearContas } = await import("../../server/api/cadastros/[lista]/[id]/renomear-contas.post");
const { alterarCadastro, CadastroRegraError } = await import("../../server/utils/cadastrosStore");

const MED = TABELA_CADASTRO.medicamentos;
const TEMP = TABELA_CADASTRO.temperaturas;
const LISTA = { lista: "medicamentos" };

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

const AGORA_SEMEADO = "2026-11-01T00:00:00.000Z";
const chave = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function temperatura(id: string, nome: string, ativo = true): Record<string, unknown> {
  return { id, nome, nome_chave: chave(nome), ativo, atualizado_por: null, created_at: AGORA_SEMEADO, updated_at: AGORA_SEMEADO };
}
function medicamento(id: string, nome: string, temp: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    nome,
    nome_chave: chave(nome),
    temperatura: temp,
    ativo: true,
    atualizado_por: null,
    created_at: AGORA_SEMEADO,
    updated_at: AGORA_SEMEADO,
    ...extra,
  };
}

const T_FRIA = "2°C a 8°C";
const T_AMBIENTE = "Ambiente";

beforeEach(() => {
  fake.tabelas[MED] = [];
  fake.tabelas[TEMP] = [temperatura("temp_1", T_FRIA), temperatura("temp_2", T_AMBIENTE), temperatura("temp_3", "TESTE TEMP INATIVA", false)];
  fake.chamadas.length = 0;
  fake.chamadasRpc.length = 0;
});

describe("medicamentos — mapeadores (ponto silencioso 1)", () => {
  it("a tabela é cadastro_medicamentos; a lista é renomeável e de nome em MAIÚSCULAS", () => {
    expect(MED).toBe("cadastro_medicamentos");
    expect(LISTAS_RENOMEAVEIS).toContain("medicamentos");
    expect(LISTAS_NOME_MAIUSCULO).toEqual(["medicamentos"]);
  });

  it("montarCadastro: o modelo traz a temperatura (NULL no banco vira \"\")", () => {
    const row = medicamento("med_1", "DIPIRONA 500 MG", T_AMBIENTE, { atualizado_por: "Cris" });
    expect(montarCadastro("medicamentos", row as never)).toEqual({
      id: "med_1",
      nome: "DIPIRONA 500 MG",
      temperatura: T_AMBIENTE,
      ativo: true,
      atualizadoPor: "Cris",
      createdAt: AGORA_SEMEADO,
      updatedAt: AGORA_SEMEADO,
    });
    expect(montarCadastro("medicamentos", { ...row, temperatura: null } as never)).toMatchObject({ temperatura: "" });
  });

  it("colunasNovoCadastro: nome em MAIÚSCULAS, nome_chave sem acento nem caixa, TEMPERATURA e ativo (sem ela o INSERT dá 500)", () => {
    expect(colunasNovoCadastro("medicamentos", { nome: "ácido  fólico 5 mg", temperatura: T_FRIA })).toEqual({
      nome: "ÁCIDO  FÓLICO 5 MG",
      nome_chave: "acido folico 5 mg",
      temperatura: T_FRIA,
      ativo: true,
    });
  });

  it("colunasPatchCadastro: temperatura e ativo, e NUNCA nome nem nome_chave (o renomear tem caminho próprio)", () => {
    expect(colunasPatchCadastro("medicamentos", { temperatura: T_AMBIENTE })).toEqual({ temperatura: T_AMBIENTE });
    expect(colunasPatchCadastro("medicamentos", { ativo: false })).toEqual({ ativo: false });
    expect(colunasPatchCadastro("medicamentos", { nome: "OUTRO NOME" })).toEqual({});
    expect(colunasPatchCadastro("medicamentos", { nome: "X", temperatura: T_FRIA, ativo: true })).toEqual({ temperatura: T_FRIA, ativo: true });
  });

  it("colunasRenomearMedicamento: nome em MAIÚSCULAS e a chave dele", () => {
    expect(colunasRenomearMedicamento("  ácido Fólico ")).toEqual({ nome: "  ÁCIDO FÓLICO ", nome_chave: "acido folico" });
    expect(nomeEmMaiusculas("dipirona 500 mg")).toBe("DIPIRONA 500 MG");
  });

  it("o comportamento dos CONSULTORES não muda: nome continua fora das colunas do patch", () => {
    expect(colunasPatchCadastro("consultores", { nome: "Outro Nome", ativo: true })).toEqual({ ativo: true });
    expect(colunasPatchCadastro("consultores", { nome: "Outro Nome" })).toEqual({});
  });
});

describe("medicamentos — validação (ponto silencioso 2)", () => {
  it("criar: nome em MAIÚSCULAS (aparado, espaços colapsados) e temperatura aparada — a temperatura NÃO é descartada", () => {
    expect(validarNovoCadastro("medicamentos", { nome: "  dipirona   500 mg ", temperatura: "  2°C a 8°C " })).toEqual({
      ok: true,
      valor: { nome: "DIPIRONA 500 MG", temperatura: "2°C a 8°C" },
    });
  });

  it("criar: temperatura é obrigatória (ausente, vazia, só espaços, número, nula) e tem teto de 120 caracteres", () => {
    for (const temperatura of [undefined, null, "", "   ", 7, {}]) {
      const r = validarNovoCadastro("medicamentos", { nome: "DIPIRONA", temperatura });
      expect(r, String(temperatura)).toEqual({ ok: false, erro: "Informe a temperatura." });
    }
    expect(validarNovoCadastro("medicamentos", { nome: "DIPIRONA" })).toEqual({ ok: false, erro: "Informe a temperatura." });
    expect(validarNovoCadastro("medicamentos", { nome: "DIPIRONA", temperatura: "x".repeat(121) }).ok).toBe(false);
  });

  it("criar: nome vazio, comprido e 'Outro' (reservado, qualquer caixa) são recusados", () => {
    for (const nome of ["", "   ", "x".repeat(121), "Outro", "outro", "OUTRO"]) {
      expect(validarNovoCadastro("medicamentos", { nome, temperatura: T_FRIA }).ok, nome).toBe(false);
    }
  });

  it("criar: campo desconhecido (PIX, ativo) é recusado sem repetir o valor", () => {
    const r = validarNovoCadastro("medicamentos", { nome: "X", temperatura: "T", chavePix: "segredo" });
    expect(r).toEqual({ ok: false, erro: "Campo desconhecido: chavePix." });
  });

  it("alterar: aceita nome (em MAIÚSCULAS), temperatura e ativo", () => {
    expect(validarPatchCadastro("medicamentos", { nome: " dipirona   1 g " })).toEqual({ ok: true, valor: { nome: "DIPIRONA 1 G" } });
    expect(validarPatchCadastro("medicamentos", { temperatura: " Ambiente " })).toEqual({ ok: true, valor: { temperatura: "Ambiente" } });
    expect(validarPatchCadastro("medicamentos", { ativo: false })).toEqual({ ok: true, valor: { ativo: false } });
    expect(validarPatchCadastro("medicamentos", { nome: "x", temperatura: "T", ativo: true })).toEqual({
      ok: true,
      valor: { nome: "X", temperatura: "T", ativo: true },
    });
  });

  it("alterar: o nome novo passa pelas regras de um nome novo ('Outro', vazio, comprido) e a temperatura não pode ficar vazia", () => {
    for (const nome of ["Outro", "OUTRO", "  ", "x".repeat(121), 5]) expect(validarPatchCadastro("medicamentos", { nome }).ok, String(nome)).toBe(false);
    for (const temperatura of ["", "  ", null, 3]) {
      expect(validarPatchCadastro("medicamentos", { temperatura }), String(temperatura)).toEqual({ ok: false, erro: "Informe a temperatura." });
    }
    expect(validarPatchCadastro("medicamentos", {}).ok).toBe(false);
    expect(validarPatchCadastro("medicamentos", { chavePix: "x" }).ok).toBe(false);
  });

  it("os consultores continuam renomeáveis e NÃO ganham maiúsculas; as outras listas continuam sem renomear", () => {
    expect(validarPatchCadastro("consultores", { nome: "Mateus Teste" })).toEqual({ ok: true, valor: { nome: "Mateus Teste" } });
    expect(validarNovoCadastro("consultores", { nome: "Mateus Teste" })).toEqual({ ok: true, valor: { nome: "Mateus Teste" } });
    expect(validarPatchCadastro("cias-aereas", { nome: "  Latam  " })).toEqual({ ok: true, valor: { nome: "Latam" } });
  });
});

describe("medicamentos — API: ler e criar", () => {
  it("GET: qualquer cargo lê (com a temperatura), ativos primeiro e depois inativos, alfabética", async () => {
    fake.semear(MED, [
      medicamento("med_a", "ZOLPIDEM 10 MG", T_AMBIENTE),
      medicamento("med_b", "ALFA TESTE", T_FRIA, { ativo: false }),
      medicamento("med_c", "BETA TESTE", T_FRIA),
    ]);
    for (const role of ["administrador", ...NAO_ADMIN] as const) {
      const r = (await chamar(listar, conta(role), LISTA)) as Array<{ nome: string; temperatura: string }>;
      expect(r.map((i) => i.nome), role).toEqual(["BETA TESTE", "ZOLPIDEM 10 MG", "ALFA TESTE"]);
      expect(r[0]!.temperatura).toBe(T_FRIA);
    }
  });

  it("POST: o administrador cria — nome em MAIÚSCULAS, temperatura = nome gravado da temperatura, id med_, nasce ativo", async () => {
    const r = await chamar(criar, admin, LISTA, { nome: "teste medicamento", temperatura: T_FRIA });
    expect(r).toMatchObject({ nome: "TESTE MEDICAMENTO", temperatura: T_FRIA, ativo: true, atualizadoPor: "Cris Admin" });
    expect((r as { id: string }).id).toMatch(/^med_/);
    expect(fake.linhas(MED)[0]).toMatchObject({
      nome: "TESTE MEDICAMENTO",
      nome_chave: "teste medicamento",
      temperatura: T_FRIA,
      ativo: true,
      atualizado_por: "Cris Admin",
    });
  });

  it("POST: a temperatura é gravada com o nome do CADASTRO, mesmo que venha em outra caixa", async () => {
    await chamar(criar, admin, LISTA, { nome: "TESTE MEDICAMENTO", temperatura: "  ambiente " });
    expect(fake.linhas(MED)[0]!.temperatura).toBe(T_AMBIENTE);
  });

  it("POST: temperatura que NÃO existe → 422 e nada é gravado", async () => {
    const r = await erroDe(chamar(criar, admin, LISTA, { nome: "TESTE MEDICAMENTO", temperatura: "-196°C" }));
    expect(r.status).toBe(422);
    expect(r.msg).toBe("Temperatura não encontrada no Cadastro de Temperaturas.");
    expect(fake.linhas(MED)).toHaveLength(0);
  });

  it("POST: temperatura INATIVA → 422 e nada é gravado", async () => {
    const r = await erroDe(chamar(criar, admin, LISTA, { nome: "TESTE MEDICAMENTO", temperatura: "TESTE TEMP INATIVA" }));
    expect(r.status).toBe(422);
    expect(r.msg).toBe("Essa temperatura está inativa. Escolha uma temperatura ativa.");
    expect(fake.linhas(MED)).toHaveLength(0);
  });

  it("POST: temperatura ausente é 400 (a validação pura) e 'Outro' é reservado", async () => {
    expect((await erroDe(chamar(criar, admin, LISTA, { nome: "TESTE MEDICAMENTO" }))).status).toBe(400);
    expect((await erroDe(chamar(criar, admin, LISTA, { nome: "Outro", temperatura: T_FRIA }))).status).toBe(400);
  });

  it("POST: duplicado → 409 (nome_chave: sem acento, caixa e espaços), inclusive INATIVO, com a dica de reativar", async () => {
    await chamar(criar, admin, LISTA, { nome: "ácido fólico 5 mg", temperatura: T_FRIA });
    const dup = await erroDe(chamar(criar, admin, LISTA, { nome: "ACIDO   FOLICO 5 MG", temperatura: T_AMBIENTE }));
    expect(dup).toMatchObject({ status: 409, msg: "Já existe um item com esse nome." });

    fake.tabelas[MED]![0]!.ativo = false;
    const dupInativo = await erroDe(chamar(criar, admin, LISTA, { nome: "Ácido Fólico 5 mg", temperatura: T_FRIA }));
    expect(dupInativo.status).toBe(409);
    expect(dupInativo.msg).toMatch(/inativo.*Reative-o/);
    expect(fake.linhas(MED)).toHaveLength(1);
  });

  it("POST: sócio, operacional, consultor e sem login levam 403 — nada é gravado", async () => {
    const proibidos: Array<AuthUser | null> = [...NAO_ADMIN.map((r) => conta(r)), null];
    for (const user of proibidos) {
      expect((await erroDe(chamar(criar, user, LISTA, { nome: "TESTE MEDICAMENTO", temperatura: T_FRIA }))).status).toBe(403);
    }
    expect(fake.linhas(MED)).toHaveLength(0);
  });
});

describe("medicamentos — API: alterar e renomear (UPDATE único, sem RPC)", () => {
  const PATCH = (id: string) => ({ ...LISTA, id });
  const updates = () => fake.chamadas.filter((c) => c.tabela === MED && c.op === "update");

  beforeEach(() => {
    fake.semear(MED, [medicamento("med_1", "DIPIRONA 500 MG", T_AMBIENTE), medicamento("med_2", "ZOLPIDEM 10 MG", T_FRIA)]);
  });

  it("renomear: UM update com nome, nome_chave, updated_at e atualizado_por; o resto da linha não muda", async () => {
    const antes = { ...fake.linhas(MED)[0]! };
    const r = await chamar(alterar, admin, PATCH("med_1"), { nome: "dipirona 1 g" });
    expect(r).toMatchObject({ id: "med_1", nome: "DIPIRONA 1 G", temperatura: T_AMBIENTE, ativo: true, atualizadoPor: "Cris Admin" });

    expect(updates()).toHaveLength(1);
    expect(fake.chamadasRpc).toEqual([]); // sem RPC (isso é dos consultores)
    expect(fake.chamadas.filter((c) => c.op === "delete" || c.op === "insert" || c.op === "upsert")).toEqual([]);
    const depois = fake.linhas(MED)[0]!;
    expect(depois).toMatchObject({ nome: "DIPIRONA 1 G", nome_chave: "dipirona 1 g", atualizado_por: "Cris Admin" });
    expect(depois.updated_at).not.toBe(antes.updated_at);
    expect(depois).toMatchObject({ temperatura: antes.temperatura, ativo: antes.ativo, created_at: antes.created_at, id: antes.id });
    expect(fake.linhas(MED)[1]!.nome).toBe("ZOLPIDEM 10 MG"); // o outro medicamento não foi tocado
  });

  it("renomear + trocar a temperatura + desativar: continua UM update só", async () => {
    await chamar(alterar, admin, PATCH("med_1"), { nome: "dipirona 1 g", temperatura: T_FRIA, ativo: false });
    expect(updates()).toHaveLength(1);
    expect(fake.linhas(MED)[0]).toMatchObject({ nome: "DIPIRONA 1 G", temperatura: T_FRIA, ativo: false });
  });

  it("nome que já é de OUTRO medicamento → 409 (ativo, e inativo com mensagem própria); nada é gravado", async () => {
    const ativo = await erroDe(chamar(alterar, admin, PATCH("med_1"), { nome: "zolpidem 10 mg" }));
    expect(ativo).toMatchObject({ status: 409, msg: "Já existe outro medicamento com esse nome." });

    fake.tabelas[MED]![1]!.ativo = false;
    const inativo = await erroDe(chamar(alterar, admin, PATCH("med_1"), { nome: "ZOLPIDEM 10 MG" }));
    expect(inativo).toMatchObject({ status: 409, msg: "Já existe outro medicamento inativo com esse nome." });

    expect(updates()).toHaveLength(0);
    expect(fake.linhas(MED)[0]!.nome).toBe("DIPIRONA 500 MG");
  });

  it("corrida: o índice único recusa no UPDATE (23505) e vira 409", async () => {
    const from = fake.from.bind(fake);
    const spy = vi.spyOn(fake, "from").mockImplementation(((tabela: string) =>
      tabela !== MED
        ? from(tabela)
        : Object.assign(from(tabela), {
            update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: null, error: { message: "duplicate key", code: "23505" } }) }) }),
          })) as unknown as typeof fake.from);
    try {
      expect(await erroDe(chamar(alterar, admin, PATCH("med_1"), { nome: "DIPIRONA 2 G" }))).toMatchObject({ status: 409 });
    } finally {
      spy.mockRestore();
    }
  });

  it("corrigir só acento/caixa (mesma chave do PRÓPRIO medicamento) é permitido", async () => {
    fake.semear(MED, [medicamento("med_3", "ACIDO FOLICO 5 MG", T_FRIA)]);
    const r = await chamar(alterar, admin, PATCH("med_3"), { nome: "ácido fólico 5 mg" });
    expect(r).toMatchObject({ nome: "ÁCIDO FÓLICO 5 MG" });
    expect(fake.linhas(MED)[2]).toMatchObject({ nome: "ÁCIDO FÓLICO 5 MG", nome_chave: "acido folico 5 mg" });
  });

  it("o mesmo nome (em qualquer caixa) é ignorado: nenhuma gravação", async () => {
    const r = await chamar(alterar, admin, PATCH("med_1"), { nome: "dipirona 500 mg" });
    expect(r).toMatchObject({ nome: "DIPIRONA 500 MG" });
    expect(updates()).toHaveLength(0);
  });

  it("trocar a temperatura valida contra as ATIVAS: existente e ativa passa (com o nome do Cadastro); inexistente e inativa são 422", async () => {
    expect(await chamar(alterar, admin, PATCH("med_1"), { temperatura: "2°c a 8°c" })).toMatchObject({ temperatura: T_FRIA });
    expect(fake.linhas(MED)[0]!.temperatura).toBe(T_FRIA);

    const inexistente = await erroDe(chamar(alterar, admin, PATCH("med_1"), { temperatura: "-196°C" }));
    expect(inexistente).toMatchObject({ status: 422, msg: "Temperatura não encontrada no Cadastro de Temperaturas." });
    const inativa = await erroDe(chamar(alterar, admin, PATCH("med_1"), { temperatura: "TESTE TEMP INATIVA" }));
    expect(inativa).toMatchObject({ status: 422, msg: "Essa temperatura está inativa. Escolha uma temperatura ativa." });
    expect(fake.linhas(MED)[0]!.temperatura).toBe(T_FRIA); // a recusa não gravou nada
  });

  it("temperatura IGUAL à gravada é ignorada, mesmo se a temperatura foi desativada depois (o medicamento continua editável)", async () => {
    fake.tabelas[TEMP]!.find((t) => t.nome === T_AMBIENTE)!.ativo = false;
    const r = await chamar(alterar, admin, PATCH("med_1"), { nome: "dipirona 1 g", temperatura: T_AMBIENTE });
    expect(r).toMatchObject({ nome: "DIPIRONA 1 G", temperatura: T_AMBIENTE });
    expect(fake.chamadas.filter((c) => c.tabela === TEMP)).toEqual([]); // nem consultou as temperaturas
  });

  it("desativar e reativar (sem apagar nada)", async () => {
    expect(await chamar(alterar, admin, PATCH("med_1"), { ativo: false })).toMatchObject({ ativo: false, nome: "DIPIRONA 500 MG" });
    expect(await chamar(alterar, admin, PATCH("med_1"), { ativo: true })).toMatchObject({ ativo: true });
    expect(fake.linhas(MED)).toHaveLength(2);
    expect(fake.chamadas.filter((c) => c.op === "delete")).toEqual([]);
  });

  it("'Outro' e nome vazio ao renomear são 400; inexistente é 404; sócio, operacional, consultor e sem login levam 403", async () => {
    expect((await erroDe(chamar(alterar, admin, PATCH("med_1"), { nome: "Outro" }))).status).toBe(400);
    expect((await erroDe(chamar(alterar, admin, PATCH("med_1"), { nome: "   " }))).status).toBe(400);
    expect((await erroDe(chamar(alterar, admin, PATCH("nao_existe"), { nome: "TESTE" }))).status).toBe(404);
    for (const user of [...NAO_ADMIN.map((r) => conta(r)), null]) {
      expect((await erroDe(chamar(alterar, user, PATCH("med_1"), { nome: "TESTE" }))).status).toBe(403);
    }
    expect(updates()).toHaveLength(0);
  });

  it("o store devolve null (404) para id inexistente, sem gravar", async () => {
    expect(await alterarCadastro("medicamentos", "nao_existe", { ativo: false }, "Cris")).toBeNull();
    expect(updates()).toHaveLength(0);
  });

  it("falha do banco no update sobe como erro comum (500), não como regra", async () => {
    fake.falhar(MED, "update", "falha injetada");
    await expect(chamar(alterar, admin, PATCH("med_1"), { ativo: false })).rejects.not.toBeInstanceOf(CadastroRegraError);
  });
});

describe("medicamentos — as rotas de renomear são SÓ dos consultores", () => {
  it("impacto e renomear-contas respondem 404 para medicamentos e temperaturas (e não tocam o banco)", async () => {
    fake.semear(MED, [medicamento("med_1", "DIPIRONA 500 MG", T_AMBIENTE)]);
    for (const lista of ["medicamentos", "temperaturas"]) {
      expect((await erroDe(chamar(impacto, admin, { lista, id: "med_1" }))).status, lista).toBe(404);
      expect((await erroDe(chamar(renomearContas, admin, { lista, id: "med_1" }, { nomeAntigo: "X" }))).status, lista).toBe(404);
    }
    expect(fake.chamadas).toEqual([]);
    expect(fake.chamadasRpc).toEqual([]);
  });

  it("renomear um medicamento NUNCA chama a função renomear_consultor nem mexe em follow_up, prestação, DIR ou contas", async () => {
    fake.semear(MED, [medicamento("med_1", "DIPIRONA 500 MG", T_AMBIENTE)]);
    await chamar(alterar, admin, { ...LISTA, id: "med_1" }, { nome: "DIPIRONA 1 G" });
    expect(fake.chamadasRpc).toEqual([]);
    const tabelas = new Set(fake.chamadas.map((c) => c.tabela));
    expect([...tabelas].sort()).toEqual([MED]);
  });
});
