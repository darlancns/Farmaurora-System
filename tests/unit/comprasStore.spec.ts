import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Compra, CompraEstado, ItemCompraEstado, OrdemCompraEstado } from "../../shared/types/compra";
import { FakeSupabase } from "./helpers/fakeSupabase";

// comprasStore com o cliente Supabase em memória (tests/unit/helpers/fakeSupabase.ts). As unicidades do banco são ligadas no fake
// (`unico`), conferidas no FIM de cada comando, como as constraints deferrable: a troca de posições num comando só passa, e a
// duplicata entre dois comandos derruba o comando. Dados fictícios (TESTE).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const store = await import("../../server/utils/comprasStore");
const {
  ComprasRegraError,
  MAX_TENTATIVAS_NUMERO,
  MENSAGEM_COMPRA_CANCELADA,
  MENSAGEM_CONFLITO_VERSAO,
  MENSAGEM_ID_DE_OUTRA_COMPRA,
  MENSAGEM_NUMERO_ESGOTADO,
  MENSAGEM_REFERENCIA_INVALIDA,
  NOME_UNICO_SEQUENCIA,
  anoMesDeBrasilia,
  cancelarCompra,
  criarCompra,
  duplicarCompra,
  listarComprasDoMes,
  obterCompra,
  proximaVersao,
  salvarCompra,
} = store;

const NOME_UNICO_ORDEM = "compra_ordens_compra_posicao_uq";
const NOME_UNICO_ITEM = "compra_itens_ordem_posicao_uq";

function limparBanco(): void {
  for (const t of ["compras", "compra_ordens", "compra_itens"]) fake.tabelas[t] = [];
  fake.chamadas.length = 0;
}

beforeEach(() => {
  limparBanco();
  // O banco de verdade impõe estas três unicidades.
  (fake as unknown as { unicos: unknown[] }).unicos = [];
  fake.unico("compras", ["ano_mes", "sequencia"], NOME_UNICO_SEQUENCIA);
  fake.unico("compra_ordens", ["compra_id", "posicao"], NOME_UNICO_ORDEM);
  fake.unico("compra_itens", ["ordem_id", "posicao"], NOME_UNICO_ITEM);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T15:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────────────────────

const item = (id: string, medicamento = `TESTE MED ${id}`, extra: Partial<ItemCompraEstado> = {}): ItemCompraEstado => ({
  id,
  medicamento,
  medicamentoCadastroId: null,
  preCadastroId: null,
  apresentacao: "",
  referencia: "",
  laboratorio: "",
  quantidade: "",
  temperatura: "",
  valorUnitario: null,
  valorReal: null,
  ...extra,
});

const ordem = (id: string, itens: ItemCompraEstado[], extra: Partial<OrdemCompraEstado> = {}): OrdemCompraEstado => ({
  id,
  fornecedor: "",
  envio: "",
  cia: "",
  po: "",
  frete: null,
  freteReal: null,
  itens,
  ...extra,
});

const estado = (c: Compra, ordens?: OrdemCompraEstado[], campos: CompraEstado["campos"] = {}): CompraEstado => ({
  atualizadoEm: c.updatedAt,
  campos,
  ...(ordens ? { ordens } : {}),
});

/** A forma de uma compra: [[ordem, [itens...]]...] na ordem do banco. */
const forma = (c: Compra): Array<[string, string[]]> => c.ordens.map((o) => [o.id, o.itens.map((i) => i.id)]);
const posicoes = (c: Compra): Array<[number, number[]]> => c.ordens.map((o) => [o.posicao, o.itens.map((i) => i.posicao)]);

async function erroDe(promessa: Promise<unknown>): Promise<InstanceType<typeof ComprasRegraError>> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ComprasRegraError) return e;
    throw e;
  }
  throw new Error("esperava um erro de regra das Compras, mas a chamada passou");
}

// ── Mês de Brasília ───────────────────────────────────────────────────────────────────────────────────────────

describe("anoMesDeBrasilia — o mês é o de BRASÍLIA, nunca o do fuso do servidor", () => {
  it("a virada do mês: 01h30 UTC de 1º/12 ainda é 30/11 em Brasília; 03h00 UTC já é dezembro", () => {
    expect(anoMesDeBrasilia("2026-12-01T01:30:00Z")).toBe("2026-11");
    expect(anoMesDeBrasilia("2026-12-01T02:59:59.999Z")).toBe("2026-11");
    expect(anoMesDeBrasilia("2026-12-01T03:00:00Z")).toBe("2026-12");
    expect(anoMesDeBrasilia(new Date("2026-12-01T01:30:00Z"))).toBe("2026-11");
  });

  it("a virada do ano e meio do mês", () => {
    expect(anoMesDeBrasilia("2027-01-01T02:59:59Z")).toBe("2026-12");
    expect(anoMesDeBrasilia("2027-01-01T03:00:00Z")).toBe("2027-01");
    expect(anoMesDeBrasilia("2026-11-15T12:00:00Z")).toBe("2026-11");
    expect(anoMesDeBrasilia("2026-11-30T23:30:00-03:00")).toBe("2026-11");
    expect(anoMesDeBrasilia("2026-12-01T00:30:00-03:00")).toBe("2026-12");
  });

  it("sem argumento usa o agora", () => {
    expect(anoMesDeBrasilia()).toBe("2026-11");
  });
});

describe("proximaVersao — a versão nunca fica igual nem menor que a anterior", () => {
  it("agora, ou +1 ms quando o relógio não andou (ou voltou)", () => {
    const agora = Date.parse("2026-11-19T15:00:00.000Z");
    expect(proximaVersao("2026-11-19T14:00:00.000Z", agora)).toBe("2026-11-19T15:00:00.000Z");
    expect(proximaVersao("2026-11-19T15:00:00.000Z", agora)).toBe("2026-11-19T15:00:00.001Z");
    expect(proximaVersao("2026-11-19T16:00:00.000Z", agora)).toBe("2026-11-19T16:00:00.001Z");
    expect(proximaVersao("lixo", agora)).toBe("2026-11-19T15:00:00.000Z");
  });
});

