// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { computed, createApp, defineComponent, h, nextTick, ref, type Ref } from "vue";
import type { ConsultorProcesso, Processo } from "#shared/types/processo";
import ProcessoDeliveredList from "../../app/components/processos/ProcessoDeliveredList.vue";
import ProcessoGroupList from "../../app/components/processos/ProcessoGroupList.vue";
import ProcessoRow from "../../app/components/processos/ProcessoRow.vue";
import { useAberturaPorBusca } from "../../app/composables/useAberturaPorBusca";
import { filtrarPorBusca } from "../../app/utils/processoBusca";

// Componentes reais montados no happy-dom: a lista de grupos, a linha e a lista de Entregues, com o estado
// de abertura (grupos e detalhes) controlado pela página, como em app/pages/processos.vue.

function proc(
  id: string,
  consultor: ConsultorProcesso,
  paciente: string,
  extra: Partial<Processo> = {},
): Processo {
  return {
    id,
    paciente,
    pasta: "2026 - 100",
    empresa: "FARMAURORA",
    consultor,
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "",
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
});

const linhas = (el: HTMLElement) => Array.from(el.querySelectorAll("[id^='processo-row-']")).map((n) => n.id.replace("processo-row-", ""));
const detalhes = (el: HTMLElement) =>
  Array.from(el.querySelectorAll("[id^='processo-detail-']")).map((n) => n.id.replace("processo-detail-", ""));
const cabecalhoDoGrupo = (el: HTMLElement, consultor: string) =>
  Array.from(el.querySelectorAll<HTMLButtonElement>("#processo-group-list > div > button")).find((b) =>
    b.textContent?.includes(consultor),
  )!;
const botaoDaLinha = (el: HTMLElement, id: string) => el.querySelector<HTMLButtonElement>(`#processo-row-${id} > button`)!;

// ── ProcessoRow ─────────────────────────────────────────────────────────────────────────────────

describe("ProcessoRow", () => {
  const p = proc("r1", "Dani", "Maria Alves");

  it("SEM controle do pai: continua abrindo e fechando sozinha, como antes", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoRow, { processo: p }) }));
    expect(detalhes(el)).toEqual([]);

    botaoDaLinha(el, "r1").click();
    await nextTick();
    expect(detalhes(el)).toEqual(["r1"]);

    botaoDaLinha(el, "r1").click();
    await nextTick();
    expect(detalhes(el)).toEqual([]);
  });

  it("controlada pelo pai: abre e fecha conforme o valor recebido", async () => {
    const aberto = ref(false);
    const el = montar(
      defineComponent({
        render: () =>
          h(ProcessoRow, {
            processo: p,
            expandido: aberto.value,
            "onUpdate:expandido": (v: boolean) => {
              aberto.value = v;
            },
          }),
      }),
    );
    expect(detalhes(el)).toEqual([]);

    aberto.value = true; // o pai abre (ex.: a busca)
    await nextTick();
    expect(detalhes(el)).toEqual(["r1"]);

    aberto.value = false;
    await nextTick();
    expect(detalhes(el)).toEqual([]);
  });

  it("controlada: o clique avisa o pai (update:expandido) e quem manda é o pai", async () => {
    const eventos: boolean[] = [];
    const aberto = ref(false);
    const el = montar(
      defineComponent({
        render: () =>
          h(ProcessoRow, {
            processo: p,
            expandido: aberto.value,
            "onUpdate:expandido": (v: boolean) => {
              eventos.push(v);
              // o pai IGNORA o pedido: a linha não abre sozinha
            },
          }),
      }),
    );

    botaoDaLinha(el, "r1").click();
    await nextTick();

    expect(eventos).toEqual([true]);
    expect(detalhes(el)).toEqual([]);

    aberto.value = true;
    await nextTick();
    expect(detalhes(el)).toEqual(["r1"]);
  });
});

// ── ProcessoGroupList ───────────────────────────────────────────────────────────────────────────

