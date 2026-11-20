// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { TEXTO_PRE_CADASTRO_REJEITADO } from "../../shared/constants/compraChecklist";
import type { ItemCompra, OrdemCompra } from "../../shared/types/compra";
import { checklistCompra, contarPendencias, statusDaCompra, type CompraParaChecklist } from "../../shared/utils/compraChecklist";
import { itemVazio, ordemVazia } from "../../shared/utils/compraForm";
import { campoDoItem } from "../../app/utils/comprasCampos";
import { montarCompraParaChecklist, montarItem, type ItemRow } from "../../server/utils/compraMappers";
import { compraTeste, montarFormulario, q, texto, type FormularioMontado } from "./helpers/formularioCompra";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { compraTeste as compraCompleta } from "./helpers/encaminharFixtures";

// O aviso de PRÉ-CADASTRO REJEITADO (aviso, não erro) no checklist e na linha do medicamento, e o item APROVADO que deixa de mostrar o aviso de
// pré-cadastro. Mapeador, checklist, leitura da compra (Supabase simulado) e a linha real do formulário. Dados fictícios (TESTE).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));
const { obterCompra } = await import("../../server/utils/comprasStore");
const { aprovarPreCadastro, rejeitarPreCadastro } = await import("../../server/utils/preCadastroDecisao");

const ANTIGA = "2026-11-10T10:00:00.000Z";
const NOME = "TESTE MEDICAMENTO ALFA";
const AVISO_REJEITADO = `${TEXTO_PRE_CADASTRO_REJEITADO} (${NOME})`;

const linhaItem = (extra: Partial<ItemRow> = {}): ItemRow => ({
  id: "it_1",
  ordem_id: "ord_1",
  posicao: 1,
  medicamento: NOME,
  medicamento_cadastro_id: null,
  pre_cadastro_id: null,
  apresentacao: "",
  referencia: "",
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

  it("a checagem da LISTA também esconde o pré-cadastro de item já ligado ao Cadastro", () => {
    const row = { id: "c", ano_mes: "2026-11", sequencia: 1, cancelada: false, paciente: "TESTE", processo_numero: "", compra_particular: true, medico: "Dr", vendedor: "v", responsavel: "r", despachante: "d", pagamento_momento: null, local_aplicacao: "", entrega: "", documentos: null, updated_at: ANTIGA };
    const checagem = montarCompraParaChecklist(row, [{ id: "ord_1", compra_id: "c", posicao: 1, fornecedor: "f", envio: "e", po: "", dir_id: null, encaminhada_em: null }], [linhaItem({ medicamento_cadastro_id: "med_1", pre_cadastro_id: "pre_1" })]);
    expect(checagem.ordens[0]!.itens[0]).toMatchObject({ preCadastroId: null, medicamentoCadastroId: "med_1" });
  });
});

function compraComItem(item: Partial<ItemCompra>): CompraParaChecklist {
  const base = compraCompleta();
  return { ...base, ordens: [{ ...base.ordens[0]!, itens: [{ ...base.ordens[0]!.itens[0]!, medicamento: NOME, medicamentoCadastroId: null, preCadastroId: null, ...item }] }] };
}
const avisoDoItem = (c: CompraParaChecklist) => checklistCompra(c).itens.find((i) => i.id.endsWith("-pre-cadastro"));

