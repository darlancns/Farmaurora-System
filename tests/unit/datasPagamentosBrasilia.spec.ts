import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoteBanco, NovoGrupoPagamentoDTO, NovoLancamentoBancoDTO } from "../../shared/types/Pagamento";
import { ehDataFutura, hojeBrasilia } from "../../shared/utils/dataBrasilia";
import { FakeSupabase } from "./helpers/fakeSupabase";

// "Hoje" = dia de Brasília no servidor: data do lote, validação de pagoEm futuro (igual à do
// cliente) e agregação de itens no grupo de Despachante/Transportadora. O relógio é injetado com
// timers falsos (só Date); os horários são de parede de Brasília (UTC-3).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { criarLancamentoBanco } = await import("../../server/utils/pagamentos/bancoStore");
const { criarGrupoPagamento } = await import("../../server/utils/pagamentos/grupoStore");
const { loteToRow } = await import("../../server/utils/pagamentos/bancoMappers");
const { isValidAtualizarLancamentoRealizado, isValidAtualizarGrupoRealizado } = await import(
  "../../server/utils/pagamentoValidation"
);

const T_LOTES = "pagamento_lotes_banco";
const T_LANC = "pagamento_lancamentos_banco";
const T_GRUPOS = "pagamento_grupos";

function relogio(brtIso: string): void {
  vi.setSystemTime(new Date(`${brtIso}-03:00`));
}

const dtoLanc: NovoLancamentoBancoDTO = {
  empresa: "FARMAURORA",
  moeda: "USD",
  fornecedor: "Poros - Turquia",
  invoice: "INV-1",
  cliente: "Cliente",
  valorMoeda: 100,
};

