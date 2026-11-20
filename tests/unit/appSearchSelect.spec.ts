// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import AppSearchSelect, { type OpcaoBusca } from "../../app/components/AppSearchSelect.vue";

// AppSearchSelect no happy-dom, com timers falsos: debounce de 250 ms, resposta fora de ordem, teclado, "Usar “texto”" e acessibilidade.
// Dados fictícios (TESTE).

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const montados: Array<() => void> = [];
afterEach(() => {
  while (montados.length) montados.pop()!();
});

type Buscar = (q: string, sinal: AbortSignal) => Promise<OpcaoBusca[]>;

interface Eventos {
  escolher: OpcaoBusca[];
  novo: string[];
  limpar: number;
  digitar: string[];
}

function montar(buscar: Buscar, extra: { modelValue?: string; permitirNovo?: boolean; disabled?: boolean; rotuloNovo?: (t: string) => string } = {}) {
  const ev: Eventos = { escolher: [], novo: [], limpar: 0, digitar: [] };
  const valor = ref(extra.modelValue ?? "");
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(AppSearchSelect, {
          id: "busca-teste",
          modelValue: valor.value,
          buscar,
          permitirNovo: extra.permitirNovo ?? false,
          disabled: extra.disabled ?? false,
          ...(extra.rotuloNovo ? { rotuloNovo: extra.rotuloNovo } : {}),
          onEscolher: (o: OpcaoBusca) => {
            ev.escolher.push(o);
            valor.value = o.rotulo;
          },
          onNovo: (t: string) => ev.novo.push(t),
          onLimpar: () => (ev.limpar += 1),
          onDigitar: (t: string) => ev.digitar.push(t),
        }),
    }),
  );
  app.mount(el);
  montados.push(() => {
    app.unmount();
    el.remove();
  });
  return { ev, valor };
}

const input = () => document.querySelector<HTMLInputElement>("#busca-teste")!;
const lista = () => document.querySelector<HTMLElement>("#busca-teste-listbox");
const opcoes = () => [...document.querySelectorAll<HTMLElement>("[role=option]")];
const textos = () => opcoes().map((o) => (o.textContent ?? "").trim());

async function digitar(texto: string): Promise<void> {
  input().focus();
  input().value = texto;
  input().dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}
async function tecla(key: string): Promise<KeyboardEvent> {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  input().dispatchEvent(e);
  await nextTick();
  return e;
}
const avancar = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await nextTick();
};

const ACHADOS: OpcaoBusca[] = [
  { valor: "med_1", rotulo: "DIPIRONA TESTE", extra: { temperatura: "Ambiente" } },
  { valor: "med_2", rotulo: "DIPIRONA GOTAS TESTE" },
];
const buscaSimples = (): ReturnType<typeof vi.fn<Buscar>> => vi.fn<Buscar>(async () => ACHADOS);

