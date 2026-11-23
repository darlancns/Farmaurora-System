// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import ProcessoEntregaModal from "../../app/components/processos/ProcessoEntregaModal.vue";

// Modal "Confirme a data de entrega" (ProcessoEntregaModal): data inicial, atalhos Hoje/Ontem, bloqueio do "Confirmar entrega"
// (data vazia, futura, inexistente ou incompleta), Cancelar/Esc, foco e clique duplo. "Hoje" = 17/11/2026 (Brasília).

vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-17",
}));

interface Saida {
  confirm: string[];
  close: number;
}

let app: App | null = null;
let raiz: HTMLElement | null = null;
let saida: Saida;

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const campo = () => $<HTMLInputElement>("#entrega-data")!;
const confirmarBtn = () => $<HTMLButtonElement>("#btn-entrega-confirmar")!;

async function esperar(): Promise<void> {
  for (let i = 0; i < 4; i++) await nextTick();
}

function abrir(props: Record<string, unknown> = {}): void {
  saida = { confirm: [], close: 0 };
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(
    defineComponent({
      setup: () => () =>
        h(ProcessoEntregaModal, {
          paciente: "Maria da Silva",
          pasta: "2026 - 234",
          ...props,
          onConfirm: (d: string) => saida.confirm.push(d),
          onClose: () => saida.close++,
        }),
    }),
  );
  app.mount(raiz);
}

/** Digita no campo de data e sai dele (o ano e o erro são decididos ao sair). */
async function digitar(valor: string): Promise<void> {
  const el = campo();
  el.focus();
  el.dispatchEvent(new FocusEvent("focus"));
  el.value = valor;
  el.dispatchEvent(new Event("input"));
  el.dispatchEvent(new FocusEvent("blur"));
  await esperar();
}

function esc(alvo: EventTarget = document): void {
  alvo.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  app?.unmount();
  raiz?.remove();
  app = null;
  raiz = null;
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  vi.restoreAllMocks();
});

