import { describe, expect, it } from "vitest";
import {
  BANCO_DIR_COR_PADRAO,
  BANCO_DIR_CORES,
  BANCO_DIR_SEM_BANCO,
  BANCOS_DIR,
  corDoBanco,
} from "../../shared/constants/dir";
import { formatarDataHoraBrasilia } from "../../app/utils/dirFormatters";

// Contraste WCAG 2.x (luminância relativa).
function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  const canal = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}
function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (escuro + 0.05);
}

describe("cores dos bancos da DIR (paleta aprovada)", () => {
  const NOMES = ["XP", "Rendimento", "Sicoob", "INTEX", "MIURA", "Pendente", "Não Cotado", "Cancelado"];

  it("tem cor para os 8 bancos da lista da DIR e para mais nenhum", () => {
    expect(Object.keys(BANCO_DIR_CORES).sort()).toEqual([...NOMES].sort());
    for (const banco of BANCOS_DIR) expect(BANCO_DIR_CORES[banco], banco).toBeDefined();
  });

  it("valores da paleta aprovada", () => {
    expect(BANCO_DIR_CORES.XP).toMatchObject({ fundo: "#FEF3C7", texto: "#78350F", ponto: "#D97706" });
    expect(BANCO_DIR_CORES.Rendimento).toMatchObject({ fundo: "#DCFCE7", texto: "#14532D", ponto: "#16A34A" });
    expect(BANCO_DIR_CORES.Sicoob).toMatchObject({ fundo: "#CCFBF1", texto: "#134E4A", ponto: "#0D9488" });
    expect(BANCO_DIR_CORES.INTEX).toMatchObject({ fundo: "#DBEAFE", texto: "#1E3A8A", ponto: "#2563EB" });
    expect(BANCO_DIR_CORES.MIURA).toMatchObject({ fundo: "#EDE9FE", texto: "#4C1D95", ponto: "#7C3AED" });
    expect(BANCO_DIR_CORES.Pendente).toMatchObject({ fundo: "#F3F4F6", texto: "#374151", ponto: "#6B7280" });
    expect(BANCO_DIR_CORES["Não Cotado"]).toMatchObject({ fundo: "#FFFFFF", texto: "#4B5563", ponto: "#6B7280", tracejado: true });
    expect(BANCO_DIR_CORES.Cancelado).toMatchObject({ fundo: "#FFE4E6", texto: "#881337", ponto: "#E11D48" });
  });

  it("contraste texto/fundo >= 4,5:1 e ponto sobre branco >= 3:1 em TODAS as cores (inclusive a padrão)", () => {
    for (const [banco, cor] of [...Object.entries(BANCO_DIR_CORES), ["padrão", BANCO_DIR_COR_PADRAO] as const]) {
      expect(contraste(cor.texto, cor.fundo), `${banco}: texto/fundo`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(cor.ponto, "#FFFFFF"), `${banco}: ponto/branco`).toBeGreaterThanOrEqual(3);
    }
  });

  it("só 'Não Cotado' é tracejado", () => {
    expect(Object.entries(BANCO_DIR_CORES).filter(([, c]) => c.tracejado).map(([n]) => n)).toEqual(["Não Cotado"]);
  });

  it("banco vazio ou fora do mapa ('Outro' digitado) cai no cinza padrão", () => {
    expect(corDoBanco("")).toBe(BANCO_DIR_COR_PADRAO);
    expect(corDoBanco("Banco Novo Digitado")).toBe(BANCO_DIR_COR_PADRAO);
    expect(corDoBanco("XP")).toBe(BANCO_DIR_CORES.XP);
    expect(BANCO_DIR_SEM_BANCO).toBe("Sem banco");
  });
});

describe("formatarDataHoraBrasilia — 'incluído por X, dd/mm hh:mm' (roda com TZ=UTC, Sao_Paulo e Honolulu)", () => {
  it("converte o instante para Brasília", () => {
    expect(formatarDataHoraBrasilia("2026-10-20T17:32:00.000Z")).toBe("20/10 14:32");
    expect(formatarDataHoraBrasilia("2026-10-27T15:30:00+00:00")).toBe("27/10 12:30");
  });

  it("vira o dia anterior perto da meia-noite UTC (21h BRT)", () => {
    expect(formatarDataHoraBrasilia("2026-10-21T02:30:00.000Z")).toBe("20/10 23:30");
    expect(formatarDataHoraBrasilia("2026-10-21T03:00:00.000Z")).toBe("21/10 00:00");
  });

  it("meia-noite não vira 24:00", () => {
    expect(formatarDataHoraBrasilia("2026-11-01T03:05:00.000Z")).toBe("01/11 00:05");
  });

  it("vazio ou inválido devolve ''", () => {
    expect(formatarDataHoraBrasilia("")).toBe("");
    expect(formatarDataHoraBrasilia("não é data")).toBe("");
  });
});