describe("debounce de 250 ms e o mínimo de 1 caractere", () => {
  it("só busca 250 ms depois da última tecla (uma busca só para várias teclas)", async () => {
    const buscar = buscaSimples();
    montar(buscar);
    await digitar("d");
    await avancar(200);
    await digitar("di");
    await avancar(200);
    await digitar("dip");
    await avancar(249);
    expect(buscar).not.toHaveBeenCalled();
    await avancar(1);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar.mock.calls[0]![0]).toBe("dip");
    expect(textos()).toEqual(["DIPIRONA TESTE", "DIPIRONA GOTAS TESTE"]);
  });

  it("campo vazio (ou só espaços) não busca e fecha a lista", async () => {
    const buscar = buscaSimples();
    montar(buscar);
    await digitar("   ");
    await avancar(1000);
    expect(buscar).not.toHaveBeenCalled();
    expect(lista()).toBeNull();
    await digitar("d");
    await avancar(250);
    expect(lista()).not.toBeNull();
    await digitar("");
    expect(lista()).toBeNull();
  });

  it("o texto vai normalizado (espaços repetidos viram um) para a busca", async () => {
    const buscar = buscaSimples();
    montar(buscar);
    await digitar("  dipi    rona ");
    await avancar(250);
    expect(buscar.mock.calls[0]![0]).toBe("dipi rona");
  });

  it("'Carregando…' enquanto espera (um só caractere de reticências) e 'Nada encontrado' sem resultado", async () => {
    let soltar: (r: OpcaoBusca[]) => void = () => undefined;
    const buscar = vi.fn<Buscar>(() => new Promise<OpcaoBusca[]>((r) => (soltar = r)));
    montar(buscar);
    await digitar("x");
    expect(lista()!.textContent).toContain("Carregando…");
    await avancar(250);
    expect(lista()!.textContent).toContain("Carregando…");
    soltar([]);
    await avancar(0);
    expect(lista()!.textContent).toContain("Nada encontrado");
    expect(lista()!.textContent).not.toContain("Carregando");
  });

  it("falha na busca: 'Não foi possível buscar.' (e nada trava)", async () => {
    montar(vi.fn<Buscar>(async () => {
      throw new Error("rede");
    }));
    await digitar("x");
    await avancar(250);
    expect(lista()!.textContent).toContain("Não foi possível buscar.");
  });
});

describe("resposta fora de ordem", () => {
  it("a resposta da busca ANTIGA, que chega depois, não sobrescreve a mais recente", async () => {
    const pendentes: Array<{ q: string; soltar: (r: OpcaoBusca[]) => void; sinal: AbortSignal }> = [];
    const buscar = vi.fn<Buscar>((q, sinal) => new Promise<OpcaoBusca[]>((r) => pendentes.push({ q, soltar: r, sinal })));
    montar(buscar);
    await digitar("a");
    await avancar(250); // busca 1 sai
    await digitar("ab");
    await avancar(250); // busca 2 sai
    expect(pendentes.map((p) => p.q)).toEqual(["a", "ab"]);
    expect(pendentes[0]!.sinal.aborted).toBe(true); // a antiga foi cancelada
    pendentes[1]!.soltar([{ valor: "novo", rotulo: "RESPOSTA DA BUSCA NOVA" }]);
    await avancar(0);
    pendentes[0]!.soltar([{ valor: "velho", rotulo: "RESPOSTA DA BUSCA VELHA" }]); // chega atrasada
    await avancar(0);
    expect(textos()).toEqual(["RESPOSTA DA BUSCA NOVA"]);
  });

  it("a antiga chegando ANTES da nova também não vale quando já há uma mais nova em curso", async () => {
    const pendentes: Array<{ soltar: (r: OpcaoBusca[]) => void }> = [];
    montar(vi.fn<Buscar>(() => new Promise<OpcaoBusca[]>((r) => pendentes.push({ soltar: r }))));
    await digitar("a");
    await avancar(250);
    await digitar("ab");
    await avancar(250);
    pendentes[0]!.soltar([{ valor: "velho", rotulo: "VELHA" }]);
    await avancar(0);
    expect(textos()).toEqual([]);
    expect(lista()!.textContent).toContain("Carregando…");
    pendentes[1]!.soltar([{ valor: "novo", rotulo: "NOVA" }]);
    await avancar(0);
    expect(textos()).toEqual(["NOVA"]);
  });
});