// ── Criar e o contador mensal ─────────────────────────────────────────────────────────────────────────────────

describe("criarCompra — o número do mês", () => {
  it("nasce vazia (rascunho), com responsável e criado_por = quem criou, e número 1", async () => {
    const c = await criarCompra("Cris");
    expect(c).toMatchObject({
      anoMes: "2026-11",
      sequencia: 1,
      cancelada: false,
      paciente: "",
      vendedor: "",
      responsavel: "Cris",
      criadoPor: "Cris",
      atualizadoPor: "Cris",
      compraParticular: false,
      termoPosterior: false,
      pagamentoAlvara: null,
      pagamentoMomento: null,
      documentos: null,
      pendencias: [],
      ordens: [],
    });
    expect(c.id).toMatch(/^cmp_/);
    expect(c.createdAt).toBe("2026-11-19T15:00:00.000Z");
    expect(c.updatedAt).toBe("2026-11-19T15:00:00.000Z");
  });

  it("sequencia = maior do mês + 1 (1, 2, 3...), e cada mês tem a sua contagem", async () => {
    expect((await criarCompra("Cris")).sequencia).toBe(1);
    expect((await criarCompra("Cris")).sequencia).toBe(2);
    expect((await criarCompra("Cris")).sequencia).toBe(3);
    vi.setSystemTime(new Date("2026-12-10T15:00:00.000Z"));
    const dezembro = await criarCompra("Cris");
    expect([dezembro.anoMes, dezembro.sequencia]).toEqual(["2026-12", 1]);
    expect((await criarCompra("Cris")).sequencia).toBe(2);
  });

  it("o maior é NUMÉRICO: com 11 compras no mês a próxima é 12 (não 10)", async () => {
    for (let n = 1; n <= 11; n++) await criarCompra("Cris");
    expect((await criarCompra("Cris")).sequencia).toBe(12);
  });

  it("cancelada continua ocupando o número (o número nunca é reaproveitado)", async () => {
    const a = await criarCompra("Cris");
    await cancelarCompra(a.id, "Cris");
    expect((await criarCompra("Cris")).sequencia).toBe(2);
  });

  it("a virada do mês de Brasília (2026-12-01T01:30Z é 30/11 → 2026-11; 03:00Z → 2026-12)", async () => {
    await criarCompra("Cris"); // 1 em novembro
    vi.setSystemTime(new Date("2026-12-01T01:30:00.000Z"));
    const antesDaVirada = await criarCompra("Cris");
    expect([antesDaVirada.anoMes, antesDaVirada.sequencia]).toEqual(["2026-11", 2]);
    vi.setSystemTime(new Date("2026-12-01T03:00:00.000Z"));
    const depoisDaVirada = await criarCompra("Cris");
    expect([depoisDaVirada.anoMes, depoisDaVirada.sequencia]).toEqual(["2026-12", 1]);
  });
});

describe("criarCompra — disputa pelo número (23505 em compras_mes_sequencia_uq): recalcula e tenta de novo, até 5 vezes", () => {
  /**
   * Faz os N primeiros INSERTs em compras falharem com 23505, como se outra pessoa tivesse pegado o mesmo número no mesmo instante:
   * antes de falhar o stub grava a compra rival com o número disputado (então o recálculo enxerga um número a mais).
   */
  function disputaNasPrimeiras(falhas: number, mensagem = `duplicate key value violates unique constraint "${NOME_UNICO_SEQUENCIA}"`): { tentativas: () => number } {
    let tentativas = 0;
    const from = fake.from.bind(fake);
    vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
      const consulta = from(tabela);
      if (tabela !== "compras") return consulta;
      return Object.assign(consulta, {
        insert: (row: Record<string, unknown>) => {
          tentativas += 1;
          if (tentativas <= falhas) {
            fake.semear("compras", [{ ...row, id: `rival_${tentativas}` }]); // a rival ficou com o número que íamos usar
            return { select: () => Promise.resolve({ data: null, error: { message: mensagem, code: "23505" } }) };
          }
          return from(tabela).insert(row);
        },
      });
    }) as unknown as typeof fake.from);
    return { tentativas: () => tentativas };
  }

  it("perdeu 2 vezes, ganhou na 3ª: o número é o 3º livre", async () => {
    const d = disputaNasPrimeiras(2);
    const c = await criarCompra("Cris");
    expect(d.tentativas()).toBe(3);
    expect(c.sequencia).toBe(3); // 1 e 2 foram das rivais
    expect(fake.linhas("compras").map((r) => r.sequencia)).toEqual([1, 2, 3]);
  });

  it("perdeu 4 vezes, ganhou na 5ª (a última tentativa conta)", async () => {
    const d = disputaNasPrimeiras(MAX_TENTATIVAS_NUMERO - 1);
    const c = await criarCompra("Cris");
    expect(d.tentativas()).toBe(MAX_TENTATIVAS_NUMERO);
    expect(c.sequencia).toBe(MAX_TENTATIVAS_NUMERO);
  });

  it("perdeu todas as 5: 503 com mensagem clara, e a compra não foi criada", async () => {
    const d = disputaNasPrimeiras(MAX_TENTATIVAS_NUMERO);
    const e = await erroDe(criarCompra("Cris"));
    expect(e.statusCode).toBe(503);
    expect(e.message).toBe(MENSAGEM_NUMERO_ESGOTADO);
    expect(d.tentativas()).toBe(MAX_TENTATIVAS_NUMERO);
    expect(fake.linhas("compras").every((r) => String(r.id).startsWith("rival_"))).toBe(true);
  });

  it("23505 de OUTRA constraint (ou outro erro) não é disputa: sobe na hora, sem tentar de novo", async () => {
    const d = disputaNasPrimeiras(10, 'duplicate key value violates unique constraint "compras_pkey"');
    await expect(criarCompra("Cris")).rejects.not.toBeInstanceOf(ComprasRegraError);
    expect(d.tentativas()).toBe(1);

    vi.restoreAllMocks();
    fake.falhar("compras", "insert", "falha injetada");
    await expect(criarCompra("Cris")).rejects.toThrow(/falha ao criar a compra/);
  });

  it("o unique do fake também recusa o número repetido (a disputa real: dois com o mesmo número)", async () => {
    await criarCompra("Cris");
    const repetida = await fake.from("compras").insert({ id: "x", ano_mes: "2026-11", sequencia: 1 });
    expect(repetida.error).toMatchObject({ code: "23505" });
    expect(fake.linhas("compras")).toHaveLength(1);
  });
});

