// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import CompraCampo from "../../app/components/compras/CompraCampo.vue";
import { compraComUmMedicamento, compraVaziaDeTeste, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/montarFormulario";

// A linha base (CompraCampo), o cabeçalho (sem chips de status nem contador de pendências) e a casca do formulário único. Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
afterEach(() => {
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});

function montarCampo(props: Record<string, unknown>, conteudo: string): void {
  const el = document.createElement("div");
  document.body.appendChild(el);
  createApp(defineComponent({ render: () => h(CompraCampo, props, { default: () => h("div", { innerHTML: conteudo }) }) })).mount(el);
}

describe("CompraCampo: a linha [rótulo | controle]", () => {
  it("com `para`: o rótulo é um <label for> ligado ao controle, e a linha leva data-linha", () => {
    montarCampo({ idLinha: "laboratorio", rotulo: "Laboratório", para: "meu-controle" }, '<input id="meu-controle" />');
    const linha = q<HTMLElement>('[data-linha="laboratorio"]')!;
    const rotulo = linha.querySelector("label")!;
    expect(rotulo.getAttribute("for")).toBe("meu-controle");
    expect(texto(rotulo)).toBe("Laboratório");
    expect(linha.getAttribute("role")).toBeNull();
    expect(linha.querySelector('[role="group"]')).toBeNull();
  });

  it("sem `para` (vários controles): o rótulo é um texto e a linha é um grupo ligado a ele (aria-labelledby)", () => {
    montarCampo({ idLinha: "envio", rotulo: "Envio" }, "<input /><input />");
    const grupo = q<HTMLElement>('[data-linha="envio"] [role="group"]')!;
    const rotulo = q<HTMLElement>("#compra-linha-envio-rotulo")!;
    expect(grupo.getAttribute("aria-labelledby")).toBe("compra-linha-envio-rotulo");
    expect(rotulo.tagName).toBe("SPAN");
    expect(texto(rotulo)).toBe("Envio");
  });

  it("o erro aparece embaixo, com role=alert e id fixo para o controle apontar (aria-describedby)", () => {
    montarCampo({ idLinha: "ordens", rotulo: "Ordens", para: "x", erro: "Nº Ordem inválido." }, '<input id="x" />');
    const erro = q<HTMLElement>("#compra-linha-ordens-erro")!;
    expect(erro.getAttribute("role")).toBe("alert");
    expect(texto(erro)).toBe("Nº Ordem inválido.");
  });

  it("o texto de apoio (ex.: os dados do broker) aparece embaixo, sem ser erro", () => {
    montarCampo({ idLinha: "despachante", rotulo: "Despachante", para: "x", apoio: "Telefone: 1" }, '<input id="x" />');
    expect(texto(q("#compra-linha-despachante-apoio"))).toBe("Telefone: 1");
    expect(q("#compra-linha-despachante-erro")).toBeNull();
  });

  it("a grade é [210px | controle] em lg+ e o rótulo fica ACIMA no celular (uma coluna)", () => {
    montarCampo({ idLinha: "frete", rotulo: "Frete", para: "x" }, '<input id="x" />');
    const classe = q<HTMLElement>('[data-linha="frete"]')!.className;
    expect(classe).toContain("lg:grid-cols-[210px_minmax(0,1fr)]");
    expect(classe).not.toMatch(/(^|\s)grid-cols-/); // abaixo de lg: uma coluna
  });
});

describe("cabeçalho do formulário", () => {
  it("'Compra NN - Mês/Ano', 'salvo automaticamente' e Duplicar/Cancelar para quem edita", () => {
    montado = montarFormulario(compraComUmMedicamento({ anoMes: "2026-11", sequencia: 13 }));
    expect(texto(q("#compra-titulo"))).toBe("Compra 13 - Novembro/2026");
    expect(q("#btn-duplicar-compra")).not.toBeNull();
    expect(q("#btn-cancelar-compra")).not.toBeNull();
    expect(q("[data-selo-cancelada]")).toBeNull();
  });

  it("sem chips Rascunho/Pronta/Encaminhada e sem contador de pendências", () => {
    montado = montarFormulario(compraComUmMedicamento());
    const cabecalho = texto(q("#compra-cabecalho"));
    for (const proibido of ["Rascunho", "Pronta", "Encaminhada", "pendência", "pendências"]) expect(cabecalho).not.toContain(proibido);
    expect(q("[data-status]")).toBeNull();
    expect(q("#compra-pendencias")).toBeNull();
  });

  it("compra cancelada: selo 'Cancelada', sem Duplicar nem Cancelar", () => {
    montado = montarFormulario(compraComUmMedicamento({ cancelada: true }));
    expect(texto(q("[data-selo-cancelada]"))).toBe("Cancelada");
    expect(q("#btn-duplicar-compra")).toBeNull();
    expect(q("#btn-cancelar-compra")).toBeNull();
  });

  it("sócio (só leitura): sem Duplicar nem Cancelar", () => {
    montado = montarFormulario(compraComUmMedicamento(), { podeEditar: false });
    expect(q("#btn-duplicar-compra")).toBeNull();
    expect(q("#btn-cancelar-compra")).toBeNull();
  });
});

describe("casca do formulário", () => {
  it("UM bloco de campos: sem <fieldset>, sem <legend> e sem texto de 'Dicas'", () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(qa("fieldset")).toHaveLength(0);
    expect(qa("legend")).toHaveLength(0);
    expect(texto(q("#compra-formulario"))).not.toMatch(/Dicas/i);
    expect(q("#compra-campos")).not.toBeNull();
  });

  it("compra de teste usa o modelo novo (sem ordens)", () => {
    expect(compraVaziaDeTeste()).not.toHaveProperty("ordens");
  });
});
