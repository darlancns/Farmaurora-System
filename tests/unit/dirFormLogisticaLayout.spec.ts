// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import { INPUT_MONO_CLASS, MODAL_PAD_X_CLASS } from "../../app/utils/processoFormClasses";
import { novoDir } from "./helpers/dirFixtures";

// Bloco de Logística do formulário da DIR: "Cia aérea" e "AWB" lado a lado (meia largura cada) a partir de sm; abaixo de
// sm, um embaixo do outro em largura total. Nada mais do layout muda: a ordem (Cia antes do AWB) e a Origem ficam.
// A conta da sobra prova que o AWB cabe em meia largura em sm, md e lg sem cortar.
vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

const lerFonte = (caminho: string): string => readFileSync(resolve(process.cwd(), caminho), "utf-8");

// ── Estrutura (DOM do formulário montado) ──────────────────────────────────────────────────────────

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montar(): void {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({ render: () => h(DirFormModal, { editingDir: novoDir(), contagemPorPo: new Map<string, number>() }) }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
}

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
});

describe("Logística: estrutura", () => {
  const grade = () => document.querySelector("#dir-secao-logistica .grid") as HTMLElement;
  const bloco = (id: string) => [...grade().children].find((c) => c.contains(document.getElementById(id)))! as HTMLElement;
  const classes = (el: Element) => [...el.classList].filter((c) => c.startsWith("col-span") || c.startsWith("sm:col-span"));

  it("a grade segue com 2 colunas e o mesmo espaçamento", () => {
    montar();
    expect(grade().className).toBe("grid grid-cols-2 gap-2.5");
  });

  it("Cia aérea e AWB: largura total abaixo de sm e meia largura (1 coluna de 2) a partir de sm", () => {
    montar();
    expect(classes(bloco("df-companhia-aerea"))).toEqual(["col-span-2", "sm:col-span-1"]);
    expect(classes(bloco("df-awb"))).toEqual(["col-span-2", "sm:col-span-1"]);
  });

  it("a ordem não mudou: Cia aérea logo antes do AWB, os dois depois dos 4 campos de lista", () => {
    montar();
    const ids = [...grade().children].map((c) => c.querySelector("[id]")?.id);
    expect(ids).toEqual(["df-fornecedor", "df-origem", "df-envio", "df-despachante", "df-companhia-aerea", "df-awb"]);
  });

  it("a Origem e os 4 campos de lista continuam como estavam (meia largura a partir de sm, como sempre)", () => {
    montar();
    for (const id of ["df-fornecedor", "df-origem", "df-envio", "df-despachante"]) {
      expect(classes(bloco(id)), id).toEqual(["col-span-2", "sm:col-span-1"]);
    }
  });

  it("o campo do AWB não ganhou largura própria nem padding novo (só as classes de sempre)", () => {
    montar();
    const awb = document.getElementById("df-awb")!;
    expect(awb.className).toBe(INPUT_MONO_CLASS);
    expect(awb.hasAttribute("data-sem-maiuscula")).toBe(true);
    expect(awb.getAttribute("placeholder")).toBe("020-00000000");
  });

  it("a fonte é o único código do layout: nenhuma outra classe de largura no bloco da cia e do AWB", () => {
    const fonte = lerFonte("app/components/dir/DirFormModal.vue");
    const trecho = fonte.slice(fonte.indexOf('for="df-companhia-aerea"') - 200, fonte.indexOf("</fieldset>", fonte.indexOf('id="df-awb"')));
    expect(trecho).not.toMatch(/\b(?:w-\d|w-\[|max-w|min-w|basis|flex-)/);
  });
});

// ── Conta da sobra: o AWB cabe em meia largura em sm, md e lg ──────────────────────────────────────

// Geometria do formulário (as classes de DirFormModal.vue):
//  - abaixo de lg o modal é tela cheia (largura = viewport, sem borda); em lg+ é max-w-[720px] com borda de 1px e o form
//    leva lg:p-5 (20px de cada lado); a div interna é `lg:contents` (o padding horizontal dela só vale abaixo de lg);
//  - abaixo de lg o padding horizontal é MODAL_PAD_X_CLASS: px-4 (16px) e, a partir de sm, max(1rem, (100% − 720px)/2 + 1.25rem);
//  - a seção (fieldset) tem borda de 1px e p-3 (12px) de cada lado; a grade tem gap-2.5 (10px) e 2 colunas.
const BORDA = 1;
const PADDING_SECAO = 12;
const GAP = 10;
const MODAL_LG = 720;

function larguraMeiaColuna(viewport: number): number {
  let util: number;
  if (viewport >= 1024) {
    util = Math.min(viewport, MODAL_LG) - 2 * BORDA - 2 * 20;
  } else {
    const pad = viewport >= 640 ? Math.max(16, (viewport - 720) / 2 + 20) : 16;
    util = viewport - 2 * pad;
  }
  const grade = util - 2 * (BORDA + PADDING_SECAO);
  return (grade - GAP) / 2;
}

// Campo: padding horizontal px-2.5 (10px) + borda de 1px de cada lado; JetBrains Mono tem 0.6em por caractere.
const MOLDURA_CAMPO = 2 * 10 + 2 * BORDA;
const fonte = (viewport: number) => (viewport >= 1024 ? 13.5 : 16); // text-[16px] lg:text-[13.5px]
const larguraTexto = (texto: string, viewport: number) => texto.length * 0.6 * fonte(viewport) + MOLDURA_CAMPO;

const PLACEHOLDER = "020-00000000"; // 12 caracteres
const AWB_FEDEX = "8789 1818 0440"; // 14 caracteres (espaços incluídos)
const AWB_ANTIGO = "Lufthansa: 020-01045494"; // 23 caracteres: o texto bruto que as linhas antigas ainda têm

describe("a conta da meia largura (sm, md, lg)", () => {
  it("as classes usadas na conta são as do código", () => {
    expect(INPUT_MONO_CLASS).toContain("px-2.5");
    expect(INPUT_MONO_CLASS).toContain("border");
    expect(INPUT_MONO_CLASS).toContain("font-mono");
    expect(INPUT_MONO_CLASS).toContain("text-[16px] lg:text-[13.5px]");
    expect(MODAL_PAD_X_CLASS).toBe("px-4 sm:px-[max(1rem,calc((100%-720px)/2+1.25rem))]");
    const modal = lerFonte("app/components/dir/DirFormModal.vue");
    expect(modal).toContain("lg:max-w-[720px]");
    expect(modal).toContain("lg:p-5");
    expect(modal).toContain('class="min-w-0 rounded-md border border-hairline p-3"');
  });

  it.each([
    [640, "sm (o menor com meia largura)", 286],
    [768, "md", 322],
    [1023, "último pixel abaixo de lg", 322],
    [1024, "lg", 321],
    [1280, "lg largo (o modal para em 720)", 321],
    [1920, "lg máximo", 321],
  ])("meia coluna a %ipx (%s) = %ipx", (viewport, _rotulo, esperado) => {
    expect(larguraMeiaColuna(viewport)).toBe(esperado);
  });

  it("o campo mais estreito é o de sm (640px): 286px", () => {
    const larguras = [640, 700, 768, 900, 1023, 1024, 1280, 1920].map(larguraMeiaColuna);
    expect(Math.min(...larguras)).toBe(286);
  });

  it.each([
    [PLACEHOLDER, 12],
    [AWB_FEDEX, 14],
    [AWB_ANTIGO, 23],
  ])("%j (%i caracteres) cabe em meia largura em sm, md e lg, com sobra", (texto, tamanho) => {
    expect(texto).toHaveLength(tamanho);
    for (const viewport of [640, 768, 1023, 1024, 1280]) {
      const sobra = larguraMeiaColuna(viewport) - larguraTexto(texto, viewport);
      expect(sobra, `${texto} a ${viewport}px`).toBeGreaterThan(40);
    }
  });

  it("a sobra de cada caso (a conta toda)", () => {
    // sm 640 (16px: 9,6px por caractere): campo 286px
    expect(larguraTexto(PLACEHOLDER, 640)).toBeCloseTo(12 * 9.6 + 22, 5); // 137,2 → sobra 148,8
    expect(larguraMeiaColuna(640) - larguraTexto(PLACEHOLDER, 640)).toBeCloseTo(148.8, 5);
    expect(larguraTexto(AWB_FEDEX, 640)).toBeCloseTo(14 * 9.6 + 22, 5); // 156,4 → sobra 129,6
    expect(larguraMeiaColuna(640) - larguraTexto(AWB_FEDEX, 640)).toBeCloseTo(129.6, 5);
    expect(larguraMeiaColuna(640) - larguraTexto(AWB_ANTIGO, 640)).toBeCloseTo(286 - (23 * 9.6 + 22), 5); // 43,2
    // md 768 (16px): campo 322px
    expect(larguraMeiaColuna(768) - larguraTexto(AWB_FEDEX, 768)).toBeCloseTo(165.6, 5);
    // lg 1280 (13,5px: 8,1px por caractere): campo 321px
    expect(larguraTexto(AWB_FEDEX, 1280)).toBeCloseTo(14 * 8.1 + 22, 5); // 135,4 → sobra 185,6
    expect(larguraMeiaColuna(1280) - larguraTexto(AWB_FEDEX, 1280)).toBeCloseTo(185.6, 5);
    expect(larguraMeiaColuna(1280) - larguraTexto(PLACEHOLDER, 1280)).toBeCloseTo(321 - (12 * 8.1 + 22), 5); // 201,8
  });

  it("abaixo de sm (360px) os dois ficam em largura total: nem precisa de conta (302px > meia largura de sm)", () => {
    const util = 360 - 2 * 16 - 2 * (BORDA + PADDING_SECAO); // 302
    expect(util).toBe(302);
    expect(larguraTexto(AWB_ANTIGO, 360)).toBeLessThan(util);
    expect(larguraTexto(AWB_FEDEX, 360)).toBeLessThan(larguraMeiaColuna(640));
  });
});