function paginaDeAndamento(todos: Processo[], termoInicial = "", agrupado = true) {
  const termo: Ref<string> = ref(termoInicial);
  const encontrados = computed(() => filtrarPorBusca(todos, termo.value));
  const abertura = useAberturaPorBusca({
    termo: () => termo.value,
    encontrados: () => encontrados.value,
    agrupado: () => agrupado,
  });
  const el = montar(
    defineComponent({
      render: () => h(ProcessoGroupList, { processos: encontrados.value, abertura, flat: !agrupado }),
    }),
  );
  return { termo, abertura, el };
}

const LOTE = [
  proc("a1", "Dani", "Maria Alves", { pasta: "2026 - 375" }),
  proc("a2", "Dani", "Mariana Costa", { pasta: "2026 - 12" }),
  proc("b1", "Bolívar", "Maria Bastos", { pasta: "2026 - 40" }),
  proc("c1", "Flávia", "Carlos Dias", { pasta: "2026 - 99" }),
  proc("c2", "Flávia", "Carla Dias", { pasta: "2026 - 98" }),
  proc("c3", "Flávia", "Cíntia Dias", { pasta: "2026 - 97" }),
  proc("c4", "Flávia", "Cláudia Dias", { pasta: "2026 - 96" }),
];

describe("ProcessoGroupList com busca", () => {
  it("sem busca: tudo recolhido (só os cabeçalhos), como sempre", async () => {
    const { el } = paginaDeAndamento(LOTE);
    await nextTick();
    expect(linhas(el)).toEqual([]);
    expect(el.querySelectorAll("#processo-group-list > div")).toHaveLength(3); // Bolívar, Dani, Flávia
  });

  it("buscar abre TODOS os grupos com resultado; com ≤ 5 resultados abre também cada detalhe", async () => {
    const { termo, el } = paginaDeAndamento(LOTE);
    termo.value = "maria";
    await nextTick();

    expect(linhas(el).sort()).toEqual(["a1", "a2", "b1"]);
    expect(detalhes(el).sort()).toEqual(["a1", "a2", "b1"]);
  });

  it("mais de 5 resultados: abre só os grupos, com os detalhes fechados", async () => {
    const { termo, el } = paginaDeAndamento(LOTE);
    termo.value = "dias"; // 4 da Flávia...
    await nextTick();
    expect(detalhes(el)).toHaveLength(4);

    termo.value = "a"; // casa quase todos (> 5)
    await nextTick();
    expect(linhas(el).length).toBeGreaterThan(5);
    expect(detalhes(el)).toEqual([]);
    expect(el.querySelectorAll("#processo-group-list > div")).toHaveLength(3);
  });

  it("grupo sem resultado nem aparece, e o que tem resultado abre", async () => {
    const { termo, el } = paginaDeAndamento(LOTE);
    termo.value = "bastos";
    await nextTick();
    expect(linhas(el)).toEqual(["b1"]);
    expect(cabecalhoDoGrupo(el, "Dani")).toBeUndefined();
  });

  it("achar por PASTA (variações de digitação) abre o grupo e o detalhe", async () => {
    for (const digitado of ["2026 - 375", "2026-375", "2026 375", "375"]) {
      const { termo, el } = paginaDeAndamento(LOTE);
      termo.value = digitado;
      await nextTick();
      expect(linhas(el), digitado).toEqual(["a1"]);
      expect(detalhes(el), digitado).toEqual(["a1"]);
    }
  });

  it("apagar a busca restaura o que estava aberto ANTES de digitar", async () => {
    const { termo, abertura, el } = paginaDeAndamento(LOTE);
    cabecalhoDoGrupo(el, "Flávia").click(); // a pessoa abriu o grupo Flávia antes
    await nextTick();
    expect(linhas(el).sort()).toEqual(["c1", "c2", "c3", "c4"]);

    termo.value = "maria";
    await nextTick();
    expect(abertura.grupos.has("Dani")).toBe(true);
    expect(detalhes(el)).toHaveLength(3);

    termo.value = "";
    await nextTick();
    expect(linhas(el).sort()).toEqual(["c1", "c2", "c3", "c4"]); // só o Flávia, como antes
    expect(detalhes(el)).toEqual([]);
    expect(cabecalhoDoGrupo(el, "Dani").parentElement!.querySelectorAll("[id^='processo-row-']")).toHaveLength(0);
  });

  it("escolha manual vale até os resultados mudarem: fechar um grupo à mão resiste a letras que não mudam o resultado", async () => {
    const { termo, el } = paginaDeAndamento(LOTE);
    termo.value = "mar";
    await nextTick();
    expect(linhas(el)).toEqual(expect.arrayContaining(["a1", "a2", "b1"]));

    cabecalhoDoGrupo(el, "Dani").click(); // fecha Dani à mão
    await nextTick();
    expect(linhas(el)).toEqual(["b1"]);

    termo.value = "mari"; // mesmos resultados: a escolha manual continua valendo
    await nextTick();
    expect(linhas(el)).toEqual(["b1"]);
  });

  it("…e quando o conjunto de resultados muda, a regra automática volta a valer", async () => {
    const { termo, el } = paginaDeAndamento(LOTE);
    termo.value = "mar";
    await nextTick();
    cabecalhoDoGrupo(el, "Dani").click();
    await nextTick();
    expect(linhas(el)).toEqual(["b1"]);

    termo.value = "marian"; // resultados mudam (só a2, Mariana): reaplica e reabre Dani
    await nextTick();
    expect(linhas(el)).toEqual(["a2"]);
    expect(detalhes(el)).toEqual(["a2"]);
  });

  it("detalhe fechado à mão durante a busca fica fechado até os resultados mudarem", async () => {
    const { termo, el } = paginaDeAndamento(LOTE);
    termo.value = "maria";
    await nextTick();
    expect(detalhes(el).sort()).toEqual(["a1", "a2", "b1"]);

    botaoDaLinha(el, "a1").click(); // fecha o detalhe de a1
    await nextTick();
    expect(detalhes(el).sort()).toEqual(["a2", "b1"]);

    termo.value = "maria "; // espaço no fim: mesmos resultados
    await nextTick();
    expect(detalhes(el).sort()).toEqual(["a2", "b1"]);
  });

  it("cargo consultor (lista plana): só a regra dos 5, sem grupos", async () => {
    const meus = LOTE.filter((x) => x.consultor === "Flávia");
    const { termo, el } = paginaDeAndamento(meus, "", false);
    await nextTick();
    expect(linhas(el).sort()).toEqual(["c1", "c2", "c3", "c4"]); // lista plana mostra tudo
    expect(detalhes(el)).toEqual([]);

    termo.value = "dias";
    await nextTick();
    expect(detalhes(el).sort()).toEqual(["c1", "c2", "c3", "c4"]);

    termo.value = "";
    await nextTick();
    expect(detalhes(el)).toEqual([]);
  });

  it("sem o estado do pai (uso antigo): a lista cuida de si — recolhida, abre pelo cabeçalho, fecha levando os detalhes", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoGroupList, { processos: LOTE }) }));
    expect(linhas(el)).toEqual([]);

    cabecalhoDoGrupo(el, "Dani").click();
    await nextTick();
    expect(linhas(el).sort()).toEqual(["a1", "a2"]);

    botaoDaLinha(el, "a1").click();
    await nextTick();
    expect(detalhes(el)).toEqual(["a1"]);

    cabecalhoDoGrupo(el, "Dani").click(); // fecha o grupo: o detalhe aberto não sobrevive
    await nextTick();
    expect(linhas(el)).toEqual([]);
    cabecalhoDoGrupo(el, "Dani").click();
    await nextTick();
    expect(detalhes(el)).toEqual([]);
  });

  it("foco do sino (focoId): continua abrindo o grupo do processo, SEM abrir o detalhe", async () => {
    const foco = ref("");
    const el = montar(
      defineComponent({ render: () => h(ProcessoGroupList, { processos: LOTE, focoId: foco.value }) }),
    );
    expect(linhas(el)).toEqual([]);

    foco.value = "b1";
    await nextTick();
    expect(linhas(el)).toEqual(["b1"]);
    expect(detalhes(el)).toEqual([]);
  });
});

