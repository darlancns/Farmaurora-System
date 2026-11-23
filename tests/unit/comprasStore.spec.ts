import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Compra, CompraEstado, ItemCompraEstado } from "../../shared/types/compra";
import { FakeSupabase } from "./helpers/fakeSupabase";

// comprasStore (UMA compra por fornecedor: compras + compra_itens) com o cliente Supabase em memória (tests/unit/helpers/fakeSupabase.ts).
// As unicidades do banco são ligadas no fake (`unico`), conferidas no FIM de cada comando, como as constraints deferrable: a troca de
// posições num comando só passa, e a duplicata entre dois comandos derruba o comando. Dados fictícios (TESTE).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const store = await import("../../server/utils/comprasStore");
const { ComprasRegraError } = await import("../../server/utils/comprasErro");
const {
  MENSAGEM_COMPRA_CANCELADA,
  MENSAGEM_CONFLITO_VERSAO,
  MENSAGEM_ID_DE_OUTRA_COMPRA,
  MENSAGEM_REFERENCIA_INVALIDA,
  NOME_UNICO_SEQUENCIA,
  anoMesDeBrasilia,
  cancelarCompra,
  criarCompra: criarCompraDoStore,
  duplicarCompra: duplicarCompraDoStore,
  listarComprasDoMes,
  mensagemNumeroJaExiste,
  obterCompra,
  proximaVersao,
  salvarCompra,
  subirVersaoDaCompra,
} = store;

const NOME_UNICO_ITEM = "compra_itens_compra_posicao_uq";

// O Nº da compra é DIGITADO (o servidor nunca o escolhe). Os testes que não tratam do número usam estes ajudantes, que numeram 1, 2, 3... por conta do
// TESTE; os testes do número passam o número e o mês de forma explícita.
let proximoNumero = 1;
const criarCompra = (usuario: string, sequencia?: number, extra: { anoMes?: string; agora?: Date } = {}): Promise<Compra> =>
  criarCompraDoStore(usuario, { sequencia: sequencia ?? proximoNumero++, ...extra });
const duplicarCompra = (id: string, usuario: string, sequencia?: number, extra: { anoMes?: string; agora?: Date } = {}): Promise<Compra | null> =>
  duplicarCompraDoStore(id, usuario, { sequencia: sequencia ?? proximoNumero++, ...extra });

function limparBanco(): void {
  for (const t of ["compras", "compra_itens", "cadastro_medicamentos", "pre_cadastro_medicamentos"]) fake.tabelas[t] = [];
  fake.chamadas.length = 0;
}

beforeEach(() => {
  proximoNumero = 1;
  limparBanco();
  // O banco de verdade impõe estas duas unicidades.
  (fake as unknown as { unicos: unknown[] }).unicos = [];
  fake.unico("compras", ["ano_mes", "sequencia"], NOME_UNICO_SEQUENCIA);
  fake.unico("compra_itens", ["compra_id", "posicao"], NOME_UNICO_ITEM);
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
  laboratorio: "",
  brand: "",
  quantidade: "",
  temperatura: "",
  valorUnitario: null,
  valorReal: null,
  ...extra,
});

const estado = (c: Compra, itens?: ItemCompraEstado[], campos: CompraEstado["campos"] = {}): CompraEstado => ({
  atualizadoEm: c.updatedAt,
  campos,
  ...(itens ? { itens } : {}),
});

const ids = (c: Compra): string[] => c.itens.map((i) => i.id);
const posicoes = (c: Compra): number[] => c.itens.map((i) => i.posicao);

async function erroDe(promessa: Promise<unknown>): Promise<InstanceType<typeof ComprasRegraError>> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ComprasRegraError) return e;
    throw e;
  }
  throw new Error("esperava um erro de regra das Compras, mas a chamada passou");
}

/** Guarda o que cada `upsert` em compra_itens recebeu (as posições gravadas), sem mudar o comportamento do fake. */
function espiarUpsertsDeItens(): Array<Array<{ id: string; posicao: number }>> {
  const gravados: Array<Array<{ id: string; posicao: number }>> = [];
  const from = fake.from.bind(fake);
  vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
    const consulta = from(tabela);
    if (tabela !== "compra_itens") return consulta;
    const upsert = consulta.upsert.bind(consulta);
    return Object.assign(consulta, {
      upsert: (linhas: Array<{ id: string; posicao: number }>, opcoes: unknown) => {
        gravados.push(linhas.map((l) => ({ id: l.id, posicao: l.posicao })));
        return upsert(linhas as never, opcoes as never);
      },
    });
  }) as unknown as typeof fake.from);
  return gravados;
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
  it("nasce vazia (rascunho): empresa FARMAURORA, 1 ordem, sem itens, responsável e criado_por = quem criou, número 1", async () => {
    const c = await criarCompra("Cris");
    expect(c).toMatchObject({
      anoMes: "2026-11",
      sequencia: 1,
      cancelada: false,
      fornecedor: "",
      envio: "",
      cia: "",
      empresa: "FARMAURORA",
      numeroOrdens: 1,
      frete: null,
      freteReal: null,
      paciente: "",
      consultor: "",
      responsavel: "Cris",
      criadoPor: "Cris",
      atualizadoPor: "Cris",
      compraParticular: false,
      termoPosterior: false,
      isencao: false,
      recorrente: false,
      pagamentoAlvara: null,
      pagamentoMomento: null,
      documentos: null,
      pendencias: [],
      itens: [],
    });
    expect(c.id).toMatch(/^cmp_/);
    expect(c.createdAt).toBe("2026-11-19T15:00:00.000Z");
    expect(c.updatedAt).toBe("2026-11-19T15:00:00.000Z");
  });

  it("a linha gravada tem exatamente as 34 colunas do schema novo (nada de vendedor, ordens, courier_simples, local_declarado, isencao_para)", async () => {
    await criarCompra("Cris");
    const colunas = Object.keys(fake.linhas("compras")[0]!).sort();
    expect(colunas).toHaveLength(34);
    for (const c of ["consultor", "fornecedor", "envio", "cia", "frete", "frete_real", "empresa", "numero_ordens"]) expect(colunas, c).toContain(c);
    for (const c of ["vendedor", "courier_simples", "local_declarado", "isencao_para"]) expect(colunas, c).not.toContain(c);
  });

  it("o número é o DIGITADO, na ordem que o time combinou (14 antes do 3) — o servidor não gera nem preenche lacunas", async () => {
    const quatorze = await criarCompraDoStore("Cris", { sequencia: 14 });
    const tres = await criarCompraDoStore("Cris", { sequencia: 3 });
    const nove = await criarCompraDoStore("Cris", { sequencia: 9999 });
    expect([quatorze.sequencia, tres.sequencia, nove.sequencia]).toEqual([14, 3, 9999]);
    expect(fake.linhas("compras").map((r) => r.sequencia)).toEqual([14, 3, 9999]);
  });

  it("o mesmo número em OUTRO mês é permitido (a unicidade é por mês)", async () => {
    await criarCompraDoStore("Cris", { sequencia: 5 });
    const outubro = await criarCompraDoStore("Cris", { sequencia: 5, anoMes: "2026-10" });
    expect([outubro.anoMes, outubro.sequencia]).toEqual(["2026-10", 5]);
    expect(fake.linhas("compras")).toHaveLength(2);
  });

  it("o mês padrão é o de BRASÍLIA (a virada: 2026-12-01T01:30Z é 30/11 → 2026-11; 03:00Z → 2026-12)", async () => {
    vi.setSystemTime(new Date("2026-12-01T01:30:00.000Z"));
    expect((await criarCompraDoStore("Cris", { sequencia: 1 })).anoMes).toBe("2026-11");
    vi.setSystemTime(new Date("2026-12-01T03:00:00.000Z"));
    expect((await criarCompraDoStore("Cris", { sequencia: 1 })).anoMes).toBe("2026-12");
  });

  it("um mês explícito vence o mês padrão", async () => {
    const c = await criarCompraDoStore("Cris", { sequencia: 2, anoMes: "2026-09" });
    expect(c.anoMes).toBe("2026-09");
  });
});

