import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fakeSupabase";

// A decisão dos pré-cadastros de medicamento (aprovar, vincular, rejeitar) no store, com o Supabase simulado: o que cada decisão grava, os
// conflitos e a ordem dos passos — repetir depois de uma falha injetada em CADA passo termina consistente. Dados fictícios (TESTE).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { aprovarPreCadastro, listarPreCadastros, rejeitarPreCadastro, idDoMedicamentoDoPreCadastro } = await import("../../server/utils/preCadastroDecisao");

type Linha = Record<string, unknown>;
const ADM = "Adm Teste";
const ANTIGA = "2026-11-10T10:00:00.000Z";

const chave = (nome: string): string =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const pre = (id: string, nome: string, extra: Linha = {}): Linha => ({
  id,
  nome,
  nome_chave: chave(nome),
  temperatura: "2°C a 8°C",
  status: "pendente",
  compra_id: "compra_1",
  cadastro_id: null,
  solicitado_por: "Op Teste",
  decidido_por: null,
  decidido_em: null,
  created_at: "2026-11-12T12:00:00.000Z",
  updated_at: "2026-11-12T12:00:00.000Z",
  ...extra,
});

const medicamento = (id: string, nome: string, ativo = true): Linha => ({ id, nome, nome_chave: chave(nome), temperatura: "Ambiente", ativo, atualizado_por: "Alguém", created_at: ANTIGA, updated_at: ANTIGA });
const temperatura = (id: string, nome: string, ativo = true): Linha => ({ id, nome, nome_chave: chave(nome), ativo, atualizado_por: "Alguém", created_at: ANTIGA, updated_at: ANTIGA });
const compra = (id: string, sequencia: number): Linha => ({ id, ano_mes: "2026-11", sequencia, paciente: "TESTE PACIENTE", updated_at: ANTIGA });
const item = (id: string, compraId: string, extra: Linha = {}): Linha => ({ id, compra_id: compraId, posicao: 1, medicamento: "TESTE MEDICAMENTO ALFA", medicamento_cadastro_id: null, pre_cadastro_id: null, ...extra });

const PRE_ALFA = "pre_teste_alfa";
const MED_ALFA = idDoMedicamentoDoPreCadastro(PRE_ALFA);

function semear(): void {
  for (const k of Object.keys(fake.tabelas)) delete fake.tabelas[k];
  fake.chamadas.length = 0;
  fake.semear("cadastro_temperaturas", [temperatura("temp_1", "2°C a 8°C"), temperatura("temp_2", "Ambiente"), temperatura("temp_3", "Congelado -20°C", false)]);
  fake.semear("cadastro_medicamentos", [medicamento("med_gama", "TESTE MEDICAMENTO GAMA"), medicamento("med_delta", "TESTE MEDICAMENTO DELTA", false)]);
  fake.semear("compras", [compra("compra_1", 7), compra("compra_2", 8), compra("compra_3", 9)]);
  fake.semear("pre_cadastro_medicamentos", [pre(PRE_ALFA, "TESTE MEDICAMENTO ALFA"), pre("pre_teste_beta", "TESTE MEDICAMENTO BETA", { created_at: "2026-11-13T12:00:00.000Z" })]);
  fake.semear("compra_itens", [
    item("it_1", "compra_1", { pre_cadastro_id: PRE_ALFA }),
    item("it_2", "compra_2", { pre_cadastro_id: PRE_ALFA }), // outra compra com o MESMO pendente
    item("it_3", "compra_3", { pre_cadastro_id: "pre_teste_beta", medicamento: "TESTE MEDICAMENTO BETA" }), // de outro pré-cadastro: nunca muda
    item("it_4", "compra_3", { medicamento: "TESTE DO CADASTRO", medicamento_cadastro_id: "med_gama" }),
  ]);
}

const linhas = (tabela: string): Linha[] => fake.linhas(tabela);
const porId = (tabela: string, id: string): Linha => linhas(tabela).find((l) => l.id === id)!;
const escritasEm = (tabela: string): string[] => fake.chamadas.filter((c) => c.tabela === tabela && c.op !== "select").map((c) => c.op);