// ── Ler ───────────────────────────────────────────────────────────────────────────────────────────────────────

describe("obterCompra e listarComprasDoMes", () => {
  it("obterCompra: null se não existe; com ordens e itens POR POSIÇÃO", async () => {
    expect(await obterCompra("nao_existe")).toBeNull();
    const c = await criarCompra("Cris");
    // Linhas semeadas fora de ordem.
    fake.semear("compra_ordens", [
      { id: "ord_b0001", compra_id: c.id, posicao: 2, fornecedor: "B", envio: "", cia: "", po: "", frete: "10.50", frete_real: null, dir_id: null, encaminhada_em: null },
      { id: "ord_a0001", compra_id: c.id, posicao: 1, fornecedor: "A", envio: "", cia: "", po: "", frete: null, frete_real: null, dir_id: null, encaminhada_em: null },
    ]);
    fake.semear("compra_itens", [
      { id: "itm_a0002", ordem_id: "ord_a0001", posicao: 2, medicamento: "SEGUNDO", valor_unitario: "0.00" },
      { id: "itm_a0001", ordem_id: "ord_a0001", posicao: 1, medicamento: "PRIMEIRO", valor_unitario: "12.30" },
    ]);
    const lida = (await obterCompra(c.id))!;
    expect(forma(lida)).toEqual([
      ["ord_a0001", ["itm_a0001", "itm_a0002"]],
      ["ord_b0001", []],
    ]);
    expect(lida.ordens[1]!.frete).toBe(10.5);
    expect(lida.ordens[0]!.itens.map((i) => i.valorUnitario)).toEqual([12.3, 0]); // numeric de texto → número; "0.00" é zero
  });

  it("listarComprasDoMes: só o mês pedido, da mais recente para a mais antiga, SEM as canceladas por padrão", async () => {
    const a = await criarCompra("Cris");
    const b = await criarCompra("Cris");
    const c = await criarCompra("Cris");
    await cancelarCompra(b.id, "Cris");
    vi.setSystemTime(new Date("2026-12-10T15:00:00.000Z"));
    await criarCompra("Cris"); // dezembro

    const lista = await listarComprasDoMes("2026-11");
    expect(lista.map((x) => x.sequencia)).toEqual([3, 1]);
    expect(lista.map((x) => x.id)).toEqual([c.id, a.id]);
    expect(lista[0]).not.toHaveProperty("ordens");

    const todas = await listarComprasDoMes("2026-11", { incluirCanceladas: true });
    expect(todas.map((x) => [x.sequencia, x.cancelada])).toEqual([[3, false], [2, true], [1, false]]);
    expect((await listarComprasDoMes("2026-12")).map((x) => x.sequencia)).toEqual([1]);
    expect(await listarComprasDoMes("2025-01")).toEqual([]);
  });

  it("a lista traz o total de ordens e quantas já foram encaminhadas", async () => {
    const c = await criarCompra("Cris");
    fake.semear("compra_ordens", [
      { id: "ord_000001", compra_id: c.id, posicao: 1, dir_id: null, encaminhada_em: null },
      { id: "ord_000002", compra_id: c.id, posicao: 2, dir_id: "dir_1", encaminhada_em: "2026-11-19T16:00:00.000Z" },
    ]);
    const outra = await criarCompra("Cris");
    const lista = await listarComprasDoMes("2026-11");
    expect(lista.find((x) => x.id === c.id)).toMatchObject({ totalOrdens: 2, totalOrdensEncaminhadas: 1 });
    expect(lista.find((x) => x.id === outra.id)).toMatchObject({ totalOrdens: 0, totalOrdensEncaminhadas: 0 });
  });

  it("mês fora do formato AAAA-MM é 400", async () => {
    for (const ruim of ["2026-13", "2026-1", "26-11", "novembro", "", "2026-11-01", "2026-00"]) {
      expect((await erroDe(listarComprasDoMes(ruim))).statusCode, ruim).toBe(400);
    }
  });
});

// ── Cancelar ──────────────────────────────────────────────────────────────────────────────────────────────────