describe("fluxo do sino (?processo=<id>) com a busca", () => {
  it("busca ativa e o sino limpa a busca: restaura, e DEPOIS o foco abre o grupo (sem abrir o detalhe)", async () => {
    const termo = ref("");
    const foco = ref("");
    const encontrados = computed(() => filtrarPorBusca(LOTE, termo.value));
    const abertura = useAberturaPorBusca({
      termo: () => termo.value,
      encontrados: () => encontrados.value,
      agrupado: () => true,
    });
    const el = montar(
      defineComponent({
        render: () => h(ProcessoGroupList, { processos: encontrados.value, abertura, focoId: foco.value }),
      }),
    );

    termo.value = "maria";
    await nextTick();
    expect(detalhes(el)).toHaveLength(3);

    // Mesma sequência de irParaProcesso (processos.vue): limpa a busca, espera, só então define o foco.
    termo.value = "";
    foco.value = "";
    await nextTick();
    expect(linhas(el)).toEqual([]); // restaurado: tudo recolhido, como antes de digitar
    foco.value = "c2";
    await nextTick();

    expect(linhas(el).sort()).toEqual(["c1", "c2", "c3", "c4"]); // o grupo da Flávia abriu
    expect(detalhes(el)).toEqual([]); // o detalhe continua fechado
  });
});

