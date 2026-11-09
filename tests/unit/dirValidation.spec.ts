import { describe, expect, it } from "vitest";
import { isValidDirPatch, isValidDirPayload } from "../../server/utils/dirValidation";
import { novoDirDTO } from "./helpers/dirFixtures";

describe("dirValidation — isValidDirPayload (create)", () => {
  it("aceita um DTO completo", () => {
    expect(isValidDirPayload(novoDirDTO())).toBe(true);
  });

  it("aceita status nulo, datas vazias e texto vazio", () => {
    expect(
      isValidDirPayload(novoDirDTO({ status: null, dataEmissao: "", dataEntrega: "", awb: "", responsavel: "", banco: "" })),
    ).toBe(true);
  });

  it("aceita valores literais fora das listas (texto livre, sem enum)", () => {
    expect(isValidDirPayload(novoDirDTO({ vendedor: "Braulio (3RB)", fornecedor: "Fornecedor Novo", banco: "Banco Novo" }))).toBe(true);
  });

  it("rejeita PO fora do padrão", () => {
    for (const po of ["", "PO26-1-0001", "po26-10-0001", "PO26-10-001", "26-10-0001", " PO26-10-0001x"]) {
      expect(isValidDirPayload(novoDirDTO({ po })), po).toBe(false);
    }
  });

  it("rejeita paciente e vendedor vazios", () => {
    expect(isValidDirPayload(novoDirDTO({ paciente: "  " }))).toBe(false);
    expect(isValidDirPayload(novoDirDTO({ vendedor: "" }))).toBe(false);
  });

  it("rejeita status inválido, data inexistente, data fora do formato e booleano não-boolean", () => {
    expect(isValidDirPayload(novoDirDTO({ status: "perdido" as never }))).toBe(false);
    expect(isValidDirPayload(novoDirDTO({ dataEmissao: "2026-02-31" }))).toBe(false);
    expect(isValidDirPayload(novoDirDTO({ dataPagamento: "10/02/2026" }))).toBe(false);
    expect(isValidDirPayload({ ...novoDirDTO(), conferido: "true" })).toBe(false);
  });

  it("rejeita texto longo demais", () => {
    expect(isValidDirPayload(novoDirDTO({ observacao: "x".repeat(301) }))).toBe(false);
  });

  it("rejeita campo faltando, campo desconhecido e corpo que não é objeto", () => {
    const { swift: _swift, ...semSwift } = novoDirDTO();
    expect(isValidDirPayload(semSwift)).toBe(false);
    expect(isValidDirPayload({ ...novoDirDTO(), empresa: "FARMAURORA" })).toBe(false);
    expect(isValidDirPayload(null)).toBe(false);
    expect(isValidDirPayload([])).toBe(false);
    expect(isValidDirPayload("PO26-10-0001")).toBe(false);
  });
});

describe("dirValidation — isValidDirPatch", () => {
  it("aceita os toggles instantâneos e campos soltos", () => {
    expect(isValidDirPatch({ conferido: true })).toBe(true);
    expect(isValidDirPatch({ dactes: false })).toBe(true);
    expect(isValidDirPatch({ operacaoEncerrada: true })).toBe(true);
    expect(isValidDirPatch({ status: null, dataEntrega: "" })).toBe(true);
    expect(isValidDirPatch({ banco: "XP", dataPagamento: "2026-10-20" })).toBe(true);
  });

  it("rejeita patch vazio, chave desconhecida (inclui id e empresa) e valor inválido", () => {
    expect(isValidDirPatch({})).toBe(false);
    expect(isValidDirPatch({ id: "outro" })).toBe(false);
    expect(isValidDirPatch({ empresa: "MAINZFARMA" })).toBe(false);
    expect(isValidDirPatch({ conferido: "sim" })).toBe(false);
    expect(isValidDirPatch({ po: "PO" })).toBe(false);
    expect(isValidDirPatch({ paciente: "" })).toBe(false);
    expect(isValidDirPatch({ status: "x" })).toBe(false);
    expect(isValidDirPatch({ dataEmissao: "2026-13-01" })).toBe(false);
  });

  it("rejeita corpo que não é objeto", () => {
    expect(isValidDirPatch(undefined)).toBe(false);
    expect(isValidDirPatch([{ conferido: true }])).toBe(false);
  });
});