describe("cancelarCompra — cancelada = true, NUNCA um DELETE", () => {
  it("marca a compra, muda a versão e quem mexeu; é idempotente; null se não existe", async () => {
    const c = await criarCompra("Cris");
    const cancelada = (await cancelarCompra(c.id, "Bruno"))!;
    expect(cancelada).toMatchObject({ cancelada: true, atualizadoPor: "Bruno" });
    expect(cancelada.updatedAt > c.updatedAt).toBe(true);
    const denovo = (await cancelarCompra(c.id, "Outro"))!;
    expect(denovo).toMatchObject({ cancelada: true, atualizadoPor: "Bruno", updatedAt: cancelada.updatedAt }); // não regrava
    expect(await cancelarCompra("nao_existe", "Bruno")).toBeNull();
  });

  it("nenhuma operação de exclusão em compras, em nenhum caminho do store", async () => {
    const c = await criarCompra("Cris");
    await salvarCompra(c.id, estado(c, [ordem("ord_000001", [item("itm_000001")])]), "Cris");
    const atual = (await obterCompra(c.id))!;
    await salvarCompra(c.id, estado(atual, []), "Cris");
    await duplicarCompra(c.id, "Cris");
    await cancelarCompra(c.id, "Cris");
    expect(fake.chamadas.filter((x) => x.tabela === "compras" && x.op === "delete")).toEqual([]);
  });

  it("depois de cancelada, salvar é 409 (compra cancelada) e não grava nada", async () => {
    const c = await criarCompra("Cris");
    const cancelada = (await cancelarCompra(c.id, "Cris"))!;
    const e = await erroDe(salvarCompra(c.id, estado(cancelada, undefined, { paciente: "NOVO" }), "Cris"));
    expect(e).toMatchObject({ statusCode: 409, message: MENSAGEM_COMPRA_CANCELADA });
    expect(fake.linhas("compras")[0]!.paciente).toBe("");
  });
});

// ── Salvar: campos e versão ───────────────────────────────────────────────────────────────────────────────────

describe("salvarCompra — campos", () => {
  it("grava só os campos que vieram (ausente = não muda), troca a versão e quem mexeu", async () => {
    const c = await criarCompra("Cris");
    const r1 = (await salvarCompra(c.id, estado(c, undefined, { paciente: "PACIENTE TESTE", isencao: true, pendencias: ["Receita"], pagamentoMomento: "apos_awb" }), "Bruno"))!;
    expect(r1).toMatchObject({ paciente: "PACIENTE TESTE", isencao: true, pendencias: ["Receita"], pagamentoMomento: "apos_awb", atualizadoPor: "Bruno", responsavel: "Cris" });
    expect(r1.updatedAt > c.updatedAt).toBe(true);

    const r2 = (await salvarCompra(c.id, { atualizadoEm: r1.updatedAt, campos: { medico: "Dr. Teste", pagamentoMomento: null } }, "Bruno"))!;
    expect(r2).toMatchObject({ paciente: "PACIENTE TESTE", medico: "Dr. Teste", isencao: true, pagamentoMomento: null }); // o resto ficou
  });

  it("sem `ordens` não mexe nas ordens e itens", async () => {
    const c = await criarCompra("Cris");
    const r1 = (await salvarCompra(c.id, estado(c, [ordem("ord_000001", [item("itm_000001")])]), "Cris"))!;
    const r2 = (await salvarCompra(c.id, { atualizadoEm: r1.updatedAt, campos: { paciente: "X" } }, "Cris"))!;
    expect(forma(r2)).toEqual([["ord_000001", ["itm_000001"]]]);
  });

  it("compra que não existe: null", async () => {
    expect(await salvarCompra("nao_existe", { atualizadoEm: "2026-11-19T15:00:00.000Z", campos: {} }, "Cris")).toBeNull();
  });

  it("antesDeGravar recebe a compra como está e, se lançar, NADA é gravado", async () => {
    const c = await criarCompra("Cris");
    let recebida: Compra | null = null;
    await expect(
      salvarCompra(c.id, estado(c, [ordem("ord_000001", [])], { paciente: "NAO_GRAVA" }), "Cris", {
        antesDeGravar: async (atual) => {
          recebida = atual;
          throw new ComprasRegraError("recusado pela validação", 422);
        },
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect((recebida as Compra | null)?.id).toBe(c.id);
    expect(fake.linhas("compras")[0]).toMatchObject({ paciente: "", updated_at: c.updatedAt });
    expect(fake.linhas("compra_ordens")).toHaveLength(0);
  });
});

describe("salvarCompra — concorrência (dois operacionais na mesma compra)", () => {
  it("versão antiga: 409 com a compra ATUAL na resposta, e nada é gravado", async () => {
    const c = await criarCompra("Cris");
    const r1 = (await salvarCompra(c.id, estado(c, undefined, { paciente: "DA PESSOA A" }), "A"))!;
    const e = await erroDe(salvarCompra(c.id, estado(c, undefined, { paciente: "DA PESSOA B" }), "B")); // B ainda vê a versão antiga
    expect(e).toMatchObject({ statusCode: 409, message: MENSAGEM_CONFLITO_VERSAO });
    expect((e.data as { atual: Compra }).atual).toMatchObject({ paciente: "DA PESSOA A", updatedAt: r1.updatedAt });
    expect(fake.linhas("compras")[0]!.paciente).toBe("DA PESSOA A");
  });

  it("B recarrega e salva de novo com a versão nova: passa", async () => {
    const c = await criarCompra("Cris");
    const r1 = (await salvarCompra(c.id, estado(c, undefined, { paciente: "A" }), "A"))!;
    const r2 = (await salvarCompra(c.id, estado(r1, undefined, { medico: "B" }), "B"))!;
    expect(r2).toMatchObject({ paciente: "A", medico: "B", atualizadoPor: "B" });
  });

  it("dois salvamentos com a MESMA versão: só um passa (o segundo leva 409), mesmo no mesmo milissegundo", async () => {
    const c = await criarCompra("Cris");
    await salvarCompra(c.id, estado(c, undefined, { paciente: "PRIMEIRO" }), "A"); // relógio parado: a versão ainda assim muda
    const e = await erroDe(salvarCompra(c.id, estado(c, undefined, { paciente: "SEGUNDO" }), "B"));
    expect(e.statusCode).toBe(409);
    expect(fake.linhas("compras")[0]!.paciente).toBe("PRIMEIRO");
  });

  it("alguém salva ENTRE a leitura e a gravação: o compare-and-swap barra (409 com a versão dessa pessoa)", async () => {
    const c = await criarCompra("Cris");
    const from = fake.from.bind(fake);
    vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
      const consulta = from(tabela);
      if (tabela !== "compras") return consulta;
      return Object.assign(consulta, {
        update: (patch: Record<string, unknown>) => {
          // O rival grava primeiro.
          Object.assign(fake.linhas("compras")[0]!, { paciente: "DO RIVAL", updated_at: "2026-11-19T15:00:05.000Z" });
          return from(tabela).update(patch);
        },
      });
    }) as unknown as typeof fake.from);
    const e = await erroDe(salvarCompra(c.id, estado(c, [ordem("ord_000001", [item("itm_000001")])], { paciente: "MEU" }), "Eu"));
    expect(e.statusCode).toBe(409);
    expect((e.data as { atual: Compra }).atual).toMatchObject({ paciente: "DO RIVAL", updatedAt: "2026-11-19T15:00:05.000Z" });
    expect(fake.linhas("compras")[0]!.paciente).toBe("DO RIVAL");
    expect(fake.linhas("compra_ordens")).toHaveLength(0); // as filhas nem foram tocadas
  });

  it("a versão compara o instante, não o texto (o '+00:00' do Postgres e o 'Z' são a mesma versão)", async () => {
    const c = await criarCompra("Cris");
    fake.linhas("compras")[0]!.updated_at = "2026-11-19T15:00:00.000+00:00"; // como o banco devolve
    const r = (await salvarCompra(c.id, { atualizadoEm: "2026-11-19T15:00:00.000Z", campos: { paciente: "OK" } }, "Cris"))!;
    expect(r.paciente).toBe("OK");
  });
});