describe("criarCompra — número que já existe no mês: 409 amigável, nada é criado", () => {
  async function ocupar(sequencia: number, consultor: string, fornecedor: string, anoMes = "2026-11"): Promise<Compra> {
    const c = await criarCompraDoStore("Cris", { sequencia, anoMes });
    await salvarCompra(c.id, estado(c, undefined, { consultor, fornecedor }), "Cris");
    return (await obterCompra(c.id))!;
  }

  it("409 com a mensagem pedida (só consultor e fornecedor) e o código que a tela distingue do 409 de versão", async () => {
    await ocupar(14, "Rebeca", "Can Pharma");
    const e = await erroDe(criarCompraDoStore("Bruno", { sequencia: 14 }));
    expect(e.statusCode).toBe(409);
    expect(e.message).toBe("A Compra 14 de novembro já existe (Rebeca, Can Pharma). Escolha outro número.");
    expect(e.data).toMatchObject({ code: "NUMERO_JA_EXISTE", anoMes: "2026-11", sequencia: 14 });
    expect(e.data).not.toHaveProperty("atual"); // não é o 409 de versão
    expect(fake.linhas("compras")).toHaveLength(1); // nada foi criado
  });

  it("a mensagem mostra só o que existe: só consultor, só fornecedor, ou nenhum dos dois", async () => {
    expect(mensagemNumeroJaExiste("2026-11", 14, { consultor: "Rebeca", fornecedor: "" })).toBe("A Compra 14 de novembro já existe (Rebeca). Escolha outro número.");
    expect(mensagemNumeroJaExiste("2026-11", 14, { consultor: "", fornecedor: "Can Pharma" })).toBe("A Compra 14 de novembro já existe (Can Pharma). Escolha outro número.");
    expect(mensagemNumeroJaExiste("2026-11", 14, { consultor: "  ", fornecedor: "" })).toBe("A Compra 14 de novembro já existe. Escolha outro número.");
    expect(mensagemNumeroJaExiste("2026-10", 3, null)).toBe("A Compra 03 de outubro já existe. Escolha outro número.");
  });

  it("compra CANCELADA continua ocupando o número", async () => {
    const c = await ocupar(7, "Rebeca", "Can Pharma");
    await cancelarCompra(c.id, "Cris");
    const e = await erroDe(criarCompraDoStore("Bruno", { sequencia: 7 }));
    expect(e.statusCode).toBe(409);
    expect(e.message).toContain("A Compra 07 de novembro já existe");
  });

  it("não tenta de outro número, nem preenche: um só INSERT e nenhum outro número aparece", async () => {
    await ocupar(14, "Rebeca", "Can Pharma");
    const inserts = fake.chamadas.filter((x) => x.tabela === "compras" && x.op === "insert").length;
    await erroDe(criarCompraDoStore("Bruno", { sequencia: 14 }));
    expect(fake.chamadas.filter((x) => x.tabela === "compras" && x.op === "insert").length).toBe(inserts); // nenhum INSERT a mais
    expect(fake.linhas("compras").map((r) => r.sequencia)).toEqual([14]);
  });

  it("o mesmo número em outro mês não conflita", async () => {
    await ocupar(14, "Rebeca", "Can Pharma", "2026-10");
    const c = await criarCompraDoStore("Bruno", { sequencia: 14 }); // novembro
    expect([c.anoMes, c.sequencia]).toEqual(["2026-11", 14]);
  });
});

describe("criarCompra — disputa pelo número (23505 em compras_mes_sequencia_uq): vira o MESMO 409, sem tentar outro número", () => {
  /**
   * Faz o INSERT em compras falhar com 23505, como se outra pessoa tivesse pegado o mesmo número no mesmo instante (depois da conferência):
   * antes de falhar o stub grava a compra rival com o número disputado (e o consultor/fornecedor dela, que a mensagem mostra).
   */
  function disputa(mensagem = `duplicate key value violates unique constraint "${NOME_UNICO_SEQUENCIA}"`): { tentativas: () => number } {
    let tentativas = 0;
    const from = fake.from.bind(fake);
    vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
      const consulta = from(tabela);
      if (tabela !== "compras") return consulta;
      return Object.assign(consulta, {
        insert: (row: Record<string, unknown>) => {
          tentativas += 1;
          fake.semear("compras", [{ ...row, id: `rival_${tentativas}`, consultor: "Rebeca", fornecedor: "Can Pharma" }]);
          return { select: () => Promise.resolve({ data: null, error: { message: mensagem, code: "23505" } }) };
        },
      });
    }) as unknown as typeof fake.from);
    return { tentativas: () => tentativas };
  }

  it("23505 no INSERT: 409 amigável com o dono do número, uma só tentativa (nada de 500 e nada de outro número)", async () => {
    const d = disputa();
    const e = await erroDe(criarCompraDoStore("Bruno", { sequencia: 14 }));
    expect(e.statusCode).toBe(409);
    expect(e.message).toBe("A Compra 14 de novembro já existe (Rebeca, Can Pharma). Escolha outro número.");
    expect(e.data).toMatchObject({ code: "NUMERO_JA_EXISTE", sequencia: 14 });
    expect(d.tentativas()).toBe(1);
    expect(fake.linhas("compras").map((r) => r.sequencia)).toEqual([14]); // só a da rival
  });

  it("23505 de OUTRA constraint (ou outro erro) não é disputa pelo número: sobe como erro comum", async () => {
    const d = disputa('duplicate key value violates unique constraint "compras_pkey"');
    await expect(criarCompraDoStore("Cris", { sequencia: 1 })).rejects.not.toBeInstanceOf(ComprasRegraError);
    expect(d.tentativas()).toBe(1);

    vi.restoreAllMocks();
    fake.falhar("compras", "insert", "falha injetada");
    await expect(criarCompraDoStore("Cris", { sequencia: 2 })).rejects.toThrow(/falha ao criar a compra/);
  });

  it("o unique do fake também recusa o número repetido (a disputa real: dois com o mesmo número)", async () => {
    await criarCompra("Cris");
    const repetida = await fake.from("compras").insert({ id: "x", ano_mes: "2026-11", sequencia: 1 });
    expect(repetida.error).toMatchObject({ code: "23505" });
    expect(fake.linhas("compras")).toHaveLength(1);
  });
});

