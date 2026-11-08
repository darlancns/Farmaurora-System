// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import ProcessoRemessaStepper from "../../app/components/processos/ProcessoRemessaStepper.vue";

// @vue/test-utils não está instalado no projeto: o componente real é montado com createApp no happy-dom (como os
// demais specs de componente) e dirigido por eventos do DOM.

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montar(inicial = "1") {
  const valor = ref(inicial);
  let enviou = 0;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(
          "form",
          {
            id: "f",
            onSubmit: (e: Event) => {
              e.preventDefault();
              enviou++;
            },
          },
          [
            h(ProcessoRemessaStepper, {
              id: "pf-numero-remessa",
              modelValue: valor.value,
              rotulo: "Nº Remessa",
              "onUpdate:modelValue": (v: string) => (valor.value = v),
            }),
          ],
        ),
    }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  const campo = () => el.querySelector<HTMLInputElement>("#pf-numero-remessa")!;
  const menos = () => el.querySelector<HTMLButtonElement>("#pf-numero-remessa-menos")!;
  const mais = () => el.querySelector<HTMLButtonElement>("#pf-numero-remessa-mais")!;
  return { el, valor, campo, menos, mais, enviou: () => enviou };
}

function digitar(input: HTMLInputElement, texto: string) {
  input.value = texto;
  input.setSelectionRange(texto.length, texto.length);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function tecla(input: HTMLInputElement, key: string): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  input.dispatchEvent(ev);
  return ev;
}

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
});

describe("ProcessoRemessaStepper", () => {
  it("estrutura: − | campo | +, com os ids, aria-labels, type e inputmode combinados", () => {
    const { el, campo, menos, mais } = montar();
    const filhos = Array.from(el.querySelector("form > div")!.children);
    expect(filhos).toEqual([menos(), campo(), mais()]);

    expect(menos().getAttribute("aria-label")).toBe("Diminuir Nº Remessa");
    expect(mais().getAttribute("aria-label")).toBe("Aumentar Nº Remessa");
    expect(menos().type).toBe("button");
    expect(mais().type).toBe("button");
    expect(campo().type).toBe("text");
    expect(campo().getAttribute("inputmode")).toBe("numeric");
    expect(campo().hasAttribute("data-sem-maiuscula")).toBe(true);
    expect(campo().value).toBe("1");
  });

  it("alvo de toque: botões com no mínimo 40px (w-10 e min-h-11) abaixo de lg", () => {
    const { menos, mais } = montar();
    for (const b of [menos(), mais()]) {
      expect(b.className).toContain("w-10");
      expect(b.className).toContain("min-h-11");
    }
  });

  it("'−' está desabilitado em 1; '+' habilitado", () => {
    const { menos, mais } = montar("1");
    expect(menos().disabled).toBe(true);
    expect(mais().disabled).toBe(false);
  });

  it("clicar em '+' e em '−' muda o valor de 1 em 1, e '−' para em 1", async () => {
    const { valor, campo, menos, mais } = montar("1");
    mais().click();
    await nextTick();
    expect(valor.value).toBe("2");
    expect(campo().value).toBe("2");
    expect(menos().disabled).toBe(false);

    mais().click();
    await nextTick();
    expect(valor.value).toBe("3");

    menos().click();
    await nextTick();
    menos().click();
    await nextTick();
    expect(valor.value).toBe("1");
    expect(menos().disabled).toBe(true);

    menos().click(); // desabilitado: nada acontece
    await nextTick();
    expect(valor.value).toBe("1");
  });

  it("'+' desabilita no máximo (2147483647) e não passa dele", async () => {
    const { valor, mais, menos } = montar("2147483646");
    mais().click();
    await nextTick();
    expect(valor.value).toBe("2147483647");
    expect(mais().disabled).toBe(true);
    mais().click();
    await nextTick();
    expect(valor.value).toBe("2147483647");
    expect(menos().disabled).toBe(false);
  });

  it("os botões NÃO enviam o formulário", async () => {
    const { mais, menos, enviou } = montar("3");
    mais().click();
    menos().click();
    await nextTick();
    expect(enviou()).toBe(0);
  });

  it("digitar: só dígitos (letras, 'e', '+', '-' e '.' saem) e sem zeros à esquerda", async () => {
    const { valor, campo } = montar("1");
    digitar(campo(), "1e3");
    expect(valor.value).toBe("13");
    digitar(campo(), "-5");
    expect(valor.value).toBe("5");
    digitar(campo(), "2.5");
    expect(valor.value).toBe("25");
    digitar(campo(), "abc");
    expect(valor.value).toBe("");
    digitar(campo(), "007");
    expect(valor.value).toBe("7");
    await nextTick();
    expect(campo().value).toBe("7");
  });

  it("blur com o campo vazio vira 1; com 0 também; com valor válido não muda", async () => {
    const { valor, campo } = montar("4");
    digitar(campo(), "");
    expect(valor.value).toBe("");
    campo().dispatchEvent(new Event("blur"));
    await nextTick();
    expect(valor.value).toBe("1");
    expect(campo().value).toBe("1");

    digitar(campo(), "0"); // a máscara já tira o zero
    campo().dispatchEvent(new Event("blur"));
    await nextTick();
    expect(valor.value).toBe("1");

    digitar(campo(), "9");
    campo().dispatchEvent(new Event("blur"));
    await nextTick();
    expect(valor.value).toBe("9");
  });

  it("ArrowUp aumenta e ArrowDown diminui em 1 (sem rolar a página), parando em 1", async () => {
    const { valor, campo } = montar("5");
    const sobe = tecla(campo(), "ArrowUp");
    expect(sobe.defaultPrevented).toBe(true);
    await nextTick();
    expect(valor.value).toBe("6");

    tecla(campo(), "ArrowDown");
    await nextTick();
    tecla(campo(), "ArrowDown");
    await nextTick();
    expect(valor.value).toBe("4");

    for (let i = 0; i < 6; i++) {
      tecla(campo(), "ArrowDown");
      await nextTick();
    }
    expect(valor.value).toBe("1");
  });

  it("outras teclas não mexem no valor", async () => {
    const { valor, campo } = montar("5");
    tecla(campo(), "ArrowLeft");
    tecla(campo(), "Enter");
    await nextTick();
    expect(valor.value).toBe("5");
  });

  it("campo vazio: '−' desabilitado e '+' leva a 2", async () => {
    const { valor, menos, mais } = montar("");
    expect(menos().disabled).toBe(true);
    mais().click();
    await nextTick();
    expect(valor.value).toBe("2");
  });
});