// ── Salvar: ordens e itens (a sincronização) ─────────────────────────────────────────────────────────────────

describe("salvarCompra — ordens e itens", () => {
  async function comTres(): Promise<Compra> {
    const c = await criarCompra("Cris");
    return (await salvarCompra(
      c.id,
      estado(c, [
        ordem("ord_aaaaaa", [item("itm_a00001"), item("itm_a00002"), item("itm_a00003")], { fornecedor: "FORNECEDOR A", frete: 100 }),
        ordem("ord_bbbbbb", [item("itm_b00001"), item("itm_b00002")], { fornecedor: "FORNECEDOR B" }),
        ordem("ord_cccccc", [item("itm_c00001")], { fornecedor: "FORNECEDOR C", po: "PO26-11-0003" }),
      ]),
      "Cris",
    ))!;
  }

  it("ids novos vindos do cliente: grava ordens e itens com a posição = a ordem do array (1..N)", async () => {
    const c = await comTres();
    expect(forma(c)).toEqual([
      ["ord_aaaaaa", ["itm_a00001", "itm_a00002", "itm_a00003"]],
      ["ord_bbbbbb", ["itm_b00001", "itm_b00002"]],
      ["ord_cccccc", ["itm_c00001"]],
    ]);
    expect(posicoes(c)).toEqual([[1, [1, 2, 3]], [2, [1, 2]], [3, [1]]]);
    expect(c.ordens[0]).toMatchObject({ fornecedor: "FORNECEDOR A", frete: 100 });
    expect(c.ordens[2]!.po).toBe("PO26-11-0003");
  });

  it("dinheiro: número com 2 casas vai e volta (0 é zero, null é vazio); quantidade é texto", async () => {
    const c = await criarCompra("Cris");
    const r = (await salvarCompra(
      c.id,
      estado(c, [ordem("ord_aaaaaa", [item("itm_a00001", "TESTE MED", { quantidade: "12 ampolas", valorUnitario: 1234.5, valorReal: 0 }), item("itm_a00002", "TESTE MED 2")], { frete: 0, freteReal: 140.5 })]),
      "Cris",
    ))!;
    expect(r.ordens[0]).toMatchObject({ frete: 0, freteReal: 140.5 });
    expect(r.ordens[0]!.itens[0]).toMatchObject({ quantidade: "12 ampolas", valorUnitario: 1234.5, valorReal: 0 });
    expect(r.ordens[0]!.itens[1]).toMatchObject({ valorUnitario: null, valorReal: null });
  });

  it("editar sem mudar a forma é o caminho rápido: dois comandos de escrita, nenhum delete", async () => {
    const c = await comTres();
    fake.chamadas.length = 0;
    const novas = c.ordens.map((o) => ordem(o.id, o.itens.map((i) => item(i.id, `${i.medicamento} EDITADO`)), { fornecedor: o.fornecedor }));
    const r = (await salvarCompra(c.id, estado(c, novas), "Cris"))!;
    expect(r.ordens[0]!.itens[0]!.medicamento).toMatch(/EDITADO$/);
    const escritas = fake.chamadas.filter((x) => x.op !== "select");
    expect(escritas.map((x) => `${x.tabela}:${x.op}`)).toEqual(["compras:update", "compra_ordens:upsert", "compra_itens:upsert"]);
  });

  it("REMOVER A ORDEM DO MEIO: as outras sobem de posição (1, 2), a removida e seus itens somem, nenhuma unicidade é violada", async () => {
    const c = await comTres();
    const r = (await salvarCompra(c.id, estado(c, [ordem("ord_aaaaaa", [item("itm_a00001"), item("itm_a00002"), item("itm_a00003")]), ordem("ord_cccccc", [item("itm_c00001")])]), "Cris"))!;
    expect(forma(r)).toEqual([
      ["ord_aaaaaa", ["itm_a00001", "itm_a00002", "itm_a00003"]],
      ["ord_cccccc", ["itm_c00001"]],
    ]);
    expect(posicoes(r)).toEqual([[1, [1, 2, 3]], [2, [1]]]);
    expect(fake.linhas("compra_ordens").map((o) => o.id).sort()).toEqual(["ord_aaaaaa", "ord_cccccc"]);
    expect(fake.linhas("compra_itens").map((i) => i.id)).not.toContain("itm_b00001");
    expect(fake.linhas("compra_itens")).toHaveLength(4);
  });

  it("TROCAR A ORDEM DE DOIS ITENS (e de duas ordens): as posições trocam sem violar a unicidade", async () => {
    const c = await comTres();
    const r = (await salvarCompra(
      c.id,
      estado(c, [
        ordem("ord_cccccc", [item("itm_c00001")]),
        ordem("ord_aaaaaa", [item("itm_a00003"), item("itm_a00002"), item("itm_a00001")]),
        ordem("ord_bbbbbb", [item("itm_b00002"), item("itm_b00001")]),
      ]),
      "Cris",
    ))!;
    expect(forma(r)).toEqual([
      ["ord_cccccc", ["itm_c00001"]],
      ["ord_aaaaaa", ["itm_a00003", "itm_a00002", "itm_a00001"]],
      ["ord_bbbbbb", ["itm_b00002", "itm_b00001"]],
    ]);
    expect(posicoes(r)).toEqual([[1, [1]], [2, [1, 2, 3]], [3, [1, 2]]]);
  });

  it("remover o item do meio, e inserir um item novo no meio, reposicionam sem violar", async () => {
    const c = await comTres();
    const semMeio = (await salvarCompra(c.id, estado(c, [ordem("ord_aaaaaa", [item("itm_a00001"), item("itm_a00003")]), ordem("ord_bbbbbb", c.ordens[1]!.itens.map((i) => item(i.id))), ordem("ord_cccccc", [item("itm_c00001")])]), "Cris"))!;
    expect(forma(semMeio)[0]).toEqual(["ord_aaaaaa", ["itm_a00001", "itm_a00003"]]);
    expect(posicoes(semMeio)[0]).toEqual([1, [1, 2]]);

    const comNovo = (await salvarCompra(semMeio.id, estado(semMeio, [ordem("ord_aaaaaa", [item("itm_a00001"), item("itm_novo001"), item("itm_a00003")]), ordem("ord_bbbbbb", semMeio.ordens[1]!.itens.map((i) => item(i.id))), ordem("ord_cccccc", [item("itm_c00001")])]), "Cris"))!;
    expect(forma(comNovo)[0]).toEqual(["ord_aaaaaa", ["itm_a00001", "itm_novo001", "itm_a00003"]]);
    expect(posicoes(comNovo)[0]).toEqual([1, [1, 2, 3]]);
  });

  it("mover um item de uma ordem para outra, inclusive de uma ordem que está sendo REMOVIDA: o item sobrevive (a cascata não o leva)", async () => {
    const c = await comTres();
    // B é removida; seu item itm_b00001 vai para A, itm_b00002 vai para uma ordem nova.
    const r = (await salvarCompra(
      c.id,
      estado(c, [
        ordem("ord_aaaaaa", [item("itm_a00001"), item("itm_b00001", "MOVIDO"), item("itm_a00002"), item("itm_a00003")]),
        ordem("ord_cccccc", [item("itm_c00001")]),
        ordem("ord_novo001", [item("itm_b00002", "MOVIDO 2")]),
      ]),
      "Cris",
    ))!;
    expect(forma(r)).toEqual([
      ["ord_aaaaaa", ["itm_a00001", "itm_b00001", "itm_a00002", "itm_a00003"]],
      ["ord_cccccc", ["itm_c00001"]],
      ["ord_novo001", ["itm_b00002"]],
    ]);
    expect(posicoes(r)).toEqual([[1, [1, 2, 3, 4]], [2, [1]], [3, [1]]]);
    expect(r.ordens[0]!.itens[1]!.medicamento).toBe("MOVIDO");
    expect(fake.linhas("compra_ordens").map((o) => o.id)).not.toContain("ord_bbbbbb");
  });

  it("remover todas as ordens (estado vazio) apaga todas as ordens e itens; `ordens: []` é válido", async () => {
    const c = await comTres();
    const r = (await salvarCompra(c.id, estado(c, []), "Cris"))!;
    expect(r.ordens).toEqual([]);
    expect(fake.linhas("compra_ordens")).toHaveLength(0);
    expect(fake.linhas("compra_itens")).toHaveLength(0);
  });

  it("tudo junto numa gravação: ordem nova no começo, remover uma, trocar itens, editar campos", async () => {
    const c = await comTres();
    const r = (await salvarCompra(
      c.id,
      estado(
        c,
        [ordem("ord_novo001", [item("itm_nov0001")], { fornecedor: "NOVO" }), ordem("ord_cccccc", [item("itm_c00001")]), ordem("ord_aaaaaa", [item("itm_a00003"), item("itm_a00001")])],
        { paciente: "DEPOIS" },
      ),
      "Cris",
    ))!;
    expect(forma(r)).toEqual([
      ["ord_novo001", ["itm_nov0001"]],
      ["ord_cccccc", ["itm_c00001"]],
      ["ord_aaaaaa", ["itm_a00003", "itm_a00001"]],
    ]);
    expect(posicoes(r)).toEqual([[1, [1]], [2, [1]], [3, [1, 2]]]);
    expect(r.paciente).toBe("DEPOIS");
    expect(fake.linhas("compra_itens").map((i) => i.id).sort()).toEqual(["itm_a00001", "itm_a00003", "itm_c00001", "itm_nov0001"]);
  });

  it("uma ordem encaminhada continua editável e NÃO perde dir_id nem encaminhada_em ao ser salva", async () => {
    const c = await comTres();
    Object.assign(fake.linhas("compra_ordens").find((o) => o.id === "ord_aaaaaa")!, { dir_id: "dir_9", encaminhada_em: "2026-11-19T16:00:00.000Z", po: "PO26-11-0009" });
    const atual = (await obterCompra(c.id))!;
    const r = (await salvarCompra(c.id, estado(atual, atual.ordens.map((o) => ordem(o.id, o.itens.map((i) => item(i.id)), { fornecedor: `${o.fornecedor} EDITADO`, po: o.po }))), "Cris"))!;
    expect(r.ordens[0]).toMatchObject({ id: "ord_aaaaaa", fornecedor: "FORNECEDOR A EDITADO", dirId: "dir_9", encaminhadaEm: "2026-11-19T16:00:00.000Z" });
    // E mesmo numa mudança de forma (a ordem do meio sai):
    const r2 = (await salvarCompra(c.id, estado(r, [ordem("ord_aaaaaa", r.ordens[0]!.itens.map((i) => item(i.id))), ordem("ord_cccccc", [item("itm_c00001")])]), "Cris"))!;
    expect(r2.ordens[0]).toMatchObject({ dirId: "dir_9", encaminhadaEm: "2026-11-19T16:00:00.000Z" });
  });

  it("nenhuma linha gravada tem dir_id ou encaminhada_em vindo do estado (o upsert não leva essas colunas)", async () => {
    const c = await criarCompra("Cris");
    const r = (await salvarCompra(c.id, estado(c, [ordem("ord_aaaaaa", [])]), "Cris"))!;
    expect(r.ordens[0]).toMatchObject({ dirId: null, encaminhadaEm: null });
    expect(Object.keys(fake.linhas("compra_ordens")[0]!)).not.toContain("dir_id");
  });
});