async function erroDe(p: Promise<unknown>): Promise<{ status: number; msg: string; data: Record<string, unknown> }> {
  try {
    await p;
  } catch (e) {
    const err = e as { statusCode?: number; message?: string; data?: unknown };
    return { status: err.statusCode ?? 0, msg: err.message ?? "", data: (err.data ?? {}) as Record<string, unknown> };
  }
  throw new Error("esperava um erro, mas a chamada passou");
}

beforeEach(() => {
  semear();
});

describe("listarPreCadastros", () => {
  it("lista os pendentes do mais antigo para o mais novo, com o título da compra (sem paciente) e a contagem", async () => {
    const r = await listarPreCadastros("pendente");
    expect(r.status).toBe("pendente");
    expect(r.total).toBe(2);
    expect(r.itens.map((i) => i.nome)).toEqual(["TESTE MEDICAMENTO ALFA", "TESTE MEDICAMENTO BETA"]);
    expect(r.itens[0]).toMatchObject({ id: PRE_ALFA, temperatura: "2°C a 8°C", status: "pendente", compra: "Compra 07 - Novembro/2026", compraId: "compra_1", solicitadoPor: "Op Teste", solicitadoEm: "2026-11-12T12:00:00.000Z", decididoPor: null, decididoEm: null, cadastroId: null });
    expect(JSON.stringify(r)).not.toContain("TESTE PACIENTE");
  });

  it("filtra pelo status; sem nenhum no estado: lista vazia e total 0", async () => {
    expect((await listarPreCadastros("aprovado")).total).toBe(0);
    await aprovarPreCadastro(PRE_ALFA, {}, ADM);
    const aprovados = await listarPreCadastros("aprovado");
    expect(aprovados.itens.map((i) => i.id)).toEqual([PRE_ALFA]);
    expect((await listarPreCadastros("pendente")).total).toBe(1);
  });

  it("pedido sem compra: compra = null", async () => {
    fake.semear("pre_cadastro_medicamentos", [pre("pre_teste_sem_compra", "TESTE MEDICAMENTO SEM COMPRA", { compra_id: null })]);
    const r = await listarPreCadastros("pendente");
    expect(r.itens.find((i) => i.id === "pre_teste_sem_compra")).toMatchObject({ compra: null, compraId: null });
  });
});

