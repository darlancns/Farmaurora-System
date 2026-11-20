import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Compra } from "../../shared/types/compra";
import { statusDaCompra } from "../../shared/utils/compraChecklist";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { CONSULTOR_INATIVO_FIXTURE, semearConsultores } from "./helpers/consultoresFixtures";

// O store do Encaminhar para a DIR (server/utils/comprasEncaminhar.ts) com o Supabase em memória. Dados fictícios (TESTE).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { encaminharCompra, previaEncaminhar } = await import("../../server/utils/comprasEncaminhar");
const { obterCompra } = await import("../../server/utils/comprasStore");

const ID = "cmp_teste_000001";
const VERSAO = "2026-11-19T12:00:00.000Z";
// 23h30 de 19/11 em Brasília (já é 20/11 em UTC): a data de emissão tem de ser 2026-11-19.
const AGORA = new Date("2026-11-20T02:30:00.000Z");

function linhaCompra(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID,
    ano_mes: "2026-11",
    sequencia: 1,
    cancelada: false,
    paciente: "paciente  teste da silva",
    processo_numero: "123456",
    medico: "Dr. Teste",
    local_aplicacao: "Local Teste",
    entrega: "Entrega Teste",
    contatos: "",
    termo_observacao: "",
    despachante: "Despachante Teste",
    isencao_para: "",
    observacoes: "",
    vendedor: "Mateus Morais",
    responsavel: "Rebeca",
    compra_particular: false,
    local_declarado: false,
    termo_posterior: false,
    courier_simples: false,
    isencao: false,
    recorrente: false,
    pagamento_alvara: true,
    pagamento_momento: "vamos_pagar",
    documentos: true,
    pendencias: [],
    criado_por: "Teste",
    atualizado_por: "Teste",
    created_at: VERSAO,
    updated_at: VERSAO,
    ...extra,
  };
}

function linhaOrdem(id: string, posicao: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    compra_id: ID,
    posicao,
    fornecedor: "Fornecedor Teste",
    envio: "Air Cargo",
    cia: "Cia Teste",
    po: `PO26-11-000${posicao}`,
    frete: null,
    frete_real: null,
    dir_id: null,
    encaminhada_em: null,
    ...extra,
  };
}

function linhaItem(id: string, ordemId: string, posicao: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    ordem_id: ordemId,
    posicao,
    medicamento: "MED TESTE",
    medicamento_cadastro_id: "med_1",
    pre_cadastro_id: null,
    apresentacao: "10 mg",
    referencia: "",
    laboratorio: "",
    quantidade: "2 caixas",
    temperatura: "2°C a 8°C",
    valor_unitario: null,
    valor_real: null,
    ...extra,
  };
}

/** Uma compra pronta com DUAS ordens: a 1ª Air Cargo e a 2ª Courier Simples. */
function semear(extraCompra: Record<string, unknown> = {}): void {
  fake.tabelas.compras = [linhaCompra(extraCompra)];
  fake.tabelas.compra_ordens = [linhaOrdem("ord_teste_0001", 1), linhaOrdem("ord_teste_0002", 2, { envio: "Courier Simples", cia: "" })];
  fake.tabelas.compra_itens = [linhaItem("itm_teste_0001", "ord_teste_0001", 1), linhaItem("itm_teste_0002", "ord_teste_0002", 1, { medicamento: "OUTRO MED", apresentacao: "" })];
  fake.tabelas.dir = [];
  semearConsultores(fake);
}

const corpo = (extra: Record<string, unknown> = {}): { atualizadoEm: string } & Record<string, unknown> => ({ atualizadoEm: VERSAO, ...extra });
const dir = () => fake.linhas("dir");
const ordens = () => fake.linhas("compra_ordens");
const escritas = (tabela: string) => fake.chamadas.filter((c) => c.tabela === tabela && c.op !== "select");

