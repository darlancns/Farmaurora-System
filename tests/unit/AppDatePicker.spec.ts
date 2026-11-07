// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type Ref } from "vue";
import AppDatePicker from "../../app/components/AppDatePicker.vue";

// O calendário próprio montado no happy-dom. "Hoje" fixo: 07/11/2026 (sábado), horário de Brasília. Em vez de
// congelar o relógio (um Date parado faz o Vue ignorar o 2º listener de um mesmo evento), troca-se só hojeBrasilia.
vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

type Janela = Window & { happyDOM: { setViewport(v: { width: number; height: number }): void } };
const janela = () => window as unknown as Janela;

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

interface Opcoes {
  valor?: string;
  formato?: "dd/mm" | "iso";
  min?: string;
  max?: string;
  disabled?: boolean;
}

function montar(opcoes: Opcoes = {}): { valor: Ref<string>; emitidos: string[]; el: HTMLElement } {
  const valor = ref(opcoes.valor ?? "");
  const emitidos: string[] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(AppDatePicker, {
          id: "dp",
          label: "Embarque",
          modelValue: valor.value,
          formato: opcoes.formato ?? "dd/mm",
          min: opcoes.min,
          max: opcoes.max,
          disabled: opcoes.disabled,
          "onUpdate:modelValue": (v: string) => {
            emitidos.push(v);
            valor.value = v;
          },
        }),
    }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return { valor, emitidos, el };
}