describe("aprovarPreCadastro", () => {
  it("cria o medicamento no Cadastro, marca aprovado e liga TODOS os itens (de todas as compras) ao novo id", async () => {
    const r = await aprovarPreCadastro(PRE_ALFA, {}, ADM);

    const criada = porId("cadastro_medicamentos", MED_ALFA);
    expect(criada).toMatchObject({ nome: "TESTE MEDICAMENTO ALFA", nome_chave: "teste medicamento alfa", temperatura: "2°C a 8°C", ativo: true, atualizado_por: ADM });
    expect(linhas("cadastro_medicamentos")).toHaveLength(3);

    expect(porId("compra_itens", "it_1").medicamento_cadastro_id).toBe(MED_ALFA);
    expect(porId("compra_itens", "it_2").medicamento_cadastro_id).toBe(MED_ALFA);
    // O que não é deste pré-cadastro não muda.
    expect(porId("compra_itens", "it_3").medicamento_cadastro_id).toBeNull();
    expect(porId("compra_itens", "it_4").medicamento_cadastro_id).toBe("med_gama");

    const decidido = porId("pre_cadastro_medicamentos", PRE_ALFA);
    expect(decidido).toMatchObject({ status: "aprovado", cadastro_id: MED_ALFA, decidido_por: ADM });
    expect(typeof decidido.decidido_em).toBe("string");
    expect(porId("pre_cadastro_medicamentos", "pre_teste_beta").status).toBe("pendente");

    expect(r.itens).toBe(2);
    expect(r.compras).toBe(2);
    expect(r.medicamentoCriado).toBe(true);
    expect(r.preCadastro).toMatchObject({ id: PRE_ALFA, status: "aprovado", cadastroId: MED_ALFA, decididoPor: ADM });
  });

  it("sobe a versão (updated_at) de cada compra afetada — e SÓ delas", async () => {
    await aprovarPreCadastro(PRE_ALFA, {}, ADM);
    for (const id of ["compra_1", "compra_2"]) expect(new Date(porId("compras", id).updated_at as string).getTime(), id).toBeGreaterThan(new Date(ANTIGA).getTime());
    expect(porId("compras", "compra_3").updated_at).toBe(ANTIGA);
  });

  it("o aprovador pode ajustar nome (MAIÚSCULAS) e temperatura (do Cadastro de temperaturas ativas)", async () => {
    await aprovarPreCadastro(PRE_ALFA, { nome: "teste medicamento alfa 10 mg", temperatura: "ambiente" }, ADM);
    // A temperatura gravada é o NOME dela no Cadastro (a cópia), não o texto digitado.
    expect(porId("cadastro_medicamentos", MED_ALFA)).toMatchObject({ nome: "TESTE MEDICAMENTO ALFA 10 MG", nome_chave: "teste medicamento alfa 10 mg", temperatura: "Ambiente" });
  });

  it.each([
    ["nome vazio", { nome: "  " }, "Informe o nome."],
    ["nome reservado", { nome: "outro" }, "reservado"],
    ["temperatura vazia", { temperatura: "" }, "Informe a temperatura."],
    ["temperatura que não existe", { temperatura: "Quente" }, "Temperatura não encontrada"],
    ["temperatura inativa", { temperatura: "Congelado -20°C" }, "inativa"],
    ["campo desconhecido", { cor: "azul" }, "Campo desconhecido: cor."],
    ["vincularExistente que não é booleano", { vincularExistente: "sim" }, "vincularExistente"],
  ])("422: %s (nada é gravado)", async (_n, corpo, trecho) => {
    const e = await erroDe(aprovarPreCadastro(PRE_ALFA, corpo, ADM));
    expect(e.status).toBe(422);
    expect(e.msg).toContain(trecho);
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA).status).toBe("pendente");
  });

  it("pré-cadastro que não existe: 404 e nada gravado", async () => {
    const e = await erroDe(aprovarPreCadastro("pre_nao_existe", {}, ADM));
    expect(e.status).toBe(404);
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("nome que já existe no Cadastro: 409 medicamento_ja_cadastrado com o item existente, sem criar, ligar nem decidir", async () => {
    const e = await erroDe(aprovarPreCadastro(PRE_ALFA, { nome: "teste medicamento gama" }, ADM));
    expect(e.status).toBe(409);
    expect(e.data).toEqual({ code: "medicamento_ja_cadastrado", existente: { id: "med_gama", nome: "TESTE MEDICAMENTO GAMA", temperatura: "Ambiente", ativo: true } });
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA).status).toBe("pendente");
  });

  it("a comparação é pela CHAVE (sem acento, caixa nem espaços repetidos) e o existente INATIVO também conta", async () => {
    const e = await erroDe(aprovarPreCadastro(PRE_ALFA, { nome: "Teste   Medicamento DELTA" }, ADM));
    expect(e.status).toBe(409);
    expect(e.data).toMatchObject({ code: "medicamento_ja_cadastrado", existente: { id: "med_delta", ativo: false } });
  });
});

describe("aprovarPreCadastro com vincularExistente (não cria linha nova)", () => {
  it("usa o id do medicamento existente: liga os itens, marca aprovado com esse cadastro_id e NÃO escreve em cadastro_medicamentos", async () => {
    const r = await aprovarPreCadastro(PRE_ALFA, { nome: "TESTE MEDICAMENTO GAMA", vincularExistente: true }, ADM);

    expect(linhas("cadastro_medicamentos")).toHaveLength(2);
    expect(escritasEm("cadastro_medicamentos")).toEqual([]);
    expect(porId("compra_itens", "it_1").medicamento_cadastro_id).toBe("med_gama");
    expect(porId("compra_itens", "it_2").medicamento_cadastro_id).toBe("med_gama");
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA)).toMatchObject({ status: "aprovado", cadastro_id: "med_gama", decidido_por: ADM });
    expect(r).toMatchObject({ itens: 2, compras: 2, medicamentoCriado: false });
    for (const id of ["compra_1", "compra_2"]) expect(porId("compras", id).updated_at, id).not.toBe(ANTIGA);
  });

  it("a temperatura do pedido não importa ao vincular (pedido sem temperatura vincula)", async () => {
    porId("pre_cadastro_medicamentos", PRE_ALFA).temperatura = "";
    await aprovarPreCadastro(PRE_ALFA, { nome: "TESTE MEDICAMENTO GAMA", vincularExistente: true }, ADM);
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA).status).toBe("aprovado");
  });

  it("existente INATIVO: 409 medicamento_inativo e não vincula (nada gravado)", async () => {
    const e = await erroDe(aprovarPreCadastro(PRE_ALFA, { nome: "TESTE MEDICAMENTO DELTA", vincularExistente: true }, ADM));
    expect(e.status).toBe(409);
    expect(e.data).toMatchObject({ code: "medicamento_inativo", existente: { id: "med_delta", ativo: false } });
    expect(e.msg).toContain("inativo");
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("nome que não está no Cadastro: 422 e nada gravado", async () => {
    const e = await erroDe(aprovarPreCadastro(PRE_ALFA, { nome: "TESTE MEDICAMENTO ZETA", vincularExistente: true }, ADM));
    expect(e.status).toBe(422);
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });
});