describe("criarCompra — concorrência (várias pessoas criando ao mesmo tempo)", () => {
  it("criações SIMULTÂNEAS de números diferentes passam todas", async () => {
    const resultados = await Promise.all([14, 15, 16, 17].map((n) => criarCompraDoStore("Cris", { sequencia: n })));
    expect(resultados.map((c) => c.sequencia).sort()).toEqual([14, 15, 16, 17]);
    expect(fake.linhas("compras")).toHaveLength(4);
  });

  it("o MESMO número ao mesmo tempo: uma passa e a outra recebe o 409 amigável (nunca duas com o mesmo número)", async () => {
    const [a, b] = await Promise.allSettled([criarCompraDoStore("Ana", { sequencia: 14 }), criarCompraDoStore("Bruno", { sequencia: 14 })]);
    const status = [a, b].map((r) => r.status).sort();
    expect(status).toEqual(["fulfilled", "rejected"]);
    const recusada = [a, b].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(recusada.reason).toBeInstanceOf(ComprasRegraError);
    expect(recusada.reason).toMatchObject({ statusCode: 409, data: { code: "NUMERO_JA_EXISTE" } });
    expect(fake.linhas("compras")).toHaveLength(1);
  });

  it("criar e duplicar o mesmo número ao mesmo tempo: só um passa", async () => {
    const o = await criarCompra("Cris", 1);
    const resultados = await Promise.allSettled([criarCompraDoStore("Ana", { sequencia: 20 }), duplicarCompraDoStore(o.id, "Bruno", { sequencia: 20 })]);
    expect(resultados.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(fake.linhas("compras").filter((r) => r.sequencia === 20)).toHaveLength(1);
  });
});

describe("salvarCompra — o Nº da compra é editável (e não colide)", () => {
  it("trocar para um número livre grava (e a versão sobe); trocar para o MESMO número não mexe em nada", async () => {
    const c = await criarCompra("Cris", 5);
    const salva = (await salvarCompra(c.id, estado(c, undefined, { sequencia: 12 }), "Cris"))!;
    expect(salva.sequencia).toBe(12);
    expect(fake.linhas("compras")[0]!.sequencia).toBe(12);
    const igual = (await salvarCompra(c.id, estado(salva, undefined, { sequencia: 12 }), "Cris"))!;
    expect(igual.sequencia).toBe(12);
  });

  it("trocar para um número que OUTRA compra tem: 409 amigável, e a compra fica com o número que tinha", async () => {
    const a = await criarCompra("Cris", 5);
    const b = await criarCompra("Cris", 6);
    await salvarCompra(b.id, estado(b, undefined, { consultor: "Rebeca", fornecedor: "Can Pharma" }), "Cris");
    const e = await erroDe(salvarCompra(a.id, estado(a, undefined, { sequencia: 6 }), "Cris"));
    expect(e.statusCode).toBe(409);
    expect(e.message).toBe("A Compra 06 de novembro já existe (Rebeca, Can Pharma). Escolha outro número.");
    expect(e.data).toMatchObject({ code: "NUMERO_JA_EXISTE" });
    expect(fake.linhas("compras").find((r) => r.id === a.id)!.sequencia).toBe(5);
  });

  it("23505 no UPDATE (a outra pessoa pegou o número no meio): o mesmo 409 amigável", async () => {
    const a = await criarCompra("Cris", 5);
    const from = fake.from.bind(fake);
    vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
      const consulta = from(tabela);
      if (tabela !== "compras") return consulta;
      return Object.assign(consulta, {
        update: (...args: unknown[]) => {
          fake.semear("compras", [{ id: "rival", ano_mes: "2026-11", sequencia: 6, consultor: "Rebeca", fornecedor: "Can Pharma" }]);
          void args;
          return { eq: () => ({ eq: () => ({ select: () => Promise.resolve({ data: null, error: { message: `duplicate key value violates unique constraint "${NOME_UNICO_SEQUENCIA}"`, code: "23505" } }) }) }) };
        },
      });
    }) as unknown as typeof fake.from);
    const e = await erroDe(salvarCompra(a.id, estado(a, undefined, { sequencia: 6 }), "Cris"));
    expect(e.statusCode).toBe(409);
    expect(e.data).toMatchObject({ code: "NUMERO_JA_EXISTE", sequencia: 6 });
  });

  it("o número de outro MÊS não conflita (trocar para o 5 de novembro quando só existe o 5 de outubro)", async () => {
    await criarCompraDoStore("Cris", { sequencia: 5, anoMes: "2026-10" });
    const a = await criarCompra("Cris", 8);
    expect((await salvarCompra(a.id, estado(a, undefined, { sequencia: 5 }), "Cris"))!.sequencia).toBe(5);
  });

  it("edições de compras DIFERENTES ao mesmo tempo não se atrapalham", async () => {
    const a = await criarCompra("Cris", 1);
    const b = await criarCompra("Cris", 2);
    const [sa, sb] = await Promise.all([
      salvarCompra(a.id, estado(a, undefined, { fornecedor: "FORN A", sequencia: 11 }), "Ana"),
      salvarCompra(b.id, estado(b, undefined, { fornecedor: "FORN B", sequencia: 12 }), "Bruno"),
    ]);
    expect([sa!.fornecedor, sa!.sequencia]).toEqual(["FORN A", 11]);
    expect([sb!.fornecedor, sb!.sequencia]).toEqual(["FORN B", 12]);
  });

  it("duas edições da MESMA compra com a mesma versão: continua valendo o 409 de versão (com a compra atual)", async () => {
    const a = await criarCompra("Cris", 1);
    await salvarCompra(a.id, estado(a, undefined, { fornecedor: "DA ANA" }), "Ana");
    const e = await erroDe(salvarCompra(a.id, estado(a, undefined, { fornecedor: "DO BRUNO", sequencia: 30 }), "Bruno"));
    expect(e.statusCode).toBe(409);
    expect(e.message).toBe(MENSAGEM_CONFLITO_VERSAO);
    expect(e.data).toHaveProperty("atual");
    expect(e.data).not.toHaveProperty("code");
    expect(fake.linhas("compras")[0]!.sequencia).toBe(1); // nada do Bruno foi gravado
  });
});

describe("listarComprasDoMes — maiorSequencia (a base da sugestão do \"+ Nova compra\")", () => {
  it("o maior número do mês, contando as canceladas; 0 com o mês vazio; outro mês não conta", async () => {
    expect((await listarComprasDoMes("2026-11", {})).maiorSequencia).toBe(0);
    await criarCompra("Cris", 3);
    const dezoito = await criarCompra("Cris", 18);
    await criarCompra("Cris", 7);
    await criarCompraDoStore("Cris", { sequencia: 50, anoMes: "2026-10" });
    expect((await listarComprasDoMes("2026-11", {})).maiorSequencia).toBe(18);
    await cancelarCompra(dezoito.id, "Cris");
    expect((await listarComprasDoMes("2026-11", {})).maiorSequencia).toBe(18); // a cancelada continua ocupando
    expect((await listarComprasDoMes("2026-11", { incluirCanceladas: false })).maiorSequencia).toBe(18);
    expect((await listarComprasDoMes("2026-10", {})).maiorSequencia).toBe(50);
  });
});

// ── Ler ───────────────────────────────────────────────────────────────────────────────────────────────────────

