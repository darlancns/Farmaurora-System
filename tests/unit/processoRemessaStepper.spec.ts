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
  it("estrutura: UM campo visual — o contêiner com a borda tem o input e, DENTRO dele, a coluna com ▲ em cima e ▼ embaixo", () => {
    const { el, campo, menos, mais } = montar();
    const conteiner = campo().parentElement!;
    expect(conteiner.className).toContain("border");
    expect(conteiner.className).toContain("rounded-md");
    expect(conteiner.className).toContain("focus-within:outline-2"); // o anel envolve o conjunto todo
    // Só o contêiner tem borda: o input não tem (nada de duas caixas lado a lado).
    expect(campo().className).not.toMatch(/(^|\s)border(\s|$)/);

    expect(conteiner.contains(menos())).toBe(true);
    expect(conteiner.contains(mais())).toBe(true);
    expect(el.querySelector("form > div")).toBe(conteiner);

    // Número à esquerda; coluna das setas à direita, com ▲ (mais) antes de ▼ (menos): empilhados.
    const coluna = mais().parentElement!;
    expect(menos().parentElement).toBe(coluna);
    expect(coluna.parentElement).toBe(conteiner);
    expect(Array.from(conteiner.children)).toEqual([campo(), coluna]);
    expect(Array.from(coluna.children)).toEqual([mais(), menos()]);
  });

  it("atributos: ids, aria-labels, type, inputmode, data-sem-maiuscula; setas fora do Tab; sem spinner nativo", () => {
    const { campo, menos, mais } = montar();
    expect(menos().getAttribute("aria-label")).toBe("Diminuir Nº Remessa");
    expect(mais().getAttribute("aria-label")).toBe("Aumentar Nº Remessa");
    expect(menos().type).toBe("button");
    expect(mais().type).toBe("button");
    expect(menos().getAttribute("tabindex")).toBe("-1");
    expect(mais().getAttribute("tabindex")).toBe("-1");
    expect(campo().type).toBe("text"); // não é type="number": sem as setas nativas do navegador
    expect(campo().getAttribute("inputmode")).toBe("numeric");
    expect(campo().hasAttribute("data-sem-maiuscula")).toBe(true);
    expect(campo().value).toBe("1");
    // As setas são ícones (sem texto).
    expect(menos().textContent?.trim()).toBe("");
    expect(mais().textContent?.trim()).toBe("");
    expect(menos().querySelector("svg")).not.toBeNull();
    expect(mais().querySelector("svg")).not.toBeNull();
  });

  it("tamanhos: coluna de 32px (w-8), cada seta com metade da altura (flex-1); contêiner de 44px abaixo de lg, altura do campo em lg+", () => {
    const { campo, menos, mais } = montar();
    const coluna = mais().parentElement!;
    expect(coluna.className).toContain("w-8");
    expect(coluna.className).toContain("flex-col");
    for (const b of [menos(), mais()]) expect(b.className).toContain("flex-1");
    const conteiner = campo().parentElement!;
    expect(conteiner.className).toContain("min-h-11");
    expect(conteiner.className).toContain("lg:min-h-auto");
    // O padding do número é o dos outros campos (px-2.5, py-2) e há espaço próprio para as setas (a coluna não sobrepõe o texto).
    expect(campo().className).toContain("px-2.5");
    expect(campo().className).toContain("min-w-0");
    expect(campo().className).toContain("flex-1");
  });

  it("mousedown nas setas não tira o foco do campo (preventDefault); o campo continua utilizável", async () => {
    const { campo, mais, menos } = montar("3");
    campo().focus();
    for (const b of [mais(), menos()]) {
      const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      b.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
    }
    mais().click();
    await nextTick();
    expect(document.activeElement).toBe(campo());
  });

  it("▼ está desabilitado em 1; ▲ habilitado", () => {
    const { menos, mais } = montar("1");
    expect(menos().disabled).toBe(true);
    expect(mais().disabled).toBe(false);
  });

  it("clicar em ▲ e em ▼ muda o valor de 1 em 1, e ▼ para em 1", async () => {
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

  it("▲ desabilita no máximo (2147483647) e não passa dele", async () => {
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

  it("as setas NÃO enviam o formulário", async () => {
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

  it("campo vazio: ▼ desabilitado e ▲ leva a 2", async () => {
    const { valor, menos, mais } = montar("");
    expect(menos().disabled).toBe(true);
    mais().click();
    await nextTick();
    expect(valor.value).toBe("2");
  });
});
