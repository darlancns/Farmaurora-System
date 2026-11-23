// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import type { CompraDaLista } from "../../shared/types/compra";
import type { OrdemDaLista } from "../../shared/utils/compraLista";
import ComprasListaPainel from "../../app/components/compras/ComprasListaPainel.vue";

// O painel esquerdo com o seletor "Mais recentes" | "Por número" (abaixo de "+ Nova compra", acima da lista) e o botão que inverte. Componente REAL no
// happy-dom. Dados fictícios (TESTE).

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];

const compra = (sequencia: number): CompraDaLista => ({
  id: `cmp_${sequencia}`,
  anoMes: "2026-11",
  sequencia,
  cancelada: false,
  paciente: `PACIENTE TESTE ${sequencia}`,
  medicamentos: [],
  numeroOrdens: 1,
  atualizadoEm: "2026-11-19T12:00:00.000Z",
});

function painel(inicial: { ordem?: OrdemDaLista; inverter?: boolean; podeEditar?: boolean } = {}) {
  const eventos: Array<[string, unknown?]> = [];
  const estado = ref({ ordem: inicial.ordem ?? ("recentes" as OrdemDaLista), inverter: inicial.inverter ?? false });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(ComprasListaPainel, {
          rotuloMes: "Novembro/2026",
          totalDoMes: 2,
          compras: [compra(2), compra(1)],
          totais: { ativas: 2, canceladas: 0 },
          total: 2,
          temMais: false,
          mostrarCanceladas: false,
          selecionadaId: null,
          carregando: false,
          erro: null,
          ordem: estado.value.ordem,
          inverter: estado.value.inverter,
          podeEditar: inicial.podeEditar ?? true,
          onOrdem: (o: OrdemDaLista) => eventos.push(["ordem", o]),
          onInverter: () => eventos.push(["inverter"]),
        }),
    }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return { eventos, estado };
}

describe("o seletor de visão da lista", () => {
  it("duas opções, 'Mais recentes' e 'Por número', e a marcada é a da visão atual", () => {
    painel({ ordem: "recentes" });
    const grupo = q("#compras-ordem")!;
    expect(grupo.getAttribute("role")).toBe("radiogroup");
    expect(grupo.getAttribute("aria-label")).toBe("Ordem da lista");
    const radios = qa<HTMLElement>("#compras-ordem [role=radio]");
    expect(radios.map((r) => texto(r))).toEqual(["Mais recentes", "Por número"]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false"]);
  });

  it("com 'Por número' a segunda fica marcada", async () => {
    const { estado } = painel({ ordem: "recentes" });
    estado.value = { ordem: "numero", inverter: false };
    await nextTick();
    expect(qa<HTMLElement>("#compras-ordem [role=radio]").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);
  });

  it("clicar numa opção avisa a página com a visão escolhida", () => {
    const { eventos } = painel({ ordem: "recentes" });
    qa<HTMLElement>("#compras-ordem [role=radio]")[1]!.click();
    expect(eventos).toEqual([["ordem", "numero"]]);
  });

  it("fica abaixo de '+ Nova compra' e acima da lista de compras", () => {
    painel();
    const nova = q("#btn-nova-compra")!;
    const barra = q("#compras-ordem-barra")!;
    const lista = q("#compras-cartoes")!;
    const antes = (a: Node, b: Node): boolean => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(antes(nova, barra)).toBe(true);
    expect(antes(barra, lista)).toBe(true);
  });

  it("quem só lê (sócio) também escolhe a visão (é só de olhar), mas não vê '+ Nova compra'", () => {
    painel({ podeEditar: false });
    expect(q("#btn-nova-compra")).toBeNull();
    expect(q("#compras-ordem")).not.toBeNull();
  });
});

describe("o botão que inverte (só em 'Por número')", () => {
  it("em 'Mais recentes' ele não existe", () => {
    painel({ ordem: "recentes" });
    expect(q("#compras-ordem-inverter")).toBeNull();
  });

  it("em 'Por número' aparece, diz o sentido de hoje e avisa ao clicar", () => {
    const { eventos } = painel({ ordem: "numero", inverter: false });
    const botao = q<HTMLButtonElement>("#compras-ordem-inverter")!;
    expect(botao.type).toBe("button");
    expect(botao.getAttribute("aria-label")).toBe("Inverter a ordem (agora do maior para o menor)");
    expect(botao.getAttribute("aria-pressed")).toBe("false");
    botao.click();
    expect(eventos).toEqual([["inverter"]]);
  });

  it("invertido, o rótulo e o estado acompanham", async () => {
    const { estado } = painel({ ordem: "numero", inverter: false });
    estado.value = { ordem: "numero", inverter: true };
    await nextTick();
    const botao = q<HTMLButtonElement>("#compras-ordem-inverter")!;
    expect(botao.getAttribute("aria-label")).toBe("Inverter a ordem (agora do menor para o maior)");
    expect(botao.getAttribute("aria-pressed")).toBe("true");
  });
});