// ── ProcessoDeliveredList ───────────────────────────────────────────────────────────────────────

describe("ProcessoDeliveredList (aba Entregues)", () => {
  const entregues = [
    proc("e1", "Dani", "Maria Alves", { status: "entregue" }),
    proc("e2", "Dani", "Mariana Costa", { status: "entregue" }),
    proc("e3", "Bolívar", "Carlos Dias", { status: "entregue" }),
  ];

  it("buscar abre os detalhes dos encontrados (≤ 5); apagar restaura", async () => {
    const termo = ref("");
    const encontrados = computed(() => filtrarPorBusca(entregues, termo.value));
    const abertura = useAberturaPorBusca({
      termo: () => termo.value,
      encontrados: () => encontrados.value,
      agrupado: () => false,
    });
    const el = montar(
      defineComponent({ render: () => h(ProcessoDeliveredList, { processos: encontrados.value, abertura }) }),
    );
    expect(detalhes(el)).toEqual([]);

    // abre um à mão ANTES de buscar
    el.querySelector<HTMLButtonElement>("#btn-toggle-entregue-e3")!.click();
    await nextTick();
    expect(detalhes(el)).toEqual(["e3"]);

    termo.value = "maria";
    await nextTick();
    expect(detalhes(el).sort()).toEqual(["e1", "e2"]);

    termo.value = "";
    await nextTick();
    expect(detalhes(el)).toEqual(["e3"]);
  });

  it("mais de 5 resultados: nenhum detalhe abre", async () => {
    const muitos = Array.from({ length: 6 }, (_, i) => proc(`m${i}`, "Dani", `Maria ${i}`, { status: "entregue" }));
    const termo = ref("");
    const encontrados = computed(() => filtrarPorBusca(muitos, termo.value));
    const abertura = useAberturaPorBusca({
      termo: () => termo.value,
      encontrados: () => encontrados.value,
      agrupado: () => false,
    });
    const el = montar(
      defineComponent({ render: () => h(ProcessoDeliveredList, { processos: encontrados.value, abertura }) }),
    );
    termo.value = "maria";
    await nextTick();
    expect(detalhes(el)).toEqual([]);
  });

  it("sem o estado do pai (uso antigo): o botão de seta abre e fecha", async () => {
    const el = montar(defineComponent({ render: () => h(ProcessoDeliveredList, { processos: entregues }) }));
    const botao = () => el.querySelector<HTMLButtonElement>("#btn-toggle-entregue-e1")!;

    botao().click();
    await nextTick();
    expect(detalhes(el)).toEqual(["e1"]);
    botao().click();
    await nextTick();
    expect(detalhes(el)).toEqual([]);
  });
});
