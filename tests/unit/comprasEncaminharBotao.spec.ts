// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import type { Compra } from "../../shared/types/compra";
import CompraColunaDireita from "../../app/components/compras/CompraColunaDireita.vue";
import type { EstadoPainelEncaminhar } from "../../app/composables/useEncaminharCompra";
import { RAZAO_COMPRA_CANCELADA, RAZAO_SEM_ORDENS, RAZAO_SEM_PERMISSAO_COMPRAS, RAZAO_SEM_PERMISSAO_DIR, RAZAO_TODAS_ENCAMINHADAS, razaoEncaminharDesabilitado } from "../../app/utils/comprasEncaminhar";
import { compraTeste, ordemTeste, previaTeste } from "./helpers/encaminharFixtures";

// O botão "Encaminhar para a DIR" e a barra do celular: a razão de cada desabilitado (função pura e coluna real) e o painel aberto no celular.
// Dados fictícios (TESTE).

const montados: Array<() => void> = [];
afterEach(() => {
  while (montados.length) montados.pop()!();
  document.body.innerHTML = "";
});

const texto = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string): T | null => document.querySelector<T>(sel);

const JA = { dirId: "dir_x", encaminhadaEm: "2026-12-01T10:00:00.000Z" };

describe("razaoEncaminharDesabilitado (a função pura)", () => {
  const ok = { compras: true, dir: true };

  it("pode abrir: compra aberta, não cancelada, com pelo menos uma ordem sem dir_id", () => {
    expect(razaoEncaminharDesabilitado(compraTeste(), ok)).toBeNull();
    expect(razaoEncaminharDesabilitado(compraTeste({ ordens: [ordemTeste(1, JA), ordemTeste(2)] }), ok)).toBeNull();
  });

  it("cada razão, com o texto pedido", () => {
    expect(razaoEncaminharDesabilitado(compraTeste(), { compras: true, dir: false })).toBe("Sem permissão para escrever na DIR");
    expect(razaoEncaminharDesabilitado(compraTeste(), { compras: false, dir: true })).toBe("Sem permissão para editar Compras");
    expect(razaoEncaminharDesabilitado(compraTeste({ cancelada: true }), ok)).toBe("Compra cancelada");
    expect(razaoEncaminharDesabilitado(compraTeste({ ordens: [ordemTeste(1, JA), ordemTeste(2, JA)] }), ok)).toBe("Todas as ordens já foram encaminhadas");
    expect(razaoEncaminharDesabilitado(compraTeste({ ordens: [] }), ok)).toBe(RAZAO_SEM_ORDENS);
    expect([RAZAO_SEM_PERMISSAO_DIR, RAZAO_SEM_PERMISSAO_COMPRAS, RAZAO_COMPRA_CANCELADA, RAZAO_TODAS_ENCAMINHADAS]).toHaveLength(4);
  });

  it("a permissão vem ANTES das outras razões (quem não pode não precisa saber o resto)", () => {
    const cancelada = compraTeste({ cancelada: true, ordens: [ordemTeste(1, JA)] });
    expect(razaoEncaminharDesabilitado(cancelada, { compras: true, dir: false })).toBe(RAZAO_SEM_PERMISSAO_DIR);
    expect(razaoEncaminharDesabilitado(cancelada, { compras: false, dir: false })).toBe(RAZAO_SEM_PERMISSAO_COMPRAS);
  });

  it("compras = editar com dir = VER (dir: false) NÃO encaminha, qualquer que seja a compra", () => {
    for (const c of [compraTeste(), compraTeste({ ordens: [ordemTeste(1)] })]) expect(razaoEncaminharDesabilitado(c, { compras: true, dir: false })).not.toBeNull();
  });

  it("ordem com dir_id só de espaços não conta como encaminhada", () => {
    expect(razaoEncaminharDesabilitado(compraTeste({ ordens: [ordemTeste(1, { dirId: "  " })] }), ok)).toBeNull();
  });
});

