import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fakeSupabase";

// cadastrosStore com o cliente Supabase em memória (tests/unit/helpers/fakeSupabase.ts); nada de rede.
// Cobre: lista ordenada (ativos primeiro), criar (nasce ativo, nome_chave, 409 duplicado incluindo inativo),
// alterar (o NOME não muda: 422), desativar/reativar sem apagar nada e NENHUMA chamada de exclusão.

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { listarCadastro, criarCadastro, alterarCadastro, CadastroRegraError } = await import("../../server/utils/cadastrosStore");

const AGORA = new Date("2026-11-09T15:00:00.000Z");
const T = { fornecedores: "cadastro_fornecedores", despachantes: "cadastro_despachantes", "cias-aereas": "cadastro_cias_aereas" };

function semearFornecedor(id: string, nome: string, extra: Record<string, unknown> = {}): void {
  fake.semear(T.fornecedores, [
    {
      id,
      nome,
      nome_chave: nome.toLowerCase(),
      pais: null,
      prazo_alerta_dias: null,
      sem_alerta: true,
      ativo: true,
      atualizado_por: null,
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
      ...extra,
    },
  ]);
}

async function statusDe(promessa: Promise<unknown>): Promise<number> {
  try {
    await promessa;
  } catch (e) {
    return (e as { statusCode?: number }).statusCode ?? 0;
  }
  throw new Error("esperava um erro de regra, mas a chamada passou");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  for (const t of Object.values(T)) fake.tabelas[t] = [];
  fake.chamadas.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("listarCadastro", () => {
  it("ordem alfabética pt-BR, ativos primeiro e inativos depois; devolve o modelo (camelCase)", async () => {
    semearFornecedor("f1", "Zeta");
    semearFornecedor("f2", "Alfa", { ativo: false });
    semearFornecedor("f3", "Beta", { pais: "Índia", prazo_alerta_dias: 3, sem_alerta: false });
    const lista = await listarCadastro("fornecedores");
    expect(lista.map((f) => f.nome)).toEqual(["Beta", "Zeta", "Alfa"]);
    expect(lista[0]).toMatchObject({ pais: "Índia", prazoAlertaDias: 3, semAlerta: false, ativo: true });
    expect(lista[2]!.ativo).toBe(false);
  });

  it("lista vazia", async () => {
    expect(await listarCadastro("cias-aereas")).toEqual([]);
  });
});

describe("criarCadastro", () => {
  it("fornecedor: nasce ativo, com nome_chave, quem gravou e as datas", async () => {
    const f = await criarCadastro(
      "fornecedores",
      { nome: "Speciality", pais: "Índia", prazoAlertaDias: 3, semAlerta: false },
      "Cris",
    );
    expect(f).toMatchObject({ nome: "Speciality", pais: "Índia", prazoAlertaDias: 3, semAlerta: false, ativo: true, atualizadoPor: "Cris" });
    expect(f.id).toMatch(/^forn_/);
    expect(f.createdAt).toBe(AGORA.toISOString());

    const gravada = fake.linhas(T.fornecedores)[0]!;
    expect(gravada).toMatchObject({ nome_chave: "speciality", ativo: true, sem_alerta: false, prazo_alerta_dias: 3, atualizado_por: "Cris" });
  });

  it("fornecedor sem alerta grava prazo NULL (CHECK do banco)", async () => {
    await criarCadastro("fornecedores", { nome: "Matsun", prazoAlertaDias: null, semAlerta: true }, "Cris");
    expect(fake.linhas(T.fornecedores)[0]).toMatchObject({ sem_alerta: true, prazo_alerta_dias: null });
  });

  it("despachante e cia aérea usam o prefixo e a tabela certos", async () => {
    const d = await criarCadastro("despachantes", { nome: "STAR CUSTOMS", telefone: "11 3333-4444" }, "Cris");
    const t = await criarCadastro("cias-aereas", { nome: "Ambiente" }, "Cris");
    expect(d.id).toMatch(/^desp_/);
    expect(t.id).toMatch(/^cia_/);
    expect(fake.linhas(T.despachantes)[0]).toMatchObject({ telefone: "11 3333-4444", contato_nome: null, email: null });
    expect(fake.linhas(T["cias-aereas"])).toHaveLength(1);
  });

  it("nome repetido (mesma nome_chave: outra caixa/acento/espaços) é 409 e nada é gravado", async () => {
    await criarCadastro("cias-aereas", { nome: "Ambiente" }, "Cris");
    expect(await statusDe(criarCadastro("cias-aereas", { nome: "  AMBIENTE " }, "Cris"))).toBe(409);
    await criarCadastro("fornecedores", { nome: "Beldimed Bélgica", prazoAlertaDias: 7, semAlerta: false }, "Cris");
    expect(await statusDe(criarCadastro("fornecedores", { nome: "beldimed   belgica", prazoAlertaDias: 7, semAlerta: false }, "Cris"))).toBe(409);
    expect(fake.linhas(T["cias-aereas"])).toHaveLength(1);
    expect(fake.linhas(T.fornecedores)).toHaveLength(1);
  });

  it("duplicado INATIVO também é 409, com a mensagem de reativar", async () => {
    semearFornecedor("f1", "Poros", { ativo: false, nome_chave: "poros" });
    try {
      await criarCadastro("fornecedores", { nome: "Poros", prazoAlertaDias: 3, semAlerta: false }, "Cris");
      throw new Error("deveria recusar");
    } catch (e) {
      expect(e).toBeInstanceOf(CadastroRegraError);
      expect((e as { statusCode: number }).statusCode).toBe(409);
      expect((e as Error).message).toMatch(/inativo.*Reative/);
    }
  });

  it("o mesmo nome em listas DIFERENTES não conflita (cada tabela tem a sua unicidade)", async () => {
    await criarCadastro("cias-aereas", { nome: "Ambiente" }, "Cris");
    await expect(criarCadastro("despachantes", { nome: "Ambiente" }, "Cris")).resolves.toMatchObject({ nome: "Ambiente" });
  });

  it("violação do índice único no insert (corrida) vira 409", async () => {
    // O pré-check não vê nada, mas o banco recusa o insert: simulamos o código 23505 do Postgres.
    const from = fake.from.bind(fake);
    const spy = vi.spyOn(fake, "from").mockImplementation(((tabela: string) =>
      Object.assign(from(tabela), {
        insert: () => Promise.resolve({ data: null, error: { message: "duplicate key", code: "23505" } }),
      })) as unknown as typeof fake.from);
    try {
      expect(await statusDe(criarCadastro("cias-aereas", { nome: "Ambiente" }, "Cris"))).toBe(409);
    } finally {
      spy.mockRestore();
    }
  });

  it("erro do banco que não é duplicado sobe como erro comum (500)", async () => {
    fake.falhar(T["cias-aereas"], "insert", "falha injetada");
    await expect(criarCadastro("cias-aereas", { nome: "Ambiente" }, "Cris")).rejects.toThrow(/falha injetada/);
  });
});

describe("alterarCadastro", () => {
  it("altera país e alerta; grava quem alterou e updated_at; o nome fica como está", async () => {
    semearFornecedor("f1", "Poros");
    const f = await alterarCadastro("fornecedores", "f1", { pais: "Turquia", semAlerta: false, prazoAlertaDias: 3 }, "Rebeca");
    expect(f).toMatchObject({ nome: "Poros", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false, atualizadoPor: "Rebeca" });
    expect(f!.updatedAt).toBe(AGORA.toISOString());
    expect(fake.linhas(T.fornecedores)[0]).toMatchObject({ nome: "Poros", nome_chave: "poros", sem_alerta: false, prazo_alerta_dias: 3 });
  });

  it("trocar para 'sem alerta' zera o prazo", async () => {
    semearFornecedor("f1", "Poros", { sem_alerta: false, prazo_alerta_dias: 3 });
    await alterarCadastro("fornecedores", "f1", { semAlerta: true, prazoAlertaDias: null }, "Cris");
    expect(fake.linhas(T.fornecedores)[0]).toMatchObject({ sem_alerta: true, prazo_alerta_dias: null });
  });

  it("o NOME não muda: nome diferente é 422 e NADA é gravado", async () => {
    semearFornecedor("f1", "Poros");
    expect(await statusDe(alterarCadastro("fornecedores", "f1", { nome: "Poros Pharma", pais: "Turquia" }, "Cris"))).toBe(422);
    expect(await statusDe(alterarCadastro("fornecedores", "f1", { nome: "POROS" }, "Cris"))).toBe(422);
    expect(fake.linhas(T.fornecedores)[0]).toMatchObject({ nome: "Poros", pais: null });
    expect(fake.chamadas.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("nome igual ao gravado é ignorado (não é alteração) e os outros campos passam", async () => {
    semearFornecedor("f1", "Poros");
    const f = await alterarCadastro("fornecedores", "f1", { nome: "Poros", pais: "Turquia" }, "Cris");
    expect(f).toMatchObject({ nome: "Poros", pais: "Turquia" });
  });

  it("só o nome igual, sem mais nada: devolve o item sem gravar", async () => {
    semearFornecedor("f1", "Poros");
    const f = await alterarCadastro("fornecedores", "f1", { nome: "Poros" }, "Cris");
    expect(f).toMatchObject({ nome: "Poros" });
    expect(fake.chamadas.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("desativar e reativar: é só um update de `ativo`, o item continua na tabela", async () => {
    fake.semear(T["cias-aereas"], [
      { id: "t1", nome: "Ambiente", nome_chave: "ambiente", ativo: true, atualizado_por: null, created_at: "x", updated_at: "x" },
    ]);
    const off = await alterarCadastro("cias-aereas", "t1", { ativo: false }, "Cris");
    expect(off).toMatchObject({ ativo: false, atualizadoPor: "Cris" });
    expect(fake.linhas(T["cias-aereas"])).toHaveLength(1);
    const on = await alterarCadastro("cias-aereas", "t1", { ativo: true }, "Cris");
    expect(on).toMatchObject({ ativo: true });
    expect(fake.linhas(T["cias-aereas"])).toHaveLength(1);
  });

  it("item inexistente devolve null (404 no handler)", async () => {
    expect(await alterarCadastro("fornecedores", "nao-existe", { ativo: false }, "Cris")).toBeNull();
  });

  it("despachante: contato, telefone e e-mail (esvaziar grava NULL)", async () => {
    fake.semear(T.despachantes, [
      { id: "d1", nome: "STAR", nome_chave: "star", contato_nome: "A", telefone: "1", email: "a@b.co", ativo: true, atualizado_por: null, created_at: "x", updated_at: "x" },
    ]);
    const d = await alterarCadastro("despachantes", "d1", { contatoNome: "", telefone: "11 3333-4444" }, "Cris");
    expect(d).toMatchObject({ contatoNome: "", telefone: "11 3333-4444", email: "a@b.co" });
    expect(fake.linhas(T.despachantes)[0]).toMatchObject({ contato_nome: null });
  });
});

describe("não existe exclusão", () => {
  it("criar, alterar, desativar e listar nunca emitem delete", async () => {
    const f = await criarCadastro("fornecedores", { nome: "Poros", prazoAlertaDias: 3, semAlerta: false }, "Cris");
    await alterarCadastro("fornecedores", f.id, { ativo: false }, "Cris");
    await alterarCadastro("fornecedores", f.id, { ativo: true }, "Cris");
    await listarCadastro("fornecedores");
    expect(fake.chamadas.filter((c) => c.op === "delete")).toHaveLength(0);
  });
});