describe("salvarCompra — sequestro de id (409)", () => {
  async function duasCompras(): Promise<{ a: Compra; b: Compra }> {
    const a = await criarCompra("Cris");
    const b = await criarCompra("Cris");
    const a2 = (await salvarCompra(a.id, estado(a, [ordem("ord_da_a001", [item("itm_da_a001", "ITEM DA A")])], { paciente: "COMPRA A" }), "Cris"))!;
    const b2 = (await salvarCompra(b.id, estado(b, [ordem("ord_da_b001", [item("itm_da_b001", "ITEM DA B")], { fornecedor: "FORNECEDOR DA B" })], { paciente: "COMPRA B" }), "Cris"))!;
    return { a: a2, b: b2 };
  }

  it("usar o id de ORDEM de outra compra: 409 e nada é gravado (nem na compra, nem na alheia)", async () => {
    const { a, b } = await duasCompras();
    const antes = JSON.stringify([fake.linhas("compras"), fake.linhas("compra_ordens"), fake.linhas("compra_itens")]);
    const e = await erroDe(salvarCompra(a.id, estado(a, [ordem("ord_da_b001", [], { fornecedor: "SEQUESTRADA" })], { paciente: "NAO_GRAVA" }), "Cris"));
    expect(e).toMatchObject({ statusCode: 409, message: MENSAGEM_ID_DE_OUTRA_COMPRA });
    expect(JSON.stringify([fake.linhas("compras"), fake.linhas("compra_ordens"), fake.linhas("compra_itens")])).toBe(antes);
    expect((await obterCompra(b.id))!.ordens[0]).toMatchObject({ fornecedor: "FORNECEDOR DA B" });
  });

  it("usar o id de ITEM de outra compra (dentro de uma ordem própria): 409 e a compra alheia fica intacta", async () => {
    const { a, b } = await duasCompras();
    const e = await erroDe(salvarCompra(a.id, estado(a, [ordem("ord_da_a001", [item("itm_da_b001", "SEQUESTRADO")])]), "Cris"));
    expect(e).toMatchObject({ statusCode: 409, message: MENSAGEM_ID_DE_OUTRA_COMPRA });
    expect((await obterCompra(b.id))!.ordens[0]!.itens[0]).toMatchObject({ id: "itm_da_b001", medicamento: "ITEM DA B" });
    expect((await obterCompra(a.id))!.ordens[0]!.itens[0]!.medicamento).toBe("ITEM DA A");
  });

  it("os próprios ids (inclusive item movido para outra ordem DA MESMA compra) NÃO são sequestro", async () => {
    const c = await criarCompra("Cris");
    const r1 = (await salvarCompra(c.id, estado(c, [ordem("ord_aaaaaa", [item("itm_a00001")]), ordem("ord_bbbbbb", [item("itm_b00001")])]), "Cris"))!;
    const r2 = (await salvarCompra(c.id, estado(r1, [ordem("ord_aaaaaa", [item("itm_a00001"), item("itm_b00001")]), ordem("ord_bbbbbb", [])]), "Cris"))!;
    expect(forma(r2)).toEqual([["ord_aaaaaa", ["itm_a00001", "itm_b00001"]], ["ord_bbbbbb", []]]);
  });
});

