import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LancamentoBanco, LoteBanco, Moeda, NovoLancamentoBancoDTO } from "../../shared/types/Pagamento";
import { FakeSupabase } from "./helpers/fakeSupabase";

// criarLancamentoBanco — "a MOEDA define o lote". Cliente Supabase em memória
// (tests/unit/helpers/fakeSupabase.ts); nada de rede.

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { criarLancamentoBanco } = await import("../../server/utils/pagamentos/bancoStore");
const { loteToRow, lancToRow } = await import("../../server/utils/pagamentos/bancoMappers");

const T_LOTES = "pagamento_lotes_banco";
const T_LANC = "pagamento_lancamentos_banco";

function lote(id: string, moeda: Moeda, extra: Partial<LoteBanco> = {}): LoteBanco {
  return {
    id,
    data: "2026-10-20",
    empresa: "FARMAURORA",
    moeda,
    numeroLote: 1,
    opcoes: [
      { banco: "XP", taxaCorretagem: 25, taxa: null },
      { banco: "RENDIMENTO", taxaCorretagem: 30, taxa: null },
      { banco: "INTEX", taxaCorretagem: 35, taxa: null },
    ],
    bancoEscolhido: null,
    taxaEscolhida: null,
    realizado: false,
    pagoEm: null,
    createdAt: "2026-10-20T10:00:00.000Z",
    ...extra,
  };
}

function lanc(id: string, l: LoteBanco, extra: Partial<LancamentoBanco> = {}): LancamentoBanco {
  return {
    id,
    loteId: l.id,
    data: l.data,
    empresa: l.empresa,
    fornecedor: "Poros - Turquia",
    invoice: `INV-${id}`,
    cliente: "Cliente",
    valorMoeda: 100,
    moeda: l.moeda,
    valorReais: null,
    taxa: null,
    createdAt: l.createdAt,
    ...extra,
  };
}

function dto(moeda: Moeda, extra: Partial<NovoLancamentoBancoDTO> = {}): NovoLancamentoBancoDTO {
  return {
    empresa: "FARMAURORA",
    moeda,
    fornecedor: "Poros - Turquia",
    invoice: "INV-NOVO",
    cliente: "Cliente Novo",
    valorMoeda: 250,
    ...extra,
  };
}

function semear(lotes: LoteBanco[], lancs: LancamentoBanco[] = []): void {
  fake.semear(T_LOTES, lotes.map(loteToRow));
  fake.semear(T_LANC, lancs.map(lancToRow));
}

const lotesDe = (moeda: Moeda) => fake.linhas(T_LOTES).filter((r) => r.moeda === moeda);

beforeEach(() => {
  fake.tabelas[T_LOTES] = [];
  fake.tabelas[T_LANC] = [];
  fake.chamadas.length = 0;
});