async function erroDe(p: Promise<unknown>): Promise<{ status: number; msg: string; data: Record<string, unknown> }> {
  try {
    await p;
  } catch (e) {
    const err = e as { statusCode?: number; message?: string; data?: unknown };
    return { status: err.statusCode ?? 0, msg: err.message ?? "", data: (err.data ?? {}) as Record<string, unknown> };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

beforeEach(() => {
  semear();
  fake.chamadas.length = 0;
  fake.unico("dir", ["id"], "dir_pkey"); // a chave primária da DIR: um insert comum com id repetido seria 23505
});

describe("prévia (só leitura)", () => {
  it("monta a linha da DIR de CADA ordem (sem gravar nada) e diz que nada impede", async () => {
    const p = (await previaEncaminhar(ID, { agora: AGORA }))!;
    expect(p.erros).toEqual([]);
    expect(p.conflitosPo).toEqual([]);
    expect(p.vendedorInativo).toBe(false);
    expect(p.posRepetidosNaCompra).toEqual([]);
    expect(p.linhas.map((l) => [l.ordemPosicao, l.ordemId, l.jaEncaminhada, l.temperaturaMista])).toEqual([
      [1, "ord_teste_0001", false, false],
      [2, "ord_teste_0002", false, false],
    ]);
    const [l1, l2] = p.linhas;
    expect(l1!.dir).toMatchObject({
      id: "dir_ord_teste_0001",
      po: "PO26-11-0001",
      paciente: "PACIENTE TESTE DA SILVA",
      vendedor: "Mateus Morais",
      responsavel: "Rebeca",
      medicamento: "MED TESTE 10 MG",
      fornecedor: "Fornecedor Teste",
      envio: "Air Cargo",
      companhiaAerea: "Cia Teste",
      despachante: "Despachante Teste",
      temperatura: "2°C a 8°C",
      status: "on_going",
      dataEmissao: "2026-11-19",
    });
    expect(l2!.dir).toMatchObject({ id: "dir_ord_teste_0002", despachante: "COURIER I N/A", companhiaAerea: "" });
    expect(escritas("dir")).toEqual([]);
    expect(escritas("compra_ordens")).toEqual([]);
    expect(escritas("compras")).toEqual([]);
  });

  it("da DIR só diz QUAIS POs já existem: nada de paciente nem de id de outra linha", async () => {
    fake.tabelas.dir = [{ id: "dir_outra_linha", po: "PO26-11-0001", paciente: "PACIENTE ALHEIO TESTE", vendedor: "Dani" }];
    const p = (await previaEncaminhar(ID, { agora: AGORA }))!;
    expect(p.conflitosPo).toEqual(["PO26-11-0001"]);
    const texto = JSON.stringify(p);
    expect(texto).not.toContain("PACIENTE ALHEIO TESTE");
    expect(texto).not.toContain("dir_outra_linha");
  });

  it("a linha da DIR que ESTA ordem já criou (id determinístico) é retomada, não conflito", async () => {
    fake.tabelas.dir = [{ id: "dir_ord_teste_0001", po: "PO26-11-0001", paciente: "X", vendedor: "Dani" }];
    expect((await previaEncaminhar(ID, { agora: AGORA }))!.conflitosPo).toEqual([]);
  });

  it("vendedor inativo no Cadastro: vendedorInativo; vendedor vazio é erro do checklist, não 'inativo'", async () => {
    semear({ vendedor: CONSULTOR_INATIVO_FIXTURE });
    expect((await previaEncaminhar(ID, { agora: AGORA }))!.vendedorInativo).toBe(true);
    semear({ vendedor: "" });
    const p = (await previaEncaminhar(ID, { agora: AGORA }))!;
    expect(p.vendedorInativo).toBe(false);
    expect(p.erros.map((e) => e.id)).toContain("vendedor");
  });

  it("os erros são os da compra e os das ordens a encaminhar: o erro de uma ordem JÁ encaminhada não conta", async () => {
    fake.tabelas.compra_ordens = [
      linhaOrdem("ord_teste_0001", 1, { fornecedor: "", dir_id: "dir_ord_teste_0001", encaminhada_em: VERSAO }),
      linhaOrdem("ord_teste_0002", 2, { envio: "Courier Simples", cia: "", po: "" }),
    ];
    const p = (await previaEncaminhar(ID, { agora: AGORA }))!;
    expect(p.erros.map((e) => e.id)).toEqual(["ordem-2-po"]);
    expect(p.linhas.map((l) => l.jaEncaminhada)).toEqual([true, false]);
  });

  it("dois POs iguais entre as ordens: posRepetidosNaCompra", async () => {
    fake.tabelas.compra_ordens = [linhaOrdem("ord_teste_0001", 1, { po: "PO26-11-0009" }), linhaOrdem("ord_teste_0002", 2, { po: "PO26-11-0009", envio: "Courier Simples", cia: "" })];
    expect((await previaEncaminhar(ID, { agora: AGORA }))!.posRepetidosNaCompra).toEqual(["PO26-11-0009"]);
  });

  it("temperatura mista numa ordem: a linha vem marcada", async () => {
    fake.tabelas.compra_itens = [linhaItem("itm_a_0001", "ord_teste_0001", 1), linhaItem("itm_a_0002", "ord_teste_0001", 2, { temperatura: "Ambiente" }), linhaItem("itm_a_0003", "ord_teste_0002", 1)];
    const p = (await previaEncaminhar(ID, { agora: AGORA }))!;
    expect(p.linhas.map((l) => l.temperaturaMista)).toEqual([true, false]);
    expect(p.linhas[0]!.dir.temperatura).toBe("2°C a 8°C / Ambiente");
  });

  it("compra cancelada: 409; compra que não existe: null", async () => {
    semear({ cancelada: true });
    expect((await erroDe(previaEncaminhar(ID, { agora: AGORA }))).status).toBe(409);
    expect(await previaEncaminhar("cmp_nao_existe_1", { agora: AGORA })).toBeNull();
  });
});

describe("encaminhar — o caminho feliz", () => {
  it("cria UMA linha da DIR por ordem, grava dir_id e encaminhada_em, sobe a versão e devolve a compra encaminhada", async () => {
    const r = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!;

    expect(r.jaEncaminhada).toBe(false);
    expect(r.criadas).toEqual([
      { ordemId: "ord_teste_0001", dirId: "dir_ord_teste_0001", po: "PO26-11-0001" },
      { ordemId: "ord_teste_0002", dirId: "dir_ord_teste_0002", po: "PO26-11-0002" },
    ]);

    expect(dir().map((l) => l.id)).toEqual(["dir_ord_teste_0001", "dir_ord_teste_0002"]);
    expect(dir()[0]).toMatchObject({
      po: "PO26-11-0001",
      paciente: "PACIENTE TESTE DA SILVA",
      vendedor: "Mateus Morais",
      responsavel: "Rebeca",
      medicamento: "MED TESTE 10 MG",
      fornecedor: "Fornecedor Teste",
      envio: "Air Cargo",
      companhia_aerea: "Cia Teste",
      despachante: "Despachante Teste",
      temperatura: "2°C a 8°C",
      status: "on_going",
      data_emissao: "2026-11-19",
      conferido: false,
      operacao_encerrada: false,
      fechamento_restante: false,
      dactes: false,
      receita: null,
      awb: null,
      banco: null,
      observacao: null,
      created_at: AGORA.toISOString(),
    });
    // Ordem Courier Simples: sem despachante, o texto da DIR; sem cia, NULL.
    expect(dir()[1]).toMatchObject({ despachante: "COURIER I N/A", companhia_aerea: null, envio: "Courier Simples", medicamento: "OUTRO MED" });

    expect(ordens().map((o) => [o.id, o.dir_id, o.encaminhada_em])).toEqual([
      ["ord_teste_0001", "dir_ord_teste_0001", AGORA.toISOString()],
      ["ord_teste_0002", "dir_ord_teste_0002", AGORA.toISOString()],
    ]);
    expect(new Date(String(fake.linhas("compras")[0]!.updated_at)).getTime()).toBeGreaterThan(new Date(VERSAO).getTime());
    expect(r.compra.updatedAt).not.toBe(VERSAO);
    expect(r.compra.ordens.map((o) => o.dirId)).toEqual(["dir_ord_teste_0001", "dir_ord_teste_0002"]);
    expect(statusDaCompra(r.compra)).toBe("encaminhada");
  });

  it("a observação, o paciente e o despachante seguem o mapa (recorrente + particular, e despachante da compra nas ordens que não são Courier Simples)", async () => {
    semear({ recorrente: true, compra_particular: true, processo_numero: "" });
    await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA });
    expect(dir().map((l) => l.observacao)).toEqual(["RECORRENTE / COMPRA PARTICULAR", "RECORRENTE / COMPRA PARTICULAR"]);
  });

  it("a gravação da DIR é UM comando `insert ... on conflict (id) do nothing` (upsert com ignoreDuplicates), nunca um insert comum", async () => {
    await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA });
    expect(escritas("dir")).toEqual([{ tabela: "dir", op: "upsert" }]);
  });

  it("ordemIds: encaminha só a ordem pedida (parcial) e depois a outra", async () => {
    const r1 = (await encaminharCompra(ID, corpo({ ordemIds: ["ord_teste_0002"] }), "Teste", { agora: AGORA }))!;
    expect(r1.criadas.map((c) => c.ordemId)).toEqual(["ord_teste_0002"]);
    expect(dir().map((l) => l.id)).toEqual(["dir_ord_teste_0002"]);
    expect(statusDaCompra(r1.compra)).toBe("parcial");

    const r2 = (await encaminharCompra(ID, { atualizadoEm: r1.compra.updatedAt }, "Teste", { agora: AGORA }))!;
    expect(r2.criadas.map((c) => c.ordemId)).toEqual(["ord_teste_0001"]);
    expect(dir().map((l) => l.id).sort()).toEqual(["dir_ord_teste_0001", "dir_ord_teste_0002"]);
    expect(statusDaCompra(r2.compra)).toBe("encaminhada");
  });

  it("ordemIds com um id que não é desta compra: 422 e nada é gravado", async () => {
    const e = await erroDe(encaminharCompra(ID, corpo({ ordemIds: ["ord_de_outra_compra"] }), "Teste", { agora: AGORA }));
    expect(e.status).toBe(422);
    expect(escritas("dir")).toEqual([]);
  });

  it("compra que não existe: null", async () => {
    expect(await encaminharCompra("cmp_nao_existe_1", corpo(), "Teste", { agora: AGORA })).toBeNull();
  });
});