describe("salvarCompra — erros do banco", () => {
  it("medicamento do Cadastro ou pré-cadastro que não existe (23503, chave estrangeira): 422", async () => {
    const c = await criarCompra("Cris");
    const from = fake.from.bind(fake);
    vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
      const consulta = from(tabela);
      if (tabela !== "compra_itens") return consulta;
      return Object.assign(consulta, {
        upsert: () => Promise.resolve({ data: null, error: { message: 'violates foreign key constraint "compra_itens_medicamento_cadastro_id_fkey"', code: "23503" } }),
      });
    }) as unknown as typeof fake.from);
    const e = await erroDe(salvarCompra(c.id, estado(c, [ordem("ord_aaaaaa", [item("itm_a00001", "X", { medicamentoCadastroId: "med_inexistente" })])]), "Cris"));
    expect(e).toMatchObject({ statusCode: 422, message: MENSAGEM_REFERENCIA_INVALIDA });
  });

  it("outro erro do banco sobe como erro comum (500), não como regra", async () => {
    const c = await criarCompra("Cris");
    fake.falhar("compras", "update", "falha injetada");
    await expect(salvarCompra(c.id, estado(c, undefined, { paciente: "X" }), "Cris")).rejects.not.toBeInstanceOf(ComprasRegraError);
  });
});