describe("conteúdo", () => {
  it("título, paciente e pasta; SEM texto acima do título e SEM dica abaixo do campo", async () => {
    abrir();
    await esperar();
    const dialogo = $("#entrega-modal")!;
    expect(dialogo.getAttribute("role")).toBe("dialog");
    expect(dialogo.getAttribute("aria-modal")).toBe("true");
    expect(dialogo.getAttribute("aria-labelledby")).toBe("entrega-titulo");
    expect(dialogo.getAttribute("aria-describedby")).toBe("entrega-descricao");
    expect(texto($("#entrega-titulo"))).toBe("Confirme a data de entrega");
    expect(texto($("#entrega-paciente"))).toBe("Maria da Silva");
    expect(texto($("#entrega-pasta"))).toBe("Pasta 2026 - 234");
    // o título é o primeiro filho do diálogo; o único <p> é o do paciente/pasta (nenhuma dica depois do campo)
    expect(dialogo.firstElementChild!.id).toBe("entrega-titulo");
    expect(dialogo.querySelectorAll("p")).toHaveLength(1);
    expect($("#entrega-descricao")!.compareDocumentPosition(campo()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sem pasta, a linha 'Pasta …' não existe", async () => {
    abrir({ pasta: "   " });
    await esperar();
    expect($("#entrega-pasta")).toBeNull();
    abrir({ pasta: "" });
  });

  it("camada própria (z-950: acima do formulário, abaixo do calendário em z-970)", async () => {
    abrir();
    await esperar();
    expect($<HTMLElement>("#entrega-modal-overlay")!.style.zIndex).toBe("950");
  });

  it("botões: Cancelar e Confirmar entrega, com alvos de 44px abaixo de lg", async () => {
    abrir();
    await esperar();
    expect(texto($("#btn-entrega-cancelar"))).toBe("Cancelar");
    expect(texto(confirmarBtn())).toBe("Confirmar entrega");
    for (const id of ["btn-entrega-cancelar", "btn-entrega-confirmar", "btn-entrega-hoje", "btn-entrega-ontem"]) {
      expect(($(`#${id}`)!.getAttribute("class") ?? "").split(/\s+/), id).toContain("min-h-11");
    }
    expect(($("#entrega-data")!.closest("[data-campo-digitavel]")!.className)).toContain("min-h-11");
  });
});

describe("data inicial e atalhos", () => {
  it("sem data gravada: vem com HOJE e Hoje marcado; confirmar leva a data de hoje", async () => {
    abrir();
    await esperar();
    expect(campo().value).toBe("17/11/2026");
    expect($("#btn-entrega-hoje")!.getAttribute("aria-pressed")).toBe("true");
    expect($("#btn-entrega-ontem")!.getAttribute("aria-pressed")).toBe("false");
    confirmarBtn().click();
    expect(saida.confirm).toEqual(["2026-11-17"]);
  });

  it("com data de entrega já gravada (voltando a Entregue): vem com ela, sem atalho marcado", async () => {
    abrir({ dataInicial: "2026-11-10" });
    await esperar();
    expect(campo().value).toBe("10/11/2026");
    expect($("#btn-entrega-hoje")!.getAttribute("aria-pressed")).toBe("false");
    expect($("#btn-entrega-ontem")!.getAttribute("aria-pressed")).toBe("false");
    confirmarBtn().click();
    expect(saida.confirm).toEqual(["2026-11-10"]);
  });

  it("data inicial futura ou inválida cai em hoje", async () => {
    abrir({ dataInicial: "2026-12-25" });
    await esperar();
    expect(campo().value).toBe("17/11/2026");
    app!.unmount();
    raiz!.remove();
    abrir({ dataInicial: "lixo" });
    await esperar();
    expect(campo().value).toBe("17/11/2026");
  });

  it("'Ontem' põe 16/11 no campo e marca o atalho; 'Hoje' volta", async () => {
    abrir();
    await esperar();
    $<HTMLButtonElement>("#btn-entrega-ontem")!.click();
    await esperar();
    expect(campo().value).toBe("16/11/2026");
    expect($("#btn-entrega-ontem")!.getAttribute("aria-pressed")).toBe("true");
    expect($("#btn-entrega-hoje")!.getAttribute("aria-pressed")).toBe("false");
    $<HTMLButtonElement>("#btn-entrega-hoje")!.click();
    await esperar();
    expect(campo().value).toBe("17/11/2026");
    expect($("#btn-entrega-hoje")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("os atalhos são type=button (não enviam o formulário) e Ontem leva a data de ontem ao confirmar", async () => {
    abrir();
    await esperar();
    expect($("#btn-entrega-hoje")!.getAttribute("type")).toBe("button");
    expect($("#btn-entrega-ontem")!.getAttribute("type")).toBe("button");
    $<HTMLButtonElement>("#btn-entrega-ontem")!.click();
    await esperar();
    expect(saida.confirm).toEqual([]); // só o Confirmar entrega confirma
    confirmarBtn().click();
    expect(saida.confirm).toEqual(["2026-11-16"]);
  });

  it("digitar só dia/mês completa o ano (o mais próximo de hoje) e habilita o confirmar", async () => {
    abrir();
    await esperar();
    await digitar("1511");
    expect(campo().value).toBe("15/11/2026");
    expect(confirmarBtn().disabled).toBe(false);
    confirmarBtn().click();
    expect(saida.confirm).toEqual(["2026-11-15"]);
  });
});

describe("bloqueio do 'Confirmar entrega'", () => {
  it("data inexistente (31/04): desabilitado e o clique não confirma", async () => {
    abrir();
    await esperar();
    await digitar("31/04");
    expect(texto($("#entrega-data-erro"))).toContain("Data inexistente");
    expect(confirmarBtn().disabled).toBe(true);
    confirmarBtn().click();
    $("#entrega-modal")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(saida.confirm).toEqual([]);
  });

  it("data incompleta (22/10/20): desabilitado", async () => {
    abrir();
    await esperar();
    await digitar("22/10/20");
    expect(confirmarBtn().disabled).toBe(true);
  });

  it("data futura (18/11/2026, acima do max = hoje): desabilitado", async () => {
    abrir();
    await esperar();
    await digitar("18/11/2026");
    expect(confirmarBtn().disabled).toBe(true);
    confirmarBtn().click();
    expect(saida.confirm).toEqual([]);
  });

  it("campo vazio: desabilitado; corrigir para uma data válida libera na hora", async () => {
    abrir();
    await esperar();
    await digitar("");
    expect(campo().value).toBe("");
    expect(confirmarBtn().disabled).toBe(true);
    await digitar("10/11/2026");
    expect(confirmarBtn().disabled).toBe(false);
    $<HTMLButtonElement>("#btn-entrega-ontem")!.click();
    await esperar();
    expect(confirmarBtn().disabled).toBe(false);
  });

  it("com texto inválido digitado, NENHUM atalho aparece marcado (o valor interno ainda é o anterior)", async () => {
    abrir();
    await esperar();
    expect($("#btn-entrega-hoje")!.getAttribute("aria-pressed")).toBe("true");
    await digitar("31/04");
    expect($("#btn-entrega-hoje")!.getAttribute("aria-pressed")).toBe("false");
    expect($("#btn-entrega-ontem")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("depois de uma data inválida, 'Ontem' substitui o texto e libera", async () => {
    abrir();
    await esperar();
    await digitar("31/04");
    expect(confirmarBtn().disabled).toBe(true);
    $<HTMLButtonElement>("#btn-entrega-ontem")!.click();
    await esperar();
    expect(campo().value).toBe("16/11/2026");
    expect(confirmarBtn().disabled).toBe(false);
  });
});

describe("Cancelar, Esc e clique fora", () => {
  it("Cancelar: fecha sem confirmar", async () => {
    abrir();
    await esperar();
    $<HTMLButtonElement>("#btn-entrega-cancelar")!.click();
    expect(saida.close).toBe(1);
    expect(saida.confirm).toEqual([]);
  });

  it("Esc (calendário fechado): fecha sem confirmar", async () => {
    abrir();
    await esperar();
    esc();
    expect(saida.close).toBe(1);
    expect(saida.confirm).toEqual([]);
  });

  it("clique no fundo escuro: fecha sem confirmar", async () => {
    abrir();
    await esperar();
    $("#entrega-modal-overlay")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(saida.close).toBe(1);
    expect(saida.confirm).toEqual([]);
  });

  it("Esc com o calendário aberto fecha SÓ o calendário; o 2º Esc fecha o modal", async () => {
    abrir();
    await esperar();
    $<HTMLButtonElement>("#entrega-data")!.closest("[data-campo-digitavel]")!.querySelector<HTMLButtonElement>("button[aria-haspopup]")!.click();
    await esperar();
    const painel = document.getElementById("entrega-data-calendario")!;
    expect(painel).not.toBeNull();

    esc(painel); // dentro do calendário: o calendário trata e não propaga
    await esperar();
    expect(document.getElementById("entrega-data-calendario")).toBeNull();
    expect(saida.close).toBe(0);

    esc();
    expect(saida.close).toBe(1);
  });

  it("Esc que chega ao documento com o calendário ainda aberto também NÃO fecha o modal", async () => {
    abrir();
    await esperar();
    $<HTMLButtonElement>("#entrega-data")!.closest("[data-campo-digitavel]")!.querySelector<HTMLButtonElement>("button[aria-haspopup]")!.click();
    await esperar();
    esc(); // direto no documento
    expect(saida.close).toBe(0);
  });

  it("Esc fecha SÓ o modal de cima quando há outro modal por baixo (BaseModal)", async () => {
    const baixo = vi.fn();
    const { default: BaseModal } = await import("../../app/components/BaseModal.vue");
    saida = { confirm: [], close: 0 };
    raiz = document.createElement("div");
    document.body.appendChild(raiz);
    app = createApp(
      defineComponent({
        setup: () => () =>
          h(BaseModal, { onClose: baixo }, () =>
            h(ProcessoEntregaModal, { paciente: "X", onConfirm: () => {}, onClose: () => saida.close++ }),
          ),
      }),
    );
    app.mount(raiz);
    await esperar();
    esc();
    expect(saida.close).toBe(1);
    expect(baixo).not.toHaveBeenCalled();
  });
});

describe("foco", () => {
  it("foco inicial no campo de data (não no Cancelar)", async () => {
    abrir();
    await esperar();
    expect(document.activeElement).toBe(campo());
    expect(document.activeElement).not.toBe($("#btn-entrega-cancelar"));
  });

  it("foco preso: Tab no último vai ao primeiro e Shift+Tab no primeiro vai ao último", async () => {
    abrir();
    await esperar();
    const confirmar = confirmarBtn();
    confirmar.focus();
    confirmar.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(campo());

    campo().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(confirmar);
  });

  it("ao fechar, devolve o foco a quem estava focado antes de abrir", async () => {
    const origem = document.createElement("button");
    origem.id = "origem";
    document.body.appendChild(origem);
    origem.focus();
    expect(document.activeElement).toBe(origem);

    abrir();
    await esperar();
    expect(document.activeElement).toBe(campo());
    app!.unmount();
    app = null;
    expect(document.activeElement).toBe(origem);
  });
});

describe("clique duplo", () => {
  it("dois cliques seguidos em 'Confirmar entrega' (e Enter + clique) emitem UMA vez só", async () => {
    abrir();
    await esperar();
    const b = confirmarBtn();
    b.click();
    b.click();
    $("#entrega-modal")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(saida.confirm).toEqual(["2026-11-17"]);
  });

  it("depois de cancelar, confirmar não emite mais", async () => {
    abrir();
    await esperar();
    $<HTMLButtonElement>("#btn-entrega-cancelar")!.click();
    confirmarBtn().click();
    expect(saida.close).toBe(1);
    expect(saida.confirm).toEqual([]);
  });
});
