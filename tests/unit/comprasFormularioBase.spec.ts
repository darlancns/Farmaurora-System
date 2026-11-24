// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import CompraCampo from "../../app/components/compras/CompraCampo.vue";
import CompraFormulario from "../../app/components/compras/CompraFormulario.vue";
import { OPCOES_VAZIAS } from "../../app/utils/comprasOpcoes";
import { compraComUmMedicamento, compraVaziaDeTeste, itemDeTeste, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/montarFormulario";

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

  it("a grade é [140px | controle] em lg+ e o rótulo fica ACIMA no celular (uma coluna)", () => {
    montarCampo({ idLinha: "frete", rotulo: "Frete", para: "x" }, '<input id="x" />');
    const classe = q<HTMLElement>('[data-linha="frete"]')!.className;
    expect(classe).toContain("lg:grid-cols-[140px_minmax(0,1fr)]");
    expect(classe).not.toMatch(/(^|\s)grid-cols-/); // abaixo de lg: uma coluna
  });
});

describe("cabeçalho do formulário", () => {
  it("'Compra NN - Mês/Ano' e Duplicar/Cancelar/Apagar para quem edita", () => {
    montado = montarFormulario(compraComUmMedicamento({ anoMes: "2026-11", sequencia: 13 }));
    expect(texto(q("#compra-titulo"))).toBe("Compra 13 - Novembro/2026");
    expect(q("#btn-duplicar-compra")).not.toBeNull();
    expect(q("#btn-cancelar-compra")).not.toBeNull();
    expect(q("#btn-apagar-compra")).not.toBeNull();
    expect(q("[data-selo-cancelada]")).toBeNull();
  });

  it("sem chips Rascunho/Pronta/Encaminhada e sem contador de pendências", () => {
    montado = montarFormulario(compraComUmMedicamento());
    const cabecalho = texto(q("#compra-cabecalho"));
    for (const proibido of ["Rascunho", "Pronta", "Encaminhada", "pendência", "pendências"]) expect(cabecalho).not.toContain(proibido);
    expect(q("[data-status]")).toBeNull();
    expect(q("#compra-pendencias")).toBeNull();
  });

  it("compra cancelada: selo 'Cancelada', sem Duplicar nem Cancelar (mas pode ser apagada)", () => {
    montado = montarFormulario(compraComUmMedicamento({ cancelada: true }));
    expect(texto(q("[data-selo-cancelada]"))).toBe("Cancelada");
    expect(q("#btn-duplicar-compra")).toBeNull();
    expect(q("#btn-cancelar-compra")).toBeNull();
    expect(q("#btn-apagar-compra")).not.toBeNull();
  });

  it("sócio (só leitura): sem Duplicar, Cancelar nem Apagar", () => {
    montado = montarFormulario(compraComUmMedicamento(), { podeEditar: false });
    expect(q("#btn-duplicar-compra")).toBeNull();
    expect(q("#btn-cancelar-compra")).toBeNull();
    expect(q("#btn-apagar-compra")).toBeNull();
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

  it("o título nunca é cortado nem quebra (nowrap, sem truncate); o título e as três ações ficam na MESMA linha (flex-row) quando a coluna comporta, e nunca saem do cabeçalho", () => {
    formularioDireto("ocioso");
    expect(q("#compra-titulo")!.className).toContain("whitespace-nowrap");
    expect(q("#compra-titulo")!.className).not.toContain("truncate");
    const cabecalho = q("#compra-cabecalho")!;
    expect(cabecalho.className).toContain("lg:@min-[28rem]:flex-row");
    expect(cabecalho.className).toContain("lg:@min-[28rem]:items-center");
    expect(cabecalho.className).toContain("lg:@min-[28rem]:justify-between");
    expect(q("#compra-cabecalho-bloco")!.className).toContain("@container"); // é a largura da COLUNA que decide, não a da janela
    expect(cabecalho.contains(q("#compra-titulo"))).toBe(true);
    expect(cabecalho.contains(q("#compra-acoes"))).toBe(true);
    expect(q("#btn-duplicar-compra")!.parentElement).toBe(q("#btn-cancelar-compra")!.parentElement);
    expect(q("#btn-duplicar-compra")!.parentElement).toBe(q("#btn-apagar-compra")!.parentElement);
    expect(q("#btn-duplicar-compra")!.parentElement!.className).toContain("lg:@min-[28rem]:flex-nowrap");
    expect(q("#btn-duplicar-compra")!.parentElement!.className).toContain("lg:@min-[28rem]:shrink-0");
  });

  it("Duplicar, Cancelar e Apagar avisam (só para quem edita)", () => {
    const eventos: string[] = [];
    formularioDireto("ocioso", { onDuplicar: () => eventos.push("duplicar"), onCancelar: () => eventos.push("cancelar"), onApagar: () => eventos.push("apagar") });
    q<HTMLButtonElement>("#btn-duplicar-compra")!.click();
    q<HTMLButtonElement>("#btn-cancelar-compra")!.click();
    q<HTMLButtonElement>("#btn-apagar-compra")!.click();
    expect(eventos).toEqual(["duplicar", "cancelar", "apagar"]);
  });

  it("somente leitura: campos desabilitados (aria-disabled no bloco), sem botões de escrita", () => {
    formularioDireto("ocioso", { podeEditar: false });
    expect(q("#compra-campos")!.getAttribute("aria-disabled")).toBe("true");
    expect(q("#btn-duplicar-compra")).toBeNull();
    expect(qa<HTMLInputElement>("#compra-campos input").every((i) => i.disabled)).toBe(true);
  });
});

describe("larguras: coluna do rótulo estreita e controles ocupando TODA a largura", () => {
  it("o rótulo pode quebrar em 2 linhas (break-words, sem truncate) e a coluna é de 140px", () => {
    montado = montarFormulario(compraComUmMedicamento());
    const rotulo = q<HTMLElement>('[data-linha="valor_real"] label')!;
    expect(rotulo.className).toContain("break-words");
    expect(rotulo.className).not.toContain("truncate");
    expect(q('[data-linha="valor_real"]')!.className).toContain("lg:grid-cols-[140px_minmax(0,1fr)]");
  });

  it("nenhum controle das linhas (fora o stepper de Ordens) tem largura máxima: todos vão até o fim da coluna de controle", () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1), itemDeTeste(2)] }));
    for (const linha of qa<HTMLElement>("#compra-campos [data-linha]")) {
      if (linha.getAttribute("data-linha") === "ordens") continue;
      expect(linha.innerHTML, linha.getAttribute("data-linha")!).not.toMatch(/(^|[\s"'])max-w-/); // (o `[&_ul]:max-w` da lista suspensa não conta)
    }
    expect(q('[data-linha="ordens"] [class*="max-w-"]')).not.toBeNull(); // o stepper pode ficar curto
  });

  it("a etiqueta 'Med. N' é compacta: texto pequeno, ~3rem, colada ao controle", () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1), itemDeTeste(2)] }));
    const etiqueta = q<HTMLElement>('[data-linha="laboratorio"] [data-etiqueta-med]')!;
    expect(etiqueta.className).toContain("text-[11px]");
    expect(etiqueta.parentElement!.className).toContain("grid-cols-[3rem_minmax(0,1fr)]");
    expect(etiqueta.parentElement!.className).toContain("gap-x-1");
  });

  it("dinheiro: o rótulo não leva '(US$)' e o campo mostra 'US$' como prefixo DENTRO do input (decorativo, fora do nome acessível)", () => {
    montado = montarFormulario(compraComUmMedicamento());
    for (const linha of ["valor_unitario", "valor_real", "frete", "frete_real"]) {
      const el = q<HTMLElement>(`[data-linha="${linha}"]`)!;
      expect(texto(el.querySelector("label"))).not.toContain("US$");
      const prefixo = el.querySelector<HTMLElement>("[data-prefixo-moeda]")!;
      expect(texto(prefixo)).toBe("US$");
      expect(prefixo.getAttribute("aria-hidden")).toBe("true");
      expect(prefixo.parentElement!.querySelector("input")!.getAttribute("style")).toContain("padding-left");
    }
  });
});
