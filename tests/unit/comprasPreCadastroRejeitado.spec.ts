import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEXTO_PRE_CADASTRO_REJEITADO } from "../../shared/constants/compra";
import { montarItem, type ItemRow } from "../../server/utils/compraMappers";
import { FakeSupabase } from "./helpers/fakeSupabase";

// O estado do PRÉ-CADASTRO que a compra devolve por item (pendente, rejeitado) e o item APROVADO que deixa de mostrar pré-cadastro. Mapeador e
// leitura da compra (Supabase simulado). O aviso na linha do medicamento (TEXTO_PRE_CADASTRO_REJEITADO) é testado em comprasMedicamentos.spec.ts.
// Dados fictícios (TESTE).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));
const { obterCompra } = await import("../../server/utils/comprasStore");
const { aprovarPreCadastro, rejeitarPreCadastro } = await import("../../server/utils/preCadastroDecisao");

const ANTIGA = "2026-11-10T10:00:00.000Z";
const NOME = "TESTE MEDICAMENTO ALFA";

const linhaItem = (extra: Partial<ItemRow> = {}): ItemRow => ({
  id: "it_1",
  compra_id: "compra_1",
  posicao: 1,
  medicamento: NOME,
  medicamento_cadastro_id: null,
  pre_cadastro_id: null,
  brand: "",
  laboratorio: "",
  quantidade: "10",
  temperatura: "2°C a 8°C",
  valor_unitario: null,
  valor_real: null,
  ...extra,
});

describe("o texto do aviso", () => {
  it("é o pedido, sem acento perdido", () => {
    expect(TEXTO_PRE_CADASTRO_REJEITADO).toBe("Pré-cadastro rejeitado: escolha outro medicamento do Cadastro ou mantenha o texto livre");
  });
});

describe("mapeador: o pré-cadastro que o item MOSTRA", () => {
  it("só o pré-cadastro: devolve o id e, havendo o mapa, o estado dele", () => {
    const item = montarItem(linhaItem({ pre_cadastro_id: "pre_1" }), new Map([["pre_1", "rejeitado" as const]]));
    expect(item).toMatchObject({ preCadastroId: "pre_1", medicamentoCadastroId: null, preCadastroStatus: "rejeitado" });
  });

  it("aprovado (medicamento do Cadastro + a coluna do pré-cadastro que ficou): o pré-cadastro some, sem estado", () => {
    const item = montarItem(linhaItem({ medicamento_cadastro_id: "med_1", pre_cadastro_id: "pre_1" }), new Map([["pre_1", "aprovado" as const]]));
    expect(item.preCadastroId).toBeNull();
    expect(item.medicamentoCadastroId).toBe("med_1");
    expect("preCadastroStatus" in item).toBe(false);
  });

  it("sem o mapa (a lista do mês) ou sem pré-cadastro: a propriedade nem existe", () => {
    expect("preCadastroStatus" in montarItem(linhaItem({ pre_cadastro_id: "pre_1" }))).toBe(false);
    expect("preCadastroStatus" in montarItem(linhaItem(), new Map([["pre_1", "pendente" as const]]))).toBe(false);
  });

  it("a LISTA do mês não lê o pré-cadastro: só o id e o texto do item (itemDaLista), e item ligado ao Cadastro continua sem pré-cadastro", () => {
    const ligado = montarItem(linhaItem({ medicamento_cadastro_id: "med_1", pre_cadastro_id: "pre_1" }));
    expect(ligado).toMatchObject({ preCadastroId: null, medicamentoCadastroId: "med_1" });
  });
});

// ── A compra lida do banco (Supabase simulado) ─────────────────────────────────────────────────────────────