describe("obterCompra", () => {
  it("null se não existe; com os itens POR POSIÇÃO e os numeric de texto convertidos ('0.00' é zero)", async () => {
    expect(await obterCompra("nao_existe")).toBeNull();
    const c = await criarCompra("Cris");
    Object.assign(fake.linhas("compras")[0]!, { frete: "10.50", frete_real: "0.00", numero_ordens: 3 });
    // Linhas semeadas fora de ordem.
    fake.semear("compra_itens", [
      { id: "itm_a0002", compra_id: c.id, posicao: 2, medicamento: "SEGUNDO", brand: "referencia", valor_unitario: "0.00" },
      { id: "itm_a0001", compra_id: c.id, posicao: 1, medicamento: "PRIMEIRO", brand: "", valor_unitario: "12.30" },
    ]);
    const lida = (await obterCompra(c.id))!;
    expect(ids(lida)).toEqual(["itm_a0001", "itm_a0002"]);
    expect(lida).toMatchObject({ frete: 10.5, freteReal: 0, numeroOrdens: 3 });
    expect(lida.itens.map((i) => i.valorUnitario)).toEqual([12.3, 0]);
    expect(lida.itens.map((i) => i.brand)).toEqual(["", "referencia"]);
  });

  it("não traz os itens de OUTRA compra", async () => {
    const a = await criarCompra("Cris");
    const b = await criarCompra("Cris");
    fake.semear("compra_itens", [
      { id: "itm_da_a01", compra_id: a.id, posicao: 1, medicamento: "DA A" },
      { id: "itm_da_b01", compra_id: b.id, posicao: 1, medicamento: "DA B" },
    ]);
    expect(ids((await obterCompra(a.id))!)).toEqual(["itm_da_a01"]);
  });
});

describe("medicamentoCadastroNome — o nome do Cadastro, só leitura (1 consulta extra, sem DDL)", () => {
  async function comItens(): Promise<Compra> {
    const c = await criarCompra("Cris");
    fake.semear("cadastro_medicamentos", [
      { id: "med_1", nome: "KEYTRUDA 100MG", temperatura: "2°C a 8°C", ativo: true },
      { id: "med_inativo", nome: "MED DESATIVADO", temperatura: "Ambiente", ativo: false },
    ]);
    fake.semear("compra_itens", [
      { id: "itm_000001", compra_id: c.id, posicao: 1, medicamento: "KEYTRUDA 100MG - 2 vials per box", medicamento_cadastro_id: "med_1" },
      { id: "itm_000002", compra_id: c.id, posicao: 2, medicamento: "TEXTO LIVRE", medicamento_cadastro_id: null },
      { id: "itm_000003", compra_id: c.id, posicao: 3, medicamento: "ID QUE SUMIU", medicamento_cadastro_id: "med_sumiu" },
      { id: "itm_000004", compra_id: c.id, posicao: 4, medicamento: "DESATIVADO", medicamento_cadastro_id: "med_inativo" },
    ]);
    return c;
  }

  it("ligado: o nome do Cadastro (o texto do item pode ter mais); não ligado: null; Cadastro sem esse id: null; inativo ainda tem nome", async () => {
    const c = await comItens();
    const lida = (await obterCompra(c.id))!;
    expect(lida.itens.map((i) => [i.medicamentoCadastroId, i.medicamentoCadastroNome])).toEqual([
      ["med_1", "KEYTRUDA 100MG"],
      [null, null],
      ["med_sumiu", null],
      ["med_inativo", "MED DESATIVADO"],
    ]);
    expect(lida.itens[0]!.medicamento).toBe("KEYTRUDA 100MG - 2 vials per box"); // o texto continua como foi digitado
  });

  it("a leitura faz UMA consulta ao Cadastro (e nenhuma quando nenhum item está ligado)", async () => {
    const c = await comItens();
    fake.chamadas.length = 0;
    await obterCompra(c.id);
    expect(fake.chamadas.filter((x) => x.tabela === "cadastro_medicamentos")).toHaveLength(1);

    const vazia = await criarCompra("Cris");
    fake.chamadas.length = 0;
    await obterCompra(vazia.id);
    expect(fake.chamadas.filter((x) => x.tabela === "cadastro_medicamentos")).toEqual([]);
  });

  it("é só leitura: o que o salvamento grava não tem a coluna (nem o campo vem no estado)", async () => {
    const c = await comItens();
    const lida = (await obterCompra(c.id))!;
    await salvarCompra(c.id, estado(lida, lida.itens.map((i) => item(i.id, i.medicamento, { medicamentoCadastroId: i.medicamentoCadastroId }))), "Cris");
    for (const linha of fake.linhas("compra_itens")) expect(Object.keys(linha)).not.toContain("medicamento_cadastro_nome");
  });
});

