// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import plugin from "../../app/plugins/primeira-maiuscula.client";
import { campoRecebePrimeiraMaiuscula } from "../../app/utils/primeiraMaiuscula";
import { novoDir } from "./helpers/dirFixtures";

// Campo df-contrato do formulário da DIR montado de verdade, com o plugin global da 1ª maiúscula instalado: só números
// separados por espaço, vírgula ou barra; letras e símbolos são filtrados ao digitar e ao colar.
vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montar(editingDir: ReturnType<typeof novoDir> | null = null): HTMLInputElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({ render: () => h(DirFormModal, { editingDir, contagemPorPo: new Map<string, number>() }) }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return document.getElementById("df-contrato") as HTMLInputElement;
}

function digitar(c: HTMLInputElement, texto: string, cursor = texto.length): void {
  c.value = texto;
  c.setSelectionRange(cursor, cursor);
  c.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

beforeAll(() => {
  (plugin as unknown as () => void)();
});

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
});

describe("DirFormModal montado: df-contrato", () => {
  it("fica fora da regra da 1ª maiúscula e pede teclado numérico", () => {
    const c = montar();
    expect(c.hasAttribute("data-sem-maiuscula")).toBe(true);
    expect(campoRecebePrimeiraMaiuscula(c)).toBe(false);
    expect(c.getAttribute("inputmode")).toBe("numeric");
  });

  it("digitar tecla a tecla: só números, espaço, vírgula e barra entram", async () => {
    const c = montar();
    let atual = "";
    for (const ch of "Contrato 123456-789/012, x") {
      digitar(c, atual + ch);
      await nextTick();
      atual = c.value;
    }
    expect(c.value).toBe("123456789/012, ");
  });

  it.each([
    ["123456 789012", "123456 789012"],
    ["123456, 789012", "123456, 789012"],
    ["123456/789012", "123456/789012"],
    ["Venda a prazo", ""],
    ["ABC123", "123"],
    ["123-456", "123456"],
    ["  123456", "123456"],
    ["123\u00A0456", "123 456"],
  ])("colar %j deixa %j", async (colado, esperado) => {
    const c = montar();
    digitar(c, colado);
    await nextTick();
    expect(c.value).toBe(esperado);
  });

  it("edição: o texto antigo aparece como está; ao digitar, o filtro limpa o que não é número; o cursor não pula", async () => {
    const c = montar(novoDir({ contratoCambio: "Venda a prazo" }));
    expect(c.value).toBe("Venda a prazo");
    digitar(c, "Venda a prazo1");
    await nextTick();
    expect(c.value).toBe("1");
  });

  it("edição: digitar uma letra no meio de um número a remove e o cursor fica onde estava", async () => {
    const c = montar(novoDir({ contratoCambio: "123456" }));
    expect(c.value).toBe("123456");
    digitar(c, "123x456", 4);
    await nextTick();
    expect(c.value).toBe("123456");
    expect(c.selectionStart).toBe(3);
  });
});