describe("checklist: aviso de pré-cadastro rejeitado", () => {
  it("rejeitado: é um AVISO (nunca erro) com o texto pedido e o nome, no MESMO item da regra (clicável para o campo Medicamento)", () => {
    const c = compraComItem({ preCadastroId: "pre_1", preCadastroStatus: "rejeitado" });
    const aviso = avisoDoItem(c)!;
    expect(aviso).toMatchObject({ id: "ordem-1-med-1-pre-cadastro", nivel: "aviso", texto: AVISO_REJEITADO });
    expect(campoDoItem(aviso.id, c)).toBe("ordem-1-med-1-nome");
  });

  it("não vira pendência nem muda o estado da compra (rejeitar não trava a compra)", () => {
    const semAviso = compraComItem({ medicamentoCadastroId: "med_1" });
    const rejeitada = compraComItem({ preCadastroId: "pre_1", preCadastroStatus: "rejeitado" });
    expect(contarPendencias(rejeitada)).toBe(contarPendencias(semAviso));
    expect(checklistCompra(rejeitada).pronta).toBe(checklistCompra(semAviso).pronta);
    expect(statusDaCompra(rejeitada)).toBe(statusDaCompra(semAviso));
  });

  it("pendente (ou sem estado): segue o aviso de sempre", () => {
    expect(avisoDoItem(compraComItem({ preCadastroId: "pre_1", preCadastroStatus: "pendente" }))!.texto).toBe(`${NOME} no pré-cadastro: a linha da DIR leva o nome digitado`);
    expect(avisoDoItem(compraComItem({ preCadastroId: "pre_1" }))!.texto).toBe(`${NOME} no pré-cadastro: a linha da DIR leva o nome digitado`);
    expect(avisoDoItem(compraComItem({}))!.texto).toBe(`${NOME} no pré-cadastro: a linha da DIR leva o nome digitado`);
  });

  it("estado velho sem pré-cadastro no item (a pessoa trocou o medicamento): não vale como rejeitado", () => {
    expect(avisoDoItem(compraComItem({ preCadastroId: null, preCadastroStatus: "rejeitado" }))!.texto).not.toContain("rejeitado");
  });

  it("item APROVADO (já ligado ao Cadastro, sem pré-cadastro): NENHUM aviso de pré-cadastro", () => {
    expect(avisoDoItem(compraComItem({ medicamentoCadastroId: "med_1", preCadastroId: null }))).toBeUndefined();
  });
});

// ── A compra lida do banco (Supabase simulado) ─────────────────────────────────────────────────────────────

