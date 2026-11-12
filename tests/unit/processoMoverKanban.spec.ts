// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import ProcessoKanban from "../../app/components/processos/ProcessoKanban.vue";
import ProcessoMoverMenu from "../../app/components/processos/ProcessoMoverMenu.vue";
import ProcessoPainel from "../../app/components/processos/ProcessoPainel.vue";
import {
  deslocamentoAutoRolagem,
  MARGEM_ROLAGEM_PX,
  PASSO_ROLAGEM_PX,
} from "../../app/composables/useArrastarKanban";
import { MENSAGEM_MOVER_CONFLITO, useMoverProcesso } from "../../app/composables/useMoverProcesso";
import { ApiError } from "../../app/utils/apiFetch";
import { alvoDeMovimentoValido, opcoesMoverPara, textoConfirmacaoMover } from "../../app/utils/processoKanban";

// Etapa E do Kanban: arrastar com confirmação e "Mover para…". Funções puras, o arrastar nativo no happy-dom, o fluxo
// confirmar/cancelar/409/falha com o cliente simulado e o menu por teclado.

function proc(id: string, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta: "2026 - 100",
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: `v-${id}`,
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

describe("funções puras", () => {
  it("alvoDeMovimentoValido: um dos 5 e diferente da coluna atual", () => {
    const p = proc("a", { status: "em_transito" });
    expect(alvoDeMovimentoValido(p, "desembaraco")).toBe(true);
    expect(alvoDeMovimentoValido(p, "entregue")).toBe(true);
    expect(alvoDeMovimentoValido(p, "em_transito")).toBe(false); // mesma coluna
    expect(alvoDeMovimentoValido(p, "outro")).toBe(false);
    expect(alvoDeMovimentoValido(p, "")).toBe(false);
    expect(alvoDeMovimentoValido(p, undefined)).toBe(false);
  });

  it("opcoesMoverPara: as outras 4, na ordem do fluxo", () => {
    expect(opcoesMoverPara(proc("a", { status: "desembaraco" })).map((c) => c.rotulo)).toEqual([
      "Na origem",
      "Em trânsito",
      "Liberado",
      "Entregue",
    ]);
  });

  it("texto da confirmação", () => {
    expect(textoConfirmacaoMover("Maria", "em_transito", "desembaraco")).toBe(
      "Mover «Maria» de Em trânsito para Desembaraço? A mudança fica registrada nas atualizações e o consultor é avisado.",
    );
  });

  it("rolagem automática só perto das bordas do quadro", () => {
    expect(deslocamentoAutoRolagem(10, 0, 1000)).toBe(-PASSO_ROLAGEM_PX);
    expect(deslocamentoAutoRolagem(990, 0, 1000)).toBe(PASSO_ROLAGEM_PX);
    expect(deslocamentoAutoRolagem(500, 0, 1000)).toBe(0);
    expect(deslocamentoAutoRolagem(MARGEM_ROLAGEM_PX, 0, 1000)).toBe(0);
  });
});

// ── Arrastar nativo ─────────────────────────────────────────────────────────────────────────────────
function fakeDataTransfer() {
  const dados: Record<string, string> = {};
  return {
    effectAllowed: "",
    dropEffect: "",
    setData: (t: string, v: string) => (dados[t] = v),
    getData: (t: string) => dados[t] ?? "",
  };
}
function evento(tipo: string, dt: ReturnType<typeof fakeDataTransfer>, clientX = 500): Event {
  const ev = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: dt });
  Object.defineProperty(ev, "clientX", { value: clientX });
  return ev;
}