describe("o estado do pré-cadastro do item (só leitura)", () => {
  it("o item mostra o pré-cadastro e o estado dele enquanto não virou item do Cadastro; ligado ao Cadastro, o pré-cadastro some", async () => {
    const c = await criarCompra("Cris");
    fake.semear("pre_cadastro_medicamentos", [{ id: "pre_1", status: "rejeitado" }, { id: "pre_2", status: "aprovado" }]);
    fake.semear("cadastro_medicamentos", [{ id: "med_1", nome: "MED UM", ativo: true }]);
    fake.semear("compra_itens", [
      { id: "itm_000001", compra_id: c.id, posicao: 1, medicamento: "A", pre_cadastro_id: "pre_1" },
      { id: "itm_000002", compra_id: c.id, posicao: 2, medicamento: "B", pre_cadastro_id: "pre_2", medicamento_cadastro_id: "med_1" },
    ]);
    const lida = (await obterCompra(c.id))!;
    expect(lida.itens[0]).toMatchObject({ preCadastroId: "pre_1", preCadastroStatus: "rejeitado" });
    expect(lida.itens[1]!.preCadastroId).toBeNull();
    expect(lida.itens[1]).not.toHaveProperty("preCadastroStatus");
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
    await salvarCompra(c.id, estado(c, [item("itm_000001")]), "Cris");
    const atual = (await obterCompra(c.id))!;
    await salvarCompra(c.id, estado(atual, []), "Cris");
    await duplicarCompra(c.id, "Cris");
    await cancelarCompra(c.id, "Cris");
    expect(fake.chamadas.filter((x) => x.tabela === "compras" && x.op === "delete")).toEqual([]);
  });

  it("depois de cancelada, salvar é 409 (compra cancelada, com a compra atual em data.atual) e não grava nada", async () => {
    const c = await criarCompra("Cris");
    const cancelada = (await cancelarCompra(c.id, "Cris"))!;
    const e = await erroDe(salvarCompra(c.id, estado(cancelada, undefined, { paciente: "NOVO" }), "Cris"));
    expect(e).toMatchObject({ statusCode: 409, message: MENSAGEM_COMPRA_CANCELADA });
    expect((e.data as { atual: Compra }).atual).toMatchObject({ cancelada: true });
    expect(fake.linhas("compras")[0]!.paciente).toBe("");
  });

  it("compra cancelada não tem os itens mexidos nem com `itens` no corpo", async () => {
    const c = await criarCompra("Cris");
    const r = (await salvarCompra(c.id, estado(c, [item("itm_000001")]), "Cris"))!;
    const cancelada = (await cancelarCompra(r.id, "Cris"))!;
    await erroDe(salvarCompra(c.id, estado(cancelada, []), "Cris"));
    expect(fake.linhas("compra_itens")).toHaveLength(1);
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

  it("os campos da compra única: fornecedor, envio, cia, empresa, numeroOrdens, frete, freteReal e consultor vão para as colunas certas", async () => {
    const c = await criarCompra("Cris");
    const r = (await salvarCompra(
      c.id,
      estado(c, undefined, { fornecedor: "FORNECEDOR TESTE", envio: "Air Cargo", cia: "Emirates", empresa: "MAINZFARMA", numeroOrdens: 3, frete: 150, freteReal: 0, consultor: "CONSULTOR TESTE" }),
      "Cris",
    ))!;
    expect(r).toMatchObject({ fornecedor: "FORNECEDOR TESTE", envio: "Air Cargo", cia: "Emirates", empresa: "MAINZFARMA", numeroOrdens: 3, frete: 150, freteReal: 0, consultor: "CONSULTOR TESTE" });
    expect(fake.linhas("compras")[0]).toMatchObject({ fornecedor: "FORNECEDOR TESTE", envio: "Air Cargo", cia: "Emirates", empresa: "MAINZFARMA", numero_ordens: 3, frete: 150, frete_real: 0, consultor: "CONSULTOR TESTE" });
    const limpa = (await salvarCompra(c.id, estado(r, undefined, { frete: null }), "Cris"))!;
    expect(limpa).toMatchObject({ frete: null, freteReal: 0 }); // null limpa; o que não veio não muda
  });

  it("sem `itens` não mexe nos itens", async () => {
    const c = await criarCompra("Cris");
    const r1 = (await salvarCompra(c.id, estado(c, [item("itm_000001")]), "Cris"))!;
    const r2 = (await salvarCompra(c.id, { atualizadoEm: r1.updatedAt, campos: { paciente: "X" } }, "Cris"))!;
    expect(ids(r2)).toEqual(["itm_000001"]);
  });

  it("compra que não existe: null", async () => {
    expect(await salvarCompra("nao_existe", { atualizadoEm: "2026-11-19T15:00:00.000Z", campos: {} }, "Cris")).toBeNull();
  });

  it("antesDeGravar recebe a compra como está e, se lançar, NADA é gravado", async () => {
    const c = await criarCompra("Cris");
    let recebida: Compra | null = null;
    await expect(
      salvarCompra(c.id, estado(c, [item("itm_000001")], { paciente: "NAO_GRAVA" }), "Cris", {
        antesDeGravar: async (atual) => {
          recebida = atual;
          throw new ComprasRegraError("recusado pela validação", 422);
        },
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect((recebida as Compra | null)?.id).toBe(c.id);
    expect(fake.linhas("compras")[0]).toMatchObject({ paciente: "", updated_at: c.updatedAt });
    expect(fake.linhas("compra_itens")).toHaveLength(0);
  });

  it("antesDeGravar pode DEVOLVER outro estado: é ele que é gravado", async () => {
    const c = await criarCompra("Cris");
    const r = (await salvarCompra(c.id, estado(c, undefined, { paciente: "DIGITADO" }), "Cris", { antesDeGravar: async () => estado(c, undefined, { paciente: "DO CADASTRO" }) }))!;
    expect(r.paciente).toBe("DO CADASTRO");
  });
});

describe("salvarCompra — concorrência (dois operacionais na mesma compra)", () => {
  it("versão antiga: 409 com a compra ATUAL na resposta (data.atual), e nada é gravado", async () => {
    const c = await criarCompra("Cris");
    const r1 = (await salvarCompra(c.id, estado(c, undefined, { paciente: "DA PESSOA A" }), "A"))!;
    const e = await erroDe(salvarCompra(c.id, estado(c, [item("itm_000001")], { paciente: "DA PESSOA B" }), "B")); // B ainda vê a versão antiga
    expect(e).toMatchObject({ statusCode: 409, message: MENSAGEM_CONFLITO_VERSAO });
    expect((e.data as { atual: Compra }).atual).toMatchObject({ paciente: "DA PESSOA A", updatedAt: r1.updatedAt });
    expect(fake.linhas("compras")[0]!.paciente).toBe("DA PESSOA A");
    expect(fake.linhas("compra_itens")).toHaveLength(0);
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
    const e = await erroDe(salvarCompra(c.id, estado(c, [item("itm_000001")], { paciente: "MEU" }), "Eu"));
    expect(e.statusCode).toBe(409);
    expect((e.data as { atual: Compra }).atual).toMatchObject({ paciente: "DO RIVAL", updatedAt: "2026-11-19T15:00:05.000Z" });
    expect(fake.linhas("compras")[0]!.paciente).toBe("DO RIVAL");
    expect(fake.linhas("compra_itens")).toHaveLength(0); // os itens nem foram tocados
  });

  it("a versão compara o instante, não o texto (o '+00:00' do Postgres e o 'Z' são a mesma versão)", async () => {
    const c = await criarCompra("Cris");
    fake.linhas("compras")[0]!.updated_at = "2026-11-19T15:00:00.000+00:00"; // como o banco devolve
    const r = (await salvarCompra(c.id, { atualizadoEm: "2026-11-19T15:00:00.000Z", campos: { paciente: "OK" } }, "Cris"))!;
    expect(r.paciente).toBe("OK");
  });
});

// ── Salvar: os itens (a sincronização) ───────────────────────────────────────────────────────────────────────

describe("salvarCompra — itens", () => {
  async function comQuatro(): Promise<Compra> {
    const c = await criarCompra("Cris");
    return (await salvarCompra(c.id, estado(c, [item("itm_a00001"), item("itm_a00002"), item("itm_a00003"), item("itm_a00004")]), "Cris"))!;
  }

  it("ids novos vindos do cliente: grava com a posição = a ordem do array (1..N)", async () => {
    const c = await comQuatro();
    expect(ids(c)).toEqual(["itm_a00001", "itm_a00002", "itm_a00003", "itm_a00004"]);
    expect(posicoes(c)).toEqual([1, 2, 3, 4]);
    expect(fake.linhas("compra_itens").every((i) => i.compra_id === c.id)).toBe(true);
  });

  it("a linha gravada do item: compra_id, brand, laboratorio... e nada de ordem_id nem apresentacao", async () => {
    const c = await criarCompra("Cris");
    await salvarCompra(c.id, estado(c, [item("itm_a00001", "KEYTRUDA 100mg - 2 vials per box", { brand: "referencia", laboratorio: "MSD", quantidade: "2", temperatura: "2°C a 8°C" })]), "Cris");
    const linha = fake.linhas("compra_itens")[0]!;
    expect(linha).toMatchObject({ id: "itm_a00001", compra_id: c.id, posicao: 1, medicamento: "KEYTRUDA 100mg - 2 vials per box", brand: "referencia", laboratorio: "MSD", quantidade: "2", temperatura: "2°C a 8°C" });
    expect(Object.keys(linha)).not.toContain("ordem_id");
    expect(Object.keys(linha)).not.toContain("apresentacao");
    expect(Object.keys(linha)).not.toContain("referencia");
  });

  it("dinheiro: número com 2 casas vai e volta (0 é zero, null é vazio); quantidade é texto", async () => {
    const c = await criarCompra("Cris");
    const r = (await salvarCompra(c.id, estado(c, [item("itm_a00001", "TESTE MED", { quantidade: "12 ampolas", valorUnitario: 1234.5, valorReal: 0 }), item("itm_a00002", "TESTE MED 2")]), "Cris"))!;
    expect(r.itens[0]).toMatchObject({ quantidade: "12 ampolas", valorUnitario: 1234.5, valorReal: 0 });
    expect(r.itens[1]).toMatchObject({ valorUnitario: null, valorReal: null });
  });

  it("editar sem mudar a forma é o caminho rápido: duas escritas (compra e itens), nenhum delete, e as posições finais já na 1ª gravação", async () => {
    const c = await comQuatro();
    fake.chamadas.length = 0;
    const gravados = espiarUpsertsDeItens();
    const r = (await salvarCompra(c.id, estado(c, c.itens.map((i) => item(i.id, `${i.medicamento} EDITADO`))), "Cris"))!;
    expect(r.itens[0]!.medicamento).toMatch(/EDITADO$/);
    const escritas = fake.chamadas.filter((x) => x.op !== "select");
    expect(escritas.map((x) => `${x.tabela}:${x.op}`)).toEqual(["compras:update", "compra_itens:upsert"]);
    expect(gravados).toHaveLength(1);
    expect(gravados[0]!.map((l) => l.posicao)).toEqual([1, 2, 3, 4]);
  });

  it("REORDENAR: as posições passam por valores TEMPORÁRIOS acima de todas as existentes e só depois vão para as finais (nunca viola a unicidade)", async () => {
    const c = await comQuatro();
    const gravados = espiarUpsertsDeItens();
    const r = (await salvarCompra(c.id, estado(c, [item("itm_a00004"), item("itm_a00003"), item("itm_a00002"), item("itm_a00001")]), "Cris"))!;
    expect(ids(r)).toEqual(["itm_a00004", "itm_a00003", "itm_a00002", "itm_a00001"]);
    expect(posicoes(r)).toEqual([1, 2, 3, 4]);
    expect(gravados).toHaveLength(2);
    expect(gravados[0]!.every((l) => l.posicao > 4)).toBe(true); // temporárias: acima da maior que existia
    expect(new Set(gravados[0]!.map((l) => l.posicao)).size).toBe(4); // e todas diferentes
    expect(gravados[1]!.map((l) => [l.id, l.posicao])).toEqual([["itm_a00004", 1], ["itm_a00003", 2], ["itm_a00002", 3], ["itm_a00001", 4]]);
  });

  it("REMOVER O ITEM DO MEIO: os outros sobem de posição (1, 2, 3), o removido some, nenhuma unicidade é violada", async () => {
    const c = await comQuatro();
    const r = (await salvarCompra(c.id, estado(c, [item("itm_a00001"), item("itm_a00003"), item("itm_a00004")]), "Cris"))!;
    expect(ids(r)).toEqual(["itm_a00001", "itm_a00003", "itm_a00004"]);
    expect(posicoes(r)).toEqual([1, 2, 3]);
    expect(fake.linhas("compra_itens").map((i) => i.id)).not.toContain("itm_a00002");
    expect(fake.linhas("compra_itens")).toHaveLength(3);
  });

  it("os itens que NÃO vierem em `itens` são APAGADOS (estado completo), e só os da compra: a de outro número não é tocada", async () => {
    const c = await comQuatro();
    const outra = await criarCompra("Cris");
    await salvarCompra(outra.id, estado(outra, [item("itm_da_outra1")]), "Cris");
    const r = (await salvarCompra(c.id, estado(c, [item("itm_a00002")]), "Cris"))!;
    expect(ids(r)).toEqual(["itm_a00002"]);
    expect(posicoes(r)).toEqual([1]);
    expect(fake.linhas("compra_itens").map((i) => i.id).sort()).toEqual(["itm_a00002", "itm_da_outra1"]);
  });

  it("inserir um item novo no meio reposiciona sem violar", async () => {
    const c = await comQuatro();
    const r = (await salvarCompra(c.id, estado(c, [item("itm_a00001"), item("itm_novo001"), item("itm_a00002"), item("itm_a00003"), item("itm_a00004")]), "Cris"))!;
    expect(ids(r)).toEqual(["itm_a00001", "itm_novo001", "itm_a00002", "itm_a00003", "itm_a00004"]);
    expect(posicoes(r)).toEqual([1, 2, 3, 4, 5]);
  });

  it("`itens: []` apaga todos os itens", async () => {
    const c = await comQuatro();
    const r = (await salvarCompra(c.id, estado(c, []), "Cris"))!;
    expect(r.itens).toEqual([]);
    expect(fake.linhas("compra_itens")).toHaveLength(0);
  });

  it("tudo junto numa gravação: item novo no começo, remover um, trocar a ordem dos outros, editar campos", async () => {
    const c = await comQuatro();
    const r = (await salvarCompra(c.id, estado(c, [item("itm_novo001"), item("itm_a00004"), item("itm_a00001")], { paciente: "DEPOIS" }), "Cris"))!;
    expect(ids(r)).toEqual(["itm_novo001", "itm_a00004", "itm_a00001"]);
    expect(posicoes(r)).toEqual([1, 2, 3]);
    expect(r.paciente).toBe("DEPOIS");
    expect(fake.linhas("compra_itens").map((i) => i.id).sort()).toEqual(["itm_a00001", "itm_a00004", "itm_novo001"]);
  });

  it("os itens ligados ao Cadastro ou ao pré-cadastro guardam o vínculo", async () => {
    const c = await criarCompra("Cris");
    await salvarCompra(c.id, estado(c, [item("itm_a00001", "A", { medicamentoCadastroId: "med_1" }), item("itm_a00002", "B", { preCadastroId: "pre_1" })]), "Cris");
    expect(fake.linhas("compra_itens").map((i) => [i.medicamento_cadastro_id, i.pre_cadastro_id])).toEqual([["med_1", null], [null, "pre_1"]]);
  });
});

describe("salvarCompra — sequestro de id de item (409)", () => {
  async function duasCompras(): Promise<{ a: Compra; b: Compra }> {
    const a = await criarCompra("Cris");
    const b = await criarCompra("Cris");
    const a2 = (await salvarCompra(a.id, estado(a, [item("itm_da_a001", "ITEM DA A")], { paciente: "COMPRA A" }), "Cris"))!;
    const b2 = (await salvarCompra(b.id, estado(b, [item("itm_da_b001", "ITEM DA B")], { paciente: "COMPRA B" }), "Cris"))!;
    return { a: a2, b: b2 };
  }

  it("usar o id de ITEM de outra compra: 409 e nada é gravado (nem na compra, nem na alheia)", async () => {
    const { a, b } = await duasCompras();
    const antes = JSON.stringify([fake.linhas("compras"), fake.linhas("compra_itens")]);
    const e = await erroDe(salvarCompra(a.id, estado(a, [item("itm_da_b001", "SEQUESTRADO")], { paciente: "NAO_GRAVA" }), "Cris"));
    expect(e).toMatchObject({ statusCode: 409, message: MENSAGEM_ID_DE_OUTRA_COMPRA });
    expect(JSON.stringify([fake.linhas("compras"), fake.linhas("compra_itens")])).toBe(antes);
    expect((await obterCompra(b.id))!.itens[0]).toMatchObject({ id: "itm_da_b001", medicamento: "ITEM DA B" });
    expect((await obterCompra(a.id))!.itens[0]!.medicamento).toBe("ITEM DA A");
  });

  it("os próprios ids (inclusive reordenados) NÃO são sequestro", async () => {
    const c = await criarCompra("Cris");
    const r1 = (await salvarCompra(c.id, estado(c, [item("itm_a00001"), item("itm_b00001")]), "Cris"))!;
    const r2 = (await salvarCompra(c.id, estado(r1, [item("itm_b00001"), item("itm_a00001")]), "Cris"))!;
    expect(ids(r2)).toEqual(["itm_b00001", "itm_a00001"]);
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
    const e = await erroDe(salvarCompra(c.id, estado(c, [item("itm_a00001", "X", { medicamentoCadastroId: "med_inexistente" })]), "Cris"));
    expect(e).toMatchObject({ statusCode: 422, message: MENSAGEM_REFERENCIA_INVALIDA });
  });

  it("check violado (23514) na compra, como empresa ou numero_ordens fora do permitido: 422", async () => {
    const c = await criarCompra("Cris");
    const from = fake.from.bind(fake);
    vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
      const consulta = from(tabela);
      if (tabela !== "compras") return consulta;
      return Object.assign(consulta, {
        update: () => ({ eq: () => ({ eq: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'violates check constraint "compras_numero_ordens_check"', code: "23514" } }) }) }) }),
      });
    }) as unknown as typeof fake.from);
    const e = await erroDe(salvarCompra(c.id, estado(c, undefined, { numeroOrdens: 0 }), "Cris"));
    expect(e).toMatchObject({ statusCode: 422, message: "Algum dado da compra é inválido." });
  });

  it("outro erro do banco sobe como erro comum (500), não como regra", async () => {
    const c = await criarCompra("Cris");
    fake.falhar("compras", "update", "falha injetada");
    await expect(salvarCompra(c.id, estado(c, undefined, { paciente: "X" }), "Cris")).rejects.not.toBeInstanceOf(ComprasRegraError);
  });
});