describe("encaminhar — idempotência", () => {
  it("de novo, com tudo já encaminhado: 200 jaEncaminhada, sem criar nada e sem escrever na DIR nem nas ordens", async () => {
    const r1 = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!;
    fake.chamadas.length = 0;
    const r2 = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!; // mesmo corpo (versão velha): inofensivo
    expect(r2.jaEncaminhada).toBe(true);
    expect(r2.criadas).toEqual([]);
    expect(r2.compra.updatedAt).toBe(r1.compra.updatedAt);
    expect(dir()).toHaveLength(2);
    expect(escritas("dir")).toEqual([]);
    expect(escritas("compra_ordens")).toEqual([]);
    expect(escritas("compras")).toEqual([]);
  });

  it("encaminhada, mesmo com a compra editada depois para ficar INVÁLIDA, repetir é inofensivo (não revalida o que já foi)", async () => {
    await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA });
    fake.linhas("compras")[0]!.paciente = "";
    const r = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!;
    expect(r.jaEncaminhada).toBe(true);
  });

  it("FALHA entre inserir na DIR e gravar o dir_id: a compra segue como estava e repetir completa SEM duplicar", async () => {
    fake.falhar("compra_ordens", "update", "queda de rede");
    await expect(encaminharCompra(ID, corpo(), "Teste", { agora: AGORA })).rejects.toThrow(/queda de rede/);
    // As linhas da DIR existem, mas as ordens não apontam para elas e a versão não mudou.
    expect(dir().map((l) => l.id)).toEqual(["dir_ord_teste_0001", "dir_ord_teste_0002"]);
    expect(ordens().map((o) => o.dir_id)).toEqual([null, null]);
    expect(fake.linhas("compras")[0]!.updated_at).toBe(VERSAO);

    const r = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!;
    expect(r.criadas.map((c) => c.dirId)).toEqual(["dir_ord_teste_0001", "dir_ord_teste_0002"]);
    expect(dir()).toHaveLength(2); // nenhuma duplicata
    expect(ordens().map((o) => o.dir_id)).toEqual(["dir_ord_teste_0001", "dir_ord_teste_0002"]);
    expect(statusDaCompra(r.compra)).toBe("encaminhada");
  });

  it("a retomada NÃO mexe na linha da DIR que já existia (a DIR não muda sozinha)", async () => {
    fake.tabelas.dir = [{ id: "dir_ord_teste_0001", po: "PO26-11-0001", paciente: "EDITADO NA DIR TESTE", vendedor: "Dani", status: "entregue" }];
    const r = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!;
    expect(r.criadas.map((c) => c.ordemId)).toEqual(["ord_teste_0001", "ord_teste_0002"]);
    expect(dir().find((l) => l.id === "dir_ord_teste_0001")).toMatchObject({ paciente: "EDITADO NA DIR TESTE", status: "entregue" });
    expect(dir()).toHaveLength(2);
  });

  it("outra requisição encaminhou a ordem no MEIO (depois de eu ler): minha gravação não sobrescreve o dir_id dela nem me diz dona", async () => {
    // Antes de eu gravar o dir_id da 1ª ordem, "a outra requisição" já gravou o dela.
    fake.antes("compra_ordens", "update", () => {
      Object.assign(ordens()[0]!, { dir_id: "dir_ord_teste_0001", encaminhada_em: "2026-11-20T02:29:59.000Z" });
    });
    const r = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!;
    expect(r.criadas.map((c) => c.ordemId)).toEqual(["ord_teste_0002"]); // só a 2ª é minha
    expect(ordens()[0]!.encaminhada_em).toBe("2026-11-20T02:29:59.000Z"); // a da outra, intacta
    expect(r.jaEncaminhada).toBe(false);
  });

  it("perdi TODAS as ordens para outra requisição: jaEncaminhada, sem criadas e sem subir a versão", async () => {
    fake.antes("compra_ordens", "update", () => {
      for (const o of ordens()) Object.assign(o, { dir_id: `dir_${String(o.id)}`, encaminhada_em: "2026-11-20T02:29:59.000Z" });
    });
    const r = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!;
    expect(r.criadas).toEqual([]);
    expect(r.jaEncaminhada).toBe(true);
    expect(fake.linhas("compras")[0]!.updated_at).toBe(VERSAO);
  });

  it("dois cliques SIMULTÂNEOS: a DIR fica com UMA linha por ordem, só um dos dois encaminha e o outro não erra (ou leva 409 de versão)", async () => {
    const resultados = await Promise.allSettled([encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }), encaminharCompra(ID, corpo(), "Teste", { agora: AGORA })]);
    expect(dir().map((l) => l.id).sort()).toEqual(["dir_ord_teste_0001", "dir_ord_teste_0002"]);
    const quemCriou = resultados.filter((r) => r.status === "fulfilled" && r.value!.criadas.length > 0);
    expect(quemCriou).toHaveLength(1);
    for (const r of resultados) {
      if (r.status === "rejected") expect((r.reason as { statusCode?: number }).statusCode).toBe(409);
    }
    expect(ordens().map((o) => o.dir_id)).toEqual(["dir_ord_teste_0001", "dir_ord_teste_0002"]);
  });
});

