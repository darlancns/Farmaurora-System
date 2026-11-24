// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import CompraFormCabecalho from "../../app/components/compras/CompraFormCabecalho.vue";

// O cabeçalho da compra COMPACTO: o título e as três ações (rótulos curtos, ícone antes do texto) na MESMA linha quando a coluna comporta; só ícone quando
// a coluna é mais estreita; e as ações numa linha própria, à direita, quando nem isso cabe (e no celular). O navegador de verdade é que mede as colunas
// (container queries); aqui se confere a estrutura e as classes que as aplicam. Dados fictícios (TESTE).

const montados: Array<() => void> = [];
afterEach(() => {
  while (montados.length) montados.pop()!();
  document.body.innerHTML = "";
});

function cabecalho(extra: Record<string, unknown> = {}): void {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () => h(CompraFormCabecalho, { anoMes: "2026-11", sequencia: 8, cancelada: false, podeEditar: true, estado: "salvo", ...extra }),
    }),
  );
  app.mount(el);
  montados.push(() => {
    app.unmount();
    el.remove();
  });
}

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const classes = (el: Element | null): string[] => (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

describe("os três botões com rótulo curto", () => {
  it("'Duplicar', 'Cancelar' e 'Apagar' (e só isso de texto visível), nesta ordem", () => {
    cabecalho();
    const botoes = qa<HTMLButtonElement>("#compra-acoes > button");
    expect(botoes.map((b) => b.id)).toEqual(["btn-duplicar-compra", "btn-cancelar-compra", "btn-apagar-compra"]);
    expect(botoes.map((b) => texto(b))).toEqual(["Duplicar", "Cancelar", "Apagar"]);
    expect(botoes.map((b) => texto(b.querySelector("[data-rotulo]")))).toEqual(["Duplicar", "Cancelar", "Apagar"]);
    for (const longo of ["Duplicar compra", "Cancelar compra", "Apagar compra"]) expect(texto(q("#compra-cabecalho")), longo).not.toContain(longo);
  });

  it("o ÍCONE vem ANTES do texto, dentro do botão", () => {
    cabecalho();
    for (const b of qa<HTMLButtonElement>("#compra-acoes > button")) {
      const filhos = [...b.children];
      expect(filhos[0]!.tagName.toLowerCase(), b.id).toBe("svg");
      expect(filhos[1]!.hasAttribute("data-rotulo"), b.id).toBe(true);
      expect(b.firstChild, b.id).toBe(filhos[0]);
      expect(filhos[0]!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("o NOME COMPLETO fica em aria-label e em title (tooltip)", () => {
    cabecalho();
    const nomes = { "btn-duplicar-compra": "Duplicar compra", "btn-cancelar-compra": "Cancelar compra", "btn-apagar-compra": "Apagar compra" };
    for (const [id, nome] of Object.entries(nomes)) {
      expect(q(`#${id}`)!.getAttribute("aria-label"), id).toBe(nome);
      expect(q(`#${id}`)!.getAttribute("title"), id).toBe(nome);
    }
  });

  it("o título completo também vai em title (para o caso de a coluna ser muito estreita)", () => {
    cabecalho({ anoMes: "2026-11", sequencia: 8 });
    expect(texto(q("#compra-titulo"))).toBe("Compra 08 - Novembro/2026");
    expect(q("#compra-titulo")!.getAttribute("title")).toBe("Compra 08 - Novembro/2026");
  });
});

describe("título e botões na MESMA linha", () => {
  it("estão no mesmo contêiner (o header), e esse contêiner vira LINHA (flex-row) quando a coluna tem 28rem ou mais, com o título à esquerda e as ações à direita, centralizados na vertical", () => {
    cabecalho();
    const header = q("#compra-cabecalho")!;
    const titulo = q("#compra-titulo")!;
    const acoes = q("#compra-acoes")!;
    expect(header.contains(titulo)).toBe(true);
    expect(header.contains(acoes)).toBe(true);
    expect(acoes.parentElement).toBe(header); // irmão do bloco do título: um contêiner de linha com dois filhos
    expect(header.firstElementChild!.contains(titulo)).toBe(true); // título primeiro (à esquerda)
    expect(header.lastElementChild).toBe(acoes); // ações por último (à direita)
    const c = classes(header);
    for (const token of ["lg:@min-[28rem]:flex-row", "lg:@min-[28rem]:items-center", "lg:@min-[28rem]:justify-between", "lg:@min-[28rem]:gap-3"]) expect(c, token).toContain(token);
  });

  it("o título não é cortado: sem truncate, em uma linha só (nowrap) — e só na coluna MUITO estreita (< 20rem) ele encolhe para 16px e pode ocupar duas linhas", () => {
    cabecalho();
    const c = classes(q("#compra-titulo"));
    expect(c).toContain("whitespace-nowrap");
    expect(c).not.toContain("truncate");
    expect(c).toContain("@max-[20rem]:whitespace-normal");
    expect(c).toContain("@max-[20rem]:text-[16px]");
  });

  it("quem decide é a LARGURA DA COLUNA (container query), não a da janela: o bloco do cabeçalho é um @container", () => {
    cabecalho();
    expect(classes(q("#compra-cabecalho-bloco"))).toContain("@container");
  });

  it("as ações ficam alinhadas à direita e quebram de linha em vez de sair da coluna; só na linha do título elas não encolhem", () => {
    cabecalho();
    const c = classes(q("#compra-acoes"));
    for (const token of ["flex", "flex-wrap", "items-center", "justify-end", "lg:@min-[28rem]:shrink-0", "lg:@min-[28rem]:flex-nowrap"]) expect(c, token).toContain(token);
  });
});

describe("as faixas de largura (container queries)", () => {
  it("só ícone: abaixo de 20rem (320px) de coluna, e em lg+ entre 28rem e 40rem (448 a 640px): o texto some (sr-only, continua no aria-label) e o botão vira um quadrado", () => {
    cabecalho();
    for (const b of qa<HTMLButtonElement>("#compra-acoes > button")) {
      const rotulo = classes(b.querySelector("[data-rotulo]"));
      expect(rotulo, b.id).toContain("@max-[20rem]:sr-only");
      expect(rotulo, b.id).toContain("lg:@min-[28rem]:@max-[40rem]:sr-only");
      const c = classes(b);
      for (const token of [
        "max-lg:@max-[20rem]:w-11",
        "lg:@max-[20rem]:w-9",
        "@max-[20rem]:justify-center",
        "@max-[20rem]:px-0",
        "lg:@min-[28rem]:@max-[40rem]:w-9",
        "lg:@min-[28rem]:@max-[40rem]:justify-center",
        "lg:@min-[28rem]:@max-[40rem]:px-0",
      ]) {
        expect(c, `${b.id}: ${token}`).toContain(token);
      }
    }
  });

  it("com texto (coluna de 40rem ou mais, e a faixa de 20rem a 28rem na linha própria): o botão é o compacto do Follow-Up (px-3, gap-1.5, 12,5px, 44px no celular e 36px em lg+)", () => {
    cabecalho();
    for (const b of qa<HTMLButtonElement>("#compra-acoes > button")) {
      const c = classes(b);
      for (const token of ["inline-flex", "items-center", "gap-1.5", "px-3", "text-[12.5px]", "font-semibold", "whitespace-nowrap", "min-h-11", "lg:min-h-9"]) expect(c, `${b.id}: ${token}`).toContain(token);
    }
  });

  it("o texto de um botão nunca parte ao meio (nowrap), em nenhuma faixa", () => {
    cabecalho();
    expect(qa<HTMLButtonElement>("#compra-acoes > button").every((b) => classes(b).includes("whitespace-nowrap"))).toBe(true);
  });
});

describe("outros casos do cabeçalho", () => {
  it("o selo 'Cancelada' fica junto do título; a compra cancelada só tem o Apagar, na mesma linha", () => {
    cabecalho({ cancelada: true });
    expect(q("#compra-cabecalho-titulo")!.contains(q("[data-selo-cancelada]"))).toBe(true);
    expect(qa("#compra-acoes > button").map((b) => b.id)).toEqual(["btn-apagar-compra"]);
  });

  it("o bloco do título quebra de linha em vez de cortar (selo e '‹ Compras' descem se não couberem)", () => {
    cabecalho({ cancelada: true });
    expect(classes(q("#compra-cabecalho-titulo"))).toContain("flex-wrap");
  });

  it("sócio (só lê) não tem ação nenhuma, e o título continua lá", () => {
    cabecalho({ podeEditar: false });
    expect(q("#compra-acoes")).toBeNull();
    expect(texto(q("#compra-titulo"))).toBe("Compra 08 - Novembro/2026");
  });
});