function mockPonteiro(fino: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (q: string) =>
      ({ matches: q.includes("pointer: fine") ? fino : false, media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
}

describe("arrastar (HTML5 DnD) no quadro", () => {
  function quadro(processos: Processo[], onMover: (p: Processo, para: StatusProcesso) => void, movendo = new Set<string>()) {
    return montar(defineComponent({ setup: () => () => h(ProcessoKanban, { processos, movendo, onMover }) }));
  }

  beforeEach(() => mockPonteiro(true));

  it("mouse: card draggable; soltar em outra coluna pede a mudança (mover) — nada é gravado aqui", async () => {
    const mover = vi.fn();
    const el = quadro([proc("a", { status: "em_transito" })], mover);
    await nextTick();
    const card = el.querySelector<HTMLElement>("#processo-card-a")!;
    expect(card.getAttribute("draggable")).toBe("true");

    const dt = fakeDataTransfer();
    card.dispatchEvent(evento("dragstart", dt));
    const alvo = el.querySelector<HTMLElement>("#kanban-coluna-desembaraco")!;
    alvo.dispatchEvent(evento("dragenter", dt));
    alvo.dispatchEvent(evento("dragover", dt));
    await nextTick();
    const corpo = el.querySelector<HTMLElement>("#kanban-lista-desembaraco")!;
    expect(corpo.className).toContain("bg-farm-blue-soft");
    expect(alvo.className).toContain("outline-accent-dark");
    alvo.dispatchEvent(evento("drop", dt));
    await nextTick();
    expect(mover).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "desembaraco");
    expect(corpo.className).not.toContain("bg-farm-blue-soft");
  });

  it("soltar na MESMA coluna não faz nada (e a coluna de origem nunca fica destacada)", async () => {
    const mover = vi.fn();
    const el = quadro([proc("a", { status: "em_transito" })], mover);
    await nextTick();
    const dt = fakeDataTransfer();
    el.querySelector("#processo-card-a")!.dispatchEvent(evento("dragstart", dt));
    const origem = el.querySelector<HTMLElement>("#kanban-coluna-em-transito")!;
    origem.dispatchEvent(evento("dragenter", dt));
    await nextTick();
    expect(el.querySelector("#kanban-lista-em-transito")!.className).not.toContain("bg-farm-blue-soft");
    origem.dispatchEvent(evento("drop", dt));
    expect(mover).not.toHaveBeenCalled();
  });

  it("destaque sem piscar: entrar num filho e sair de outro mantém a coluna destacada até sair de tudo", async () => {
    const el = quadro([proc("a", { status: "em_transito" }), proc("b", { status: "liberado" })], vi.fn());
    await nextTick();
    const dt = fakeDataTransfer();
    el.querySelector("#processo-card-a")!.dispatchEvent(evento("dragstart", dt));
    const alvo = el.querySelector<HTMLElement>("#kanban-coluna-liberado")!;
    alvo.dispatchEvent(evento("dragenter", dt)); // entra na coluna
    el.querySelector("#processo-card-b")!.dispatchEvent(evento("dragenter", dt)); // entra no card (borbulha)
    alvo.dispatchEvent(new Event("dragleave", { bubbles: true })); // sai da coluna para o card
    await nextTick();
    const corpo = el.querySelector("#kanban-lista-liberado")!;
    expect(corpo.className).toContain("bg-farm-blue-soft");
    alvo.dispatchEvent(new Event("dragleave", { bubbles: true })); // sai de vez
    await nextTick();
    expect(corpo.className).not.toContain("bg-farm-blue-soft");
  });

  it("card 'movendo' não arrasta e fica travado", async () => {
    const el = quadro([proc("a")], vi.fn(), new Set(["a"]));
    await nextTick();
    const card = el.querySelector<HTMLElement>("#processo-card-a")!;
    expect(card.getAttribute("draggable")).toBeNull();
    expect(card.getAttribute("aria-busy")).toBe("true");
    expect(texto(el.querySelector("#card-movendo-a"))).toBe("Movendo…");
    expect(card.getAttribute("aria-disabled")).toBe("true");
  });

  it("toque (sem ponteiro fino): o arrastar fica desligado; o card continua abrindo o painel (onde está o menu)", async () => {
    mockPonteiro(false);
    const abrir = vi.fn();
    const el = montar(
      defineComponent({ setup: () => () => h(ProcessoKanban, { processos: [proc("a")], onAbrir: abrir }) }),
    );
    await nextTick();
    const card = el.querySelector<HTMLElement>("#processo-card-a")!;
    expect(card.getAttribute("draggable")).toBeNull();
    card.click();
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("card: o próprio <article> é arrastável e é o controle (role=button); nenhum <button> dentro (Firefox arrasta)", async () => {
    const el = quadro([proc("a")], vi.fn());
    await nextTick();
    const art = el.querySelector("#processo-card-a")!;
    expect(art.getAttribute("draggable")).toBe("true");
    expect(art.getAttribute("role")).toBe("button");
    expect(art.querySelectorAll("button")).toHaveLength(0);
    expect(el.querySelector("[id^='btn-mover-card-']")).toBeNull(); // o "Mover para…" saiu do card
  });
});

// ── Menu "Mover para…" por teclado ──────────────────────────────────────────────────────────────────
describe("menu 'Mover para…'", () => {
  it("lista as outras 4 colunas como menuitems; setas movem o foco; escolher emite mover; Esc fecha e volta o foco", async () => {
    const mover = vi.fn();
    const el = montar(
      defineComponent({ setup: () => () => h(ProcessoMoverMenu, { processo: proc("a"), onMover: mover }) }),
    );
    const trigger = el.querySelector<HTMLButtonElement>("#btn-mover-painel-a")!;
    expect(trigger.getAttribute("aria-label")).toBe("Mover Paciente a para…");
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");
    trigger.click();
    await nextTick();
    await nextTick();
    const menu = document.querySelector<HTMLElement>("#menu-mover-painel-a")!;
    expect(menu.getAttribute("role")).toBe("menu");
    const itens = [...menu.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];
    expect(itens.map(texto)).toEqual(["Na origem", "Desembaraço", "Liberado", "Entregue"]);
    expect(document.activeElement).toBe(itens[0]);

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(itens[1]);

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.querySelector("#menu-mover-painel-a")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    await nextTick();
    await nextTick();
    document.querySelector<HTMLButtonElement>("#mover-painel-a-liberado")!.click();
    expect(mover).toHaveBeenCalledWith("liberado");
  });

  it("no painel: etiqueta do status atual + menu com texto, cuja lista abre ACIMA do painel (z-890 > 880)", async () => {
    const mover = vi.fn();
    montar(
      defineComponent({
        setup: () => () => h(ProcessoPainel, { processo: proc("a", { status: "liberado" }), onMover: mover }),
      }),
    );
    expect(texto(document.querySelector("#painel-status"))).toBe("Liberado");
    expect(document.querySelector("#painel-status")!.className).toContain("bg-green-100");
    const trigger = document.querySelector<HTMLButtonElement>("#btn-mover-painel-a")!;
    expect(texto(trigger)).toBe("Mover para…");
    trigger.click();
    await nextTick();
    await nextTick();
    const menu = document.querySelector<HTMLElement>("#menu-mover-painel-a")!;
    expect(menu.className).toContain("z-[890]");
    document.querySelector<HTMLButtonElement>("#mover-painel-a-entregue")!.click();
    expect(mover).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "entregue");
  });

  it("painel 'movendo': o menu dá lugar a 'Movendo…'", () => {
    montar(defineComponent({ setup: () => () => h(ProcessoPainel, { processo: proc("a"), movendo: true }) }));
    expect(document.querySelector("#btn-mover-painel-a")).toBeNull();
    expect(texto(document.querySelector("#painel-movendo"))).toBe("Movendo…");
  });
});

// ── Fluxo único: confirmar / cancelar / 409 / falha ─────────────────────────────────────────────────
describe("useMoverProcesso", () => {
  function criar(over: Partial<Parameters<typeof useMoverProcesso>[0]> = {}) {
    const store = new Map<string, Processo>([["a", proc("a", { status: "em_transito", updatedAt: "v1" })]]);
    const deps = {
      podeEditar: () => true,
      obter: (id: string) => store.get(id),
      mover: vi.fn(async (id: string, status: StatusProcesso) => {
        const novo = { ...store.get(id)!, status, updatedAt: "v2" };
        store.set(id, novo);
        return novo;
      }),
      recarregar: vi.fn(async () => {}),
      toast: vi.fn(),
      ...over,
    };
    return { deps, store, api: useMoverProcesso(deps) };
  }

  it("pedir abre a confirmação com o texto; cancelar fecha sem chamar o servidor", () => {
    const { api, deps, store } = criar();
    api.pedir(store.get("a")!, "desembaraco");
    expect(api.pedido.value?.mensagem).toBe(
      "Mover «Paciente a» de Em trânsito para Desembaraço? A mudança fica registrada nas atualizações e o consultor é avisado.",
    );
    api.cancelar();
    expect(api.pedido.value).toBeNull();
    expect(deps.mover).not.toHaveBeenCalled();
  });

  it("mesma coluna ou sem permissão: nem abre a confirmação", () => {
    const { api, store } = criar();
    api.pedir(store.get("a")!, "em_transito");
    expect(api.pedido.value).toBeNull();
    const semPermissao = criar({ podeEditar: () => false });
    semPermissao.api.pedir(semPermissao.store.get("a")!, "liberado");
    expect(semPermissao.api.pedido.value).toBeNull();
  });

  it("confirmar: trava o card até a resposta, manda { status, versao = updatedAt da tela }, toast e anúncio", async () => {
    let liberar!: () => void;
    const { api, deps, store } = criar();
    deps.mover.mockImplementationOnce(
      (id: string, status: StatusProcesso) =>
        new Promise<Processo>((r) => {
          liberar = () => r({ ...store.get(id)!, status, updatedAt: "v2" });
        }),
    );
    api.pedir(store.get("a")!, "liberado");
    const promessa = api.confirmar();
    expect(api.pedido.value).toBeNull(); // a confirmação fecha na hora
    expect(api.movendo.has("a")).toBe(true); // travado, sem atualização otimista
    await Promise.resolve();
    expect(deps.mover).toHaveBeenCalledWith("a", "liberado", "v1");
    liberar();
    await promessa;
    expect(api.movendo.has("a")).toBe(false);
    expect(deps.toast).toHaveBeenCalledWith("Processo movido para Liberado");
    expect(api.anuncio.value).toBe("Paciente a movido para Liberado.");
  });

  it("a versão é a do processo como está no store NA HORA (recarregado depois do pedido)", async () => {
    const { api, deps, store } = criar();
    api.pedir(store.get("a")!, "liberado");
    store.set("a", { ...store.get("a")!, updatedAt: "v-recarregada" });
    await api.confirmar();
    expect(deps.mover).toHaveBeenCalledWith("a", "liberado", "v-recarregada");
  });

  it("409: recarrega o processo e avisa; o card destrava", async () => {
    const { api, deps, store } = criar({
      mover: vi.fn(async () => {
        throw new ApiError("Este processo foi alterado por outra pessoa. Recarregue e tente de novo.", 409);
      }),
    });
    api.pedir(store.get("a")!, "liberado");
    await api.confirmar();
    expect(deps.recarregar).toHaveBeenCalledWith("a");
    expect(deps.toast).toHaveBeenCalledWith(MENSAGEM_MOVER_CONFLITO);
    expect(MENSAGEM_MOVER_CONFLITO).toBe("Este processo foi alterado por outra pessoa. Confira e tente de novo.");
    expect(api.anuncio.value).toBe(MENSAGEM_MOVER_CONFLITO);
    expect(api.movendo.has("a")).toBe(false);
  });

  it("outra falha: toast com a mensagem do servidor; não recarrega; o card fica onde estava", async () => {
    const { api, deps, store } = criar({
      mover: vi.fn(async () => {
        throw new ApiError("Sem permissão para esta operação.", 403);
      }),
    });
    api.pedir(store.get("a")!, "liberado");
    await api.confirmar();
    expect(deps.recarregar).not.toHaveBeenCalled();
    expect(deps.toast).toHaveBeenCalledWith("Sem permissão para esta operação.");
    expect(store.get("a")!.status).toBe("em_transito");
    expect(api.movendo.has("a")).toBe(false);
  });

  it("enquanto move, um novo pedido do mesmo processo é ignorado; pedidos confirmados são serializados por processo", async () => {
    const ordem: string[] = [];
    const { api, store } = criar({
      mover: vi.fn(async (id: string, status: StatusProcesso) => {
        ordem.push(`inicio-${status}`);
        await new Promise((r) => setTimeout(r, 5));
        ordem.push(`fim-${status}`);
        return { ...store.get(id)!, status };
      }),
    });
    api.pedir(store.get("a")!, "liberado");
    const p1 = api.confirmar();
    api.pedir(store.get("a")!, "entregue");
    expect(api.pedido.value).toBeNull(); // travado: ignora
    await p1;
    expect(ordem).toEqual(["inicio-liberado", "fim-liberado"]);
  });
});
