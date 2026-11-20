// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { BLOCOS_DA_COMPRA } from "../../shared/constants/compraResumo";
import type { Compra, MudancasCompra } from "../../shared/types/compra";
import { BLOCOS, BLOCOS_SEM_FORMULARIO, GRUPOS } from "../../app/components/compras/blocosRegistro";
import CompraFormulario from "../../app/components/compras/CompraFormulario.vue";
import { OPCOES_VAZIAS } from "../../app/utils/comprasBlocos";

// A ORDEM do formulário é a de BLOCOS_DA_COMPRA (a do resumo, que a Cris pediu para o formulário seguir): cada bloco é um componente com
// data-bloco="<id>" no elemento raiz; blocos consecutivos pequenos dividem um fieldset sem mudar a ordem; a ordem de Tab é a do DOM.
// Um id novo em BLOCOS_DA_COMPRA sem componente nem entrada em BLOCOS_SEM_FORMULARIO quebra este teste.

const montados: Array<() => void> = [];
afterEach(() => {
  while (montados.length) montados.pop()!();
  document.body.innerHTML = "";
});

const compra: Compra = {
  id: "cmp_1",
  anoMes: "2026-11",
  sequencia: 1,
  cancelada: false,
  paciente: "PACIENTE TESTE",
  processoNumero: "",
  medico: "",
  localAplicacao: "",
  entrega: "",
  contatos: "",
  termoObservacao: "",
  despachante: "",
  isencaoPara: "",
  observacoes: "",
  vendedor: "",
  responsavel: "Cris",
  compraParticular: false,
  localDeclarado: false,
  termoPosterior: false,
  courierSimples: false,
  isencao: false,
  recorrente: false,
  pagamentoAlvara: null,
  pagamentoMomento: null,
  documentos: null,
  pendencias: [],
  criadoPor: "Cris",
  atualizadoPor: "Cris",
  createdAt: "2026-11-19T12:00:00.000Z",
  updatedAt: "2026-11-19T12:00:00.000Z",
  ordens: [],
};

function montar(c: Compra = compra): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () => h(CompraFormulario, { compra: c, estado: "ocioso", salvoEm: null, podeEditar: true, opcoes: OPCOES_VAZIAS, onAlterar: (_m: MudancasCompra) => undefined }),
    }),
  );
  app.mount(el);
  montados.push(() => {
    app.unmount();
    el.remove();
  });
  return el;
}

// Blocos que ainda não têm componente NESTE commit (a lista encolhe a cada commit da etapa 6b e termina vazia).
const AINDA_SEM_COMPONENTE: readonly string[] = ["medicamentos_e_ordens", "local_entrega", "contatos"];

describe("a ordem dos blocos é a de BLOCOS_DA_COMPRA", () => {
  const todos = BLOCOS_DA_COMPRA.filter((id) => !BLOCOS_SEM_FORMULARIO.includes(id));
  const esperados = todos.filter((id) => !AINDA_SEM_COMPONENTE.includes(id));

  it("os grupos visuais, concatenados, SÃO BLOCOS_DA_COMPRA (sem os ids sem formulário), na mesma ordem", () => {
    expect(GRUPOS.flatMap((g) => g.blocos)).toEqual(todos);
  });

  it("todo id de BLOCOS_DA_COMPRA tem componente registrado ou está na lista de exceções (hoje só o `titulo`)", () => {
    expect(BLOCOS_SEM_FORMULARIO).toEqual(["titulo"]);
    const semComponente = BLOCOS_DA_COMPRA.filter((id) => BLOCOS[id] === undefined && !BLOCOS_SEM_FORMULARIO.includes(id));
    expect(semComponente, `sem componente: ${semComponente.join(", ")}`).toEqual([...AINDA_SEM_COMPONENTE]);
  });

  it("nenhum componente registrado para um id fora de BLOCOS_DA_COMPRA, e o `titulo` nunca tem componente", () => {
    for (const id of Object.keys(BLOCOS)) expect(BLOCOS_DA_COMPRA as readonly string[]).toContain(id);
    expect(BLOCOS.titulo).toBeUndefined();
  });

  it("no formulário montado, os [data-bloco] aparecem EXATAMENTE na ordem de BLOCOS_DA_COMPRA (menos o titulo), uma vez cada", () => {
    const el = montar();
    const ids = [...el.querySelectorAll<HTMLElement>("[data-bloco]")].map((b) => b.getAttribute("data-bloco"));
    expect(ids).toEqual(esperados);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("vendedor_responsavel, processo e medico dividem UM fieldset, nessa ordem; cada um dos outros tem o seu", () => {
    const el = montar();
    const grupo = el.querySelector("#compra-grupo-vendedor-processo-medico")!;
    expect([...grupo.querySelectorAll("[data-bloco]")].map((b) => b.getAttribute("data-bloco"))).toEqual(["vendedor_responsavel", "processo", "medico"]);
    const fieldsets = [...el.querySelectorAll("fieldset")];
    expect(fieldsets).toHaveLength(GRUPOS.filter((g) => g.blocos.some((id) => !AINDA_SEM_COMPONENTE.includes(id))).length);
    expect(fieldsets.every((f) => f.querySelector("legend") !== null)).toBe(true);
  });

  it("as legendas dos fieldsets (11px, caixa alta pelo CSS)", () => {
    const el = montar();
    const legendas = [...el.querySelectorAll("legend")];
    expect(legendas.map((l) => (l.textContent ?? "").trim())).toEqual(GRUPOS.filter((g) => g.blocos.some((id) => !AINDA_SEM_COMPONENTE.includes(id))).map((g) => g.legenda));
    expect(legendas.every((l) => l.className.includes("text-[11px]") && l.className.includes("uppercase"))).toBe(true);
  });
});

describe("a ordem de Tab é a do DOM", () => {
  it("nenhum elemento do formulário tem tabindex positivo", () => {
    const el = montar();
    const positivos = [...el.querySelectorAll<HTMLElement>("[tabindex]")].filter((e) => Number(e.getAttribute("tabindex")) > 0);
    expect(positivos).toEqual([]);
  });

  it("os campos aparecem no DOM na ordem dos blocos (cada campo dentro do seu bloco, e os blocos em sequência)", () => {
    const el = montar();
    const campos = [...el.querySelectorAll<HTMLElement>("[data-bloco] input, [data-bloco] button, [data-bloco] textarea")];
    const blocosDosCampos = campos.map((c) => c.closest("[data-bloco]")!.getAttribute("data-bloco")!);
    // Os blocos dos campos nunca "voltam": a sequência é não decrescente na ordem de BLOCOS_DA_COMPRA.
    const posicoes = blocosDosCampos.map((b) => BLOCOS_DA_COMPRA.indexOf(b as (typeof BLOCOS_DA_COMPRA)[number]));
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });
});