describe("subirVersaoDaCompra — para quem muda a compra por fora do salvamento (a decisão dos pré-cadastros)", () => {
  it("troca o updated_at (uma aba com a versão antiga leva 409) sem mexer em mais nada; compra que não existe não faz nada", async () => {
    const c = await criarCompra("Cris");
    await subirVersaoDaCompra(c.id);
    const linha = fake.linhas("compras")[0]!;
    expect(String(linha.updated_at) > c.updatedAt).toBe(true);
    expect(linha).toMatchObject({ paciente: "", atualizado_por: "Cris" });
    await expect(subirVersaoDaCompra("nao_existe")).resolves.toBeUndefined();
    await erroDe(salvarCompra(c.id, estado(c, undefined, { paciente: "X" }), "Cris")); // a versão antiga leva 409
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
          item("itm_a00001", "TESTE MED A 500 mg", { quantidade: "12 ampolas", valorUnitario: 10.5, brand: "bioequivalente", laboratorio: "LAB", temperatura: "2°C a 8°C" }),
          item("itm_a00002", "TESTE MED B", { medicamentoCadastroId: "med_1" }),
          item("itm_a00003", "TESTE MED C", { preCadastroId: "pre_1" }),
        ],
        {
          fornecedor: "FORNECEDOR A",
          envio: "Air Cargo",
          cia: "Emirates",
          empresa: "MAINZFARMA",
          numeroOrdens: 2,
          frete: 150,
          freteReal: 140.5,
          paciente: "PACIENTE TESTE",
          consultor: "CONSULTOR TESTE",
          responsavel: "RESPONSAVEL TESTE",
          isencao: true,
          recorrente: true,
          pendencias: ["Receita"],
          termoPosterior: true,
          termoObservacao: "obs",
          pagamentoAlvara: true,
          pagamentoMomento: "vamos_pagar",
          documentos: false,
        },
      ),
      "Cris",
    ))!;
    return (await obterCompra(salva.id))!;
  }

  it("cria uma NOVA compra com o número DIGITADO (nunca o da original), no mês ATUAL de Brasília, com os mesmos dados da compra", async () => {
    const o = await original();
    vi.setSystemTime(new Date("2026-12-10T15:00:00.000Z"));
    const copia = (await duplicarCompra(o.id, "Bruno", 7))!;
    expect(copia.id).not.toBe(o.id);
    expect(o.sequencia).not.toBe(7);
    expect([copia.anoMes, copia.sequencia]).toEqual(["2026-12", 7]); // mês atual e o número digitado, não os da original
    expect(copia).toMatchObject({
      cancelada: false,
      fornecedor: "FORNECEDOR A",
      envio: "Air Cargo",
      cia: "Emirates",
      empresa: "MAINZFARMA",
      numeroOrdens: 2,
      frete: 150,
      freteReal: 140.5,
      paciente: "PACIENTE TESTE",
      consultor: "CONSULTOR TESTE",
      responsavel: "RESPONSAVEL TESTE",
      isencao: true,
      recorrente: true,
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

  it("copia os itens com IDS NOVOS, as mesmas posições, valores e vínculos (sem created_at/updated_at da original)", async () => {
    const o = await original();
    const copia = (await duplicarCompra(o.id, "Bruno"))!;
    expect(copia.itens).toHaveLength(3);
    expect(posicoes(copia)).toEqual([1, 2, 3]);
    const idsOriginais = new Set(ids(o));
    for (const id of ids(copia)) expect(idsOriginais.has(id), id).toBe(false);
    expect(copia.itens[0]).toMatchObject({ medicamento: "TESTE MED A 500 mg", quantidade: "12 ampolas", valorUnitario: 10.5, brand: "bioequivalente", laboratorio: "LAB", temperatura: "2°C a 8°C" });
    expect(copia.itens[1]).toMatchObject({ medicamentoCadastroId: "med_1" });
    expect(copia.itens[2]).toMatchObject({ preCadastroId: "pre_1" });
    expect(fake.linhas("compra_itens").filter((i) => i.compra_id === o.id)).toHaveLength(3); // a original não perdeu nada
  });

  it("a original, inclusive cancelada, não muda; a cópia nasce ativa", async () => {
    const o = await original();
    await cancelarCompra(o.id, "Cris");
    const copia = (await duplicarCompra(o.id, "Bruno"))!;
    expect(copia.cancelada).toBe(false);
    const original2 = (await obterCompra(o.id))!;
    expect(original2.cancelada).toBe(true);
    expect(ids(original2)).toEqual(["itm_a00001", "itm_a00002", "itm_a00003"]);
  });

  it("duplicar duas vezes com números diferentes cria duas cópias; compra que não existe é null", async () => {
    const o = await original();
    const a = (await duplicarCompra(o.id, "Bruno", 30))!;
    const b = (await duplicarCompra(o.id, "Bruno", 31))!;
    expect([a.sequencia, b.sequencia]).toEqual([30, 31]);
    expect(await duplicarCompra("nao_existe", "Bruno", 32)).toBeNull();
    expect(fake.linhas("compras").map((r) => r.sequencia)).not.toContain(32); // número de compra que não existe não é gravado
  });

  it("número que já existe no mês: 409 amigável e NADA é criado (nem itens); o número da própria original também conflita", async () => {
    const o = await original();
    const e = await erroDe(duplicarCompra(o.id, "Bruno", o.sequencia));
    expect(e.statusCode).toBe(409);
    expect(e.message).toContain(`A Compra ${String(o.sequencia).padStart(2, "0")} de novembro já existe (CONSULTOR TESTE, FORNECEDOR A)`);
    expect(e.data).toMatchObject({ code: "NUMERO_JA_EXISTE" });
    expect(fake.linhas("compras")).toHaveLength(1);
    expect(fake.linhas("compra_itens")).toHaveLength(3);
  });

  it("23505 ao inserir a cópia (corrida): o mesmo 409 amigável", async () => {
    const o = await original();
    const from = fake.from.bind(fake);
    vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
      const consulta = from(tabela);
      if (tabela !== "compras") return consulta;
      return Object.assign(consulta, {
        insert: (row: Record<string, unknown>) => {
          fake.semear("compras", [{ ...row, id: "rival", consultor: "Rebeca", fornecedor: "Can Pharma" }]);
          return { select: () => Promise.resolve({ data: null, error: { message: `duplicate key value violates unique constraint "${NOME_UNICO_SEQUENCIA}"`, code: "23505" } }) };
        },
      });
    }) as unknown as typeof fake.from);
    const e = await erroDe(duplicarCompra(o.id, "Bruno", 40));
    expect(e.statusCode).toBe(409);
    expect(e.message).toBe("A Compra 40 de novembro já existe (Rebeca, Can Pharma). Escolha outro número.");
  });

  it("um mês explícito: a cópia nasce nele (a mesma regra da criação)", async () => {
    const o = await original();
    const copia = (await duplicarCompra(o.id, "Bruno", 4, { anoMes: "2026-10" }))!;
    expect([copia.anoMes, copia.sequencia]).toEqual(["2026-10", 4]);
  });

  it("compra sem itens também duplica", async () => {
    const c = await criarCompra("Cris");
    const copia = (await duplicarCompra(c.id, "Bruno"))!;
    expect(copia.itens).toEqual([]);
    expect(copia.sequencia).toBe(2);
  });

  it("se copiar os itens FALHAR, a cópia é CANCELADA (compra não se apaga) e o erro sobe; a original fica intacta", async () => {
    const o = await original();
    fake.falhar("compra_itens", "insert", "falha injetada");
    await expect(duplicarCompra(o.id, "Bruno")).rejects.toThrow(/copiar os itens/);
    const rascunho = fake.linhas("compras").find((r) => r.id !== o.id)!;
    expect(rascunho).toMatchObject({ cancelada: true, atualizado_por: "Bruno" });
    expect(fake.linhas("compras")).toHaveLength(2); // nada foi apagado
    expect(fake.linhas("compra_itens").every((i) => i.compra_id === o.id)).toBe(true);
    expect((await obterCompra(o.id))!.cancelada).toBe(false);
    expect(fake.chamadas.filter((x) => x.tabela === "compras" && x.op === "delete")).toEqual([]);
  });
});