const botao = () => document.getElementById("dp") as HTMLButtonElement;
const painel = () => document.getElementById("dp-calendario");
const dia = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`);
const acao = (nome: string) => document.querySelector<HTMLButtonElement>(`[data-acao="${nome}"]`);
const tecla = (alvo: Element, key: string, init: KeyboardEventInit = {}) =>
  alvo.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));

async function abrir(): Promise<void> {
  botao().click();
  await nextTick();
  await nextTick();
}

beforeEach(() => {
  janela().happyDOM.setViewport({ width: 1280, height: 800 });
});

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.style.overflow = "";
});

describe("abrir, fechar e foco", () => {
  it("o campo não é digitável: é um botão com ícone, e o painel só existe aberto", async () => {
    montar();
    expect(botao().tagName).toBe("BUTTON");
    expect(document.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(painel()).toBeNull();

    await abrir();
    expect(painel()).not.toBeNull();
    expect(painel()!.getAttribute("role")).toBe("dialog");
    expect(painel()!.getAttribute("aria-label")).toBe("Embarque");
    expect(botao().getAttribute("aria-expanded")).toBe("true");
    expect(painel()!.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(botao().querySelector("svg")).not.toBeNull();
  });

  it("clicar no campo de novo fecha", async () => {
    montar();
    await abrir();
    botao().click();
    await nextTick();
    expect(painel()).toBeNull();
  });

  it("Esc fecha e devolve o foco ao campo", async () => {
    montar();
    await abrir();
    expect(painel()!.contains(document.activeElement)).toBe(true); // o foco entra no calendário
    tecla(document.activeElement!, "Escape");
    await nextTick();
    await nextTick();
    expect(painel()).toBeNull();
    expect(document.activeElement).toBe(botao());
  });

  it("Esc NÃO chega ao documento (um modal com Esc em document não fecha junto)", async () => {
    montar();
    const noDocumento = vi.fn();
    document.addEventListener("keydown", noDocumento);
    await abrir();
    tecla(document.activeElement!, "Escape");
    await nextTick();
    document.removeEventListener("keydown", noDocumento);
    expect(noDocumento).not.toHaveBeenCalled();
    expect(painel()).toBeNull();
  });

  it("clicar fora (na camada) fecha sem alterar o valor", async () => {
    const { emitidos } = montar({ valor: "05/08" });
    await abrir();
    document.getElementById("dp-calendario-camada")!.click();
    await nextTick();
    expect(painel()).toBeNull();
    expect(emitidos).toEqual([]);
  });

  it("ArrowDown no campo abre", async () => {
    montar();
    tecla(botao(), "ArrowDown");
    await nextTick();
    expect(painel()).not.toBeNull();
  });

  it("desabilitado: não abre", async () => {
    montar({ disabled: true });
    botao().click();
    await nextTick();
    expect(painel()).toBeNull();
  });

  it("abre no mês de hoje, com hoje marcado e destacado (valor vazio)", async () => {
    montar();
    await abrir();
    expect(document.querySelector('[data-acao="mes"]')!.textContent!.trim()).toBe("Novembro");
    expect(document.querySelector('[data-acao="ano"]')!.textContent!.trim()).toBe("2026");
    expect(dia("2026-11-07")!.getAttribute("aria-current")).toBe("date");
    expect(dia("2026-11-07")!.getAttribute("aria-label")).toBe("7 de novembro de 2026");
    expect(dia("2026-11-06")!.getAttribute("aria-current")).toBeNull();
  });
});

describe("selecionar, hoje e limpar", () => {
  it("escolher um dia do ano corrente grava DD/MM e fecha o painel", async () => {
    const { emitidos } = montar();
    await abrir();
    dia("2026-11-10")!.click();
    await nextTick();
    expect(emitidos).toEqual(["10/11"]);
    expect(painel()).toBeNull();
    expect(botao().textContent).toContain("10/11");
  });

  it("escolher um dia de OUTRO ano grava DD/MM/AAAA", async () => {
    const { emitidos } = montar();
    await abrir();
    acao("mes-seguinte")!.click();
    acao("mes-seguinte")!.click(); // novembro → janeiro de 2027
    await nextTick();
    expect(document.querySelector('[data-acao="ano"]')!.textContent!.trim()).toBe("2027");
    dia("2027-01-03")!.click();
    await nextTick();
    expect(emitidos).toEqual(["03/01/2027"]);
  });

  it("dia esmaecido de outro mês também pode ser escolhido", async () => {
    const { emitidos } = montar();
    await abrir();
    dia("2026-12-02")!.click(); // aparece na grade de novembro, esmaecido
    await nextTick();
    expect(emitidos).toEqual(["02/12"]);
  });

  it("formato iso grava AAAA-MM-DD", async () => {
    const { emitidos } = montar({ formato: "iso", valor: "2026-11-05" });
    await abrir();
    expect(dia("2026-11-05")!.closest("[role=gridcell]")!.getAttribute("aria-selected")).toBe("true");
    dia("2026-11-03")!.click();
    await nextTick();
    expect(emitidos).toEqual(["2026-11-03"]);
    expect(botao().textContent).toContain("03/11/2026");
  });

  it("Hoje escolhe o dia de hoje (Brasília)", async () => {
    const { emitidos } = montar();
    await abrir();
    acao("hoje")!.click();
    await nextTick();
    expect(emitidos).toEqual(["07/11"]);
  });

  it("Limpar esvazia o campo (e fica desabilitado quando já está vazio)", async () => {
    const { emitidos, valor } = montar({ valor: "05/08" });
    await abrir();
    expect(acao("limpar")!.disabled).toBe(false);
    acao("limpar")!.click();
    await nextTick();
    expect(emitidos).toEqual([""]);
    expect(valor.value).toBe("");

    await abrir();
    expect(acao("limpar")!.disabled).toBe(true);
  });

  it("a data já gravada vem selecionada, no mês certo", async () => {
    montar({ valor: "05/08/2025" });
    await abrir();
    expect(document.querySelector('[data-acao="mes"]')!.textContent!.trim()).toBe("Agosto");
    expect(document.querySelector('[data-acao="ano"]')!.textContent!.trim()).toBe("2025");
    expect(dia("2025-08-05")!.closest("[role=gridcell]")!.getAttribute("aria-selected")).toBe("true");
  });
});

describe("limites (max = hoje, como no pagamento realizado)", () => {
  it("dias depois do máximo ficam desabilitados e não selecionam", async () => {
    const { emitidos } = montar({ formato: "iso", valor: "2026-11-05", max: "2026-11-07" });
    await abrir();
    expect(dia("2026-11-07")!.disabled).toBe(false);
    expect(dia("2026-11-08")!.disabled).toBe(true);
    dia("2026-11-08")!.click();
    await nextTick();
    expect(emitidos).toEqual([]);
    expect(painel()).not.toBeNull();
  });

  it("o mês seguinte fica bloqueado quando está inteiro depois do máximo", async () => {
    montar({ formato: "iso", valor: "2026-11-05", max: "2026-11-07" });
    await abrir();
    expect(acao("mes-seguinte")!.disabled).toBe(true);
    expect(acao("mes-anterior")!.disabled).toBe(false);
  });

  it("o teclado não passa do máximo", async () => {
    montar({ formato: "iso", valor: "2026-11-07", max: "2026-11-07" });
    await abrir();
    tecla(document.activeElement!, "ArrowRight");
    await nextTick();
    expect((document.activeElement as HTMLElement).dataset.iso).toBe("2026-11-07");
    tecla(document.activeElement!, "PageDown");
    await nextTick();
    expect((document.activeElement as HTMLElement).dataset.iso).toBe("2026-11-07");
  });

  it("Hoje fica desabilitado se hoje está fora do intervalo", async () => {
    montar({ formato: "iso", min: "2026-12-01" });
    await abrir();
    expect(acao("hoje")!.disabled).toBe(true);
  });
});

describe("teclado", () => {
  it("setas movem entre os dias; Home/End vão ao começo/fim da semana", async () => {
    montar();
    await abrir();
    const foco = () => (document.activeElement as HTMLElement).dataset.iso;
    expect(foco()).toBe("2026-11-07"); // começa em hoje

    tecla(document.activeElement!, "ArrowLeft");
    await nextTick();
    expect(foco()).toBe("2026-11-06");

    tecla(document.activeElement!, "ArrowDown");
    await nextTick();
    expect(foco()).toBe("2026-11-13");

    tecla(document.activeElement!, "ArrowUp");
    await nextTick();
    expect(foco()).toBe("2026-11-06");

    tecla(document.activeElement!, "Home");
    await nextTick();
    expect(foco()).toBe("2026-11-01"); // domingo

    tecla(document.activeElement!, "End");
    await nextTick();
    expect(foco()).toBe("2026-11-07"); // sábado
  });

  it("atravessar o fim do mês troca o mês exibido", async () => {
    montar({ valor: "30/11" });
    await abrir();
    tecla(document.activeElement!, "ArrowRight");
    await nextTick();
    await nextTick();
    expect((document.activeElement as HTMLElement).dataset.iso).toBe("2026-12-01");
    expect(document.querySelector('[data-acao="mes"]')!.textContent!.trim()).toBe("Dezembro");
  });

  it("PageUp/PageDown mudam o mês; Shift muda o ano", async () => {
    montar();
    await abrir();
    const foco = () => (document.activeElement as HTMLElement).dataset.iso;

    tecla(document.activeElement!, "PageDown");
    await nextTick();
    await nextTick();
    expect(foco()).toBe("2026-12-07");
    expect(document.querySelector('[data-acao="mes"]')!.textContent!.trim()).toBe("Dezembro");

    tecla(document.activeElement!, "PageUp");
    await nextTick();
    await nextTick();
    expect(foco()).toBe("2026-11-07");

    tecla(document.activeElement!, "PageUp", { shiftKey: true });
    await nextTick();
    await nextTick();
    expect(foco()).toBe("2025-11-07");
    expect(document.querySelector('[data-acao="ano"]')!.textContent!.trim()).toBe("2025");
  });

  it("Enter seleciona o dia com foco", async () => {
    const { emitidos } = montar();
    await abrir();
    tecla(document.activeElement!, "ArrowRight"); // 08/11
    await nextTick();
    tecla(document.activeElement!, "Enter");
    await nextTick();
    expect(emitidos).toEqual(["08/11"]);
    expect(painel()).toBeNull();
  });

  it("só o dia com foco entra na ordem de Tab (foco itinerante)", async () => {
    montar();
    await abrir();
    const comTab = Array.from(document.querySelectorAll<HTMLElement>("[data-iso]")).filter((b) => b.tabIndex === 0);
    expect(comTab.map((b) => b.dataset.iso)).toEqual(["2026-11-07"]);
  });

  it("Tab não escapa do painel (foco preso, como em um diálogo modal)", async () => {
    montar({ valor: "05/08" });
    await abrir();
    const focaveis = Array.from(painel()!.querySelectorAll<HTMLElement>("button:not([disabled])")).filter((b) => b.tabIndex >= 0);
    const ultimo = focaveis[focaveis.length - 1]!;
    ultimo.focus();
    tecla(ultimo, "Tab");
    expect(document.activeElement).toBe(focaveis[0]);
    tecla(focaveis[0]!, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it("estrutura de acessibilidade: dialog, grid, linhas, células, cabeçalhos de coluna em pt-BR", async () => {
    montar();
    await abrir();
    const grade = painel()!.querySelector("[role=grid]")!;
    expect(grade.getAttribute("aria-label")).toBe("Novembro de 2026");
    expect(grade.querySelectorAll("[role=columnheader]")).toHaveLength(7);
    expect(Array.from(grade.querySelectorAll("[role=columnheader]")).map((c) => c.getAttribute("aria-label"))[0]).toBe("domingo");
    expect(grade.querySelectorAll("[role=row]")).toHaveLength(7); // cabeçalho + 6 semanas
    expect(grade.querySelectorAll("[role=gridcell]")).toHaveLength(42);
    expect(acao("mes-anterior")!.getAttribute("aria-label")).toBe("Mês anterior");
    expect(acao("mes-seguinte")!.getAttribute("aria-label")).toBe("Próximo mês");
  });
});

describe("mês e ano", () => {
  it("escolher o ano e o mês pelo título", async () => {
    const { emitidos } = montar({ formato: "iso" });
    await abrir();

    acao("ano")!.click();
    await nextTick();
    expect(document.querySelector("[data-ano='2026']")).not.toBeNull();
    acao("anos-anteriores")!.click();
    await nextTick();
    document.querySelector<HTMLButtonElement>("[data-ano='2020']")!.click();
    await nextTick();
    expect(document.querySelector('[data-acao="ano"]')!.textContent!.trim()).toBe("2020");

    acao("mes")!.click();
    await nextTick();
    document.querySelector<HTMLButtonElement>("[data-mes='3']")!.click();
    await nextTick();
    expect(document.querySelector('[data-acao="mes"]')!.textContent!.trim()).toBe("Março");

    dia("2020-03-10")!.click();
    await nextTick();
    expect(emitidos).toEqual(["2020-03-10"]);
  });

  it("Esc na visão de meses/anos volta aos dias (não fecha o calendário)", async () => {
    montar();
    await abrir();
    acao("mes")!.click();
    await nextTick();
    expect(document.querySelector("[data-mes='3']")).not.toBeNull();
    await nextTick();
    expect(painel()!.contains(document.activeElement)).toBe(true); // o foco não se perde ao trocar de visão
    tecla(document.activeElement!, "Escape");
    await nextTick();
    await nextTick();
    expect(painel()).not.toBeNull();
    expect(dia("2026-11-07")).not.toBeNull();
    expect(painel()!.contains(document.activeElement)).toBe(true); // e volta para os dias
  });

  it("anos fora do intervalo ficam desabilitados", async () => {
    montar({ formato: "iso", valor: "2026-11-05", max: "2026-11-07" });
    await abrir();
    acao("ano")!.click();
    await nextTick();
    expect(document.querySelector<HTMLButtonElement>("[data-ano='2027']")!.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("[data-ano='2026']")!.disabled).toBe(false);
  });
});

describe("texto antigo (valor que não é uma data limpa)", () => {
  const ANTIGO = "13/10; deferido 14/10";

  it("o campo mostra o texto exatamente como está, com a marca 'antigo' e o texto completo no tooltip", () => {
    montar({ valor: ANTIGO });
    expect(botao().textContent).toContain(ANTIGO);
    expect(botao().hasAttribute("data-texto-antigo")).toBe(true);
    expect(botao().textContent).toContain("antigo");
    expect(botao().getAttribute("title")).toContain(ANTIGO);
    expect(botao().getAttribute("aria-label")).toContain("texto antigo");
  });

  it("uma data limpa NÃO leva a marca", () => {
    montar({ valor: "13/10" });
    expect(botao().hasAttribute("data-texto-antigo")).toBe(false);
    expect(botao().getAttribute("title")).toBeNull();
  });

  it("se o texto começa com DD/MM, o calendário abre nessa data, pré-selecionada", async () => {
    montar({ valor: ANTIGO });
    await abrir();
    expect(document.querySelector('[data-acao="mes"]')!.textContent!.trim()).toBe("Outubro");
    expect(dia("2026-10-13")!.closest("[role=gridcell]")!.getAttribute("aria-selected")).toBe("true");
  });

  it("texto sem data no início: abre em hoje, nada pré-selecionado", async () => {
    montar({ valor: "já tem, compra recorrente" });
    await abrir();
    expect(document.querySelector('[data-acao="mes"]')!.textContent!.trim()).toBe("Novembro");
    expect(painel()!.querySelectorAll("[role=gridcell][aria-selected=true]")).toHaveLength(0);
  });

  it("escolher uma data pede confirmação no painel e NÃO substitui em silêncio", async () => {
    const { emitidos, valor } = montar({ valor: ANTIGO });
    await abrir();
    dia("2026-10-20")!.click();
    await nextTick();
    await nextTick();

    const confirmacao = document.getElementById("dp-calendario-confirmacao")!;
    expect(confirmacao).not.toBeNull();
    expect(confirmacao.textContent).toContain("Isto substitui o texto antigo:");
    expect(confirmacao.textContent).toContain(`«${ANTIGO}»`);
    expect(emitidos).toEqual([]);
    expect(valor.value).toBe(ANTIGO);
    expect(painel()).not.toBeNull();
    expect(document.activeElement).toBe(acao("confirmar")); // o foco vai para o Confirmar
  });

  it("Cancelar mantém o texto antigo e volta ao calendário", async () => {
    const { emitidos, valor } = montar({ valor: ANTIGO });
    await abrir();
    dia("2026-10-20")!.click();
    await nextTick();
    acao("cancelar")!.click();
    await nextTick();

    expect(document.getElementById("dp-calendario-confirmacao")).toBeNull();
    expect(emitidos).toEqual([]);
    expect(valor.value).toBe(ANTIGO);
    expect(painel()).not.toBeNull();
  });

  it("Confirmar aplica a data nova (no formato certo) e fecha", async () => {
    const { emitidos } = montar({ valor: ANTIGO });
    await abrir();
    dia("2026-10-20")!.click();
    await nextTick();
    acao("confirmar")!.click();
    await nextTick();

    expect(emitidos).toEqual(["20/10"]);
    expect(painel()).toBeNull();
    expect(botao().hasAttribute("data-texto-antigo")).toBe(false);
  });

  it("Esc durante a confirmação cancela só a confirmação (o calendário continua aberto)", async () => {
    const { emitidos } = montar({ valor: ANTIGO });
    await abrir();
    dia("2026-10-20")!.click();
    await nextTick();
    tecla(document.activeElement!, "Escape");
    await nextTick();
    expect(document.getElementById("dp-calendario-confirmacao")).toBeNull();
    expect(painel()).not.toBeNull();
    expect(emitidos).toEqual([]);
  });

  it("Limpar também pede confirmação, e só apaga depois do Confirmar", async () => {
    const { emitidos } = montar({ valor: ANTIGO });
    await abrir();
    acao("limpar")!.click();
    await nextTick();

    const confirmacao = document.getElementById("dp-calendario-confirmacao")!;
    expect(confirmacao.textContent).toContain("Isto apaga o texto antigo:");
    expect(confirmacao.textContent).toContain(ANTIGO);
    expect(emitidos).toEqual([]);

    acao("confirmar")!.click();
    await nextTick();
    expect(emitidos).toEqual([""]);
    expect(painel()).toBeNull();
  });

  it("Hoje com texto antigo também pede confirmação", async () => {
    const { emitidos } = montar({ valor: ANTIGO });
    await abrir();
    acao("hoje")!.click();
    await nextTick();
    expect(document.getElementById("dp-calendario-confirmacao")).not.toBeNull();
    expect(emitidos).toEqual([]);
    acao("confirmar")!.click();
    await nextTick();
    expect(emitidos).toEqual(["07/11"]);
  });

  it("Enter num dia também passa pela confirmação", async () => {
    const { emitidos } = montar({ valor: ANTIGO });
    await abrir();
    tecla(document.activeElement!, "ArrowRight"); // 14/10
    await nextTick();
    tecla(document.activeElement!, "Enter");
    await nextTick();
    expect(document.getElementById("dp-calendario-confirmacao")).not.toBeNull();
    expect(emitidos).toEqual([]);
  });

  it("data inexistente ('31/02') é texto antigo: mostra como está, sem pré-seleção, e confirma ao trocar", async () => {
    const { emitidos } = montar({ valor: "31/02" });
    expect(botao().textContent).toContain("31/02");
    expect(botao().hasAttribute("data-texto-antigo")).toBe(true);
    await abrir();
    dia("2026-11-10")!.click();
    await nextTick();
    expect(document.getElementById("dp-calendario-confirmacao")).not.toBeNull();
    expect(emitidos).toEqual([]);
  });

  it("com o campo vazio ou com data limpa não há confirmação (troca direta)", async () => {
    const a = montar({ valor: "05/08" });
    await abrir();
    dia("2026-08-10")!.click();
    await nextTick();
    expect(document.getElementById("dp-calendario-confirmacao")).toBeNull();
    expect(a.emitidos).toEqual(["10/08"]);
  });
});

describe("celular: bottom sheet", () => {
  it("abaixo de lg abre como painel inferior, com alvos de toque de 44px e trava a rolagem da página", async () => {
    janela().happyDOM.setViewport({ width: 390, height: 844 });
    montar();
    await abrir();

    expect(painel()!.dataset.modo).toBe("sheet");
    expect(document.getElementById("dp-calendario-camada")!.className).toContain("items-end");
    expect(painel()!.className).toContain("rounded-t-2xl");
    expect(dia("2026-11-10")!.className).toContain("h-11");
    expect(acao("mes-anterior")!.className).toContain("h-11");
    expect(acao("hoje")!.className).toContain("min-h-11");
    expect(document.body.style.overflow).toBe("hidden");

    tecla(document.activeElement!, "Escape");
    await nextTick();
    expect(painel()).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("em desktop abre como popover ancorado ao campo, sem travar a rolagem", async () => {
    montar();
    await abrir();
    expect(painel()!.dataset.modo).toBe("popover");
    expect(painel()!.className).toContain("absolute");
    expect(painel()!.style.top).not.toBe("");
    expect(dia("2026-11-10")!.className).toContain("h-9");
    expect(document.body.style.overflow).toBe("");
  });

  it("o painel vai para o body (Teleport): nenhum ancestral com rolagem o corta", async () => {
    const { el } = montar();
    await abrir();
    expect(painel()!.parentElement!.parentElement).toBe(document.body);
    expect(el.contains(painel())).toBe(false);
  });
});
