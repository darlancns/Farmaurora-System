import { describe, expect, it } from "vitest";
import { quebrarNumeroProcesso } from "../../app/utils/quebrarNumeroProcesso";

describe("quebrarNumeroProcesso", () => {
  it("quebra depois de ponto, barra e traço, preservando o texto original", () => {
    const valor = "25BR00009876543-2/2026-ADM/0001.2345.6789";
    const trechos = quebrarNumeroProcesso(valor);
    expect(trechos).toEqual(["25BR00009876543-", "2/", "2026-", "ADM/", "0001.", "2345.", "6789"]);
    expect(trechos.join("")).toBe(valor);
  });

  it("valor sem separador vira um trecho só", () => {
    expect(quebrarNumeroProcesso("123456789")).toEqual(["123456789"]);
  });

  it("separador no fim não gera trecho vazio", () => {
    expect(quebrarNumeroProcesso("123-")).toEqual(["123-"]);
  });

  it("string vazia devolve um trecho vazio (o chamador já trata '—' antes)", () => {
    expect(quebrarNumeroProcesso("").join("")).toBe("");
  });
});