describe("rejeitarPreCadastro", () => {
  it("marca rejeitado com decidido_por e decidido_em, NUNCA apaga a linha e deixa os itens com o texto digitado", async () => {
    const antes = linhas("pre_cadastro_medicamentos").length;
    const r = await rejeitarPreCadastro(PRE_ALFA, ADM);

    expect(linhas("pre_cadastro_medicamentos")).toHaveLength(antes);
    expect(fake.chamadas.some((c) => c.op === "delete")).toBe(false);
    const rejeitado = porId("pre_cadastro_medicamentos", PRE_ALFA);
    expect(rejeitado).toMatchObject({ status: "rejeitado", cadastro_id: null, decidido_por: ADM, nome: "TESTE MEDICAMENTO ALFA" });
    expect(typeof rejeitado.decidido_em).toBe("string");

    // Itens: seguem com o nome digitado e com o pré-cadastro (para a tela mostrar o aviso); nada é ligado ao Cadastro.
    for (const id of ["it_1", "it_2"]) expect(porId("compra_itens", id)).toMatchObject({ medicamento: "TESTE MEDICAMENTO ALFA", medicamento_cadastro_id: null, pre_cadastro_id: PRE_ALFA });
    expect(linhas("cadastro_medicamentos")).toHaveLength(2);
    expect(escritasEm("cadastro_medicamentos")).toEqual([]);
    expect(escritasEm("compra_itens")).toEqual([]);
    expect(r).toMatchObject({ itens: 2, compras: 2, medicamentoCriado: false, preCadastro: { status: "rejeitado", decididoPor: ADM } });
  });

  it("sobe a versão das compras afetadas (e só delas)", async () => {
    await rejeitarPreCadastro(PRE_ALFA, ADM);
    for (const id of ["compra_1", "compra_2"]) expect(porId("compras", id).updated_at, id).not.toBe(ANTIGA);
    expect(porId("compras", "compra_3").updated_at).toBe(ANTIGA);
  });

  it("404 inexistente", async () => {
    expect((await erroDe(rejeitarPreCadastro("pre_nao_existe", ADM))).status).toBe(404);
  });

  it("um rejeitado não impede um novo pedido do mesmo nome (o índice único é só dos pendentes) e some da lista de pendentes", async () => {
    await rejeitarPreCadastro(PRE_ALFA, ADM);
    expect((await listarPreCadastros("pendente")).itens.map((i) => i.id)).toEqual(["pre_teste_beta"]);
    expect((await listarPreCadastros("rejeitado")).itens.map((i) => i.id)).toEqual([PRE_ALFA]);
  });
});

