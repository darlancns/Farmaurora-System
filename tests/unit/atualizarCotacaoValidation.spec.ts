import { describe, expect, it } from "vitest";
import { TAXA_MAX, TAXA_MIN } from "../../shared/constants/pagamentos";
import { isValidAtualizarCotacao, mensagemTaxaForaDoIntervalo } from "../../server/utils/pagamentoValidation";

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

// Trava de sanidade: toda taxa não-nula precisa estar em [TAXA_MIN, TAXA_MAX].
// O caso real que motivou: "5.4231" lido como 54231 por um parser de moeda.
describe("isValidAtualizarCotacao — trava de intervalo da taxa", () => {
  const opcoesCom = (banco: "XP" | "RENDIMENTO" | "INTEX", taxa: number | null) =>
    ["XP", "RENDIMENTO", "INTEX"].map((b) => ({ banco: b, taxaCorretagem: 0, taxa: b === banco ? taxa : null }));

  it.each([TAXA_MIN, 5.4231, 5.10410027, TAXA_MAX])("aceita taxa %s nas opcoes de cada banco", (taxa) => {
    for (const banco of ["XP", "RENDIMENTO", "INTEX"] as const) {
      expect(isValidAtualizarCotacao({ opcoes: opcoesCom(banco, taxa) })).toBe(true);
    }
  });

  it.each([54231, 0.99, 20.01, 100, 0])("rejeita taxa %s nas opcoes de cada banco", (taxa) => {
    for (const banco of ["XP", "RENDIMENTO", "INTEX"] as const) {
      expect(isValidAtualizarCotacao({ opcoes: opcoesCom(banco, taxa) })).toBe(false);
    }
  });

  it("taxa null continua válida (banco ainda não cotado)", () => {
    expect(isValidAtualizarCotacao({ opcoes: opcoesCom("XP", null) })).toBe(true);
  });

  it("rejeita taxa fora do intervalo em taxasRendimento (fechamento por ordem)", () => {
    const body = (taxa: number) => ({
      bancoEscolhido: "RENDIMENTO" as const,
      taxasRendimento: [{ lancamentoId: "lanc_1", taxa: 5.4 }, { lancamentoId: "lanc_2", taxa }],
    });
    expect(isValidAtualizarCotacao(body(5.47))).toBe(true);
    expect(isValidAtualizarCotacao(body(54231))).toBe(false);
    expect(isValidAtualizarCotacao(body(0.5))).toBe(false);
    expect(isValidAtualizarCotacao(body(21))).toBe(false);
  });

  it("mensagemTaxaForaDoIntervalo explica o motivo (400 com mensagem clara)", () => {
    const msg = mensagemTaxaForaDoIntervalo({ opcoes: opcoesCom("RENDIMENTO", 54231) });
    expect(msg).toContain("54231");
    expect(msg).toContain(`${TAXA_MIN} a ${TAXA_MAX}`);
    expect(
      mensagemTaxaForaDoIntervalo({
        bancoEscolhido: "RENDIMENTO",
        taxasRendimento: [{ lancamentoId: "x", taxa: 99 }],
      }),
    ).toContain("99");
  });

  it("mensagemTaxaForaDoIntervalo é null quando está tudo dentro do intervalo (ou o erro é outro)", () => {
    expect(mensagemTaxaForaDoIntervalo({ opcoes: opcoesCom("XP", 5.4) })).toBeNull();
    expect(mensagemTaxaForaDoIntervalo({ opcoes: opcoesCom("XP", null) })).toBeNull();
    expect(mensagemTaxaForaDoIntervalo({})).toBeNull();
    expect(mensagemTaxaForaDoIntervalo(null)).toBeNull();
  });
});
