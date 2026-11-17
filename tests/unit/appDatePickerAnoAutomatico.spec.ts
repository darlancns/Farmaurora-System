// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import AppDatePicker from "../../app/components/AppDatePicker.vue";
import type { SentidoAno } from "../../shared/utils/anoAutomatico";

// AppDatePicker com `anoAutomatico` (opt-in): digitar com máscara, ano completado sozinho pelo sentido, ano digitado
// respeitado, calendário, limpar, data inexistente com aviso sem apagar o texto, colar. "Hoje" fixo em Brasília.

vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-17",
}));

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
});

function montar(inicial = "", props: { sentido?: SentidoAno; anoAutomatico?: boolean; formato?: "dd/mm" | "iso" } = {}) {
  const valor = ref(inicial);
  const emitidos: string[] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(AppDatePicker, {
          id: "campo",
          label: "Previsão",
          placeholder: "DD/MM/AAAA",
          anoAutomatico: props.anoAutomatico ?? true,
          sentido: props.sentido ?? "proximo",
          formato: props.formato ?? "dd/mm",
          modelValue: valor.value,
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

const entrada = () => document.getElementById("campo") as HTMLInputElement;
const erro = () => document.getElementById("campo-erro");

async function digitar(texto: string): Promise<void> {
  const i = entrada();
  i.focus();
  i.dispatchEvent(new FocusEvent("focus"));
  i.value = texto;
  i.dispatchEvent(new Event("input"));
  await nextTick();
}

async function sair(): Promise<void> {
  entrada().dispatchEvent(new FocusEvent("blur"));
  await nextTick();
}

describe("digitar", () => {
  it("'2210' vira '22/10' na máscara e, ao sair, ganha o ano (proximo -> 2026)", async () => {
    const { valor } = montar();
    await digitar("2210");
    expect(entrada().value).toBe("22/10");
    await sair();
    expect(valor.value).toBe("22/10/2026");
    expect(entrada().value).toBe("22/10/2026");
  });

  it("'22/10' no sentido futuro -> 22/10/2027", async () => {
    const { valor } = montar("", { sentido: "futuro" });
    await digitar("22/10");
    await sair();
    expect(valor.value).toBe("22/10/2027");
  });

  it("ano digitado é respeitado: '22/10/2027' em 'proximo' continua 2027", async () => {
    const { valor } = montar();
    await digitar("22/10/2027");
    await sair();
    expect(valor.value).toBe("22/10/2027");
  });

  it("dá para trocar o ano de uma data já completa", async () => {
    const { valor } = montar("22/10/2026");
    await digitar("22/10/2025");
    await sair();
    expect(valor.value).toBe("22/10/2025");
  });

  it("Enter confirma (e não segura o envio quando a data é válida)", async () => {
    const { valor } = montar();
    await digitar("0501");
    const ev = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    entrada().dispatchEvent(ev);
    await nextTick();
    expect(valor.value).toBe("05/01/2027");
    expect(ev.defaultPrevented).toBe(false);
  });

  it("letras são ignoradas pela máscara", async () => {
    montar();
    await digitar("2a2b10");
    expect(entrada().value).toBe("22/10");
  });
});

describe("data inexistente ou incompleta", () => {
  it("'31/04': aviso discreto, texto mantido, nada emitido (o valor anterior fica)", async () => {
    const { valor, emitidos } = montar("10/10/2026");
    await digitar("31/04");
    await sair();
    expect(entrada().value).toBe("31/04");
    expect(erro()?.textContent).toContain("Data inexistente");
    expect(entrada().getAttribute("aria-invalid")).toBe("true");
    expect(entrada().getAttribute("aria-describedby")).toBe("campo-erro");
    expect(emitidos).toEqual([]);
    expect(valor.value).toBe("10/10/2026");
  });

  it("Enter com data inválida segura o envio do formulário", async () => {
    montar();
    await digitar("31/04");
    const ev = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    entrada().dispatchEvent(ev);
    await nextTick();
    expect(ev.defaultPrevented).toBe(true);
  });

  it("'22': incompleta; voltar a digitar apaga o aviso e corrigir grava", async () => {
    const { valor } = montar();
    await digitar("22");
    await sair();
    expect(erro()?.textContent).toContain("Data incompleta");
    await digitar("2210");
    expect(erro()).toBeNull();
    await sair();
    expect(valor.value).toBe("22/10/2026");
  });

  it("29/02 sem ano completa para um bissexto; 29/02/2027 é inexistente", async () => {
    const { valor } = montar("", { sentido: "futuro" });
    await digitar("2902");
    await sair();
    expect(valor.value).toBe("29/02/2028");
    await digitar("29022027");
    await sair();
    expect(erro()?.textContent).toContain("Data inexistente");
    expect(valor.value).toBe("29/02/2028");
  });
});

describe("limpar", () => {
  it("o botão × aparece com foco e texto e esvazia o campo", async () => {
    const { valor } = montar("22/10/2026");
    expect(document.getElementById("campo-limpar")).toBeNull(); // sem foco: só o calendário
    entrada().focus();
    entrada().dispatchEvent(new FocusEvent("focus"));
    await nextTick();
    document.getElementById("campo-limpar")!.click();
    await nextTick();
    expect(valor.value).toBe("");
    expect(entrada().value).toBe("");
  });

  it("apagar o texto todo e sair também limpa", async () => {
    const { valor } = montar("22/10/2026");
    await digitar("");
    await sair();
    expect(valor.value).toBe("");
  });
});

describe("calendário", () => {
  it("o botão abre o mesmo calendário e o dia escolhido sai com o ano", async () => {
    const { valor } = montar("", { sentido: "futuro" });
    document.getElementById("campo-abrir-calendario")!.click();
    await nextTick();
    await nextTick();
    expect(document.getElementById("campo-calendario")).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[data-iso="2026-11-20"]')!.click();
    await nextTick();
    expect(valor.value).toBe("20/11/2026");
    expect(entrada().value).toBe("20/11/2026");
    expect(document.getElementById("campo-calendario")).toBeNull();
  });

  it("vale o ano escolhido no calendário (mesmo que o sentido diria outro)", async () => {
    const { valor } = montar("", { sentido: "futuro" });
    document.getElementById("campo-abrir-calendario")!.click();
    await nextTick();
    await nextTick();
    document.querySelector<HTMLButtonElement>('[data-acao="mes-anterior"]')!.click();
    await nextTick();
    document.querySelector<HTMLButtonElement>('[data-iso="2026-10-05"]')!.click();
    await nextTick();
    expect(valor.value).toBe("05/10/2026");
  });
});

describe("colar", () => {
  it("'2027-10-22' (ISO) vira 22/10/2027", async () => {
    const { valor } = montar();
    entrada().focus();
    entrada().dispatchEvent(new FocusEvent("focus"));
    const ev = Object.assign(new Event("paste", { cancelable: true }), {
      clipboardData: { getData: () => "2027-10-22" },
    });
    entrada().dispatchEvent(ev);
    await nextTick();
    expect(ev.defaultPrevented).toBe(true);
    expect(entrada().value).toBe("22/10/2027");
    await sair();
    expect(valor.value).toBe("22/10/2027");
  });

  it("texto com anotação colado passa pela máscara (só a data)", async () => {
    const { valor } = montar();
    await digitar("13/10 - agd. distribuição");
    expect(entrada().value).toBe("13/10");
    await sair();
    expect(valor.value).toBe("13/10/2026");
  });
});

describe("valores antigos", () => {
  it("'DD/MM' antigo aparece como está e NÃO é regravado só por focar e sair", async () => {
    const { emitidos } = montar("13/10");
    expect(entrada().value).toBe("13/10");
    entrada().focus();
    entrada().dispatchEvent(new FocusEvent("focus"));
    await sair();
    expect(emitidos).toEqual([]);
    expect(entrada().value).toBe("13/10");
  });

  it("texto antigo com anotação continua no modo botão (como está, com o pontinho)", () => {
    montar("13/10 - agd. distribuição");
    const c = document.getElementById("campo")!;
    expect(c.tagName).toBe("BUTTON");
    expect(c.textContent).toContain("13/10 - agd. distribuição");
    expect(c.hasAttribute("data-texto-antigo")).toBe(true);
  });

  it("formato iso com ano automático grava AAAA-MM-DD", async () => {
    const { valor } = montar("", { formato: "iso" });
    await digitar("2210");
    await sair();
    expect(valor.value).toBe("2026-10-22");
    expect(entrada().value).toBe("22/10/2026");
  });
});

describe("opt-in: sem anoAutomatico nada muda", () => {
  it("continua sendo o botão não digitável de antes", () => {
    montar("", { anoAutomatico: false });
    const c = document.getElementById("campo")!;
    expect(c.tagName).toBe("BUTTON");
    expect(document.querySelector("input")).toBeNull();
    expect(document.getElementById("campo-abrir-calendario")).toBeNull();
  });
});