describe("concorrência: só a primeira decisão vale", () => {
  it.each([
    ["aprovado", () => aprovarPreCadastro(PRE_ALFA, {}, ADM)],
    ["rejeitado", () => rejeitarPreCadastro(PRE_ALFA, ADM)],
  ])("pré-cadastro já %s: quem decide depois leva 409 pre_cadastro_ja_decidido com o status atual", async (status, primeira) => {
    await primeira();
    for (const segunda of [() => aprovarPreCadastro(PRE_ALFA, {}, "Outra Pessoa"), () => rejeitarPreCadastro(PRE_ALFA, "Outra Pessoa")]) {
      const e = await erroDe(segunda());
      expect(e.status).toBe(409);
      expect(e.data).toMatchObject({ code: "pre_cadastro_ja_decidido", status, preCadastro: { id: PRE_ALFA, status, decididoPor: ADM } });
    }
    // A decisão da primeira não foi tocada.
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA)).toMatchObject({ status, decidido_por: ADM });
  });

  it("outra pessoa decide NO MEIO (entre a leitura e o último passo): o passo que decide não pega e responde 409 com o estado dela", async () => {
    fake.antes("pre_cadastro_medicamentos", "update", () => {
      Object.assign(porId("pre_cadastro_medicamentos", PRE_ALFA), { status: "rejeitado", decidido_por: "Outra Pessoa" });
    });
    const e = await erroDe(aprovarPreCadastro(PRE_ALFA, {}, ADM));
    expect(e.status).toBe(409);
    expect(e.data).toMatchObject({ code: "pre_cadastro_ja_decidido", status: "rejeitado", preCadastro: { decididoPor: "Outra Pessoa" } });
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA)).toMatchObject({ status: "rejeitado", decidido_por: "Outra Pessoa", cadastro_id: null });
  });

  it("duas aprovações ao mesmo tempo: UM só medicamento no Cadastro, itens ligados uma vez, e a segunda leva 409", async () => {
    // As duas unicidades do banco (a chave primária e a nome_chave): a segunda criação leva 23505 e reconhece a linha da primeira (mesmo id).
    fake.unico("cadastro_medicamentos", ["id"], "cadastro_medicamentos_pkey");
    fake.unico("cadastro_medicamentos", ["nome_chave"], "cadastro_medicamentos_nome_chave_uq");
    const resultados = await Promise.allSettled([aprovarPreCadastro(PRE_ALFA, {}, ADM), aprovarPreCadastro(PRE_ALFA, {}, "Outra Pessoa")]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const falha = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((falha.reason as { statusCode: number }).statusCode).toBe(409);
    expect(linhas("cadastro_medicamentos").filter((m) => String(m.nome).includes("ALFA"))).toHaveLength(1);
    expect(porId("compra_itens", "it_1").medicamento_cadastro_id).toBe(MED_ALFA);
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA).status).toBe("aprovado");
  });

  it("outra pessoa criou o MESMO nome no Cadastro entre a leitura e a escrita (23505): 409 medicamento_ja_cadastrado, nada decidido", async () => {
    fake.unico("cadastro_medicamentos", ["nome_chave"], "cadastro_medicamentos_nome_chave_uq");
    fake.antes("cadastro_medicamentos", "insert", () => {
      fake.semear("cadastro_medicamentos", [medicamento("med_de_outra_pessoa", "TESTE MEDICAMENTO ALFA")]);
    });
    const e = await erroDe(aprovarPreCadastro(PRE_ALFA, {}, ADM));
    expect(e.status).toBe(409);
    expect(e.data).toMatchObject({ code: "medicamento_ja_cadastrado", existente: { id: "med_de_outra_pessoa" } });
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA).status).toBe("pendente");
    expect(porId("compra_itens", "it_1").medicamento_cadastro_id).toBeNull();
  });
});

// ── Falha no meio e repetição ──────────────────────────────────────────────────────────────────────────────────

type Op = "select" | "insert" | "update";
// Cada passo do APROVAR que fala com o banco (leitura ou escrita), na ordem em que acontecem.
const PASSOS_APROVAR: Array<[string, string, Op]> = [
  ["ler o pré-cadastro", "pre_cadastro_medicamentos", "select"],
  ["conferir a temperatura", "cadastro_temperaturas", "select"],
  ["buscar o nome no Cadastro", "cadastro_medicamentos", "select"],
  ["criar o medicamento", "cadastro_medicamentos", "insert"],
  ["ler os itens do pré-cadastro", "compra_itens", "select"],
  ["ligar os itens", "compra_itens", "update"],
  ["ler a versão da compra", "compras", "select"],
  ["subir a versão da compra", "compras", "update"],
  ["decidir (marcar aprovado)", "pre_cadastro_medicamentos", "update"],
];