// ── recorrente ────────────────────────────────────────────────────────────────────────────────────────────────

describe("recorrente: nasce false, salvarCompra grava, duplicarCompra copia, obterCompra devolve", () => {
  it("rascunho novo: recorrente = false; coluna recorrente na linha do banco", async () => {
    const c = await criarCompra("Cris");
    expect(c.recorrente).toBe(false);
    expect(fake.linhas("compras")[0]).toMatchObject({ recorrente: false });
  });

  it("salvar com recorrente true grava (e GET devolve); ausente no corpo não mexe; false desliga", async () => {
    const c = await criarCompra("Cris");
    const r1 = (await salvarCompra(c.id, estado(c, undefined, { recorrente: true }), "Bruno"))!;
    expect(r1.recorrente).toBe(true);
    expect((await obterCompra(c.id))!.recorrente).toBe(true);
    expect(fake.linhas("compras")[0]).toMatchObject({ recorrente: true });
    const r2 = (await salvarCompra(c.id, estado(r1, undefined, { paciente: "PACIENTE TESTE" }), "Bruno"))!;
    expect(r2.recorrente).toBe(true); // ausente = não muda
    const r3 = (await salvarCompra(c.id, estado(r2, undefined, { recorrente: false }), "Bruno"))!;
    expect(r3.recorrente).toBe(false);
  });

  it("duplicar copia o valor (true continua true; false continua false)", async () => {
    const c = await criarCompra("Cris");
    const marcada = (await salvarCompra(c.id, estado(c, undefined, { recorrente: true }), "Cris"))!;
    expect((await duplicarCompra(marcada.id, "Bruno"))!.recorrente).toBe(true);
    const outra = await criarCompra("Cris");
    expect((await duplicarCompra(outra.id, "Bruno"))!.recorrente).toBe(false);
  });
});

