import { describe, expect, it } from "vitest";
import {
  FONTE_PIX_MINIMA_PX,
  FONTE_PIX_PADRAO_PX,
  LARGURA_CARACTERE_MONO_EM,
  LIMITE_PIX_AO_LADO_DO_TOTAL,
  LIMITE_PIX_EM_UMA_LINHA,
  fontePixCss,
  fontePixPx,
  pixEmLinhaPropria,
} from "../../app/utils/pixExport";

// Chaves FICTÍCIAS — só importa o tamanho. Larguras do cartão de 460px (padding de 20px):
//   ao lado do TOTAL ≈ 273px (TOTAL de ~R$ 125.757,28); em linha própria = 420px.
const LARGURA_AO_LADO_DO_TOTAL = 273;
const LARGURA_LINHA_INTEIRA = 420;
const chaveFicticia = (n: number): string => "x".repeat(n);

describe("fontePixPx", () => {
  it("mantém 13px para chaves normais (11, 14 e 18 caracteres)", () => {
    for (const n of [11, 14, 18]) {
      expect(chaveFicticia(n)).toHaveLength(n);
      expect(fontePixPx(n, LARGURA_AO_LADO_DO_TOTAL)).toBe(FONTE_PIX_PADRAO_PX);
    }
  });

  it("encolhe a chave aleatória de 36 caracteres só o necessário ao lado do TOTAL", () => {
    const fonte = fontePixPx(36, LARGURA_AO_LADO_DO_TOTAL);
    expect(fonte).toBeLessThan(FONTE_PIX_PADRAO_PX);
    expect(fonte).toBeGreaterThanOrEqual(FONTE_PIX_MINIMA_PX);
    // E o texto, com essa fonte, cabe na largura.
    expect(36 * LARGURA_CARACTERE_MONO_EM * fonte).toBeLessThanOrEqual(LARGURA_AO_LADO_DO_TOTAL + 0.001);
  });

  it("encolhe a chave de 60 caracteres em linha inteira, sem passar do mínimo", () => {
    const fonte = fontePixPx(60, LARGURA_LINHA_INTEIRA);
    expect(fonte).toBeGreaterThanOrEqual(FONTE_PIX_MINIMA_PX);
    expect(fonte).toBeLessThan(FONTE_PIX_PADRAO_PX);
    expect(60 * LARGURA_CARACTERE_MONO_EM * fonte).toBeLessThanOrEqual(LARGURA_LINHA_INTEIRA + 0.001);
  });

  it("nunca desce de 10px, mesmo quando a chave não cabe", () => {
    expect(fontePixPx(140, LARGURA_LINHA_INTEIRA)).toBe(FONTE_PIX_MINIMA_PX);
    expect(fontePixPx(60, 50)).toBe(FONTE_PIX_MINIMA_PX);
  });

  it("nunca passa de 13px, mesmo com muito espaço", () => {
    expect(fontePixPx(11, 5000)).toBe(FONTE_PIX_PADRAO_PX);
  });

  it("chave vazia usa o tamanho padrão", () => {
    expect(fontePixPx(0, LARGURA_AO_LADO_DO_TOTAL)).toBe(FONTE_PIX_PADRAO_PX);
  });
});

describe("fontePixCss", () => {
  it("usa clamp entre 10px e 13px com a largura da coluna (100cqw) dividida pela largura do texto em fontes", () => {
    expect(fontePixCss(18)).toBe("clamp(10px, calc(100cqw / 10.8), 13px)");
    expect(fontePixCss(36)).toBe("clamp(10px, calc(100cqw / 21.6), 13px)");
    expect(fontePixCss(60)).toBe("clamp(10px, calc(100cqw / 36), 13px)");
  });

  it("é a mesma regra de fontePixPx: o divisor é tamanho × largura do caractere", () => {
    for (const n of [11, 14, 18, 36, 60]) {
      const divisor = Number(/calc\(100cqw \/ ([\d.]+)\)/.exec(fontePixCss(n))?.[1]);
      expect(divisor).toBeCloseTo(n * LARGURA_CARACTERE_MONO_EM, 5);
    }
  });

  it("chave vazia devolve 13px fixos", () => {
    expect(fontePixCss(0)).toBe("13px");
  });
});

describe("pixEmLinhaPropria", () => {
  it("CPF, CNPJ (com e sem pontuação), telefone e chave aleatória ficam ao lado do TOTAL", () => {
    for (const n of [11, 14, 18, 36]) expect(pixEmLinhaPropria(n)).toBe(false);
  });

  it("chaves acima de 36 caracteres ganham a linha inteira", () => {
    expect(pixEmLinhaPropria(LIMITE_PIX_AO_LADO_DO_TOTAL + 1)).toBe(true);
    expect(pixEmLinhaPropria(60)).toBe(true);
  });
});

describe("limites", () => {
  it("70 caracteres ainda cabem em uma linha com a fonte mínima na largura útil do cartão", () => {
    expect(LIMITE_PIX_EM_UMA_LINHA * LARGURA_CARACTERE_MONO_EM * FONTE_PIX_MINIMA_PX).toBeLessThanOrEqual(
      LARGURA_LINHA_INTEIRA,
    );
  });
});
