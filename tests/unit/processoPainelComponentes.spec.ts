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
      "pessoas",
      "envio",
      "entrega",
      "numero-processo",
      "datas",
      "pendencias",
      "atualizacoes",
      "rodape",
    ]);
  });

  it("cabeçalho: nome em destaque (font-display 22px/600), ícones Mover/Editar/Fechar nessa ordem; dialog rotulado pelo nome", () => {
    painel(proc());
    const titulo = document.querySelector("#painel-titulo")!;
    expect(texto(titulo)).toBe("Maria Aparecida");
    expect(titulo.className).toContain("font-display");
    expect(titulo.className).toContain("text-[22px]");
    expect(titulo.className).toContain("font-semibold");
    expect(titulo.className).toContain("break-words");
    expect(titulo.className).toContain("min-w-0");
    const acoes = [...document.querySelectorAll("#painel-acoes button")].map((b) => b.id);
    expect(acoes).toEqual(["btn-mover-painel-p1", "btn-painel-editar", "btn-painel-fechar"]);
    for (const id of acoes) {
      const b = document.getElementById(id)!;
      expect(b.getAttribute("aria-label"), id).toBeTruthy();
      expect(b.getAttribute("title"), id).toBeTruthy();
      expect(b.className, id).toContain("h-11"); // 44px abaixo de lg
      expect(b.className, id).toContain("lg:h-9"); // 36px em lg+
      expect(b.querySelector("svg[aria-hidden='true']"), id).not.toBeNull();
    }
    expect(document.querySelector("#btn-painel-fechar")!.getAttribute("aria-label")).toBe("Fechar painel");
    const dialog = document.querySelector("[data-testid='processo-painel']")!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe("painel-titulo");
    expect(document.querySelector("#btn-painel-editar")!.getAttribute("aria-label")).toBe("Editar processo");
    expect(document.querySelector("#btn-painel-fechar")).not.toBeNull();
  });

  it("valores principais", () => {
    painel(proc());
    expect(texto(document.querySelector("#painel-pasta-po"))).toBe("Pasta 2026 - 366 · PO-26-0471");
    expect(texto(document.querySelector("#painel-fornecedor"))).toBe("Poros"); // só o nome, sem " - País"
    expect(texto(document.querySelector("#painel-responsavel"))).toBe("Rebeca");
    expect(texto(document.querySelector("#painel-consultor"))).toBe("Dani");
    expect(texto(document.querySelector("#painel-envio"))).toBe("Air Cargo");
    expect(texto(document.querySelector("#painel-awb"))).toBe("957-12345678");
    expect(document.querySelector("#painel-awb")!.className).toContain("font-mono");
    expect(texto(document.querySelector("#painel-transportadora"))).toBe("AJC · COT-9 · R$ 1.500,00");
    expect(texto(document.querySelector("#painel-numero-processo"))).toBe("25BR0001");
    expect(texto(document.querySelector("#painel-registro-lpco"))).toBe("09/10 - agd. análise"); // texto antigo como está
    expect(texto(document.querySelector("#painel-bloco-pendencias h3"))).toContain("Pendências");
    expect(texto(document.querySelector("#painel-pendencias-contador"))).toBe("2");
    expect(texto(document.querySelector("#painel-pendencias"))).toContain("Enviar laudo");
    expect(texto(document.querySelector("#painel-bloco-atualizacoes"))).toContain("Carga embarcada.");
  });

  it("sem PO: só a Pasta", () => {
    painel(proc({ numeroPo: undefined }));
    expect(texto(document.querySelector("#painel-pasta-po"))).toBe("Pasta 2026 - 366");
  });
});