describe("listarComprasDoMes — a visão da lista (ordem e inverter)", () => {
  async function tres(): Promise<{ tres: Compra; dezoito: Compra; sete: Compra }> {
    vi.setSystemTime(new Date("2026-11-19T15:00:00.000Z"));
    const a = await criarCompraDoStore("Cris", { sequencia: 3 });
    vi.setSystemTime(new Date("2026-11-19T15:01:00.000Z"));
    const b = await criarCompraDoStore("Cris", { sequencia: 18 });
    vi.setSystemTime(new Date("2026-11-19T15:02:00.000Z"));
    const c = await criarCompraDoStore("Cris", { sequencia: 7 });
    return { tres: a, dezoito: b, sete: c };
  }
  const nums = (r: { compras: Array<{ sequencia: number }> }): number[] => r.compras.map((c) => c.sequencia);

  it("sem ordem: do maior Nº para o menor (como sempre foi); 'numero' é o mesmo", async () => {
    await tres();
    expect(nums(await listarComprasDoMes("2026-11", {}))).toEqual([18, 7, 3]);
    expect(nums(await listarComprasDoMes("2026-11", { ordem: "numero" }))).toEqual([18, 7, 3]);
  });

  it("'recentes': a versão mais nova primeiro (quem acabou de ser salva sobe)", async () => {
    const { tres: c3 } = await tres();
    expect(nums(await listarComprasDoMes("2026-11", { ordem: "recentes" }))).toEqual([7, 18, 3]);
    vi.setSystemTime(new Date("2026-11-19T16:00:00.000Z"));
    await salvarCompra(c3.id, estado(c3, undefined, { paciente: "MEXIDA AGORA" }), "Cris");
    expect(nums(await listarComprasDoMes("2026-11", { ordem: "recentes" }))).toEqual([3, 7, 18]);
    expect(nums(await listarComprasDoMes("2026-11", { ordem: "numero" }))).toEqual([18, 7, 3]); // por número não muda
  });

  it("'inverter': de cabeça para baixo, nas duas visões", async () => {
    await tres();
    expect(nums(await listarComprasDoMes("2026-11", { ordem: "numero", inverter: true }))).toEqual([3, 7, 18]);
    expect(nums(await listarComprasDoMes("2026-11", { ordem: "recentes", inverter: true }))).toEqual([3, 18, 7]);
  });

  it("a ordem vale ANTES de fatiar a página (a página 2 continua de onde a 1 parou) e as canceladas só entram se pedidas", async () => {
    const { dezoito } = await tres();
    vi.setSystemTime(new Date("2026-11-19T16:00:00.000Z"));
    await cancelarCompra(dezoito.id, "Cris");
    const p1 = await listarComprasDoMes("2026-11", { ordem: "recentes", incluirCanceladas: true, limite: 2, pagina: 1 });
    const p2 = await listarComprasDoMes("2026-11", { ordem: "recentes", incluirCanceladas: true, limite: 2, pagina: 2 });
    expect([...nums(p1), ...nums(p2)]).toEqual([18, 7, 3]); // a 18 foi cancelada agora: é a mais recente
    expect(p1.temMais).toBe(true);
    expect(p2.temMais).toBe(false);
    expect(nums(await listarComprasDoMes("2026-11", { ordem: "recentes" }))).toEqual([7, 3]);
  });

  it("a visão não muda os totais nem o maior número", async () => {
    const { dezoito } = await tres();
    await cancelarCompra(dezoito.id, "Cris");
    const a = await listarComprasDoMes("2026-11", { ordem: "numero" });
    const b = await listarComprasDoMes("2026-11", { ordem: "recentes", inverter: true });
    expect([b.totais, b.maiorSequencia]).toEqual([a.totais, a.maiorSequencia]);
    expect(a.maiorSequencia).toBe(18);
  });
});
