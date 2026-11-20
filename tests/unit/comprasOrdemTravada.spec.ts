import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import type { Compra, CompraEstado, ItemCompraEstado, OrdemCompraEstado } from "../../shared/types/compra";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { COMPRA_PRONTA_ID, semearCompraPronta } from "./helpers/compraProntaFixtures";

// A ordem JÁ ENCAMINHADA para a DIR (tem dir_id) é travada no SERVIDOR: não se remove (409) e o PO dela não troca (409). O resto da ordem e da compra
// continua editável. Dados fictícios (TESTE).

const h = vi.hoisted(() => ({ body: {} as unknown, params: {} as Record<string, string> }));

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return {
    ...real,
    readBody: vi.fn(async () => h.body),
    getRouterParam: vi.fn((_e: unknown, nome: string) => h.params[nome]),
  };
});

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { salvarCompra, obterCompra, ComprasRegraError, MENSAGEM_ORDEM_ENCAMINHADA_REMOVIDA, MENSAGEM_PO_TRAVADO } = await import("../../server/utils/comprasStore");
const { default: salvarPatch } = await import("../../server/api/compras/[id].patch");

const ID = COMPRA_PRONTA_ID;
const ENCAMINHADA_EM = "2026-11-19T13:00:00.000Z";

/** Semeia a compra pronta com a 1ª ordem JÁ encaminhada (dir_id e encaminhada_em) e dois itens nela. */
function semear(): void {
  semearCompraPronta(fake);
  Object.assign(fake.linhas("compra_ordens")[0]!, { dir_id: "dir_ord_teste_0001", encaminhada_em: ENCAMINHADA_EM });
  fake.linhas("compra_itens").push({ ...fake.linhas("compra_itens")[0]!, id: "itm_teste_0003", ordem_id: "ord_teste_0001", posicao: 2, medicamento: "SEGUNDO MED" });
  fake.tabelas.dir = [{ id: "dir_ord_teste_0001", po: "PO26-11-0001", paciente: "X", vendedor: "Mateus Morais" }];
  const cadastro = (id: string, nome: string) => ({ id, nome, nome_chave: nome.toLowerCase(), ativo: true, atualizado_por: null, created_at: "2026-11-18T00:00:00.000Z", updated_at: "2026-11-18T00:00:00.000Z" });
  fake.tabelas.cadastro_despachantes = [cadastro("d1", "Despachante Teste")];
  fake.tabelas.cadastro_fornecedores = [cadastro("f1", "Fornecedor Teste"), cadastro("f2", "Outro Fornecedor Teste")];
  fake.tabelas.cadastro_cias_aereas = [cadastro("c1", "Cia Teste")];
}

beforeEach(() => {
  semear();
  fake.chamadas.length = 0;
  (fake as unknown as { unicos: unknown[] }).unicos = [];
  fake.unico("compra_ordens", ["compra_id", "posicao"], "compra_ordens_compra_posicao_uq");
  fake.unico("compra_itens", ["ordem_id", "posicao"], "compra_itens_ordem_posicao_uq");
  h.params = { id: ID };
});

const paraEstadoItem = (i: Compra["ordens"][number]["itens"][number]): ItemCompraEstado => ({
  id: i.id,
  medicamento: i.medicamento,
  medicamentoCadastroId: i.medicamentoCadastroId,
  preCadastroId: i.preCadastroId,
  apresentacao: i.apresentacao,
  referencia: i.referencia,
  laboratorio: i.laboratorio,
  quantidade: i.quantidade,
  temperatura: i.temperatura,
  valorUnitario: i.valorUnitario,
  valorReal: i.valorReal,
});

/** O estado COMPLETO da compra como está (o que o autosave reenviaria), pronto para o teste mexer. */
async function estadoAtual(mexer: (ordens: OrdemCompraEstado[]) => OrdemCompraEstado[] = (o) => o): Promise<CompraEstado> {
  const c = (await obterCompra(ID))!;
  const ordens: OrdemCompraEstado[] = c.ordens.map((o) => ({ id: o.id, fornecedor: o.fornecedor, envio: o.envio, cia: o.cia, po: o.po, frete: o.frete, freteReal: o.freteReal, itens: o.itens.map(paraEstadoItem) }));
  return { atualizadoEm: c.updatedAt, campos: {}, ordens: mexer(ordens) };
}

async function erroDe(p: Promise<unknown>): Promise<InstanceType<typeof ComprasRegraError>> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ComprasRegraError) return e;
    throw e;
  }
  throw new Error("esperava um erro de regra das Compras, mas a chamada passou");
}

const ordensDoBanco = () => fake.linhas("compra_ordens").map((o) => o.id);

