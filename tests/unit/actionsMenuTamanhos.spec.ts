// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo } from "#shared/types/processo";
import ActionsMenu from "../../app/components/ActionsMenu.vue";
import ProcessoMoverMenu from "../../app/components/processos/ProcessoMoverMenu.vue";

// O ActionsMenu é compartilhado: os itens maiores para toque (44px / 14px abaixo de lg) só valem onde o Kanban pede
// (prop itensToque). Sem a prop — como na tela de Contas — os itens são os de antes.

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
});

async function abrirEPegarItens(trigger: HTMLButtonElement): Promise<HTMLElement[]> {
  trigger.click();
  await nextTick();
  await nextTick();
  return [...document.querySelectorAll<HTMLElement>("[role='menuitem']")];
}

describe("ActionsMenu — tamanhos dos itens", () => {
  it("padrão (uso da tela de Contas, sem props novas): itens de sempre, sem 44px nem 14px", async () => {
    const el = montar(
      defineComponent({
        setup: () => () =>
          h(ActionsMenu, {
            triggerId: "btn-acoes-conta-x",
            items: [{ label: "Editar", onClick: () => {} }, { label: "Excluir", danger: true, onClick: () => {} }],
            ariaLabel: "Ações para x@x.com",
          }),
      }),
    );
    const itens = await abrirEPegarItens(el.querySelector<HTMLButtonElement>("#btn-acoes-conta-x")!);
    expect(itens).toHaveLength(2);
    for (const item of itens) {
      expect(item.className).toContain("py-1.5");
      expect(item.className).toContain("text-[12.5px]");
      expect(item.className).not.toContain("max-lg:min-h-11");
      expect(item.className).not.toContain("max-lg:text-[14px]");
    }
    // A lista e o botão também seguem o padrão de antes.
    expect(document.querySelector("[role='menu']")!.className).toContain("z-50");
    expect(el.querySelector("#btn-acoes-conta-x")!.className).toContain("h-11 w-11");
  });

  it("'Mover para…' do painel do Kanban (itensToque): itens com 44px e 14px abaixo de lg", async () => {
    const processo = {
      id: "p1",
      paciente: "Maria",
      numeroRemessa: 1,
      pasta: "2026 - 1",
      empresa: "FARMAURORA",
      consultor: "Dani",
      medicamentos: [],
      status: "em_transito",
      datas: {},
      pendencias: [],
      atualizacoes: [],
      createdAt: "",
      updatedAt: "",
    } as Processo;
    const el = montar(defineComponent({ setup: () => () => h(ProcessoMoverMenu, { processo }) }));
    const itens = await abrirEPegarItens(el.querySelector<HTMLButtonElement>("#btn-mover-painel-p1")!);
    expect(itens).toHaveLength(4);
    for (const item of itens) {
      expect(item.className).toContain("max-lg:min-h-11");
      expect(item.className).toContain("max-lg:text-[14px]");
    }
  });
});
