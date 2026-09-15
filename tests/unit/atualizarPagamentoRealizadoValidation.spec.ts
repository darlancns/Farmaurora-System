import { describe, expect, it } from "vitest";
import {
  isValidAtualizarGrupoRealizado,
  isValidAtualizarLancamentoRealizado,
} from "../../server/utils/pagamentoValidation";

// Cobre a validação dos PATCHs de correção pontual em "Pagamentos
// realizados": Banco (cliente do lançamento + pagoEm do lote) e Despachante/
// Transportadora (nomeGrupo + pagoEm do grupo). Ambos exigem pagoEm no
// formato YYYY-MM-DD e nunca posterior a hoje — o cliente já bloqueia data
// futura, mas o servidor nunca confia só nele.

function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function ontem(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

describe("isValidAtualizarLancamentoRealizado — cliente + pagoEm", () => {
  it("aceita cliente não-vazio com data válida (hoje ou passada)", () => {
    expect(isValidAtualizarLancamentoRealizado({ cliente: "Cliente X", pagoEm: hoje() })).toBe(true);
    expect(isValidAtualizarLancamentoRealizado({ cliente: "Cliente X", pagoEm: ontem() })).toBe(true);
  });

  it("rejeita cliente vazio", () => {
    expect(isValidAtualizarLancamentoRealizado({ cliente: "", pagoEm: hoje() })).toBe(false);
    expect(isValidAtualizarLancamentoRealizado({ cliente: "   ", pagoEm: hoje() })).toBe(false);
    expect(isValidAtualizarLancamentoRealizado({ pagoEm: hoje() })).toBe(false);
  });

  it("rejeita data futura ou fora do formato YYYY-MM-DD", () => {
    expect(isValidAtualizarLancamentoRealizado({ cliente: "Cliente X", pagoEm: amanha() })).toBe(false);
    expect(
      isValidAtualizarLancamentoRealizado({ cliente: "Cliente X", pagoEm: "2026-01-15T00:00:00.000Z" }),
    ).toBe(false);
  });

  it("rejeita body malformado", () => {
    expect(isValidAtualizarLancamentoRealizado(null)).toBe(false);
    expect(isValidAtualizarLancamentoRealizado("x")).toBe(false);
    expect(isValidAtualizarLancamentoRealizado({})).toBe(false);
  });
});

describe("isValidAtualizarGrupoRealizado — nomeGrupo + pagoEm", () => {
  it("aceita nomeGrupo não-vazio com data válida", () => {
    expect(isValidAtualizarGrupoRealizado({ nomeGrupo: "Bruno Lopes", pagoEm: hoje() })).toBe(true);
    expect(isValidAtualizarGrupoRealizado({ nomeGrupo: "Bruno Lopes", pagoEm: ontem() })).toBe(true);
  });

  it("rejeita nomeGrupo vazio", () => {
    expect(isValidAtualizarGrupoRealizado({ nomeGrupo: "", pagoEm: hoje() })).toBe(false);
    expect(isValidAtualizarGrupoRealizado({ pagoEm: hoje() })).toBe(false);
  });

  it("rejeita data futura", () => {
    expect(isValidAtualizarGrupoRealizado({ nomeGrupo: "Bruno Lopes", pagoEm: amanha() })).toBe(false);
  });

  it("rejeita body malformado", () => {
    expect(isValidAtualizarGrupoRealizado(null)).toBe(false);
    expect(isValidAtualizarGrupoRealizado({})).toBe(false);
  });
});