// O que o NovoGrupoPagamentoModal faz: data = hoje de Brasília no instante em que abre.
function grupoDoModal(paciente: string): NovoGrupoPagamentoDTO {
  return {
    tipo: "DESPACHANTE",
    data: hojeBrasilia(),
    empresa: "FARMAURORA",
    nomeGrupo: "Andreza Faconi",
    itens: [{ paciente, valor: 100 }],
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  fake.tabelas[T_LOTES] = [];
  fake.tabelas[T_LANC] = [];
  fake.tabelas[T_GRUPOS] = [];
  fake.chamadas.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("lote criado depois das 21h BRT", () => {
  it("às 22:00 BRT (UTC já é o dia seguinte) grava a data de Brasília, no lote e no lançamento", async () => {
    relogio("2026-10-21T22:00:00");
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-22"); // o dia UTC (o bug antigo)

    const r = await criarLancamentoBanco(dtoLanc);

    expect(r.lote.data).toBe("2026-10-21");
    expect(r.lancamento.data).toBe("2026-10-21");
    expect(fake.linhas(T_LOTES)[0]!.data).toBe("2026-10-21");
  });

  it("20:59, 21:00 e 23:59 BRT caem no mesmo dia; 00:00 BRT é o dia seguinte", async () => {
    const datas: string[] = [];
    for (const [i, quando] of ["2026-10-21T20:59:00", "2026-10-21T21:00:00", "2026-10-21T23:59:59", "2026-10-22T00:00:00"].entries()) {
      relogio(quando);
      fake.tabelas[T_LOTES] = [];
      const r = await criarLancamentoBanco({ ...dtoLanc, invoice: `INV-${i}` });
      datas.push(r.lote.data);
    }
    expect(datas).toEqual(["2026-10-21", "2026-10-21", "2026-10-21", "2026-10-22"]);
  });
});

describe("validação 'pagoEm não pode ser posterior a hoje' — servidor igual ao cliente", () => {
  it("aceita hoje às 22:00 BRT e rejeita amanhã de Brasília (Banco e grupos)", () => {
    relogio("2026-10-21T22:00:00");
    const hojeOk = { cliente: "Fulano", pagoEm: "2026-10-21" };
    const amanha = { cliente: "Fulano", pagoEm: "2026-10-22" };
    expect(isValidAtualizarLancamentoRealizado(hojeOk)).toBe(true);
    expect(isValidAtualizarLancamentoRealizado(amanha)).toBe(false);
    expect(isValidAtualizarGrupoRealizado({ nomeGrupo: "Andreza Faconi", pagoEm: "2026-10-21" })).toBe(true);
    expect(isValidAtualizarGrupoRealizado({ nomeGrupo: "Andreza Faconi", pagoEm: "2026-10-22" })).toBe(false);
  });

  it("aceita datas passadas e recusa formato inválido ou data que não existe", () => {
    relogio("2026-10-21T22:00:00");
    expect(isValidAtualizarLancamentoRealizado({ cliente: "F", pagoEm: "2020-03-10" })).toBe(true);
    expect(isValidAtualizarLancamentoRealizado({ cliente: "F", pagoEm: "10/03/2020" })).toBe(false);
  });

  it("cliente (ehDataFutura, que o modal usa) e servidor concordam em todos os horários-limite", () => {
    const horarios = [
      "2026-10-21T00:00:00", "2026-10-21T20:59:00", "2026-10-21T21:00:00", "2026-10-21T23:59:59",
      "2026-10-31T23:59:59", "2026-11-01T00:00:00", "2026-12-31T22:00:00", "2027-01-01T00:00:00",
    ];
    for (const quando of horarios) {
      relogio(quando);
      const agora = new Date();
      const hoje = hojeBrasilia(agora);
      for (const dia of [-1, 0, 1].map((n) => new Date(new Date(`${hoje}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10))) {
        const cliente = !ehDataFutura(dia, agora);
        const servidor = isValidAtualizarLancamentoRealizado({ cliente: "F", pagoEm: dia });
        expect(servidor, `${quando} pagoEm=${dia}`).toBe(cliente);
      }
    }
  });
});

describe("grupo de Despachante/Transportadora — agregação pelo dia de Brasília", () => {
  it("itens às 20:59 e 22:00 BRT caem no mesmo grupo; depois de 00:00 BRT, grupo novo", async () => {
    relogio("2026-10-21T20:59:00");
    await criarGrupoPagamento(grupoDoModal("Ana"));
    relogio("2026-10-21T22:00:00");
    await criarGrupoPagamento(grupoDoModal("Bia"));

    expect(fake.linhas(T_GRUPOS)).toHaveLength(1);
    expect(fake.linhas(T_GRUPOS)[0]!.data).toBe("2026-10-21");
    expect((fake.linhas(T_GRUPOS)[0]!.itens as unknown[]).length).toBe(2);

    relogio("2026-10-22T00:00:00");
    await criarGrupoPagamento(grupoDoModal("Caio"));
    expect(fake.linhas(T_GRUPOS)).toHaveLength(2);
    expect(fake.linhas(T_GRUPOS).map((g) => g.data).sort()).toEqual(["2026-10-21", "2026-10-22"]);
  });
});

describe("dados antigos: lote/grupo EM ABERTO com data de 'amanhã' gravada pelo bug das 21h", () => {
  const loteAmanha: LoteBanco = {
    id: "lote_amanha",
    data: "2026-10-22", // gravada pelo bug (UTC) às 22:00 BRT de 21/10
    empresa: "FARMAURORA",
    moeda: "USD",
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
    createdAt: "2026-10-22T01:00:00.000Z",
  };

  it("o lote continua sendo achado pela moeda (a data não entra na busca) e o lançamento herda a data dele", async () => {
    fake.semear(T_LOTES, [loteToRow(loteAmanha)]);
    relogio("2026-10-21T23:00:00");

    const r = await criarLancamentoBanco(dtoLanc);

    expect(r.lote.id).toBe("lote_amanha");
    expect(fake.linhas(T_LOTES)).toHaveLength(1); // não abriu outro lote
    expect(r.lancamento.data).toBe("2026-10-22"); // herda a data do lote (não é corrigida)
    expect(fake.linhas(T_LOTES)[0]!.data).toBe("2026-10-22");
  });

  it("o grupo aberto de data futura NÃO agrega com o de hoje; vira o mesmo grupo quando o dia chega", async () => {
    fake.semear(T_GRUPOS, [
      {
        id: "grp_amanha",
        tipo: "DESPACHANTE",
        data: "2026-10-22",
        empresa: "FARMAURORA",
        nome_grupo: "Andreza Faconi",
        chave_pix: null,
        itens: [{ paciente: "Antigo", valor: 50, status: "NAO_PAGO" }],
        realizado: false,
        pago_em: null,
        created_at: "2026-10-22T01:00:00.000Z",
      },
    ]);

    // 23:00 BRT de 21/10: o novo item tem data 2026-10-21 -> grupo separado do de 2026-10-22
    relogio("2026-10-21T23:00:00");
    await criarGrupoPagamento(grupoDoModal("Novo"));
    expect(fake.linhas(T_GRUPOS)).toHaveLength(2);
    expect((fake.linhas(T_GRUPOS).find((g) => g.id === "grp_amanha")!.itens as unknown[]).length).toBe(1);

    // 00:00 BRT de 22/10: a data de hoje passa a ser 2026-10-22 -> agrega no grupo antigo
    relogio("2026-10-22T00:00:00");
    await criarGrupoPagamento(grupoDoModal("Depois"));
    expect(fake.linhas(T_GRUPOS)).toHaveLength(2);
    expect((fake.linhas(T_GRUPOS).find((g) => g.id === "grp_amanha")!.itens as unknown[]).length).toBe(2);
  });
});