describe("criarLancamentoBanco — roteamento pela moeda", () => {
  it("sem lote da moeda: cria o lote (numeroLote 1) junto com o lançamento", async () => {
    const r = await criarLancamentoBanco(dto("USD"));

    expect(lotesDe("USD")).toHaveLength(1);
    expect(r.lote.numeroLote).toBe(1);
    expect(r.lote.moeda).toBe("USD");
    expect(r.lancamento.loteId).toBe(r.lote.id);
    expect(fake.linhas(T_LANC)).toHaveLength(1);
  });

  it("com lote aberto da moeda: entra nele, sem criar outro", async () => {
    const usd = lote("lote_usd", "USD");
    semear([usd], [lanc("a", usd)]);

    const r = await criarLancamentoBanco(dto("USD"));

    expect(r.lote.id).toBe("lote_usd");
    expect(lotesDe("USD")).toHaveLength(1);
    expect(fake.linhas(T_LANC).filter((l) => l.lote_id === "lote_usd")).toHaveLength(2);
  });

  it("EUR com só USD aberto: cria o 2º lote (EUR) sem tocar no USD", async () => {
    const usd = lote("lote_usd", "USD", { bancoEscolhido: "XP", taxaEscolhida: 5.4 });
    semear([usd], [lanc("a", usd, { valorReais: 540 })]);
    const loteUsdAntes = JSON.stringify(lotesDe("USD"));
    const lancUsdAntes = JSON.stringify(fake.linhas(T_LANC));

    const r = await criarLancamentoBanco(dto("EUR"));

    expect(r.lote.id).not.toBe("lote_usd");
    expect(r.lote.moeda).toBe("EUR");
    expect(r.lote.numeroLote).toBe(1);
    expect(r.lancamento.moeda).toBe("EUR");
    expect(lotesDe("EUR")).toHaveLength(1);
    // USD intacto (inclusive a cotação e o valorReais já calculado).
    expect(JSON.stringify(lotesDe("USD"))).toBe(loteUsdAntes);
    expect(JSON.stringify(fake.linhas(T_LANC).filter((x) => x.lote_id === "lote_usd"))).toBe(lancUsdAntes);
  });

  it("2+ lotes abertos da mesma moeda (legado): entra no mais recente", async () => {
    const antigo = lote("lote_antigo", "USD", { createdAt: "2026-10-19T10:00:00.000Z", data: "2026-10-19" });
    const recente = lote("lote_recente", "USD", { numeroLote: 2, createdAt: "2026-10-20T10:00:00.000Z" });
    semear([antigo, recente], [lanc("a", antigo), lanc("b", recente)]);

    const r = await criarLancamentoBanco(dto("USD"));

    expect(r.lote.id).toBe("lote_recente");
    expect(fake.linhas(T_LANC).filter((l) => l.lote_id === "lote_antigo")).toHaveLength(1);
    expect(fake.linhas(T_LANC).filter((l) => l.lote_id === "lote_recente")).toHaveLength(2);
  });

  it("lote de dia anterior recebe o pagamento e mantém a data de abertura", async () => {
    const ontem = lote("lote_ontem", "USD", { data: "2026-10-19", createdAt: "2026-10-19T09:00:00.000Z" });
    semear([ontem], [lanc("a", ontem)]);

    const r = await criarLancamentoBanco(dto("USD"));

    expect(r.lote.id).toBe("lote_ontem");
    expect(r.lote.data).toBe("2026-10-19");
    expect(r.lancamento.data).toBe("2026-10-19");
  });

  it("ignora lotes já pagos (realizado) e de outra empresa", async () => {
    const pago = lote("lote_pago", "USD", { realizado: true, pagoEm: "2026-10-18T12:00:00.000Z" });
    // linha de outra empresa (valor fora do tipo atual): o store só filtra por igualdade de empresa
    const outra = lote("lote_outra", "USD", { empresa: "OUTRA_EMPRESA" as LoteBanco["empresa"] });
    semear([pago, outra]);

    const r = await criarLancamentoBanco(dto("USD"));

    expect(r.lote.id).not.toBe("lote_pago");
    expect(r.lote.id).not.toBe("lote_outra");
    expect(r.lote.empresa).toBe("FARMAURORA");
    expect(r.lote.numeroLote).toBe(1);
  });

  it("moeda do lançamento e do lote sempre coincidem (USD nunca cai em lote EUR)", async () => {
    const eur = lote("lote_eur", "EUR", { createdAt: "2026-10-21T10:00:00.000Z" });
    semear([eur]);

    const r = await criarLancamentoBanco(dto("USD"));

    expect(r.lote.id).not.toBe("lote_eur");
    expect(r.lote.moeda).toBe("USD");
    expect(r.lancamento.moeda).toBe("USD");
    for (const l of fake.linhas(T_LANC)) {
      const dono = fake.linhas(T_LOTES).find((x) => x.id === l.lote_id);
      expect(dono?.moeda).toBe(l.moeda);
    }
  });

  it("forcarLoteNovo continua criando um lote novo mesmo havendo aberto (semear testes)", async () => {
    const usd = lote("lote_usd", "USD");
    semear([usd], [lanc("a", usd)]);

    const r = await criarLancamentoBanco(dto("USD", { forcarLoteNovo: true }));

    expect(r.lote.id).not.toBe("lote_usd");
    expect(r.lote.numeroLote).toBe(2);
    expect(lotesDe("USD")).toHaveLength(2);
  });
});