function montarColuna(props: Record<string, unknown>): { eventos: string[] } {
  const eventos: string[] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(CompraColunaDireita, {
          despachanteCadastro: null,
          onEncaminhar: () => eventos.push("encaminhar"),
          onVoltarAoResumo: () => eventos.push("voltar"),
          onEnviarEncaminhar: () => eventos.push("enviar"),
          ...props,
        }),
    }),
  );
  app.component("NuxtLink", defineComponent({ props: { to: { type: String, default: "" } }, setup: (p, { slots }) => () => h("a", { href: p.to }, slots.default?.()) }));
  app.mount(el);
  montados.push(() => app.unmount());
  return { eventos };
}

function painel(compra: Compra, extra: Partial<EstadoPainelEncaminhar> = {}): EstadoPainelEncaminhar {
  return { aberto: true, previa: previaTeste(compra), carregando: false, atualizando: false, erroPrevia: null, confirmadas: [], enviando: false, resultado: null, erroEnvio: null, linhasPendentes: 2, podeEnviar: true, motivoBloqueio: null, ...extra };
}

describe("o botão na coluna direita", () => {
  it("habilitado (as duas permissões, compra com ordens pendentes): clicar emite 'encaminhar'; o texto de apoio explica o que faz", () => {
    const { eventos } = montarColuna({ compra: compraTeste(), podeEscreverCompras: true, podeEscreverDir: true });
    const b = q<HTMLButtonElement>("#btn-encaminhar-dir")!;
    expect(b.disabled).toBe(false);
    expect(b.getAttribute("aria-describedby")).toBe("encaminhar-dir-aviso");
    expect(texto(q("#encaminhar-dir-aviso"))).toBe("Cria uma linha na DIR para cada ordem.");
    b.click();
    expect(eventos).toEqual(["encaminhar"]);
  });

  it.each([
    ["sem escrever na DIR", { podeEscreverCompras: true, podeEscreverDir: false }, compraTeste(), "Sem permissão para escrever na DIR"],
    ["sem escrever em Compras (sócio)", { podeEscreverCompras: false, podeEscreverDir: true }, compraTeste(), "Sem permissão para editar Compras"],
    ["compra cancelada", { podeEscreverCompras: true, podeEscreverDir: true }, compraTeste({ cancelada: true }), "Compra cancelada"],
    ["todas encaminhadas", { podeEscreverCompras: true, podeEscreverDir: true }, compraTeste({ ordens: [ordemTeste(1, JA)] }), "Todas as ordens já foram encaminhadas"],
  ])("desabilitado %s: a razão fica em texto ao lado e o clique não emite nada", (_nome, permissoes, compra, razao) => {
    const { eventos } = montarColuna({ compra, ...permissoes });
    const b = q<HTMLButtonElement>("#btn-encaminhar-dir")!;
    expect(b.disabled).toBe(true);
    expect(texto(q("#encaminhar-dir-aviso"))).toBe(razao);
    expect(b.getAttribute("aria-describedby")).toBe("encaminhar-dir-aviso");
    b.click();
    expect(eventos).toEqual([]);
  });

  it("'Copiar resumo' continua habilitado para quem só lê", () => {
    montarColuna({ compra: compraTeste(), podeEscreverCompras: false, podeEscreverDir: false });
    expect(q<HTMLButtonElement>("#btn-copiar-resumo")!.disabled).toBe(false);
  });
});

describe("poJaNaDir no checklist normal", () => {
  it("os POs que a prévia diz que já existem entram como erro 'PO… já existe na DIR' (clicável, para o PO da ordem)", () => {
    montarColuna({ compra: compraTeste(), poJaNaDir: ["PO26-12-9998"], podeEscreverCompras: true, podeEscreverDir: true });
    const item = q('[data-item="ordem-1-po-na-dir"]')!;
    expect(texto(item)).toContain("PO PO26-12-9998 já existe na DIR");
    expect(item.querySelector("button")!.getAttribute("data-ir-campo")).toBe("ordem-1-po");
  });

  it("sem conflito: o checklist fica como era (nenhum item 'po-na-dir' de erro)", () => {
    montarColuna({ compra: compraTeste(), poJaNaDir: [], podeEscreverCompras: true, podeEscreverDir: true });
    expect(q("#compra-checklist-erros")).toBeNull();
  });
});