describe("ordem encaminhada: NÃO pode ser removida", () => {
  it("apagar a ordem com dir_id → 409 com a mensagem pedida; nada é gravado e a ordem continua com dir_id e encaminhada_em", async () => {
    const e = await erroDe(salvarCompra(ID, await estadoAtual((o) => o.filter((x) => x.id !== "ord_teste_0001")), "Teste"));
    expect(e.statusCode).toBe(409);
    expect(e.message).toBe("Ordem já encaminhada para a DIR não pode ser removida");
    expect(e.message).toBe(MENSAGEM_ORDEM_ENCAMINHADA_REMOVIDA);
    expect(e.data).toMatchObject({ code: "ordem_encaminhada_removida", ordemId: "ord_teste_0001" });
    expect((e.data as { atual: Compra }).atual.id).toBe(ID);
    expect(ordensDoBanco()).toEqual(["ord_teste_0001", "ord_teste_0002"]);
    expect(fake.linhas("compra_ordens")[0]).toMatchObject({ dir_id: "dir_ord_teste_0001", encaminhada_em: ENCAMINHADA_EM });
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("apagar TODAS as ordens (estado com a lista vazia) também é 409 quando uma está encaminhada", async () => {
    const e = await erroDe(salvarCompra(ID, await estadoAtual(() => []), "Teste"));
    expect(e.statusCode).toBe(409);
    expect(ordensDoBanco()).toHaveLength(2);
  });

  it("apagar uma ordem SEM dir_id continua permitido", async () => {
    const salvo = (await salvarCompra(ID, await estadoAtual((o) => o.filter((x) => x.id !== "ord_teste_0002")), "Teste"))!;
    expect(salvo.ordens.map((o) => o.id)).toEqual(["ord_teste_0001"]);
    expect(ordensDoBanco()).toEqual(["ord_teste_0001"]);
    expect(salvo.ordens[0]).toMatchObject({ dirId: "dir_ord_teste_0001", encaminhadaEm: ENCAMINHADA_EM });
  });

  it("remover um MEDICAMENTO de uma ordem encaminhada continua permitido", async () => {
    const salvo = (await salvarCompra(ID, await estadoAtual((o) => o.map((x) => (x.id === "ord_teste_0001" ? { ...x, itens: x.itens.filter((i) => i.id !== "itm_teste_0003") } : x))), "Teste"))!;
    expect(salvo.ordens[0]!.itens.map((i) => i.id)).toEqual(["itm_teste_0001"]);
  });

  it("2ª camada: uma ordem encaminhada ENTRE a conferência e a exclusão (outra requisição) não é apagada", async () => {
    fake.antes("compra_ordens", "delete", () => {
      Object.assign(fake.linhas("compra_ordens")[1]!, { dir_id: "dir_ord_teste_0002", encaminhada_em: ENCAMINHADA_EM });
    });
    await salvarCompra(ID, await estadoAtual((o) => o.filter((x) => x.id !== "ord_teste_0002")), "Teste");
    expect(ordensDoBanco()).toEqual(["ord_teste_0001", "ord_teste_0002"]);
    expect(fake.linhas("compra_ordens")[1]).toMatchObject({ dir_id: "dir_ord_teste_0002" });
  });
});

describe("ordem encaminhada: o PO NÃO troca", () => {
  it("trocar o PO → 409 'PO travado: já encaminhado; altere na DIR'; o PO do banco não muda", async () => {
    const e = await erroDe(salvarCompra(ID, await estadoAtual((o) => o.map((x) => (x.id === "ord_teste_0001" ? { ...x, po: "PO26-11-0099" } : x))), "Teste"));
    expect(e.statusCode).toBe(409);
    expect(e.message).toBe("PO travado: já encaminhado; altere na DIR");
    expect(e.message).toBe(MENSAGEM_PO_TRAVADO);
    expect(e.data).toMatchObject({ code: "po_travado", ordemId: "ord_teste_0001" });
    expect(fake.linhas("compra_ordens")[0]!.po).toBe("PO26-11-0001");
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("esvaziar o PO também é trocar: 409", async () => {
    const e = await erroDe(salvarCompra(ID, await estadoAtual((o) => o.map((x) => (x.id === "ord_teste_0001" ? { ...x, po: "" } : x))), "Teste"));
    expect(e.data).toMatchObject({ code: "po_travado" });
  });

  it("reenviar o MESMO po não é erro (o autosave sempre reenvia o estado inteiro)", async () => {
    const salvo = (await salvarCompra(ID, await estadoAtual(), "Teste"))!;
    expect(salvo.ordens[0]!.po).toBe("PO26-11-0001");
  });

  it("o PO de uma ordem SEM dir_id continua livre para trocar", async () => {
    const salvo = (await salvarCompra(ID, await estadoAtual((o) => o.map((x) => (x.id === "ord_teste_0002" ? { ...x, po: "PO26-11-0077" } : x))), "Teste"))!;
    expect(salvo.ordens[1]!.po).toBe("PO26-11-0077");
  });
});

describe("ordem encaminhada: o RESTO continua editável", () => {
  it("fornecedor, envio, cia e medicamentos da ordem encaminhada mudam; dir_id e encaminhada_em ficam", async () => {
    const salvo = (
      await salvarCompra(
        ID,
        await estadoAtual((o) => o.map((x) => (x.id === "ord_teste_0001" ? { ...x, fornecedor: "Outro Fornecedor Teste", envio: "Courier Formal", itens: x.itens.map((i) => ({ ...i, quantidade: "9 caixas" })) } : x))),
        "Teste",
      )
    )!;
    expect(salvo.ordens[0]).toMatchObject({ fornecedor: "Outro Fornecedor Teste", envio: "Courier Formal", dirId: "dir_ord_teste_0001", encaminhadaEm: ENCAMINHADA_EM, po: "PO26-11-0001" });
    expect(salvo.ordens[0]!.itens.map((i) => i.quantidade)).toEqual(["9 caixas", "9 caixas"]);
  });

  it("os campos da compra mudam (e a DIR não é tocada: a DIR não muda sozinha)", async () => {
    const e = await estadoAtual();
    e.campos = { paciente: "PACIENTE EDITADO TESTE", observacoes: "nova observação" };
    const salvo = (await salvarCompra(ID, e, "Teste"))!;
    expect(salvo).toMatchObject({ paciente: "PACIENTE EDITADO TESTE", observacoes: "nova observação" });
    expect(fake.linhas("dir")).toEqual([{ id: "dir_ord_teste_0001", po: "PO26-11-0001", paciente: "X", vendedor: "Mateus Morais" }]);
    expect(fake.chamadas.filter((c) => c.tabela === "dir")).toEqual([]);
  });

  it("trocar a POSIÇÃO das ordens (a encaminhada vai para o fim) é permitido; o dir_id acompanha a ordem", async () => {
    const salvo = (await salvarCompra(ID, await estadoAtual((o) => [o[1]!, o[0]!]), "Teste"))!;
    expect(salvo.ordens.map((o) => [o.id, o.posicao])).toEqual([["ord_teste_0002", 1], ["ord_teste_0001", 2]]);
    expect(salvo.ordens[1]).toMatchObject({ dirId: "dir_ord_teste_0001", po: "PO26-11-0001" });
  });

  it("um salvamento SEM `ordens` (só campos) nem olha a trava", async () => {
    const e = await estadoAtual();
    const salvo = (await salvarCompra(ID, { atualizadoEm: e.atualizadoEm, campos: { medico: "Dra. Outra Teste" } }, "Teste"))!;
    expect(salvo.medico).toBe("Dra. Outra Teste");
    expect(salvo.ordens[0]!.dirId).toBe("dir_ord_teste_0001");
  });
});

describe("pela rota PATCH /api/compras/:id", () => {
  const admin: AuthUser = { id: "u1", email: "a@x.com", role: "administrador", nome: "Admin Teste", isAdmin: true };
  const chamar = (): Promise<unknown> => (salvarPatch as unknown as (e: never) => Promise<unknown>)({ context: { user: admin } } as never);
  const corpoDe = (e: CompraEstado): Record<string, unknown> => ({ atualizadoEm: e.atualizadoEm, ordens: e.ordens });

  async function erroHttp(): Promise<{ status: number; msg: string; data: Record<string, unknown> }> {
    try {
      await chamar();
    } catch (e) {
      const err = e as { statusCode?: number; statusMessage?: string; data?: unknown };
      return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "", data: (err.data ?? {}) as Record<string, unknown> };
    }
    throw new Error("esperava um erro HTTP");
  }

  it("remover a ordem encaminhada: 409 com o motivo em data.code e a compra atual em data.atual", async () => {
    h.body = corpoDe(await estadoAtual((o) => o.filter((x) => x.id !== "ord_teste_0001")));
    const e = await erroHttp();
    expect(e).toMatchObject({ status: 409, msg: "Ordem já encaminhada para a DIR não pode ser removida", data: { code: "ordem_encaminhada_removida" } });
    expect((e.data.atual as Compra).ordens).toHaveLength(2);
  });

  it("trocar o PO da ordem encaminhada: 409 'PO travado'", async () => {
    h.body = corpoDe(await estadoAtual((o) => o.map((x) => (x.id === "ord_teste_0001" ? { ...x, po: "PO26-11-0099" } : x))));
    expect(await erroHttp()).toMatchObject({ status: 409, msg: "PO travado: já encaminhado; altere na DIR", data: { code: "po_travado" } });
  });

  it("reenviar o mesmo estado: 200", async () => {
    h.body = corpoDe(await estadoAtual());
    const r = (await chamar()) as Compra;
    expect(r.ordens[0]!.dirId).toBe("dir_ord_teste_0001");
  });
});