describe("encaminhar — validações (nada é gravado quando falham)", () => {
  const nadaGravado = (): void => {
    expect(escritas("dir")).toEqual([]);
    expect(escritas("compra_ordens")).toEqual([]);
    expect(escritas("compras")).toEqual([]);
  };

  it("compra cancelada: 409", async () => {
    semear({ cancelada: true });
    const e = await erroDe(encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }));
    expect(e.status).toBe(409);
    expect(e.data.code).toBe("compra_cancelada");
    nadaGravado();
  });

  it("versão antiga: 409 com a compra ATUAL em data.atual", async () => {
    const e = await erroDe(encaminharCompra(ID, { atualizadoEm: "2026-11-19T11:00:00.000Z" }, "Teste", { agora: AGORA }));
    expect(e.status).toBe(409);
    expect((e.data.atual as Compra).id).toBe(ID);
    expect((e.data.atual as Compra).updatedAt).toBe(VERSAO);
    nadaGravado();
  });

  it("compra alterada em outra aba (a versão subiu): 409, e o Encaminhar não grava nada", async () => {
    fake.linhas("compras")[0]!.updated_at = "2026-11-19T12:00:05.000Z";
    expect((await erroDe(encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))).status).toBe(409);
    nadaGravado();
  });

  it("checklist com erro: 422 com o código e a lista dos erros", async () => {
    fake.linhas("compras")[0]!.medico = "";
    const e = await erroDe(encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }));
    expect(e.status).toBe(422);
    expect(e.data.code).toBe("checklist_com_erros");
    expect((e.data.erros as Array<{ id: string }>).map((x) => x.id)).toEqual(["medico"]);
    nadaGravado();
  });

  it("vendedor que não é consultor ATIVO: 422 com a mensagem pedida", async () => {
    semear({ vendedor: CONSULTOR_INATIVO_FIXTURE });
    const e = await erroDe(encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }));
    expect(e.status).toBe(422);
    expect(e.msg).toBe("Escolha um consultor ativo para o vendedor desta compra");
    expect(e.data.code).toBe("vendedor_inativo");
    nadaGravado();
  });

  it("PO repetido DENTRO da compra: 422 listando os POs", async () => {
    fake.tabelas.compra_ordens = [linhaOrdem("ord_teste_0001", 1, { po: "PO26-11-0009" }), linhaOrdem("ord_teste_0002", 2, { po: "PO26-11-0009", envio: "Courier Simples", cia: "" })];
    const e = await erroDe(encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }));
    expect(e.status).toBe(422);
    expect(e.msg).toContain("PO26-11-0009");
    expect(e.data.code).toBe("po_repetido_na_compra");
    expect(e.data.pos).toEqual(["PO26-11-0009"]);
    nadaGravado();
  });

  it("PO que JÁ existe na DIR em outra linha: 409 listando os POs", async () => {
    fake.tabelas.dir = [
      { id: "dir_outra_1", po: "PO26-11-0001", paciente: "X", vendedor: "Dani" },
      { id: "dir_outra_2", po: "PO26-11-0002", paciente: "Y", vendedor: "Dani" },
    ];
    const e = await erroDe(encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }));
    expect(e.status).toBe(409);
    expect(e.data.code).toBe("po_ja_na_dir");
    expect(e.data.pos).toEqual(["PO26-11-0001", "PO26-11-0002"]);
    expect(e.msg).toContain("PO26-11-0001");
    expect(dir()).toHaveLength(2); // só as que já existiam
    expect(escritas("dir")).toEqual([]);
    expect(escritas("compra_ordens")).toEqual([]);
  });

  it("PO existente na DIR só em UMA das ordens: o conflito lista só ele", async () => {
    fake.tabelas.dir = [{ id: "dir_outra_2", po: "PO26-11-0002", paciente: "Y", vendedor: "Dani" }];
    const e = await erroDe(encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }));
    expect(e.data.pos).toEqual(["PO26-11-0002"]);
  });

  it("a ordem já encaminhada por esta compra não conta como 'PO na DIR' da ordem que falta", async () => {
    const r1 = (await encaminharCompra(ID, corpo({ ordemIds: ["ord_teste_0001"] }), "Teste", { agora: AGORA }))!;
    const r2 = (await encaminharCompra(ID, { atualizadoEm: r1.compra.updatedAt }, "Teste", { agora: AGORA }))!;
    expect(r2.criadas.map((c) => c.ordemId)).toEqual(["ord_teste_0002"]);
  });

  it("temperatura mista sem confirmar: 422 com o código e as ordens; confirmada: grava a união", async () => {
    fake.tabelas.compra_itens = [linhaItem("itm_a_0001", "ord_teste_0001", 1), linhaItem("itm_a_0002", "ord_teste_0001", 2, { temperatura: "Ambiente" }), linhaItem("itm_a_0003", "ord_teste_0002", 1)];
    const e = await erroDe(encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }));
    expect(e.status).toBe(422);
    expect(e.data.code).toBe("temperatura_mista_nao_confirmada");
    expect(e.data.ordens).toEqual([1]);
    nadaGravado();

    const e2 = await erroDe(encaminharCompra(ID, corpo({ confirmarTemperaturaMista: false }), "Teste", { agora: AGORA }));
    expect(e2.data.code).toBe("temperatura_mista_nao_confirmada");

    await encaminharCompra(ID, corpo({ confirmarTemperaturaMista: true }), "Teste", { agora: AGORA });
    expect(dir().map((l) => l.temperatura)).toEqual(["2°C a 8°C / Ambiente", "2°C a 8°C"]);
  });

  it("sem temperatura mista, a confirmação não é exigida", async () => {
    const r = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!;
    expect(r.criadas).toHaveLength(2);
  });

  it("texto de medicamento que não cabe na DIR (301 caracteres): erro de checklist; nada é gravado", async () => {
    fake.linhas("compra_itens")[0]!.medicamento = "A".repeat(300);
    const e = await erroDe(encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }));
    expect(e.status).toBe(422);
    expect((e.data.erros as Array<{ id: string }>).some((x) => x.id === "ordem-1-texto-dir")).toBe(true);
    nadaGravado();
  });

  it("união de temperaturas grande demais para a DIR: o erro vem na lista de erros (a linha não cabe) e nada é gravado", async () => {
    const itens: Array<Record<string, unknown>> = [];
    for (let i = 1; i <= 20; i++) itens.push(linhaItem(`itm_t_${String(i).padStart(4, "0")}`, "ord_teste_0001", i, { medicamento: "M", apresentacao: "", temperatura: `Temperatura numero ${i} de teste com texto comprido` }));
    itens.push(linhaItem("itm_t_9999", "ord_teste_0002", 1));
    fake.tabelas.compra_itens = itens;
    const e = await erroDe(encaminharCompra(ID, corpo({ confirmarTemperaturaMista: true }), "Teste", { agora: AGORA }));
    expect(e.status).toBe(422);
    expect((e.data.erros as Array<{ id: string }>).map((x) => x.id)).toEqual(["ordem-1-linha-dir"]);
    nadaGravado();
  });

  it("só valem os erros das ordens a encaminhar: uma ordem JÁ encaminhada com problema não impede a outra", async () => {
    fake.tabelas.compra_ordens = [
      linhaOrdem("ord_teste_0001", 1, { fornecedor: "", dir_id: "dir_ord_teste_0001", encaminhada_em: VERSAO }),
      linhaOrdem("ord_teste_0002", 2, { envio: "Courier Simples", cia: "" }),
    ];
    const r = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!;
    expect(r.criadas.map((c) => c.ordemId)).toEqual(["ord_teste_0002"]);
  });
});

describe("encaminhar — a compra continua editável e a versão avança", () => {
  it("depois de encaminhar, o GET da compra mostra dir_id e encaminhada_em, e a versão nova é a que o cliente deve usar", async () => {
    const r = (await encaminharCompra(ID, corpo(), "Teste", { agora: AGORA }))!;
    const lida = (await obterCompra(ID))!;
    expect(lida.updatedAt).toBe(r.compra.updatedAt);
    expect(lida.ordens[0]).toMatchObject({ dirId: "dir_ord_teste_0001", encaminhadaEm: AGORA.toISOString() });
  });
});