describe("Ordem N (como na Lista) na linha de cima do cabeçalho", () => {
  it("N = 1 e pasta única: sem 'Ordem'", () => {
    painel(proc());
    expect(document.querySelector("#painel-ordem")).toBeNull();
  });

  it("N > 1: 'Ordem N' depois do PO, no mesmo estilo (fonte de código cinza)", () => {
    painel(proc({ numeroRemessa: 2 }));
    expect(texto(document.querySelector("#painel-ordem"))).toBe("Ordem 2");
    const linha = document.querySelector("#painel-linha-cima")!;
    expect([...linha.children].map((c) => texto(c))).toEqual(["Pasta 2026 - 366 · PO-26-0471", "·", "Ordem 2"]); // "·" é só separador visual (aria-hidden)
    expect(linha.children[1]!.getAttribute("aria-hidden")).toBe("true");
    const pasta = document.querySelector("#painel-pasta-po")!;
    const ordem = document.querySelector("#painel-ordem")!;
    expect(pasta.compareDocumentPosition(ordem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ordem.className).toContain("font-mono");
  });

  it("pasta repetida (mesmo com N = 1): mostra 'Ordem 1'", () => {
    const p = proc();
    painel(p, {}, [p, proc({ id: "p2", numeroRemessa: 2 })]);
    expect(texto(document.querySelector("#painel-ordem"))).toBe("Ordem 1");
  });

  it("o Responsável não aparece mais junto da Ordem (#painel-ordem-responsavel não existe)", () => {
    painel(proc({ numeroRemessa: 2 }));
    expect(document.querySelector("#painel-ordem-responsavel")).toBeNull();
  });
});

describe("cabeçalho: linha de cima, pagamento, medicamentos e status", () => {
  it("Pago/Pendente aparece na linha de cima com as classes do card; sem valor, nenhuma etiqueta", () => {
    painel(proc({ statusPagamento: "pago" }));
    expect(texto(document.querySelector("#painel-pagamento"))).toBe("Pago");
    expect(document.querySelector("#painel-pagamento")!.className).toContain("bg-green-100 text-green-800");
    document.body.innerHTML = "";
    painel(proc({ statusPagamento: "pendente" }));
    expect(document.querySelector("#painel-pagamento")!.className).toContain("bg-amber-100 text-amber-800");
    document.body.innerHTML = "";
    painel(proc({ statusPagamento: undefined }));
    expect(document.querySelector("#painel-pagamento")).toBeNull();
  });

  it("com pasta/PO a linha de cima existe e o nome vem depois dela", () => {
    painel(proc());
    const linha = document.querySelector("#painel-linha-cima")!;
    const titulo = document.querySelector("#painel-titulo")!;
    expect(linha.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(texto(document.querySelector("#painel-pasta-po"))).toBe("Pasta 2026 - 366 · PO-26-0471");
    expect(document.querySelector("#painel-pasta-po")!.className).toContain("font-mono");
  });

  it("medicamentos: quantidade em negrito, ' — ', nome em maiúsculas (CSS); laboratório/brand numa linha cinza embaixo", () => {
    painel(
      proc({
        medicamentos: [
          { nome: "Opdivo", dosagem: "40mg", quantidade: "6 caixas", laboratorio: "BMS", brand: "referencia" },
          { nome: "Keytruda" },
        ],
      }),
    );
    const itens = [...document.querySelectorAll("#painel-medicamentos li")];
    expect(itens.map((li) => texto(li.firstElementChild))).toEqual(["6 caixas — Opdivo 40mg", "Keytruda"]);
    expect(itens[0]!.querySelector("strong")!.textContent).toBe("6 caixas");
    expect(itens[0]!.firstElementChild!.className).toContain("uppercase");
    expect(itens[0]!.firstElementChild!.className).toContain("text-[12.5px]");
    expect(texto(document.querySelector("#painel-medicamento-extra-0"))).toBe("BMS · Referência");
    expect(document.querySelector("#painel-medicamento-extra-0")!.className).not.toContain("uppercase");
    expect(document.querySelector("#painel-medicamento-extra-1")).toBeNull();
    expect(itens[1]!.querySelector("strong")).toBeNull();
  });

  it("status: elemento IRMÃO do bloco de medicamentos (não dentro dele), no mesmo contêiner flex alinhado pelo fundo", () => {
    painel(proc());
    const status = document.querySelector("#painel-status")!;
    const meds = document.querySelector("#painel-medicamentos")!;
    expect(meds.contains(status)).toBe(false);
    expect(status.parentElement).toBe(meds.parentElement);
    const linha = status.parentElement!;
    for (const c of ["flex", "items-end", "justify-between", "gap-4"]) expect(linha.className, c).toContain(c);
    expect(meds.className).toContain("flex-1");
    expect(meds.className).toContain("min-w-0");
    expect(status.className).toContain("flex-none");
    expect(status.className).toContain("whitespace-nowrap");
    expect(status.className).toContain("-mb-[3px]");
    expect(texto(status)).toBe("Em trânsito");
    // Não existe mais uma linha própria para o status nem o texto "Mover para…" ao lado dele.
    expect(texto(document.querySelector("#painel-bloco-cabecalho"))).not.toContain("Mover para");
  });

  it("os 3 ícones ficam num contêiner sticky de altura zero (Fechar alcançável ao rolar), filho direto do painel", () => {
    painel(proc());
    const acoes = document.querySelector("#painel-acoes")!;
    expect(acoes.parentElement).toBe(document.querySelector("[data-testid='processo-painel']"));
    for (const c of ["sticky", "top-0", "h-0", "z-20"]) expect(acoes.className, c).toContain(c);
    expect(acoes.compareDocumentPosition(document.querySelector("#painel-bloco-cabecalho")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o contêiner dos ícones não captura o mouse, mas o menu Mover e os botões RECEBEM o clique (pointer-events-auto nos filhos diretos)", () => {
    painel(proc());
    const acoes = document.querySelector("#painel-acoes")!;
    expect(acoes.className).toContain("pointer-events-none");
    const interno = acoes.firstElementChild!;
    expect(interno.className).toContain("[&>*]:pointer-events-auto");
    // Todo botão do topo é filho direto do contêiner interno ou está dentro do menu Mover (filho direto): herdam o auto.
    const filhos = [...interno.children];
    expect(filhos).toHaveLength(3);
    for (const id of ["btn-mover-painel-p1", "btn-painel-editar", "btn-painel-fechar"]) {
      const b = document.getElementById(id)!;
      expect(filhos.some((f) => f === b || f.contains(b)), id).toBe(true);
    }
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

  it("datas: as 11, na ordem da tela (MS Anexado em e Prazo da ANVISA depois do Registro Lpco)", () => {
    expect(camposDatas({ datas: {} }).map((c) => c.rotulo)).toEqual([
      "Compra (PO)",
      "Embarque",
      "Abertura thread",
      "Chegada Brasil",
      "Registro Radar",
      "Registro Duimp",
      "Registro Lpco",
      "MS Anexado em",
      "Prazo da ANVISA",
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
    expect(texto(document.querySelector("#painel-pendencias-contador"))).toBe("1");
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

  it("ao fechar, o foco volta para o card que abriu (o próprio card é o controle)", async () => {
    const botaoCard = document.createElement("article");
    botaoCard.id = "processo-card-p1";
    botaoCard.tabIndex = 0;
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
  it("overlay z-[880] (abaixo do BaseModal z-900) com fundo bg-ink/40; painel de 600px em lg+ e tela cheia abaixo", () => {
    painel(proc());
    const overlay = document.querySelector("#processo-painel-overlay")!;
    expect(overlay.className).toContain("z-[880]");
    expect(overlay.className).toContain("bg-ink/40");
    const aside = document.querySelector("[data-testid='processo-painel']")!;
    for (const c of ["h-dvh", "w-full", "lg:w-[600px]", "max-w-[100vw]", "bg-paper-raised", "lg:border-l"]) {
      expect(aside.className).toContain(c);
    }
    expect(aside.className).not.toMatch(/\bshadow-(lg|xl|2xl)\b/);
  });
});

describe("datas vazias escondidas no painel", () => {
  const TODAS = {
    dataCompraPO: "05/08",
    dataEmbarque: "10/08/2026",
    aberturaThread: "12/08",
    dataChegadaBrasil: "20/08",
    registroRadar: "21/08",
    registroDuimp: "22/08",
    registroLpco: "09/10 - agd. análise",
    msAnexadoEm: "2026-11-10",
    prazoAnvisa: "2026-11-25",
    previsaoEntrega: "28/08",
    supostaEstimativa: "Entre 28/08 e 02/09",
  };
  const rotulos = () =>
    [...document.querySelectorAll("#painel-bloco-datas [id^='painel-']")].map((n) => n.previousElementSibling?.textContent?.trim());

  it("todas preenchidas: as 11, na ordem da tela, as ISO com o ano", () => {
    painel(proc({ datas: TODAS }));
    expect(rotulos()).toEqual([
      "Compra (PO)",
      "Embarque",
      "Abertura thread",
      "Chegada Brasil",
      "Registro Radar",
      "Registro Duimp",
      "Registro Lpco",
      "MS Anexado em",
      "Prazo da ANVISA",
      "Previsão entrega",
      "Suposta estimativa",
    ]);
    expect(texto(document.querySelector("#painel-ms-anexado"))).toBe("10/11/2026");
    expect(texto(document.querySelector("#painel-prazo-anvisa"))).toBe("25/11/2026");
  });

  it("algumas: só as preenchidas aparecem (sem rótulo nem '—' das vazias); só espaços conta como vazia", () => {
    painel(proc({ datas: { dataCompraPO: "05/08", registroRadar: "   ", prazoAnvisa: "2026-11-25", registroLpco: "09/10 - agd." } }));
    expect(rotulos()).toEqual(["Compra (PO)", "Registro Lpco", "Prazo da ANVISA"]);
    expect(texto(document.querySelector("#painel-bloco-datas"))).not.toContain("—");
    expect(document.querySelector("#painel-registro-radar")).toBeNull();
  });

  it("nenhuma: a seção Datas some (os outros blocos continuam)", () => {
    painel(proc({ datas: {} }));
    expect(document.querySelector("#painel-bloco-datas")).toBeNull();
    expect(document.querySelector("#painel-bloco-pendencias")).not.toBeNull();
  });

  it("Suposta estimativa segue em largura total quando aparece", () => {
    painel(proc({ datas: { supostaEstimativa: "fim do mês" } }));
    expect(document.querySelector("#painel-suposta-estimativa")!.parentElement!.className).toContain("col-span-full");
  });
});

describe("blocos novos: pessoas, envio e desembaraço, entrega, nº do processo", () => {
  const ids = (sel: string) => [...document.querySelectorAll(`${sel} [id^='painel-']`)].map((n) => n.id);

  it("pessoas: Responsável, Consultor e Fornecedor numa linha de bloquinhos (flex-wrap, mínimo 140px, valor com ... e title)", () => {
    painel(proc({ fornecedor: "Beldimed - Bélgica" }));
    const bloco = document.querySelector("#painel-bloco-pessoas")!;
    expect(ids("#painel-bloco-pessoas")).toEqual(["painel-responsavel", "painel-consultor", "painel-fornecedor"]);
    expect(bloco.firstElementChild!.className).toContain("flex-wrap");
    for (const celula of bloco.firstElementChild!.children) {
      expect(celula.className).toContain("min-w-[140px]");
      expect(celula.className).toContain("flex-1");
      expect(celula.getAttribute("title")).toBeTruthy();
      expect(celula.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
    expect(document.querySelector("#painel-fornecedor")!.className).toContain("truncate");
    expect(document.querySelector("#painel-fornecedor")!.closest("[title]")!.getAttribute("title")).toBe("Beldimed");
    expect(texto(document.querySelector("#painel-bloco-pessoas"))).not.toContain("Bélgica");
    // Mesmo estilo de bloquinho do card.
    const estilo = bloco.querySelector("[title]")!.className;
    for (const c of ["bg-[#f6f8f8]", "border-[#e0e7e5]", "rounded-[8px]"]) expect(estilo, c).toContain(c);
  });

  it("pessoas: campo vazio some; sem nenhum, a seção some", () => {
    painel(proc({ consultor: "", fornecedor: undefined }));
    expect(ids("#painel-bloco-pessoas")).toEqual(["painel-responsavel"]);
    document.body.innerHTML = "";
    painel(proc({ responsavelOperacional: undefined, consultor: "", fornecedor: "  " }));
    expect(document.querySelector("#painel-bloco-pessoas")).toBeNull();
  });

  it("envio e desembaraço: título e 2 linhas (Envio | Cia.; AWB em fonte de código | Despachante)", () => {
    painel(proc());
    const bloco = document.querySelector("#painel-bloco-envio")!;
    expect(texto(bloco.querySelector("h3"))).toBe("Envio e desembaraço");
    expect(ids("#painel-bloco-envio")).toEqual(["painel-envio", "painel-cia", "painel-awb", "painel-despachante"]);
    const linhas = [...bloco.querySelectorAll(":scope > div > div")];
    expect(linhas.map((l) => [...l.querySelectorAll("[id^='painel-']")].map((n) => n.id))).toEqual([
      ["painel-envio", "painel-cia"],
      ["painel-awb", "painel-despachante"],
    ]);
    for (const l of linhas) expect(l.className).toContain("grid-cols-2");
    expect(document.querySelector("#painel-awb")!.className).toContain("font-mono");
    expect(texto(document.querySelector("#painel-envio"))).toBe("Air Cargo");
    expect(texto(document.querySelector("#painel-cia"))).toBe("Lufthansa");
  });

  it("envio e desembaraço: célula sozinha ocupa a linha (1 coluna); linha sem células some; sem campo nenhum, nem o título", () => {
    painel(proc({ companhiaAerea: undefined, despachante: undefined }));
    const linhas = [...document.querySelectorAll("#painel-bloco-envio > div > div")];
    expect(linhas).toHaveLength(2);
    for (const l of linhas) expect(l.className).toContain("grid-cols-1");
    document.body.innerHTML = "";
    painel(proc({ modalEnvio: "Air Cargo", companhiaAerea: undefined, numeroAwb: undefined, despachante: undefined }));
    expect([...document.querySelectorAll("#painel-bloco-envio > div > div")]).toHaveLength(1);
    document.body.innerHTML = "";
    painel(proc({ modalEnvio: undefined, companhiaAerea: undefined, numeroAwb: undefined, despachante: undefined }));
    expect(document.querySelector("#painel-bloco-envio")).toBeNull();
    expect(document.body.textContent).not.toContain("Envio e desembaraço");
  });

  it("entrega: Transportadora e Local de entrega, cada um numa linha inteira; vazios somem; seção some sem nenhum", () => {
    painel(proc());
    expect(texto(document.querySelector("#painel-bloco-entrega h3"))).toBe("Entrega");
    expect(ids("#painel-bloco-entrega")).toEqual(["painel-transportadora", "painel-local-entrega"]);
    expect(texto(document.querySelector("#painel-transportadora"))).toBe("AJC · COT-9 · R$ 1.500,00");
    document.body.innerHTML = "";
    painel(proc({ transportadoraNacional: undefined, localEntrega: undefined }));
    expect(document.querySelector("#painel-bloco-entrega")).toBeNull();
    document.body.innerHTML = "";
    painel(proc({ transportadoraNacional: undefined }));
    expect(ids("#painel-bloco-entrega")).toEqual(["painel-local-entrega"]);
  });

  it("nº do processo: bloquinho de linha inteira, sem título, em fonte de código com break-all; vazio some", () => {
    painel(proc({ numeroProcesso: "25BR00001234567-8/2026-ABCDEFGHIJKLMNOPQRSTUVWXYZ" }));
    const bloco = document.querySelector("#painel-bloco-numero-processo")!;
    expect(bloco.querySelector("h3")).toBeNull();
    const valor = document.querySelector("#painel-numero-processo")!;
    expect(valor.className).toContain("font-mono");
    expect(valor.className).toContain("break-all");
    expect(texto(bloco)).toContain("Nº do processo");
    document.body.innerHTML = "";
    painel(proc({ numeroProcesso: "  " }));
    expect(document.querySelector("#painel-bloco-numero-processo")).toBeNull();
  });

  it("nenhum campo vazio mostra '—' no painel", () => {
    painel(proc({ companhiaAerea: undefined, numeroAwb: undefined, despachante: undefined, localEntrega: undefined, transportadoraNacional: undefined, numeroProcesso: undefined, datas: {} }));
    // O "—" do cabeçalho é só o separador "quantidade — medicamento"; nas seções nenhum campo vazio vira "—".
    const secoes = [...document.querySelectorAll("#painel-corpo > section")].map((n) => texto(n)).join(" ");
    expect(secoes).not.toContain("—");
    expect(secoes).not.toContain("–");
  });
});

describe("datas em bloquinhos", () => {
  it("3 colunas a partir de sm e 2 abaixo; bloquinho pequeno (rótulo 10,5px cinza + valor 13,5px/600)", () => {
    painel(proc({ datas: { dataCompraPO: "05/08", dataEmbarque: "10/08/2026" } }));
    const grade = document.querySelector("#painel-bloco-datas .grid")!;
    expect(grade.className).toContain("grid-cols-2");
    expect(grade.className).toContain("sm:grid-cols-3");
    const valor = document.querySelector("#painel-data-compra-po")!;
    expect(valor.className).toContain("text-[13.5px]");
    expect(valor.className).toContain("font-semibold");
    expect(valor.previousElementSibling!.className).toContain("text-[10.5px]");
    expect(valor.previousElementSibling!.className).toContain("text-ink-soft");
    expect(valor.parentElement!.className).not.toContain("col-span-full");
  });

  it("valor anotado (não é DD/MM nem DD/MM/AAAA) ocupa a linha inteira e quebra; DD/MM e DD/MM/AAAA ficam em 1 coluna", () => {
    painel(proc({ datas: { dataCompraPO: "05/08", dataEmbarque: "10/08/2026", registroLpco: "09/10 - agd. análise do órgão", supostaEstimativa: "10/08" } }));
    expect(document.querySelector("#painel-data-compra-po")!.parentElement!.className).not.toContain("col-span-full");
    expect(document.querySelector("#painel-data-embarque")!.parentElement!.className).not.toContain("col-span-full");
    expect(document.querySelector("#painel-registro-lpco")!.parentElement!.className).toContain("col-span-full");
    expect(document.querySelector("#painel-registro-lpco")!.className).toContain("break-words");
    // Suposta estimativa: sempre linha inteira, mesmo com valor curto.
    expect(document.querySelector("#painel-suposta-estimativa")!.parentElement!.className).toContain("col-span-full");
  });

  it("previsão de entrega mantém o destaque; vazias não aparecem", () => {
    painel(proc({ datas: { previsaoEntrega: "28/08" } }));
    expect(document.querySelector("#painel-previsao-entrega")!.className).toContain("text-accent-dark");
    expect(document.querySelectorAll("#painel-bloco-datas [id^='painel-']")).toHaveLength(1);
  });
});

describe("divisórias só entre seções que existem", () => {
  it("o corpo usa divide-y e as seções vazias nem entram no DOM (processo simples: só cabeçalho, pessoas, pendências, atualizações e rodapé)", () => {
    painel(
      proc({
        modalEnvio: undefined, companhiaAerea: undefined, numeroAwb: undefined, despachante: undefined,
        transportadoraNacional: undefined, localEntrega: undefined, numeroProcesso: undefined, datas: {},
      }),
    );
    const corpo = document.querySelector("#painel-corpo")!;
    expect(corpo.className).toContain("divide-y");
    expect(corpo.className).toContain("divide-[#e0e7e5]");
    const ids = [...corpo.children].map((c) => c.id.replace("painel-bloco-", ""));
    expect(ids).toEqual(["cabecalho", "pessoas", "pendencias", "atualizacoes", "rodape"]);
    // Nenhuma seção traz borda própria: as linhas vêm só do divide-y (assim não há linha dupla nem solta).
    for (const filho of corpo.children) expect(filho.className).not.toMatch(/(^|\s)border-[bt](\s|$)/);
  });

  it("processo completo: todas as seções, na ordem", () => {
    painel(proc({ datas: { dataCompraPO: "05/08" } }));
    const ids = [...document.querySelector("#painel-corpo")!.children].map((c) => c.id.replace("painel-bloco-", ""));
    expect(ids).toEqual([...BLOCOS_PAINEL]);
  });
});

describe("pendências", () => {
  it("título com contador vermelho (pílula); cada pendência numa linha de fundo vermelho suave com ícone de alerta", () => {
    painel(proc({ pendencias: ["Enviar laudo", "Ligar para a clínica", "Conferir procuração"] }));
    const contador = document.querySelector("#painel-pendencias-contador")!;
    expect(texto(contador)).toBe("3");
    for (const c of ["bg-[#fbe9e5]", "text-[#9a3828]", "rounded-full"]) expect(contador.className, c).toContain(c);
    const linhas = [...document.querySelectorAll("#painel-pendencias li")];
    expect(linhas.map((l) => texto(l))).toEqual(["Enviar laudo", "Ligar para a clínica", "Conferir procuração"]);
    for (const l of linhas) {
      for (const c of ["bg-[#fbeeea]", "border-[#efd3cc]", "text-[#7e2e20]"]) expect(l.className, c).toContain(c);
      expect(l.querySelector("svg[aria-hidden='true']")).not.toBeNull();
      expect(l.querySelector("span.break-words")).not.toBeNull();
    }
  });

  it("vazio: 'Nenhuma pendência.' e sem pílula", () => {
    painel(proc({ pendencias: [] }));
    expect(texto(document.querySelector("#painel-bloco-pendencias"))).toContain("Nenhuma pendência.");
    expect(document.querySelector("#painel-pendencias-contador")).toBeNull();
    expect(document.querySelector("#painel-pendencias")).toBeNull();
  });
});

describe("atualizações (variante painel) e Excluir processo", () => {
  const atualizacoes = [
    { data: "31/08", texto: "Carga embarcada." },
    { data: "", texto: "Cliente avisado por telefone." },
  ];

  it("data numa pílula de fonte de código ou 'obs.' sem data; texto com break-words; linhas separadas por fio fino", () => {
    painel(proc({ atualizacoes }));
    const itens = [...document.querySelectorAll("#painel-bloco-atualizacoes ol > li")];
    expect(itens).toHaveLength(2);
    const pilulas = itens.map((li) => li.querySelector("span")!);
    expect(pilulas.map((p) => texto(p))).toEqual(["31/08", "obs."]);
    expect(pilulas[0]!.className).toContain("font-mono");
    expect(pilulas[0]!.className).toContain("bg-[#edf1f0]");
    expect(pilulas[1]!.className).not.toContain("font-mono");
    expect(itens[0]!.querySelector("span.break-words")!.textContent!.trim()).toBe("Carga embarcada.");
    expect(document.querySelector("#painel-bloco-atualizacoes ol")!.className).toContain("divide-y");
  });

  it("só dois ícones (editar e excluir) à direita, sem botões de texto, com os MESMOS ids e aria-labels de hoje", () => {
    painel(proc({ atualizacoes }));
    const li = document.querySelector("#atualizacao-p1-0")!;
    const botoes = [...li.querySelectorAll("button")];
    expect(botoes.map((b) => b.id)).toEqual(["btn-edit-atualizacao-p1-0", "btn-delete-atualizacao-p1-0"]);
    expect(botoes.map((b) => b.getAttribute("aria-label"))).toEqual(["Editar atualização de 31/08", "Excluir atualização de 31/08"]);
    expect(botoes.map((b) => b.getAttribute("title"))).toEqual(["Editar atualização", "Excluir atualização"]);
    for (const b of botoes) {
      expect(texto(b)).toBe("");
      expect(b.querySelector("svg[aria-hidden='true']")).not.toBeNull();
      expect(b.className).toContain("h-11"); // 44px abaixo de lg
      expect(b.className).toContain("lg:h-[30px]");
    }
    // Sem data: "sem data" no nome acessível, como hoje.
    expect(document.querySelector("#btn-edit-atualizacao-p1-1")!.getAttribute("aria-label")).toBe("Editar atualização sem data");
  });

  it("o campo de adicionar é o de hoje (data, texto e botão Adicionar); vazio: 'Nenhuma atualização ainda.'", () => {
    painel(proc({ atualizacoes: [] }));
    const bloco = document.querySelector("#painel-bloco-atualizacoes")!;
    expect(texto(bloco)).toContain("Nenhuma atualização ainda.");
    const form = bloco.querySelector("form[id^='form-nova-atualizacao-']")!;
    expect(form.querySelectorAll("input")).toHaveLength(2);
    expect(texto(form.querySelector("button[type='submit']"))).toBe("Adicionar");
    expect(form.querySelector("button[type='submit']")!.className).toContain("bg-accent-dark");
  });

  it("clicar em editar abre o formulário inline de sempre (Salvar/Cancelar)", async () => {
    painel(proc({ atualizacoes }));
    document.querySelector<HTMLButtonElement>("#btn-edit-atualizacao-p1-0")!.click();
    await nextTick();
    expect(document.querySelector("#form-edit-atualizacao-p1-0")).not.toBeNull();
    expect(texto(document.querySelector("#btn-save-atualizacao-p1-0"))).toBe("Salvar");
  });

  it("Excluir processo: última seção, no canto direito, borda #efd3cc, texto #9a3828 e ícone de lixeira", () => {
    painel(proc());
    const rodape = document.querySelector("#painel-bloco-rodape")!;
    const corpo = document.querySelector("#painel-corpo")!;
    expect(corpo.lastElementChild).toBe(rodape);
    expect(rodape.className).toContain("justify-end");
    const botao = document.querySelector<HTMLButtonElement>("#btn-painel-excluir")!;
    expect(texto(botao)).toBe("Excluir processo");
    for (const c of ["border-[#efd3cc]", "text-[#9a3828]"]) expect(botao.className, c).toContain(c);
    expect(botao.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });
});
