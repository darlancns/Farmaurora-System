import { describe, expect, it } from "vitest";
import { isValidAtualizarCotacao } from "../../server/utils/pagamentoValidation";

// PATCH /api/pagamentos/cotacao — forma do body.
//  - { opcoes: [...] }                         grava taxa/corretagem digitadas
//  - { bancoEscolhido: "XP" }                  "Usar este banco" (taxa única)
//  - { bancoEscolhido: "RENDIMENTO", taxasRendimento: [...] }  fechamento por ordem

const opcoesOk = [
  { banco: "XP", taxaCorretagem: 0, taxa: 5.4 },
  { banco: "RENDIMENTO", taxaCorretagem: 12, taxa: 5.41 },
  { banco: "INTEX", taxaCorretagem: 0, taxa: null },
];

describe("isValidAtualizarCotacao — XP/Intex (sem regressão)", () => {
  it("aceita só opcoes", () => {
    expect(isValidAtualizarCotacao({ opcoes: opcoesOk })).toBe(true);
  });

  it("aceita bancoEscolhido XP sem taxasRendimento", () => {
    expect(isValidAtualizarCotacao({ opcoes: opcoesOk, bancoEscolhido: "XP" })).toBe(true);
    expect(isValidAtualizarCotacao({ bancoEscolhido: "INTEX" })).toBe(true);
  });

  it("rejeita body vazio", () => {
    expect(isValidAtualizarCotacao({})).toBe(false);
  });
});

describe("isValidAtualizarCotacao — Rendimento por ordem", () => {
  it("aceita RENDIMENTO com taxasRendimento bem formadas", () => {
    expect(
      isValidAtualizarCotacao({
        opcoes: opcoesOk,
        bancoEscolhido: "RENDIMENTO",
        taxasRendimento: [
          { lancamentoId: "lanc_1", taxa: 5.4 },
          { lancamentoId: "lanc_2", taxa: 5.47 },
        ],
      })
    ).toBe(true);
  });

  it("rejeita RENDIMENTO sem taxasRendimento (obrigatório)", () => {
    expect(isValidAtualizarCotacao({ bancoEscolhido: "RENDIMENTO" })).toBe(false);
    expect(isValidAtualizarCotacao({ opcoes: opcoesOk, bancoEscolhido: "RENDIMENTO" })).toBe(false);
  });

  it("rejeita taxasRendimento sem bancoEscolhido === RENDIMENTO", () => {
    expect(
      isValidAtualizarCotacao({
        bancoEscolhido: "XP",
        taxasRendimento: [{ lancamentoId: "lanc_1", taxa: 5.4 }],
      })
    ).toBe(false);
    expect(
      isValidAtualizarCotacao({
        opcoes: opcoesOk,
        taxasRendimento: [{ lancamentoId: "lanc_1", taxa: 5.4 }],
      })
    ).toBe(false);
  });

  it("rejeita entradas mal formadas (id vazio, taxa <= 0, lista vazia)", () => {
    const base = { bancoEscolhido: "RENDIMENTO" as const };
    expect(isValidAtualizarCotacao({ ...base, taxasRendimento: [] })).toBe(false);
    expect(
      isValidAtualizarCotacao({ ...base, taxasRendimento: [{ lancamentoId: "", taxa: 5.4 }] })
    ).toBe(false);
    expect(
      isValidAtualizarCotacao({ ...base, taxasRendimento: [{ lancamentoId: "lanc_1", taxa: 0 }] })
    ).toBe(false);
    expect(
      isValidAtualizarCotacao({ ...base, taxasRendimento: [{ lancamentoId: "lanc_1" }] })
    ).toBe(false);
  });
});