function conferirAprovadoPorInteiro(): void {
  expect(linhas("cadastro_medicamentos").filter((m) => String(m.nome).includes("ALFA")), "um só medicamento criado").toHaveLength(1);
  expect(porId("cadastro_medicamentos", MED_ALFA)).toMatchObject({ nome: "TESTE MEDICAMENTO ALFA", ativo: true });
  expect(porId("compra_itens", "it_1").medicamento_cadastro_id, "item 1 ligado").toBe(MED_ALFA);
  expect(porId("compra_itens", "it_2").medicamento_cadastro_id, "item 2 ligado").toBe(MED_ALFA);
  expect(porId("compra_itens", "it_3").medicamento_cadastro_id, "item de outro pré-cadastro intacto").toBeNull();
  for (const id of ["compra_1", "compra_2"]) expect(porId("compras", id).updated_at, `versão de ${id} subiu`).not.toBe(ANTIGA);
  expect(porId("compras", "compra_3").updated_at).toBe(ANTIGA);
  expect(porId("pre_cadastro_medicamentos", PRE_ALFA)).toMatchObject({ status: "aprovado", cadastro_id: MED_ALFA, decidido_por: ADM });
}

describe("aprovar: falha injetada em CADA passo e repetição (termina consistente, nada duplicado)", () => {
  it.each(PASSOS_APROVAR)("falha ao %s: a primeira chamada rejeita e a repetição conclui tudo", async (_nome, tabela, op) => {
    fake.falhar(tabela, op);
    await expect(aprovarPreCadastro(PRE_ALFA, {}, ADM)).rejects.toThrow();
    // Nada foi decidido enquanto o último passo não rodou.
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA).status).toBe("pendente");

    const r = await aprovarPreCadastro(PRE_ALFA, {}, ADM);
    conferirAprovadoPorInteiro();
    expect(r).toMatchObject({ itens: 2, compras: 2, preCadastro: { status: "aprovado" } });
  });

  it("falha DEPOIS de ligar os itens (na versão da compra): a repetição ainda acha as compras e sobe a versão de todas", async () => {
    fake.falhar("compras", "update");
    await expect(aprovarPreCadastro(PRE_ALFA, {}, ADM)).rejects.toThrow();
    expect(porId("compra_itens", "it_1").medicamento_cadastro_id).toBe(MED_ALFA); // já ligado
    expect(porId("compras", "compra_1").updated_at).toBe(ANTIGA); // mas a versão não subiu

    await aprovarPreCadastro(PRE_ALFA, {}, ADM);
    conferirAprovadoPorInteiro();
  });

  it("duas falhas seguidas, em passos diferentes, e a terceira chamada conclui", async () => {
    fake.falhar("compra_itens", "update");
    await expect(aprovarPreCadastro(PRE_ALFA, {}, ADM)).rejects.toThrow();
    fake.falhar("pre_cadastro_medicamentos", "update");
    await expect(aprovarPreCadastro(PRE_ALFA, {}, ADM)).rejects.toThrow();
    await aprovarPreCadastro(PRE_ALFA, {}, ADM);
    conferirAprovadoPorInteiro();
  });

  it("a repetição depois de a decisão concluir é um 409 (não duplica nada)", async () => {
    fake.falhar("pre_cadastro_medicamentos", "update");
    await expect(aprovarPreCadastro(PRE_ALFA, {}, ADM)).rejects.toThrow();
    await aprovarPreCadastro(PRE_ALFA, {}, ADM);
    expect((await erroDe(aprovarPreCadastro(PRE_ALFA, {}, ADM))).status).toBe(409);
    conferirAprovadoPorInteiro();
  });
});

describe("vincular: falha injetada em cada passo que escreve e repetição", () => {
  const VINCULAR = { nome: "TESTE MEDICAMENTO GAMA", vincularExistente: true };
  it.each([
    ["ligar os itens", "compra_itens"],
    ["subir a versão da compra", "compras"],
    ["decidir (marcar aprovado)", "pre_cadastro_medicamentos"],
  ] as Array<[string, string]>)("falha ao %s: a repetição conclui, sem criar nada no Cadastro", async (_nome, tabela) => {
    fake.falhar(tabela, "update");
    await expect(aprovarPreCadastro(PRE_ALFA, VINCULAR, ADM)).rejects.toThrow();
    await aprovarPreCadastro(PRE_ALFA, VINCULAR, ADM);
    expect(linhas("cadastro_medicamentos")).toHaveLength(2);
    expect(escritasEm("cadastro_medicamentos")).toEqual([]);
    expect(porId("compra_itens", "it_1").medicamento_cadastro_id).toBe("med_gama");
    expect(porId("compra_itens", "it_2").medicamento_cadastro_id).toBe("med_gama");
    for (const id of ["compra_1", "compra_2"]) expect(porId("compras", id).updated_at, id).not.toBe(ANTIGA);
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA)).toMatchObject({ status: "aprovado", cadastro_id: "med_gama" });
  });
});

