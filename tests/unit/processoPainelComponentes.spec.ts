// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, reactive } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoPainel from "../../app/components/processos/ProcessoPainel.vue";
import {
  BLOCOS_PAINEL,
  camposDatas,
  haModalAberto,
  linhaTransportadora,
  linhasMedicamentos,
  mostraDespachanteTransportadora,
} from "../../app/utils/processoPainel";
import { contarProcessosPorPasta } from "../../app/utils/remessaNaLinha";

// Etapa C do Kanban: painel lateral direito (ProcessoPainel). Componente real no happy-dom.

function proc(extra: Partial<Processo> = {}): Processo {
  return {
    id: "p1",
    paciente: "Maria Aparecida",
    numeroRemessa: 1,
    pasta: "2026 - 366",
    numeroPo: "PO-26-0471",
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavelOperacional: "Rebeca",
    fornecedor: "Poros - Turquia",
    modalEnvio: "Air Cargo",
    companhiaAerea: "Lufthansa",
    numeroAwb: "957-12345678",
    despachante: "Marcelo Lima",
    transportadoraNacional: { nome: "AJC", cotacao: "COT-9", valor: 1500 },
    localEntrega: "Clínica X",
    numeroProcesso: "25BR0001",
    medicamentos: [
      { nome: "PEMBROLIZUMABE", quantidade: "4 cx" },
      { nome: "NIVOLUMABE", dosagem: "40MG" },
    ],
    status: "em_transito",
    datas: { dataCompraPO: "05/08", previsaoEntrega: "28/08", registroLpco: "09/10 - agd. análise" },
    pendencias: ["Enviar laudo", "Ligar para a clínica"],
    atualizacoes: [{ data: "31/08", texto: "Carga embarcada." }],
    createdAt: "",
    updatedAt: "v1",
    ...extra,
  };
}

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
function montar(componente: ReturnType<typeof defineComponent>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(componente);
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function painel(p: Processo, handlers: Record<string, (...a: unknown[]) => void> = {}, todos: Processo[] = [p]) {
  return montar(
    defineComponent({
      setup: () => () =>
        h(ProcessoPainel, {
          processo: p,
          contagemPasta: contarProcessosPorPasta(todos),
          onClose: handlers.close,
          onEdit: handlers.edit,
          onDelete: handlers.delete,
        }),
    }),
  );
}

describe("ordem e conteúdo dos blocos", () => {
  it("blocos na ordem pedida, cada um um bloco próprio", () => {
    painel(proc());
    const ids = [...document.querySelectorAll("[id^='painel-bloco-']")].map((n) => n.id.replace("painel-bloco-", ""));
    expect(ids).toEqual([...BLOCOS_PAINEL]);
    expect(BLOCOS_PAINEL).toEqual([
      "cabecalho",
      "pasta",
      "medicamentos",
      "fornecedor",
      "envio",
      "transportadora",
      "numero-processo",
      "datas",
      "pendencias",
      "atualizacoes",
      "rodape",
    ]);
  });

  it("cabeçalho: nome (font-display 16px), editar e fechar; dialog rotulado pelo nome", () => {
    painel(proc());
    const titulo = document.querySelector("#painel-titulo")!;
    expect(texto(titulo)).toBe("Maria Aparecida");
    expect(titulo.className).toContain("font-display");
    expect(titulo.className).toContain("text-[16px]");
    const dialog = document.querySelector("[data-testid='processo-painel']")!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe("painel-titulo");
    expect(document.querySelector("#btn-painel-editar")!.getAttribute("aria-label")).toBe("Editar processo");
    expect(document.querySelector("#btn-painel-fechar")).not.toBeNull();
  });

  it("valores principais", () => {
    painel(proc());
    expect(texto(document.querySelector("#painel-pasta-po"))).toBe("Pasta 2026 - 366 · PO-26-0471");
    expect(texto(document.querySelector("#painel-fornecedor"))).toBe("Poros - Turquia");
    expect(texto(document.querySelector("#painel-envio"))).toBe("Air Cargo");
    expect(texto(document.querySelector("#painel-awb"))).toBe("957-12345678");
    expect(document.querySelector("#painel-awb")!.className).toContain("font-mono");
    expect(texto(document.querySelector("#painel-transportadora"))).toBe("AJC · COT-9 · R$ 1.500,00");
    expect(texto(document.querySelector("#painel-numero-processo"))).toBe("25BR0001");
    expect(texto(document.querySelector("#painel-registro-lpco"))).toBe("09/10 - agd. análise"); // texto antigo como está
    expect(texto(document.querySelector("#painel-bloco-pendencias"))).toContain("Pendências (2)");
    expect(texto(document.querySelector("#painel-pendencias"))).toContain("Enviar laudo");
    expect(texto(document.querySelector("#painel-bloco-atualizacoes"))).toContain("Carga embarcada.");
  });

  it("sem PO: só a Pasta", () => {
    painel(proc({ numeroPo: undefined }));
    expect(texto(document.querySelector("#painel-pasta-po"))).toBe("Pasta 2026 - 366");
  });
});

describe("Ordem N (como na Lista)", () => {
  it("N = 1 e pasta única: sem 'Ordem'; só o Responsável", () => {
    painel(proc());
    expect(texto(document.querySelector("#painel-ordem-responsavel"))).toBe("Responsável Rebeca");
  });

  it("N > 1: 'Ordem N · Responsável'", () => {
    painel(proc({ numeroRemessa: 2 }));
    expect(texto(document.querySelector("#painel-ordem-responsavel"))).toBe("Ordem 2 · Responsável Rebeca");
  });

  it("pasta repetida (mesmo com N = 1): mostra 'Ordem 1'", () => {
    const p = proc();
    painel(p, {}, [p, proc({ id: "p2", numeroRemessa: 2 })]);
    expect(texto(document.querySelector("#painel-ordem-responsavel"))).toBe("Ordem 1 · Responsável Rebeca");
  });

  it("sem Ordem visível e sem Responsável: a linha some", () => {
    painel(proc({ responsavelOperacional: undefined }));
    expect(document.querySelector("#painel-ordem-responsavel")).toBeNull();
  });
});

describe("Courier Simples (mesma regra do formulário)", () => {
  it("esconde Despachante e Transportadora; Local de entrega continua", () => {
    painel(proc({ modalEnvio: "Courier Simples", companhiaAerea: "DHL" }));
    expect(document.querySelector("#painel-despachante")).toBeNull();
    expect(document.querySelector("#painel-transportadora")).toBeNull();
    expect(texto(document.querySelector("#painel-local-entrega"))).toBe("Clínica X");
  });

  it("Air Cargo, Courier Formal, vazio e o legado 'Courier' mostram", () => {
    for (const modalEnvio of ["Air Cargo", "Courier Formal", undefined, "Courier"]) {
      expect(mostraDespachanteTransportadora({ modalEnvio }), String(modalEnvio)).toBe(true);
    }
    expect(mostraDespachanteTransportadora({ modalEnvio: "Courier Simples" })).toBe(false);
  });
});

describe("funções puras do painel", () => {
  it("medicamentos: 'Qtd. — nome (dosagem)'; sem quantidade, só o nome; sem nome, fora", () => {
    expect(
      linhasMedicamentos([
        { nome: "PEMBROLIZUMABE", quantidade: "4 cx" },
        { nome: "NIVOLUMABE", dosagem: "40MG" },
        { nome: "  " },
      ]),
    ).toEqual(["4 cx — PEMBROLIZUMABE", "NIVOLUMABE 40MG"]);
  });

  it("transportadora: só as partes preenchidas; sem transportadora, vazio", () => {
    expect(linhaTransportadora({ transportadoraNacional: { nome: "AJC" } })).toBe("AJC");
    expect(linhaTransportadora({ transportadoraNacional: { nome: "AJC", valor: 0 } })).toBe("AJC · R$ 0,00");
    expect(linhaTransportadora({})).toBe("");
  });

  it("datas: as 9, na ordem da tela", () => {
    expect(camposDatas({ datas: {} }).map((c) => c.rotulo)).toEqual([
      "Compra (PO)",
      "Embarque",
      "Abertura thread",
      "Chegada Brasil",
      "Registro Radar",
      "Registro Duimp",
      "Registro Lpco",
      "Previsão entrega",
      "Suposta estimativa",
    ]);
  });
});

describe("reatividade: lê o processo do store, não um snapshot", () => {
  it("o objeto do store muda (ex.: salvou no formulário) e o painel acompanha", async () => {
    const p = reactive(proc());
    montar(defineComponent({ setup: () => () => h(ProcessoPainel, { processo: p }) }));
    p.paciente = "Maria Aparecida Souza";
    p.pendencias = ["Só uma"];
    await nextTick();
    expect(texto(document.querySelector("#painel-titulo"))).toBe("Maria Aparecida Souza");
    expect(texto(document.querySelector("#painel-bloco-pendencias"))).toContain("Pendências (1)");
  });
});

describe("ações", () => {
  it("editar emite o processo", () => {
    const edit = vi.fn();
    painel(proc(), { edit });
    document.querySelector<HTMLButtonElement>("#btn-painel-editar")!.click();
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });

  it("excluir pede confirmação: só emite delete ao confirmar; cancelar não emite", async () => {
    const del = vi.fn();
    painel(proc(), { delete: del });
    document.querySelector<HTMLButtonElement>("#btn-painel-excluir")!.click();
    await nextTick();
    const dialogo = document.querySelector("#confirm-dialog-overlay, [data-overlay='modal']");
    expect(dialogo).not.toBeNull();
    expect(texto(dialogo)).toContain("Excluir o processo de Maria Aparecida? Essa ação não pode ser desfeita.");
    expect(del).not.toHaveBeenCalled();

    const cancelar = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => texto(b) === "Cancelar")!;
    cancelar.click();
    await nextTick();
    expect(document.querySelector("[data-overlay='modal']")).toBeNull();
    expect(del).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>("#btn-painel-excluir")!.click();
    await nextTick();
    const confirmar = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => texto(b) === "Sim, excluir")!;
    confirmar.click();
    await nextTick();
    expect(del).toHaveBeenCalledWith("p1");
  });

  it("clique no overlay (fora do painel) fecha; clique dentro não", () => {
    const close = vi.fn();
    painel(proc(), { close });
    document.querySelector<HTMLElement>("[data-testid='processo-painel']")!.click();
    expect(close).not.toHaveBeenCalled();
    document.querySelector<HTMLElement>("#processo-painel-overlay")!.click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("botão X fecha", () => {
    const close = vi.fn();
    painel(proc(), { close });
    document.querySelector<HTMLButtonElement>("#btn-painel-fechar")!.click();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("foco e Esc", () => {
  const esc = (alvo: EventTarget = document) => {
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    alvo.dispatchEvent(ev);
    return ev;
  };

  it("ao abrir, o foco vai para o botão fechar", async () => {
    painel(proc());
    await nextTick();
    await nextTick();
    expect(document.activeElement?.id).toBe("btn-painel-fechar");
  });

  it("Esc fecha", () => {
    const close = vi.fn();
    painel(proc(), { close });
    esc();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("Esc NÃO fecha com um modal por cima (formulário/ConfirmDialog) nem quando alguém já tratou a tecla", () => {
    const close = vi.fn();
    painel(proc(), { close });

    const modal = document.createElement("div");
    modal.setAttribute("data-overlay", "modal");
    document.body.appendChild(modal);
    expect(haModalAberto()).toBe(true);
    esc();
    expect(close).not.toHaveBeenCalled();
    modal.remove();
    expect(haModalAberto()).toBe(false);

    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    ev.preventDefault();
    document.dispatchEvent(ev);
    expect(close).not.toHaveBeenCalled();
  });

  it("foco preso: Tab no último volta ao primeiro; Shift+Tab no primeiro vai ao último", () => {
    painel(proc());
    const aside = document.querySelector<HTMLElement>("[data-testid='processo-painel']")!;
    const botoes = [...aside.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")];
    const primeiro = botoes[0]!;
    const ultimo = botoes[botoes.length - 1]!;
    expect(ultimo.id).toBe("btn-painel-excluir");

    ultimo.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    ultimo.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(primeiro);

    const shiftTab = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    primeiro.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(ultimo);
  });

  it("ao fechar, o foco volta para o botão do card que abriu", async () => {
    const botaoCard = document.createElement("button");
    botaoCard.id = "btn-abrir-processo-p1";
    document.body.appendChild(botaoCard);
    botaoCard.focus();

    const el = painel(proc());
    await nextTick();
    montados.pop()!.unmount();
    el.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(botaoCard);
  });

  it("trava a rolagem do body enquanto aberto", () => {
    painel(proc());
    expect(document.body.style.overflow).toBe("hidden");
  });
});

describe("camadas", () => {
  it("overlay z-[880] (abaixo do BaseModal z-900) com fundo bg-ink/40; painel de 480px em lg+ e tela cheia abaixo", () => {
    painel(proc());
    const overlay = document.querySelector("#processo-painel-overlay")!;
    expect(overlay.className).toContain("z-[880]");
    expect(overlay.className).toContain("bg-ink/40");
    const aside = document.querySelector("[data-testid='processo-painel']")!;
    for (const c of ["h-dvh", "w-full", "lg:w-[480px]", "max-w-[100vw]", "bg-paper-raised", "lg:border-l"]) {
      expect(aside.className).toContain(c);
    }
    expect(aside.className).not.toMatch(/\bshadow-(lg|xl|2xl)\b/);
  });
});
