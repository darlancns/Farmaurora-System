// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { COMPRA_MAX_ITENS_POR_ORDEM, COMPRA_MAX_ORDENS } from "../../shared/constants/compra";
import { MODAIS_ENVIO, MODAL_COURIER_SIMPLES } from "../../shared/constants/processos";
import type { ItemCompra, OrdemCompra } from "../../shared/types/compra";
import { COMPRA_ID_RE } from "../../shared/constants/compra";
import { itemTemConteudo, ordemTemConteudo, ordemVazia, itemVazio } from "../../shared/utils/compraForm";
import { dinheiroDoTexto, dinheiroParaTexto } from "../../app/utils/comprasDinheiro";
import { compraTeste, clicar, digitar, escolherNoSelect, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/formularioCompra";

// O bloco Ordens e medicamentos no formulário REAL: cartões, linhas, chaves estáveis, remover, limites, ordem encaminhada, PO, dinheiro
// e somente leitura. Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
afterEach(() => {
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});
const abrir = (...args: Parameters<typeof montarFormulario>): FormularioMontado => (montado = montarFormulario(...args));

const item = (id: string, posicao: number, extra: Partial<ItemCompra> = {}): ItemCompra => ({ ...itemVazio(posicao), id, ...extra });
const ordem = (id: string, posicao: number, itens: ItemCompra[], extra: Partial<OrdemCompra> = {}): OrdemCompra => ({ ...ordemVazia(posicao), id, itens, ...extra });

const OPCOES = {
  fornecedores: [
    { nome: "Fornecedor Teste A", pais: "Alemanha", prazoAlertaDias: 30, semAlerta: false },
    { nome: "Fornecedor Teste B", pais: "", prazoAlertaDias: null, semAlerta: true },
  ],
  ciasAereas: [{ nome: "Cia Teste" }],
  temperaturas: [{ nome: "2°C a 8°C" }, { nome: "Ambiente" }],
};

const cartoes = () => qa<HTMLElement>("[data-ordem-cartao]");
const linhas = (ordemId?: string) => qa<HTMLElement>(`${ordemId ? `#ordem-${ordemId} ` : ""}[data-item-linha]`);
const valorDe = (sel: string) => q<HTMLInputElement>(sel)!.value;

describe("cartões de ordem", () => {
  it("uma 'Ordem N' por cartão, com a dica fixa", () => {
    abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a00001", 1)]), ordem("ord_b00001", 2, [item("itm_b00001", 1)])] }), { opcoes: OPCOES });
    expect(cartoes().map((c) => texto(c.querySelector("h3")))).toEqual(["Ordem 1", "Ordem 2"]);
    expect(texto(q("[data-bloco='medicamentos_e_ordens']"))).toContain("Cada ordem vira uma linha da DIR com o seu PO.");
  });

  it("campos da ordem: Fornecedor, Envio, Cia. aérea, PO, Frete e Frete real, cada um com rótulo ligado", () => {
    abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a00001", 1)])] }), { opcoes: OPCOES });
    const rotulos = Object.fromEntries(qa<HTMLLabelElement>("#ordem-ord_a00001 > div > div > label").map((l) => [l.htmlFor, texto(l)]));
    expect(rotulos).toMatchObject({
      "ordem-ord_a00001-fornecedor": "Fornecedor",
      "ordem-ord_a00001-envio": "Envio",
      "ordem-ord_a00001-cia": "Cia. aérea",
      "ordem-ord_a00001-po": "PO",
      "ordem-ord_a00001-frete": "Frete (US$)",
      "ordem-ord_a00001-frete-real": "Frete real (US$)",
    });
  });

  it("Fornecedor, Envio e Cia vêm dos Cadastros (e Envio dos MODAIS_ENVIO, sem texto solto); escolher grava", async () => {
    const f = abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a00001", 1)])] }), { opcoes: OPCOES });
    await escolherNoSelect("#ordem-ord_a00001-fornecedor", "Fornecedor Teste B");
    expect(f.compra.value.ordens[0]!.fornecedor).toBe("Fornecedor Teste B");
    await clicar("#ordem-ord_a00001-envio");
    expect(qa("[role=option]").map((o) => texto(o))).toEqual(["Selecione", ...MODAIS_ENVIO]);
    qa<HTMLElement>("[role=option]")[1]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await nextTick();
    expect(f.compra.value.ordens[0]!.envio).toBe(MODAIS_ENVIO[0]);
    await escolherNoSelect("#ordem-ord_a00001-cia", "Cia Teste");
    expect(f.compra.value.ordens[0]!.cia).toBe("Cia Teste");
  });

  it("o contrato só tem `cia`: NÃO existe campo de transportadora do courier", () => {
    abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a00001", 1)])] }), { opcoes: OPCOES });
    expect(document.body.textContent?.toLowerCase()).not.toContain("transportadora");
  });

  it("PO: maiúsculas automáticas e sem espaços, placeholder PO26-11-0000 e a dica 'pode ficar para depois'; formato inválido NÃO é erro na tela", async () => {
    const f = abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a00001", 1)])] }));
    const po = q<HTMLInputElement>("#ordem-ord_a00001-po")!;
    expect(po.placeholder).toBe("PO26-11-0000");
    expect(po.className).toContain("font-mono");
    expect(texto(q("#ordem-ord_a00001"))).toContain("Pode ficar para depois.");
    await digitar("#ordem-ord_a00001-po", "po26 -11-00");
    expect(f.compra.value.ordens[0]!.po).toBe("PO26-11-00");
    expect(q("#ordem-ord_a00001 [role=alert]")).toBeNull();
    expect(texto(q("#ordem-ord_a00001"))).not.toMatch(/inválid/i);
  });

  it("Courier Simples em TODAS as ordens: courier_simples da compra liga e o Despachante vira a nota 'Dispensado'", async () => {
    const f = abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a00001", 1)])] }), { opcoes: OPCOES });
    expect(q("#compra-despachante")).not.toBeNull();
    await escolherNoSelect("#ordem-ord_a00001-envio", MODAL_COURIER_SIMPLES);
    expect(f.compra.value.courierSimples).toBe(true);
    expect(q("#compra-despachante")).toBeNull();
    expect(texto(q("#compra-despachante-dispensado"))).toBe("Dispensado: todas as ordens são Courier Simples");
    await clicar("#compra-adicionar-ordem");
    expect(f.compra.value.courierSimples).toBe(false); // a 2ª ordem ainda sem envio
    expect(q("#compra-despachante")).not.toBeNull();
  });
});

describe("dinheiro (US$): vazio é null, zero é zero", () => {
  it("as funções puras: vazio e sem dígito → null; '0' → 0; formatos de fora; duas casas; sem negativo", () => {
    expect(dinheiroDoTexto("")).toBeNull();
    expect(dinheiroDoTexto("   ")).toBeNull();
    expect(dinheiroDoTexto("abc")).toBeNull();
    expect(dinheiroDoTexto("0")).toBe(0);
    expect(dinheiroDoTexto("0,00")).toBe(0);
    expect(dinheiroDoTexto("1.234,50")).toBe(1234.5);
    expect(dinheiroDoTexto("$8,550.00")).toBe(8550);
    expect(dinheiroDoTexto("12,5")).toBe(12.5);
    expect(dinheiroDoTexto("-5")).toBe(5); // o sinal é descartado: nunca negativo
    expect(dinheiroParaTexto(null)).toBe("");
    expect(dinheiroParaTexto(0)).toBe("0,00");
    expect(dinheiroParaTexto(1234.5)).toBe("1.234,50");
    expect(dinheiroParaTexto(dinheiroDoTexto("1.234,56"))).toBe("1.234,56");
  });

  it("nos campos: digitar grava número, apagar grava null, '0' grava 0; ao sair o texto vira '1.234,50'", async () => {
    const f = abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a00001", 1)])] }));
    const freteSel = "#ordem-ord_a00001-frete";
    await digitar(freteSel, "1234,5");
    expect(f.compra.value.ordens[0]!.frete).toBe(1234.5);
    q<HTMLInputElement>(freteSel)!.dispatchEvent(new FocusEvent("blur"));
    await nextTick();
    expect(valorDe(freteSel)).toBe("1.234,50");
    await digitar(freteSel, "");
    expect(f.compra.value.ordens[0]!.frete).toBeNull();
    await digitar(freteSel, "0");
    expect(f.compra.value.ordens[0]!.frete).toBe(0);
    expect(q<HTMLInputElement>(freteSel)!.className).toContain("font-mono");
    await digitar("#item-itm_a00001-valor-unitario", "12,34");
    await digitar("#item-itm_a00001-valor-real", "0");
    expect(f.compra.value.ordens[0]!.itens[0]).toMatchObject({ valorUnitario: 12.34, valorReal: 0 });
  });

  it("carregar uma compra mostra o valor formatado (e zero aparece como 0,00, vazio como vazio)", () => {
    abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a00001", 1, { valorUnitario: 1234.5, valorReal: 0 })], { frete: null, freteReal: 99.9 })] }));
    expect(valorDe("#item-itm_a00001-valor-unitario")).toBe("1.234,50");
    expect(valorDe("#item-itm_a00001-valor-real")).toBe("0,00");
    expect(valorDe("#ordem-ord_a00001-frete")).toBe("");
    expect(valorDe("#ordem-ord_a00001-frete-real")).toBe("99,90");
  });
});

describe("linhas de medicamento", () => {
  it("campos: Qtd, Medicamento, Apresentação, Valor unit., Valor real e Temperatura; ✕ escondido no primeiro item", () => {
    abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a", 1), item("itm_b", 2)])] }), { opcoes: OPCOES });
    const rotulos = qa<HTMLLabelElement>("#item-itm_a > div:first-child label").map((l) => texto(l));
    expect(rotulos).toEqual(["Qtd", "Medicamento", "Apresentação", "Valor unit. (US$)", "Valor real (US$)", "Temperatura"]);
    expect(q("#item-itm_a-remover")).toBeNull();
    expect(q("#item-itm_b-remover")).not.toBeNull();
  });

  it("um item não pode ser removido se for o único (nenhum ✕)", () => {
    abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a", 1)])] }));
    expect(qa("[id$='-remover'][id^='item-']")).toHaveLength(0);
  });

  it("'Detalhes' recolhido: Referência/Bioequivalente e Laboratório; abre sozinho quando algum está preenchido", () => {
    abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a", 1), item("itm_b", 2, { laboratorio: "Lab Teste" })])] }));
    const detalhes = qa<HTMLDetailsElement>("#item-itm_a details, #item-itm_b details");
    expect(detalhes.map((d) => d.open)).toEqual([false, true]);
    expect(texto(detalhes[0]!.querySelector("summary"))).toBe("Detalhes");
    expect(qa("#item-itm_a details label").map((l) => texto(l))).toEqual(["Referência/Bioequivalente", "Laboratório"]);
  });

  it("digitar em cada campo grava no item certo (e só nele)", async () => {
    const f = abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a", 1), item("itm_b", 2)])] }));
    await digitar("#item-itm_b-quantidade", "12 ampolas");
    await digitar("#item-itm_b-medicamento", "MED B TESTE");
    await digitar("#item-itm_b-apresentacao", "10 mg");
    await digitar("#item-itm_b-referencia", "REF B");
    await digitar("#item-itm_b-laboratorio", "LAB B");
    const [a, b] = f.compra.value.ordens[0]!.itens;
    expect(a).toMatchObject({ quantidade: "", medicamento: "", apresentacao: "" });
    expect(b).toMatchObject({ quantidade: "12 ampolas", medicamento: "MED B TESTE", apresentacao: "10 mg", referencia: "REF B", laboratorio: "LAB B" });
  });

  it("a Temperatura vem da lista do Cadastro e um valor antigo fora da lista continua selecionado", async () => {
    const f = abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a", 1, { temperatura: "Temperatura antiga" })])] }), { opcoes: OPCOES });
    expect(texto(q("#item-itm_a-temperatura"))).toBe("Temperatura antiga");
    await escolherNoSelect("#item-itm_a-temperatura", "Ambiente");
    expect(f.compra.value.ordens[0]!.itens[0]!.temperatura).toBe("Ambiente");
  });
});

describe("adicionar e remover (chaves estáveis: nunca o índice)", () => {
  it("+ Adicionar medicamento acrescenta uma linha vazia com id novo no formato do servidor e a posição certa", async () => {
    const f = abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a", 1)])] }));
    await clicar("#ordem-ord_a00001-adicionar-item");
    const itens = f.compra.value.ordens[0]!.itens;
    expect(itens).toHaveLength(2);
    expect(itens[1]).toMatchObject({ posicao: 2, medicamento: "", quantidade: "" });
    expect(COMPRA_ID_RE.test(itens[1]!.id)).toBe(true);
    expect(linhas()).toHaveLength(2);
  });

  it("REMOVER o item do MEIO não troca o valor digitado em outra linha (valores diferentes em cada uma)", async () => {
    const f = abrir(
      compraTeste({
        ordens: [
          ordem("ord_a00001", 1, [
            item("itm_a", 1, { medicamento: "PRIMEIRO", quantidade: "1", valorUnitario: 1.5, apresentacao: "A mg" }),
            item("itm_b", 2, { medicamento: "SEGUNDO", quantidade: "2", valorUnitario: 2.5, apresentacao: "B mg" }),
            item("itm_c", 3, { medicamento: "TERCEIRO", quantidade: "3", valorUnitario: 3.5, apresentacao: "C mg", laboratorio: "Lab C" }),
          ]),
        ],
      }),
    );
    // Uma digitação "não salva" ainda na 3ª linha: tem de sobreviver à remoção do meio.
    await digitar("#item-itm_c-medicamento", "TERCEIRO EDITADO");
    await clicar("#item-itm_b-remover");
    const restantes = f.compra.value.ordens[0]!.itens;
    expect(restantes.map((i) => i.id)).toEqual(["itm_a", "itm_c"]);
    expect(restantes.map((i) => i.posicao)).toEqual([1, 2]);
    expect(linhas().map((l) => l.id)).toEqual(["item-itm_a", "item-itm_c"]);
    expect(valorDe("#item-itm_a-medicamento")).toBe("PRIMEIRO");
    expect(valorDe("#item-itm_a-quantidade")).toBe("1");
    expect(valorDe("#item-itm_a-valor-unitario")).toBe("1,50");
    expect(valorDe("#item-itm_a-apresentacao")).toBe("A mg");
    expect(valorDe("#item-itm_c-medicamento")).toBe("TERCEIRO EDITADO");
    expect(valorDe("#item-itm_c-quantidade")).toBe("3");
    expect(valorDe("#item-itm_c-valor-unitario")).toBe("3,50");
    expect(valorDe("#item-itm_c-laboratorio")).toBe("Lab C");
    expect(q<HTMLDetailsElement>("#item-itm_c details")!.open).toBe(true);
    expect(q<HTMLDetailsElement>("#item-itm_a details")!.open).toBe(false);
  });

  it("remover o ÚLTIMO e o do meio em sequência mantém cada valor na sua linha", async () => {
    const f = abrir(
      compraTeste({
        ordens: [ordem("ord_a00001", 1, [item("itm_a", 1, { medicamento: "A" }), item("itm_b", 2, { medicamento: "B" }), item("itm_c", 3, { medicamento: "C" }), item("itm_d", 4, { medicamento: "D" })])],
      }),
    );
    await clicar("#item-itm_d-remover");
    await clicar("#item-itm_b-remover");
    expect(f.compra.value.ordens[0]!.itens.map((i) => [i.id, i.medicamento, i.posicao])).toEqual([
      ["itm_a", "A", 1],
      ["itm_c", "C", 2],
    ]);
    expect(valorDe("#item-itm_c-medicamento")).toBe("C");
  });

  it("+ Adicionar ordem (outro fornecedor) acrescenta um cartão com UM item vazio, id novo e posição certa", async () => {
    const f = abrir(compraTeste({ ordens: [ordem("ord_a00001", 1, [item("itm_a", 1)])] }));
    await clicar("#compra-adicionar-ordem");
    const ordens = f.compra.value.ordens;
    expect(ordens).toHaveLength(2);
    expect(ordens[1]).toMatchObject({ posicao: 2, fornecedor: "", dirId: null });
    expect(ordens[1]!.itens).toHaveLength(1);
    expect(COMPRA_ID_RE.test(ordens[1]!.id)).toBe(true);
    expect(cartoes().map((c) => texto(c.querySelector("h3")))).toEqual(["Ordem 1", "Ordem 2"]);
  });

  it("sem nenhuma ordem (compra antiga) só há o botão de adicionar", async () => {
    const f = abrir(compraTeste({ ordens: [] }));
    expect(cartoes()).toHaveLength(0);
    await clicar("#compra-adicionar-ordem");
    expect(f.compra.value.ordens).toHaveLength(1);
  });

  it("a 1ª ordem NÃO tem 'Remover ordem'; da 2ª em diante tem", () => {
    abrir(compraTeste({ ordens: [ordem("ord_a", 1, [item("itm_a", 1)]), ordem("ord_b", 2, [item("itm_b", 1)])] }));
    expect(q("#ordem-ord_a-remover")).toBeNull();
    expect(q("#ordem-ord_b-remover")).not.toBeNull();
    expect(texto(q("#ordem-ord_b-remover"))).toBe("Remover ordem");
  });

  it("remover uma ordem VAZIA é direto; remover a do MEIO não troca os dados das outras (chave = id)", async () => {
    const f = abrir(
      compraTeste({
        ordens: [
          ordem("ord_a", 1, [item("itm_a", 1, { medicamento: "MED A" })], { fornecedor: "Fornecedor Teste A", po: "PO26-11-0001" }),
          ordem("ord_b", 2, [item("itm_b", 1)]), // vazia
          ordem("ord_c", 3, [item("itm_c", 1, { medicamento: "MED C" })], { fornecedor: "Fornecedor Teste B", po: "PO26-11-0003" }),
        ],
      }),
      { opcoes: OPCOES },
    );
    await clicar("#ordem-ord_b-remover");
    expect(document.querySelector("[role=alertdialog]")).toBeNull(); // vazia: sem confirmação
    const ordens = f.compra.value.ordens;
    expect(ordens.map((o) => [o.id, o.posicao])).toEqual([
      ["ord_a", 1],
      ["ord_c", 2],
    ]);
    expect(cartoes().map((c) => texto(c.querySelector("h3")))).toEqual(["Ordem 1", "Ordem 2"]);
    expect(valorDe("#ordem-ord_a-po")).toBe("PO26-11-0001");
    expect(valorDe("#ordem-ord_c-po")).toBe("PO26-11-0003");
    expect(valorDe("#item-itm_c-medicamento")).toBe("MED C");
    expect(texto(q("#ordem-ord_c-fornecedor"))).toBe("Fornecedor Teste B");
  });

  it("remover uma ordem PREENCHIDA pede confirmação: 'Voltar' mantém, 'Remover ordem' remove", async () => {
    const f = abrir(compraTeste({ ordens: [ordem("ord_a", 1, [item("itm_a", 1)]), ordem("ord_b", 2, [item("itm_b", 1, { medicamento: "MED B" })])] }));
    await clicar("#ordem-ord_b-remover");
    const dialogo = document.querySelector("[role=alertdialog]")!;
    expect(dialogo).not.toBeNull();
    const botoes = [...dialogo.querySelectorAll("button")];
    botoes.find((b) => texto(b) === "Voltar")!.click();
    await nextTick();
    expect(f.compra.value.ordens).toHaveLength(2);
    expect(document.querySelector("[role=alertdialog]")).toBeNull();
    await clicar("#ordem-ord_b-remover");
    [...document.querySelectorAll("[role=alertdialog] button")].find((b) => texto(b) === "Remover ordem")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(f.compra.value.ordens.map((o) => o.id)).toEqual(["ord_a"]);
  });

  it("a confirmação também vale quando só o frete ou só o PO estão preenchidos", () => {
    expect(ordemTemConteudo(ordem("o", 2, [item("i", 1)], { frete: 0 }))).toBe(true);
    expect(ordemTemConteudo(ordem("o", 2, [item("i", 1)], { po: "PO26-11-0001" }))).toBe(true);
    expect(ordemTemConteudo(ordem("o", 2, [item("i", 1, { valorReal: 0 })]))).toBe(true);
    expect(ordemTemConteudo(ordem("o", 2, [item("i", 1)]))).toBe(false);
    expect(itemTemConteudo(item("i", 1, { preCadastroId: "pre_1" }))).toBe(true);
    expect(itemTemConteudo(item("i", 1))).toBe(false);
  });
});

describe("ordem já encaminhada para a DIR", () => {
  it("etiqueta 'Encaminhada em dd/mm' (dia de BRASÍLIA) e 'Remover ordem' desabilitado com a dica", () => {
    // 02h30 UTC de 20/11 ainda é 19/11 em Brasília.
    abrir(compraTeste({ ordens: [ordem("ord_a", 1, [item("itm_a", 1)]), ordem("ord_b", 2, [item("itm_b", 1)], { dirId: "dir_1", encaminhadaEm: "2026-11-20T02:30:00.000Z" })] }));
    expect(texto(q("#ordem-ord_b-encaminhada"))).toBe("Encaminhada em 19/11");
    const botao = q<HTMLButtonElement>("#ordem-ord_b-remover")!;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toBe("Já encaminhada para a DIR");
    expect(q("#ordem-ord_a-encaminhada")).toBeNull();
  });

  it("a ordem encaminhada continua editável (só a remoção é travada) e, sem data, a etiqueta é só 'Encaminhada'", async () => {
    const f = abrir(compraTeste({ ordens: [ordem("ord_a", 1, [item("itm_a", 1)], { dirId: "dir_1", encaminhadaEm: null })] }));
    expect(texto(q("#ordem-ord_a-encaminhada"))).toBe("Encaminhada");
    await digitar("#item-itm_a-medicamento", "AINDA EDITA");
    expect(f.compra.value.ordens[0]!.itens[0]!.medicamento).toBe("AINDA EDITA");
    expect(f.compra.value.ordens[0]!.dirId).toBe("dir_1"); // o dir_id é preservado no estado
  });
});

describe("limites do servidor (10 ordens, 30 itens por ordem)", () => {
  it("com 10 ordens o botão de adicionar ordem fica desabilitado, com a dica", () => {
    const ordens = Array.from({ length: COMPRA_MAX_ORDENS }, (_, i) => ordem(`ord_${i}_x`, i + 1, [item(`itm_${i}_x`, 1)]));
    abrir(compraTeste({ ordens }));
    const botao = q<HTMLButtonElement>("#compra-adicionar-ordem")!;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toBe("Limite de 10 ordens por compra");
    expect(texto(q("[data-bloco='medicamentos_e_ordens']"))).toContain("Limite de 10 ordens por compra.");
  });

  it("com 9 ordens ainda adiciona a 10ª, e daí trava", async () => {
    const ordens = Array.from({ length: COMPRA_MAX_ORDENS - 1 }, (_, i) => ordem(`ord_${i}_x`, i + 1, [item(`itm_${i}_x`, 1)]));
    const f = abrir(compraTeste({ ordens }));
    await clicar("#compra-adicionar-ordem");
    expect(f.compra.value.ordens).toHaveLength(10);
    expect(q<HTMLButtonElement>("#compra-adicionar-ordem")!.disabled).toBe(true);
  });

  it("com 30 itens o botão de adicionar medicamento fica desabilitado, com a dica", () => {
    const itens = Array.from({ length: COMPRA_MAX_ITENS_POR_ORDEM }, (_, i) => item(`itm_${i}_x`, i + 1));
    abrir(compraTeste({ ordens: [ordem("ord_a", 1, itens)] }));
    const botao = q<HTMLButtonElement>("#ordem-ord_a-adicionar-item")!;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toBe("Limite de 30 medicamentos por ordem");
  });
});

describe("somente leitura (sócio, mapa 'ver', compra cancelada)", () => {
  it("nenhum botão de adicionar/remover e todos os campos desabilitados", () => {
    abrir(compraTeste({ ordens: [ordem("ord_a", 1, [item("itm_a", 1), item("itm_b", 2)]), ordem("ord_b", 2, [item("itm_c", 1)])] }), { opcoes: OPCOES, podeEditar: false });
    expect(q("#compra-adicionar-ordem")).toBeNull();
    expect(q("#ordem-ord_a-adicionar-item")).toBeNull();
    expect(q("#ordem-ord_b-remover")).toBeNull();
    expect(q("#item-itm_b-remover")).toBeNull();
    const campos = qa<HTMLInputElement>("[data-bloco='medicamentos_e_ordens'] input, [data-bloco='medicamentos_e_ordens'] button");
    expect(campos.length).toBeGreaterThan(10);
    expect(campos.filter((c) => c.tagName !== "SUMMARY").every((c) => c.disabled)).toBe(true);
  });
});