// ── Duplicar ──────────────────────────────────────────────────────────────────────────────────────────────────

describe("duplicarCompra", () => {
  async function original(): Promise<Compra> {
    const c = await criarCompra("Cris");
    const salva = (await salvarCompra(
      c.id,
      estado(
        c,
        [
          ordem("ord_aaaaaa", [item("itm_a00001", "TESTE MED A", { quantidade: "12 ampolas", valorUnitario: 10.5, medicamentoCadastroId: null }), item("itm_a00002", "TESTE MED B")], { fornecedor: "FORNECEDOR A", envio: "Aéreo", cia: "CIA TESTE", po: "PO26-11-0001", frete: 150, freteReal: 140.5 }),
          ordem("ord_bbbbbb", [item("itm_b00001", "TESTE MED C")], { fornecedor: "FORNECEDOR B" }),
        ],
        { paciente: "PACIENTE TESTE", vendedor: "VENDEDOR TESTE", responsavel: "RESPONSAVEL TESTE", isencao: true, pendencias: ["Receita"], termoPosterior: true, termoObservacao: "obs", pagamentoAlvara: true, pagamentoMomento: "vamos_pagar", documentos: false },
      ),
      "Cris",
    ))!;
    // A ordem A já foi encaminhada à DIR.
    Object.assign(fake.linhas("compra_ordens").find((o) => o.id === "ord_aaaaaa")!, { dir_id: "dir_9", encaminhada_em: "2026-11-19T16:00:00.000Z" });
    return (await obterCompra(salva.id))!;
  }

  it("cria uma NOVA compra no próximo número do mês ATUAL de Brasília, com os mesmos dados", async () => {
    const o = await original();
    vi.setSystemTime(new Date("2026-12-10T15:00:00.000Z"));
    const copia = (await duplicarCompra(o.id, "Bruno"))!;
    expect(copia.id).not.toBe(o.id);
    expect([copia.anoMes, copia.sequencia]).toEqual(["2026-12", 1]); // mês atual, não o da original
    expect(copia).toMatchObject({
      cancelada: false,
      paciente: "PACIENTE TESTE",
      vendedor: "VENDEDOR TESTE",
      responsavel: "RESPONSAVEL TESTE",
      isencao: true,
      pendencias: ["Receita"],
      termoPosterior: true,
      termoObservacao: "obs",
      pagamentoAlvara: true,
      pagamentoMomento: "vamos_pagar",
      documentos: false,
      criadoPor: "Bruno",
      atualizadoPor: "Bruno",
      createdAt: "2026-12-10T15:00:00.000Z",
    });
  });

  it("copia as ordens e os itens com IDS NOVOS e as mesmas posições e valores", async () => {
    const o = await original();
    const copia = (await duplicarCompra(o.id, "Bruno"))!;
    expect(copia.ordens).toHaveLength(2);
    expect(posicoes(copia)).toEqual([[1, [1, 2]], [2, [1]]]);
    const idsOriginais = new Set([...o.ordens.map((x) => x.id), ...o.ordens.flatMap((x) => x.itens.map((i) => i.id))]);
    for (const id of [...copia.ordens.map((x) => x.id), ...copia.ordens.flatMap((x) => x.itens.map((i) => i.id))]) expect(idsOriginais.has(id), id).toBe(false);
    expect(copia.ordens[0]).toMatchObject({ fornecedor: "FORNECEDOR A", envio: "Aéreo", cia: "CIA TESTE", frete: 150, freteReal: 140.5 });
    expect(copia.ordens[0]!.itens[0]).toMatchObject({ medicamento: "TESTE MED A", quantidade: "12 ampolas", valorUnitario: 10.5 });
    expect(copia.ordens[1]!.itens[0]!.medicamento).toBe("TESTE MED C");
  });

  it("LIMPA po, dir_id, encaminhada_em e cancelada (a original, inclusive cancelada, não muda)", async () => {
    const o = await original();
    await cancelarCompra(o.id, "Cris");
    const copia = (await duplicarCompra(o.id, "Bruno"))!;
    expect(copia.cancelada).toBe(false);
    for (const ordem of copia.ordens) expect(ordem).toMatchObject({ po: "", dirId: null, encaminhadaEm: null });
    const original2 = (await obterCompra(o.id))!;
    expect(original2.cancelada).toBe(true);
    expect(original2.ordens[0]).toMatchObject({ po: "PO26-11-0001", dirId: "dir_9", encaminhadaEm: "2026-11-19T16:00:00.000Z" });
  });

  it("duplicar duas vezes dá dois números seguidos; compra que não existe é null", async () => {
    const o = await original();
    const a = (await duplicarCompra(o.id, "Bruno"))!;
    const b = (await duplicarCompra(o.id, "Bruno"))!;
    expect([a.sequencia, b.sequencia]).toEqual([o.sequencia + 1, o.sequencia + 2]);
    expect(await duplicarCompra("nao_existe", "Bruno")).toBeNull();
  });

  it("compra sem ordens também duplica", async () => {
    const c = await criarCompra("Cris");
    const copia = (await duplicarCompra(c.id, "Bruno"))!;
    expect(copia.ordens).toEqual([]);
    expect(copia.sequencia).toBe(2);
  });

  it("se copiar as ordens falhar, a cópia é CANCELADA (compra não se apaga) e o erro sobe", async () => {
    const o = await original();
    fake.falhar("compra_ordens", "insert", "falha injetada");
    await expect(duplicarCompra(o.id, "Bruno")).rejects.toThrow(/copiar as ordens/);
    const rascunho = fake.linhas("compras").find((r) => r.id !== o.id)!;
    expect(rascunho.cancelada).toBe(true);
    expect(fake.chamadas.filter((x) => x.tabela === "compras" && x.op === "delete")).toEqual([]);
    expect((await obterCompra(o.id))!.cancelada).toBe(false);
  });
});