function semear(): void {
  for (const k of Object.keys(fake.tabelas)) delete fake.tabelas[k];
  fake.chamadas.length = 0;
  fake.semear("cadastro_temperaturas", [{ id: "temp_1", nome: "2°C a 8°C", nome_chave: "2°c a 8°c", ativo: true }]);
  fake.semear("compras", [{ id: "compra_1", ano_mes: "2026-11", sequencia: 7, paciente: "TESTE PACIENTE", updated_at: ANTIGA, created_at: ANTIGA, cancelada: false }]);
  fake.semear("compra_ordens", [{ id: "ord_1", compra_id: "compra_1", posicao: 1, fornecedor: "", envio: "", cia: "", po: "" }]);
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
    const itens = (await obterCompra("compra_1"))!.ordens[0]!.itens;
    expect(itens.find((i) => i.id === "it_alfa")).toMatchObject({ preCadastroId: "pre_alfa", preCadastroStatus: "pendente" });
    expect(itens.find((i) => i.id === "it_beta")).toMatchObject({ preCadastroId: "pre_beta", preCadastroStatus: "rejeitado", medicamento: "TESTE MEDICAMENTO BETA" });
    expect("preCadastroStatus" in itens.find((i) => i.id === "it_cad")!).toBe(false);
  });

  it("rejeitar NÃO apaga nem troca o texto do item; o checklist da compra lida mostra o aviso de rejeitado", async () => {
    await rejeitarPreCadastro("pre_beta", "Adm Teste");
    const compra = (await obterCompra("compra_1"))!;
    const beta = compra.ordens[0]!.itens.find((i) => i.id === "it_beta")!;
    expect(beta.medicamento).toBe("TESTE MEDICAMENTO BETA");
    const aviso = checklistCompra(compra).itens.find((i) => i.id === "ordem-1-med-2-pre-cadastro")!;
    expect(aviso).toMatchObject({ nivel: "aviso", texto: `${TEXTO_PRE_CADASTRO_REJEITADO} (TESTE MEDICAMENTO BETA)` });
    // O item pendente segue com o aviso de sempre.
    expect(checklistCompra(compra).itens.find((i) => i.id === "ordem-1-med-1-pre-cadastro")!.texto).toBe(`${NOME} no pré-cadastro: a linha da DIR leva o nome digitado`);
  });

  it("APROVAR: o item passa a ser do Cadastro (sem pré-cadastro, sem estado) e o aviso de pré-cadastro some do checklist", async () => {
    const antes = checklistCompra((await obterCompra("compra_1"))!).itens.some((i) => i.id === "ordem-1-med-1-pre-cadastro");
    expect(antes).toBe(true);

    const r = await aprovarPreCadastro("pre_alfa", {}, "Adm Teste");
    const compra = (await obterCompra("compra_1"))!;
    const alfa = compra.ordens[0]!.itens.find((i) => i.id === "it_alfa")!;
    expect(alfa).toMatchObject({ medicamentoCadastroId: r.preCadastro.cadastroId, preCadastroId: null });
    expect("preCadastroStatus" in alfa).toBe(false);
    expect(checklistCompra(compra).itens.some((i) => i.id === "ordem-1-med-1-pre-cadastro")).toBe(false);
    // O outro, ainda pendente, mantém o aviso.
    expect(checklistCompra(compra).itens.some((i) => i.id === "ordem-1-med-2-pre-cadastro")).toBe(true);
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

// ── A linha do medicamento no formulário ───────────────────────────────────────────────────────────────────

describe("linha do medicamento (formulário real)", () => {
  let montado: FormularioMontado | null = null;
  afterEach(() => {
    montado?.desmontar();
    montado = null;
    document.body.innerHTML = "";
  });

  const item = (id: string, posicao: number, extra: Partial<ItemCompra> = {}): ItemCompra => ({ ...itemVazio(posicao), id, ...extra });
  const ordem = (itens: ItemCompra[]): OrdemCompra => ({ ...ordemVazia(1), id: "ord_a00001", itens });
  function abrir(itens: ItemCompra[]): FormularioMontado {
    montado = montarFormulario(compraTeste({ ordens: [ordem(itens)] }), { opcoes: { temperaturas: [{ nome: "2°C a 8°C" }] } });
    return montado;
  }

  it("rejeitado: mostra o aviso (e não o 'entra no pré-cadastro para aprovação'); o texto livre continua no campo", async () => {
    abrir([item("itm_a", 1, { medicamento: NOME, preCadastroId: "pre_1", preCadastroStatus: "rejeitado", temperatura: "2°C a 8°C" })]);
    await nextTick();
    expect(texto(q("#item-itm_a-pre-cadastro-rejeitado"))).toBe(TEXTO_PRE_CADASTRO_REJEITADO);
    expect(q("#item-itm_a-fora-do-cadastro")).toBeNull();
    expect(q<HTMLInputElement>("#item-itm_a-medicamento")!.value).toBe(NOME);
  });

  it("pendente: só o texto de sempre", async () => {
    abrir([item("itm_a", 1, { medicamento: NOME, preCadastroId: "pre_1", preCadastroStatus: "pendente", temperatura: "2°C a 8°C" })]);
    await nextTick();
    expect(q("#item-itm_a-pre-cadastro-rejeitado")).toBeNull();
    expect(q("#item-itm_a-fora-do-cadastro")).not.toBeNull();
  });

  it("item aprovado (do Cadastro): nenhum dos dois avisos", async () => {
    abrir([item("itm_a", 1, { medicamento: NOME, medicamentoCadastroId: "med_1", preCadastroId: null })]);
    await nextTick();
    expect(q("#item-itm_a-pre-cadastro-rejeitado")).toBeNull();
    expect(q("#item-itm_a-fora-do-cadastro")).toBeNull();
  });
});