describe("teclado", () => {
  it("setas movem o destaque (aria-activedescendant) e Enter escolhe o destacado", async () => {
    const { ev } = montar(buscaSimples());
    await digitar("dip");
    await avancar(250);
    await tecla("ArrowDown");
    expect(input().getAttribute("aria-activedescendant")).toBe("busca-teste-opcao-0");
    await tecla("ArrowDown");
    expect(input().getAttribute("aria-activedescendant")).toBe("busca-teste-opcao-1");
    await tecla("ArrowDown"); // para na última
    expect(input().getAttribute("aria-activedescendant")).toBe("busca-teste-opcao-1");
    await tecla("ArrowUp");
    expect(input().getAttribute("aria-activedescendant")).toBe("busca-teste-opcao-0");
    await tecla("Enter");
    expect(ev.escolher.map((o) => o.valor)).toEqual(["med_1"]);
    expect(lista()).toBeNull();
    expect(input().value).toBe("DIPIRONA TESTE");
  });

  it("Enter SEM destaque escolhe a 1ª sugestão", async () => {
    const { ev } = montar(buscaSimples());
    await digitar("dip");
    await avancar(250);
    const e = await tecla("Enter");
    expect(e.defaultPrevented).toBe(true);
    expect(ev.escolher.map((o) => o.valor)).toEqual(["med_1"]);
  });

  it("Enter SEM destaque e sem sugestão usa o texto (com permitirNovo)", async () => {
    const { ev } = montar(vi.fn<Buscar>(async () => []), { permitirNovo: true });
    await digitar("TESTE MED NOVO");
    await avancar(250);
    await tecla("Enter");
    expect(ev.novo).toEqual(["TESTE MED NOVO"]);
    expect(ev.escolher).toEqual([]);
  });

  it("Enter antes de a busca voltar ESPERA o resultado (não vira 'Usar X' por pressa)", async () => {
    let soltar: (r: OpcaoBusca[]) => void = () => undefined;
    const { ev } = montar(vi.fn<Buscar>(() => new Promise<OpcaoBusca[]>((r) => (soltar = r))), { permitirNovo: true });
    await digitar("dip");
    await tecla("Enter"); // ainda no debounce
    expect(ev.novo).toEqual([]);
    soltar(ACHADOS);
    await avancar(0);
    expect(ev.escolher.map((o) => o.valor)).toEqual(["med_1"]);
    expect(ev.novo).toEqual([]);
  });

  it("Esc fecha a lista sem escolher", async () => {
    const { ev } = montar(buscaSimples());
    await digitar("dip");
    await avancar(250);
    expect(lista()).not.toBeNull();
    await tecla("Escape");
    expect(lista()).toBeNull();
    expect(ev.escolher).toEqual([]);
  });

  it("Tab sai SEM escolher (fecha a lista; sem permitirNovo o campo volta ao valor de antes)", async () => {
    const { ev } = montar(buscaSimples(), { modelValue: "VALOR ANTIGO" });
    await digitar("dip");
    await avancar(250);
    await tecla("Tab");
    expect(lista()).toBeNull();
    expect(ev.escolher).toEqual([]);
    input().dispatchEvent(new FocusEvent("blur"));
    await nextTick();
    expect(input().value).toBe("VALOR ANTIGO");
    expect(ev.novo).toEqual([]);
  });

  it("clicar numa sugestão escolhe (mousedown, para o campo não perder o foco antes)", async () => {
    const { ev } = montar(buscaSimples());
    await digitar("dip");
    await avancar(250);
    opcoes()[1]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(ev.escolher.map((o) => o.valor)).toEqual(["med_2"]);
  });

  it("a escolha devolve o `extra` (ex.: a temperatura)", async () => {
    const { ev } = montar(buscaSimples());
    await digitar("dip");
    await avancar(250);
    await tecla("Enter");
    expect(ev.escolher[0]!.extra).toEqual({ temperatura: "Ambiente" });
  });
});