describe("rejeitar: falha injetada em CADA passo e repetição", () => {
  it.each([
    ["ler o pré-cadastro", "pre_cadastro_medicamentos", "select"],
    ["ler os itens do pré-cadastro", "compra_itens", "select"],
    ["ler a versão da compra", "compras", "select"],
    ["subir a versão da compra", "compras", "update"],
    ["decidir (marcar rejeitado)", "pre_cadastro_medicamentos", "update"],
  ] as Array<[string, string, Op]>)("falha ao %s: a repetição conclui", async (_nome, tabela, op) => {
    fake.falhar(tabela, op);
    await expect(rejeitarPreCadastro(PRE_ALFA, ADM)).rejects.toThrow();
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA).status).toBe("pendente");

    await rejeitarPreCadastro(PRE_ALFA, ADM);
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA)).toMatchObject({ status: "rejeitado", decidido_por: ADM });
    for (const id of ["compra_1", "compra_2"]) expect(porId("compras", id).updated_at, `versão de ${id} subiu`).not.toBe(ANTIGA);
    expect(linhas("pre_cadastro_medicamentos")).toHaveLength(2);
    expect(escritasEm("compra_itens")).toEqual([]);
  });
});

describe("item que o usuário trocou depois do pedido", () => {
  it("item que já não aponta para o pré-cadastro (trocado por um do Cadastro) não é tocado", async () => {
    porId("compra_itens", "it_2").pre_cadastro_id = null;
    porId("compra_itens", "it_2").medicamento_cadastro_id = "med_gama";
    const r = await aprovarPreCadastro(PRE_ALFA, {}, ADM);
    expect(porId("compra_itens", "it_2").medicamento_cadastro_id).toBe("med_gama");
    expect(r).toMatchObject({ itens: 1, compras: 1 });
  });

  it("itens de DUAS compras e dois itens na MESMA compra: itens conta todos, compras conta cada compra uma vez, e a versão sobe só nas compras dos itens (cada item aponta direto para a sua compra)", async () => {
    fake.semear("compra_itens", [item("it_5", "compra_1", { posicao: 2, pre_cadastro_id: PRE_ALFA })]); // 2º item da compra_1
    const r = await aprovarPreCadastro(PRE_ALFA, {}, ADM);
    expect(r).toMatchObject({ itens: 3, compras: 2 });
    for (const id of ["it_1", "it_2", "it_5"]) expect(porId("compra_itens", id).medicamento_cadastro_id, id).toBe(MED_ALFA);
    expect(porId("compras", "compra_3").updated_at).toBe(ANTIGA); // a compra do outro pré-cadastro não mexe
    expect(linhas("compra_itens").every((i) => !("ordem_id" in i))).toBe(true); // nada de ordens no caminho
  });

  it("rejeitar com itens de duas compras: sobe a versão das duas e não toca nos itens", async () => {
    fake.semear("compra_itens", [item("it_5", "compra_1", { posicao: 2, pre_cadastro_id: PRE_ALFA })]);
    const r = await rejeitarPreCadastro(PRE_ALFA, ADM);
    expect(r).toMatchObject({ itens: 3, compras: 2, preCadastro: { status: "rejeitado" } });
    for (const id of ["compra_1", "compra_2"]) expect(porId("compras", id).updated_at, id).not.toBe(ANTIGA);
    expect(escritasEm("compra_itens")).toEqual([]);
  });

  it("pré-cadastro sem nenhum item (a compra tirou o medicamento): aprova e cria o medicamento sem ligar nada", async () => {
    for (const i of linhas("compra_itens")) if (i.pre_cadastro_id === PRE_ALFA) i.pre_cadastro_id = null;
    const r = await aprovarPreCadastro(PRE_ALFA, {}, ADM);
    expect(r).toMatchObject({ itens: 0, compras: 0, medicamentoCriado: true });
    expect(escritasEm("compra_itens")).toEqual([]);
    expect(porId("pre_cadastro_medicamentos", PRE_ALFA).status).toBe("aprovado");
  });
});