describe("com o painel aberto", () => {
  it("a coluna mostra o painel no lugar do checklist e do resumo, e some a barra de Copiar/Encaminhar", () => {
    const compra = compraTeste();
    montarColuna({ compra, encaminhar: painel(compra), podeEscreverCompras: true, podeEscreverDir: true });
    expect(q("#compra-encaminhar")).not.toBeNull();
    expect(q("#compra-resumo")).toBeNull();
    expect(q("#compra-barra-acoes")).toBeNull();
    expect(q("#btn-encaminhar-dir")).toBeNull();
  });

  it("celular: a barra fixa do pé tem 'Voltar' e 'Encaminhar N linhas', acima da barra de navegação e com o safe-area; só abaixo de lg", () => {
    const compra = compraTeste();
    const { eventos } = montarColuna({ compra, encaminhar: painel(compra), podeEscreverCompras: true, podeEscreverDir: true });
    const barra = q<HTMLElement>("#compra-barra-encaminhar")!;
    for (const c of ["max-lg:fixed", "max-lg:inset-x-0", "max-lg:bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))]", "max-lg:z-30", "lg:hidden"]) expect(barra.className, c).toContain(c);
    expect(texto(q("#btn-encaminhar-voltar-celular"))).toBe("Voltar");
    const enviar = q<HTMLButtonElement>("#btn-encaminhar-confirmar-celular")!;
    expect(texto(enviar)).toBe("Encaminhar 2 linhas");
    expect(enviar.disabled).toBe(false);
    expect(enviar.getAttribute("aria-describedby")).toBe("encaminhar-apoio");
    expect(enviar.className).toContain("max-lg:min-h-11");
    q<HTMLButtonElement>("#btn-encaminhar-voltar-celular")!.click();
    enviar.click();
    expect(eventos).toEqual(["voltar", "enviar"]);
  });

  it("celular: o botão do pé acompanha podeEnviar, o singular e o 'Encaminhando…'", () => {
    const compra = compraTeste({ ordens: [ordemTeste(1)] });
    montarColuna({ compra, encaminhar: painel(compra, { linhasPendentes: 1, podeEnviar: false, motivoBloqueio: "Carregando a conferência…" }), podeEscreverCompras: true, podeEscreverDir: true });
    expect(q<HTMLButtonElement>("#btn-encaminhar-confirmar-celular")!.disabled).toBe(true);
    expect(texto(q("#btn-encaminhar-confirmar-celular"))).toBe("Encaminhar 1 linha");
    document.body.innerHTML = "";
    montarColuna({ compra, encaminhar: painel(compra, { linhasPendentes: 1, podeEnviar: false, enviando: true }), podeEscreverCompras: true, podeEscreverDir: true });
    expect(texto(q("#btn-encaminhar-confirmar-celular"))).toBe("Encaminhando…");
  });

  it("celular, com o resultado na tela: só 'Voltar' na barra (já não há o que encaminhar)", () => {
    const compra = compraTeste();
    montarColuna({ compra, encaminhar: painel(compra, { resultado: { tipo: "ja-encaminhada" } }), podeEscreverCompras: true, podeEscreverDir: true });
    expect(q("#btn-encaminhar-voltar-celular")).not.toBeNull();
    expect(q("#btn-encaminhar-confirmar-celular")).toBeNull();
  });

  it("a coluna continua reservando espaço no fim para a barra fixa (só abaixo de lg)", () => {
    const compra = compraTeste();
    montarColuna({ compra, encaminhar: painel(compra), podeEscreverCompras: true, podeEscreverDir: true });
    expect(q("#compra-coluna-direita")!.className).toContain("max-lg:pb-28");
  });
});