describe("opção 'Usar “texto”' (permitirNovo)", () => {
  it("aparece por último, com o texto digitado; escolher avisa `novo`", async () => {
    const { ev } = montar(buscaSimples(), { permitirNovo: true });
    await digitar("  TESTE   MED  ");
    await avancar(250);
    expect(textos()).toEqual(["DIPIRONA TESTE", "DIPIRONA GOTAS TESTE", "Usar “TESTE MED”"]);
    opcoes()[2]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(ev.novo).toEqual(["TESTE MED"]);
  });

  it("rótulo personalizado (ex.: '… (fora do Cadastro)')", async () => {
    montar(vi.fn<Buscar>(async () => []), { permitirNovo: true, rotuloNovo: (t) => `Usar “${t}” (fora do Cadastro)` });
    await digitar("XYZ");
    await avancar(250);
    expect(textos()).toEqual(["Usar “XYZ” (fora do Cadastro)"]);
  });

  it("não aparece quando o texto é exatamente uma das sugestões (sem diferença de caixa)", async () => {
    montar(buscaSimples(), { permitirNovo: true });
    await digitar("dipirona teste");
    await avancar(250);
    expect(textos()).toEqual(["DIPIRONA TESTE", "DIPIRONA GOTAS TESTE"]);
  });

  it("sem permitirNovo a opção não existe", async () => {
    montar(vi.fn<Buscar>(async () => []));
    await digitar("XYZ");
    await avancar(250);
    expect(textos()).toEqual([]);
    expect(document.querySelector("[data-opcao-novo]")).toBeNull();
  });

  it("sair do campo com texto sem escolher, com permitirNovo, aplica a mesma regra ('novo')", async () => {
    const { ev } = montar(buscaSimples(), { modelValue: "", permitirNovo: true });
    await digitar("TESTE MED SOLTO");
    await avancar(250);
    input().dispatchEvent(new FocusEvent("blur"));
    await nextTick();
    expect(ev.novo).toEqual(["TESTE MED SOLTO"]);
  });

  it("sair sem mexer (texto igual ao valor) não avisa nada; sair com o campo esvaziado avisa `limpar`", async () => {
    const { ev } = montar(buscaSimples(), { modelValue: "DIPIRONA TESTE", permitirNovo: true });
    input().focus();
    input().dispatchEvent(new FocusEvent("blur"));
    await nextTick();
    expect(ev.novo).toEqual([]);
    expect(ev.limpar).toBe(0);
    await digitar("");
    input().dispatchEvent(new FocusEvent("blur"));
    await nextTick();
    expect(ev.limpar).toBe(1);
  });
});

describe("acessibilidade e desabilitado", () => {
  it("combobox/listbox/option com os atributos ARIA", async () => {
    montar(buscaSimples());
    const campo = input();
    expect(campo.getAttribute("role")).toBe("combobox");
    expect(campo.getAttribute("aria-autocomplete")).toBe("list");
    expect(campo.getAttribute("aria-expanded")).toBe("false");
    await digitar("dip");
    await avancar(250);
    expect(campo.getAttribute("aria-expanded")).toBe("true");
    expect(campo.getAttribute("aria-controls")).toBe("busca-teste-listbox");
    expect(lista()!.getAttribute("role")).toBe("listbox");
    expect(lista()!.id).toBe("busca-teste-listbox");
    expect(opcoes().map((o) => o.id)).toEqual(["busca-teste-opcao-0", "busca-teste-opcao-1"]);
    await tecla("ArrowDown");
    expect(opcoes()[0]!.getAttribute("aria-selected")).toBe("true");
    expect(opcoes()[1]!.getAttribute("aria-selected")).toBe("false");
  });

  it("desabilitado: o campo é desabilitado, não busca e não abre", async () => {
    const buscar = buscaSimples();
    montar(buscar, { disabled: true });
    expect(input().disabled).toBe(true);
    input().value = "dip";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    await avancar(1000);
    await tecla("ArrowDown");
    expect(buscar).not.toHaveBeenCalled();
    expect(lista()).toBeNull();
  });

  it("segue a classe dos campos do app (13.5px no desktop, 16px no celular)", () => {
    montar(buscaSimples());
    expect(input().className).toContain("lg:text-[13.5px]");
    expect(input().className).toContain("text-[16px]");
    expect(input().className).toContain("min-h-11");
  });

  it("quando o valor de fora muda (outra compra, escolha aplicada), o campo mostra o novo texto", async () => {
    const { valor } = montar(buscaSimples(), { modelValue: "A" });
    expect(input().value).toBe("A");
    valor.value = "B";
    await nextTick();
    expect(input().value).toBe("B");
  });
});
