import { describe, expect, it } from "vitest";
import type { LoteBanco, Moeda } from "../../shared/types/Pagamento";
import {
  AVISO_LOTE_COTADO,
  avisosDestinoNovoPagamento,
  formatDataLote,
  lotesAbertosDaMoeda,
} from "../../app/utils/pagamentoLoteDestino";

function lote(id: string, moeda: Moeda, extra: Partial<LoteBanco> = {}): LoteBanco {
  return {
    id,
    data: "2026-10-20",
    empresa: "FARMAURORA",
    moeda,
    numeroLote: 1,
    opcoes: [],
    bancoEscolhido: null,
    taxaEscolhida: null,
    realizado: false,
    pagoEm: null,
    createdAt: "2026-10-20T10:00:00.000Z",
    ...extra,
  };
}

describe("avisosDestinoNovoPagamento", () => {
  it("sem lote da moeda: nenhum aviso (o lote nasce junto com o pagamento)", () => {
    expect(avisosDestinoNovoPagamento([lote("a", "USD")], "FARMAURORA", "EUR")).toEqual([]);
  });

  it("1 lote aberto não cotado: nenhum aviso", () => {
    expect(avisosDestinoNovoPagamento([lote("a", "USD")], "FARMAURORA", "USD")).toEqual([]);
  });

  it("lote cotado: avisa que a cotação será reaberta", () => {
    const cotado = lote("a", "USD", { bancoEscolhido: "XP", taxaEscolhida: 5.4 });
    expect(avisosDestinoNovoPagamento([cotado], "FARMAURORA", "USD")).toEqual([AVISO_LOTE_COTADO]);
  });

  it("2+ lotes da moeda: cita o N real, a moeda e a data do mais recente (sem 'Lote N')", () => {
    const antigo = lote("a", "USD", { data: "2026-10-19", createdAt: "2026-10-19T10:00:00.000Z" });
    const recente = lote("b", "USD", { data: "2026-10-20", numeroLote: 2 });
    const [aviso] = avisosDestinoNovoPagamento([antigo, recente], "FARMAURORA", "USD");
    expect(aviso).toBe("Há 2 lotes em USD em aberto. Este entra no mais recente (20 de outubro de 2026).");
    expect(aviso).not.toMatch(/Lote \d/);
  });

  it("2+ lotes com o mais recente cotado: os dois avisos, nessa ordem", () => {
    const antigo = lote("a", "EUR", { createdAt: "2026-10-19T10:00:00.000Z" });
    const recente = lote("b", "EUR", { bancoEscolhido: "INTEX", taxaEscolhida: 6.1 });
    const avisos = avisosDestinoNovoPagamento([antigo, recente], "FARMAURORA", "EUR");
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toMatch(/^Há 2 lotes em EUR em aberto\./);
    expect(avisos[1]).toBe(AVISO_LOTE_COTADO);
  });

  it("só olha o lote que o servidor escolheria (o mais recente), não um cotado antigo", () => {
    const antigoCotado = lote("a", "USD", { bancoEscolhido: "XP", createdAt: "2026-10-19T10:00:00.000Z" });
    const recente = lote("b", "USD");
    const avisos = avisosDestinoNovoPagamento([antigoCotado, recente], "FARMAURORA", "USD");
    expect(avisos).toHaveLength(1);
    expect(avisos).not.toContain(AVISO_LOTE_COTADO);
  });

  it("ignora lotes pagos, de outra empresa e de outra moeda", () => {
    const lotes = [
      lote("pago", "USD", { realizado: true }),
      lote("outra", "USD", { empresa: "OUTRA_EMPRESA" as LoteBanco["empresa"] }),
      lote("eur", "EUR"),
    ];
    expect(avisosDestinoNovoPagamento(lotes, "FARMAURORA", "USD")).toEqual([]);
  });
});

describe("lotesAbertosDaMoeda", () => {
  it("ordena por createdAt desc e desempata por id asc, como o servidor", () => {
    const a = lote("b", "USD", { createdAt: "2026-10-20T10:00:00.000Z" });
    const b = lote("a", "USD", { createdAt: "2026-10-20T10:00:00.000Z" });
    const c = lote("c", "USD", { createdAt: "2026-10-21T10:00:00.000Z" });
    expect(lotesAbertosDaMoeda([a, b, c], "FARMAURORA", "USD").map((l) => l.id)).toEqual(["c", "a", "b"]);
  });
});

describe("formatDataLote", () => {
  it("formata a data longa exibida no título do lote", () => {
    expect(formatDataLote("2026-10-20")).toBe("20 de outubro de 2026");
  });
});
