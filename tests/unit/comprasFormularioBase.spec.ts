// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import CompraCampo from "../../app/components/compras/CompraCampo.vue";
import CompraFormulario from "../../app/components/compras/CompraFormulario.vue";
import { OPCOES_VAZIAS } from "../../app/utils/comprasOpcoes";
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

describe("faixa de conflito e estados do formulário", () => {
  function formularioDireto(estado: string, extra: Record<string, unknown> = {}) {
    const ev: string[] = [];
    const el = document.createElement("div");
    document.body.appendChild(el);
    createApp(
      defineComponent({
        render: () =>
          h(CompraFormulario, {
            compra: compraComUmMedicamento(),
            estado,
            podeEditar: true,
            opcoes: OPCOES_VAZIAS,
            onCarregarVersaoSalva: () => ev.push("carregar"),
            onManterMinhas: () => ev.push("manter"),
            onTentarDeNovo: () => ev.push("tentar"),
            ...extra,
          }),
      }),
    ).mount(el);
    return ev;
  }

  it("só no 409 (estado 'conflito') a faixa aparece, com o texto e as DUAS saídas, que avisam", () => {
    const ev = formularioDireto("conflito");
    expect(texto(q("#compra-faixa-conflito"))).toContain("Esta compra foi alterada por outra pessoa.");
    q<HTMLButtonElement>("#btn-conflito-carregar")!.click();
    q<HTMLButtonElement>("#btn-conflito-manter")!.click();
    expect(ev).toEqual(["carregar", "manter"]);
    expect(texto(q("#compra-salvamento-regiao"))).toBe(""); // o conflito tem a faixa; nenhum texto de salvamento
  });

  it("sem conflito, a faixa não existe; e não há a faixa antiga 'Compra cancelada' (o selo do cabeçalho basta)", () => {
    formularioDireto("salvo", { compra: compraComUmMedicamento({ cancelada: true }) });
    expect(q("#compra-faixa-conflito")).toBeNull();
    expect(q("#compra-faixa-cancelada")).toBeNull();
    expect(texto(q("[data-selo-cancelada]"))).toBe("Cancelada");
  });

  it("falhou de vez: 'Não foi possível salvar. Tentar de novo' avisa", () => {
    const ev = formularioDireto("erro", { esperandoClique: true });
    q<HTMLButtonElement>("#compra-salvamento-erro")!.click();
    expect(ev).toEqual(["tentar"]);
  });

  it("NÃO existe 'Salvo automaticamente' no cabeçalho, em nenhum estado; o estado vai só para data-salvamento (sem texto)", () => {
    for (const estado of ["ocioso", "pendente", "salvando", "salvo"]) {
      document.body.innerHTML = "";
      formularioDireto(estado);
      expect(texto(q("#compra-cabecalho"))).not.toMatch(/Salvo|Salvando|automaticamente/i);
      expect(q("#compra-salvamento")).toBeNull();
      expect(q("#compra-formulario")!.getAttribute("data-salvamento")).toBe(estado);
    }
  });

  it("o erro de salvamento aparece FORA do cabeçalho (abaixo dele): 'Tentando salvar de novo…' e, depois das tentativas, o alerta com 'Tentar de novo'", () => {
    formularioDireto("erro", { esperandoClique: false });
    expect(texto(q("#compra-salvamento"))).toBe("Tentando salvar de novo…");
    expect(q("#compra-cabecalho")!.contains(q("#compra-salvamento"))).toBe(false);
    expect(q("[role=alert]")).toBeNull();
    document.body.innerHTML = "";
    formularioDireto("erro", { esperandoClique: true });
    const alerta = q<HTMLElement>("#compra-salvamento-alerta")!;
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(q("#compra-cabecalho")!.contains(alerta)).toBe(false);
    expect(q("#compra-cabecalho-bloco")!.contains(alerta)).toBe(true);
  });

  it("o título nunca quebra e Duplicar/Cancelar ficam na mesma linha (nowrap/truncate), em qualquer largura de desktop", () => {
    formularioDireto("ocioso");
    expect(q("#compra-titulo")!.className).toContain("whitespace-nowrap");
    expect(q("#compra-titulo")!.className).toContain("truncate");
    expect(q("#compra-cabecalho")!.className).toContain("lg:flex-nowrap");
    expect(q("#btn-duplicar-compra")!.parentElement).toBe(q("#btn-cancelar-compra")!.parentElement);
    expect(q("#btn-duplicar-compra")!.parentElement!.className).toContain("flex-nowrap");
    expect(q("#btn-duplicar-compra")!.parentElement!.className).toContain("shrink-0");
  });

  it("Duplicar e Cancelar avisam (só para quem edita)", () => {
    const eventos: string[] = [];
    formularioDireto("ocioso", { onDuplicar: () => eventos.push("duplicar"), onCancelar: () => eventos.push("cancelar") });
    q<HTMLButtonElement>("#btn-duplicar-compra")!.click();
    q<HTMLButtonElement>("#btn-cancelar-compra")!.click();
    expect(eventos).toEqual(["duplicar", "cancelar"]);
  });

  it("somente leitura: campos desabilitados (aria-disabled no bloco), sem botões de escrita", () => {
    formularioDireto("ocioso", { podeEditar: false });
    expect(q("#compra-campos")!.getAttribute("aria-disabled")).toBe("true");
    expect(q("#btn-duplicar-compra")).toBeNull();
    expect(qa<HTMLInputElement>("#compra-campos input").every((i) => i.disabled)).toBe(true);
  });
});