describe("criarLancamentoBanco — lote cotado tem a cotação invalidada", () => {
  it("zera banco/taxa escolhidos e as 3 taxas, preserva taxaCorretagem e devolve valorReais a null", async () => {
    const cotado = lote("lote_cotado", "USD", {
      bancoEscolhido: "XP",
      taxaEscolhida: 5.4,
      opcoes: [
        { banco: "XP", taxaCorretagem: 27, taxa: 5.4 },
        { banco: "RENDIMENTO", taxaCorretagem: 31, taxa: 5.5 },
        { banco: "INTEX", taxaCorretagem: 36, taxa: 5.6 },
      ],
    });
    semear([cotado], [lanc("a", cotado, { valorReais: 540, taxa: 5.4 })]);

    const r = await criarLancamentoBanco(dto("USD"));

    const row = fake.linhas(T_LOTES)[0]!;
    expect(row.banco_escolhido).toBeNull();
    expect(row.taxa_escolhida).toBeNull();
    expect(row.xp_taxa).toBeNull();
    expect(row.rendimento_taxa).toBeNull();
    expect(row.intex_taxa).toBeNull();
    // taxaCorretagem editada é preservada.
    expect(row.xp_taxa_corretagem).toBe(27);
    expect(row.rendimento_taxa_corretagem).toBe(31);
    expect(row.intex_taxa_corretagem).toBe(36);
    // lançamentos do lote voltam a pendentes.
    for (const l of fake.linhas(T_LANC)) {
      expect(l.valor_reais).toBeNull();
      expect(l.taxa).toBeNull();
    }
    // O lote devolvido reflete a invalidação.
    expect(r.lote.bancoEscolhido).toBeNull();
    expect(r.lote.taxaEscolhida).toBeNull();
    expect(r.lote.opcoes.every((o) => o.taxa === null)).toBe(true);
    expect(fake.linhas(T_LANC)).toHaveLength(2);
  });

  it("lote não cotado: nenhuma escrita de invalidação", async () => {
    const aberto = lote("lote_usd", "USD");
    semear([aberto], [lanc("a", aberto)]);

    await criarLancamentoBanco(dto("USD"));

    expect(fake.chamadas.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("a invalidação acontece ANTES do insert do lançamento (ordem preservada)", async () => {
    const cotado = lote("lote_cotado", "USD", { bancoEscolhido: "XP", taxaEscolhida: 5.4 });
    semear([cotado], [lanc("a", cotado, { valorReais: 540 })]);

    await criarLancamentoBanco(dto("USD"));

    const ops = fake.chamadas.map((c) => `${c.tabela}:${c.op}`);
    const iUpdate = ops.indexOf(`${T_LOTES}:update`);
    const iInsert = ops.indexOf(`${T_LANC}:insert`);
    expect(iUpdate).toBeGreaterThanOrEqual(0);
    expect(iUpdate).toBeLessThan(iInsert);
  });
});

describe("criarLancamentoBanco — rollback de lote vazio", () => {
  it("falha no insert do lançamento: apaga o lote criado nesta chamada e relança o erro original", async () => {
    fake.falhar(T_LANC, "insert", "boom no insert");

    await expect(criarLancamentoBanco(dto("USD"))).rejects.toThrow(/criar lançamento — boom no insert/);

    expect(fake.linhas(T_LOTES)).toHaveLength(0);
    expect(fake.linhas(T_LANC)).toHaveLength(0);
  });

  it("falha com forcarLoteNovo também desfaz só o lote recém-criado", async () => {
    const existente = lote("lote_usd", "USD");
    semear([existente], [lanc("a", existente)]);
    fake.falhar(T_LANC, "insert");

    await expect(criarLancamentoBanco(dto("USD", { forcarLoteNovo: true }))).rejects.toThrow();

    expect(fake.linhas(T_LOTES).map((r) => r.id)).toEqual(["lote_usd"]);
    expect(fake.linhas(T_LANC)).toHaveLength(1);
  });

  it("lote PRÉ-EXISTENTE nunca é apagado quando o insert falha", async () => {
    const existente = lote("lote_usd", "USD");
    semear([existente]); // sem lançamentos: o caso mais exposto a um delete indevido
    fake.falhar(T_LANC, "insert");

    await expect(criarLancamentoBanco(dto("USD"))).rejects.toThrow(/criar lançamento/);

    expect(fake.linhas(T_LOTES).map((r) => r.id)).toEqual(["lote_usd"]);
    expect(fake.chamadas.some((c) => c.tabela === T_LOTES && c.op === "delete")).toBe(false);
  });

  it("lote pré-existente cotado: não é apagado, e a invalidação (que vem antes do insert) permanece", async () => {
    const cotado = lote("lote_cotado", "USD", { bancoEscolhido: "XP", taxaEscolhida: 5.4 });
    semear([cotado], [lanc("a", cotado, { valorReais: 540 })]);
    fake.falhar(T_LANC, "insert");

    await expect(criarLancamentoBanco(dto("USD"))).rejects.toThrow();

    expect(fake.linhas(T_LOTES)).toHaveLength(1);
    expect(fake.linhas(T_LOTES)[0]!.banco_escolhido).toBeNull();
    expect(fake.linhas(T_LANC)).toHaveLength(1);
  });

  it("só apaga o lote criado se ele ainda estiver sem lançamentos", async () => {
    // O insert "falha" mas a linha chegou a ser gravada (ex.: timeout): não apagar.
    const original = fake.from.bind(fake);
    const spy = vi.spyOn(fake, "from").mockImplementation((tabela: string) => {
      const q = original(tabela);
      if (tabela === T_LANC) {
        const insert = q.insert.bind(q);
        q.insert = (row) => {
          fake.semear(T_LANC, [row]);
          fake.falhar(T_LANC, "insert", "timeout depois de gravar");
          return insert({ ...row, id: `${String(row.id)}_dup` });
        };
      }
      return q;
    });

    await expect(criarLancamentoBanco(dto("USD"))).rejects.toThrow(/timeout depois de gravar/);
    spy.mockRestore();

    expect(fake.linhas(T_LOTES)).toHaveLength(1);
    expect(fake.linhas(T_LANC).length).toBeGreaterThanOrEqual(1);
  });

  it("erro no próprio rollback não mascara o erro original", async () => {
    fake.falhar(T_LANC, "insert", "erro original");
    fake.falhar(T_LOTES, "delete", "erro do rollback");

    await expect(criarLancamentoBanco(dto("USD"))).rejects.toThrow(/erro original/);
  });
});