function semear(): void {
  for (const k of Object.keys(fake.tabelas)) delete fake.tabelas[k];
  fake.chamadas.length = 0;
  fake.semear("cadastro_temperaturas", [{ id: "temp_1", nome: "2°C a 8°C", nome_chave: "2°c a 8°c", ativo: true }]);
  fake.semear("compras", [{ id: "compra_1", ano_mes: "2026-11", sequencia: 7, paciente: "TESTE PACIENTE", updated_at: ANTIGA, created_at: ANTIGA, cancelada: false }]);
  fake.semear("pre_cadastro_medicamentos", [
    { id: "pre_alfa", nome: NOME, nome_chave: "teste medicamento alfa", temperatura: "2°C a 8°C", status: "pendente", compra_id: "compra_1", cadastro_id: null, solicitado_por: "Op", created_at: ANTIGA, updated_at: ANTIGA },
    { id: "pre_beta", nome: "TESTE MEDICAMENTO BETA", nome_chave: "teste medicamento beta", temperatura: "2°C a 8°C", status: "pendente", compra_id: "compra_1", cadastro_id: null, solicitado_por: "Op", created_at: ANTIGA, updated_at: ANTIGA },
  ]);
  fake.semear("compra_itens", [
    { ...linhaItem({ id: "it_alfa", posicao: 1, pre_cadastro_id: "pre_alfa" }) },
    { ...linhaItem({ id: "it_beta", posicao: 2, medicamento: "TESTE MEDICAMENTO BETA", pre_cadastro_id: "pre_beta" }) },
    { ...linhaItem({ id: "it_cad", posicao: 3, medicamento: "TESTE DO CADASTRO", medicamento_cadastro_id: "med_x" }) },
  ]);
}

beforeEach(() => {
  semear();
});

describe("a compra devolve o estado do pré-cadastro de cada item", () => {
  it("pendente e rejeitado; item do Cadastro e item sem pré-cadastro não levam estado", async () => {
    await rejeitarPreCadastro("pre_beta", "Adm Teste");
    const itens = (await obterCompra("compra_1"))!.itens;
    expect(itens.find((i) => i.id === "it_alfa")).toMatchObject({ preCadastroId: "pre_alfa", preCadastroStatus: "pendente" });
    expect(itens.find((i) => i.id === "it_beta")).toMatchObject({ preCadastroId: "pre_beta", preCadastroStatus: "rejeitado", medicamento: "TESTE MEDICAMENTO BETA" });
    expect("preCadastroStatus" in itens.find((i) => i.id === "it_cad")!).toBe(false);
  });

  it("rejeitar NÃO apaga nem troca o texto do item: o item rejeitado segue com o texto livre e o estado, o pendente continua pendente", async () => {
    await rejeitarPreCadastro("pre_beta", "Adm Teste");
    const compra = (await obterCompra("compra_1"))!;
    expect(compra.itens).toHaveLength(3);
    const beta = compra.itens.find((i) => i.id === "it_beta")!;
    expect(beta).toMatchObject({ medicamento: "TESTE MEDICAMENTO BETA", preCadastroId: "pre_beta", preCadastroStatus: "rejeitado" });
    expect(compra.itens.find((i) => i.id === "it_alfa")).toMatchObject({ preCadastroId: "pre_alfa", preCadastroStatus: "pendente" });
  });

  it("APROVAR: o item passa a ser do Cadastro (sem pré-cadastro, sem estado, com o nome do Cadastro); o outro, ainda pendente, mantém o pré-cadastro", async () => {
    const r = await aprovarPreCadastro("pre_alfa", {}, "Adm Teste");
    const compra = (await obterCompra("compra_1"))!;
    const alfa = compra.itens.find((i) => i.id === "it_alfa")!;
    expect(alfa).toMatchObject({ medicamentoCadastroId: r.preCadastro.cadastroId, medicamentoCadastroNome: NOME, preCadastroId: null });
    expect("preCadastroStatus" in alfa).toBe(false);
    expect(compra.itens.find((i) => i.id === "it_beta")).toMatchObject({ preCadastroId: "pre_beta", preCadastroStatus: "pendente" });
  });

  it("a compra lida depois de aprovar sobe de versão (a aba antiga leva 409 e recarrega)", async () => {
    const antes = (await obterCompra("compra_1"))!.updatedAt;
    await aprovarPreCadastro("pre_alfa", {}, "Adm Teste");
    expect((await obterCompra("compra_1"))!.updatedAt).not.toBe(antes);
  });

  it("sem item com pré-cadastro, a leitura nem consulta a tabela de pré-cadastros", async () => {
    for (const i of fake.linhas("compra_itens")) i.pre_cadastro_id = null;
    fake.chamadas.length = 0;
    await obterCompra("compra_1");
    expect(fake.chamadas.some((c) => c.tabela === "pre_cadastro_medicamentos")).toBe(false);
  });
});
