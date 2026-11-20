// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { ItemCompra, OrdemCompra } from "../../shared/types/compra";
import CompraFormCabecalho from "../../app/components/compras/CompraFormCabecalho.vue";
import ComprasListaPainel from "../../app/components/compras/ComprasListaPainel.vue";
import { PENDENCIAS_PADRAO } from "../../shared/constants/compra";
import { itemVazio, ordemVazia } from "../../shared/utils/compraForm";
import { compraTeste, clicar, digitar, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/formularioCompra";

// (1) A CHAVE DAS ORDENS é o id (nunca o índice): remover a ordem do MEIO com campos diferentes em cada ordem não troca nada nas outras —
//     e o DOM da ordem que fica é o MESMO (foco, cursor e texto em digitação sobrevivem). (2) Acessibilidade mínima: região aria-live do
//     salvamento, role=alert só quando falha de vez, botões só de ícone com aria-label, foco depois de remover, chips com aria-pressed.

let montado: FormularioMontado | null = null;
const extras: Array<() => void> = [];
afterEach(() => {
  montado?.desmontar();
  montado = null;
  while (extras.length) extras.pop()!();
  document.body.innerHTML = "";
});

const item = (id: string, posicao: number, extra: Partial<ItemCompra> = {}): ItemCompra => ({ ...itemVazio(posicao), id, ...extra });
const ordem = (id: string, posicao: number, itens: ItemCompra[], extra: Partial<OrdemCompra> = {}): OrdemCompra => ({ ...ordemVazia(posicao), id, posicao, itens, ...extra });

const OPCOES = {
  fornecedores: [
    { nome: "Fornecedor Teste A", pais: "", prazoAlertaDias: null, semAlerta: true },
    { nome: "Fornecedor Teste B", pais: "", prazoAlertaDias: null, semAlerta: true },
    { nome: "Fornecedor Teste C", pais: "", prazoAlertaDias: null, semAlerta: true },
  ],
  ciasAereas: [{ nome: "Cia A" }, { nome: "Cia B" }, { nome: "Cia C" }],
  temperaturas: [{ nome: "2°C a 8°C" }, { nome: "Ambiente" }],
};

function tresOrdensDiferentes(): OrdemCompra[] {
  return [
    ordem("ord_aaaaaa", 1, [item("itm_a1", 1, { medicamento: "MED A", quantidade: "1 cx", valorUnitario: 1.5, laboratorio: "Lab A" })], { fornecedor: "Fornecedor Teste A", envio: "Air Cargo", cia: "Cia A", po: "PO26-11-0001", frete: 10, freteReal: 11 }),
    ordem("ord_bbbbbb", 2, [item("itm_b1", 1, { medicamento: "MED B", quantidade: "2 cx", valorUnitario: 2.5 }), item("itm_b2", 2, { medicamento: "MED B2", quantidade: "22 cx" })], { fornecedor: "Fornecedor Teste B", envio: "Courier Formal", cia: "Cia B", po: "PO26-11-0002", frete: 20, freteReal: 21 }),
    ordem("ord_cccccc", 3, [item("itm_c1", 1, { medicamento: "MED C", quantidade: "3 cx", valorUnitario: 3.5, referencia: "REF C" })], { fornecedor: "Fornecedor Teste C", envio: "Courier Simples", cia: "Cia C", po: "PO26-11-0003", frete: 30.5, freteReal: null }),
  ];
}

describe("chave por id nas ordens: remover a ordem do MEIO", () => {
  it("as outras duas mantêm TODOS os seus valores (fornecedor, envio, cia, PO, fretes e itens), cada uma diferente da outra", async () => {
    const f = (montado = montarFormulario(compraTeste({ ordens: tresOrdensDiferentes() }), { opcoes: OPCOES }));
    await clicar("#ordem-ord_bbbbbb-remover");
    [...document.querySelectorAll("[role=alertdialog] button")].find((b) => texto(b) === "Remover ordem")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(f.compra.value.ordens.map((o) => [o.id, o.posicao])).toEqual([
      ["ord_aaaaaa", 1],
      ["ord_cccccc", 2],
    ]);
    // A ordem A não mudou.
    expect(texto(q("#ordem-ord_aaaaaa-fornecedor"))).toBe("Fornecedor Teste A");
    expect(texto(q("#ordem-ord_aaaaaa-envio"))).toBe("Air Cargo");
    expect(texto(q("#ordem-ord_aaaaaa-cia"))).toBe("Cia A");
    expect(q<HTMLInputElement>("#ordem-ord_aaaaaa-po")!.value).toBe("PO26-11-0001");
    expect(q<HTMLInputElement>("#ordem-ord_aaaaaa-frete")!.value).toBe("10,00");
    expect(q<HTMLInputElement>("#ordem-ord_aaaaaa-frete-real")!.value).toBe("11,00");
    expect(q<HTMLInputElement>("#item-itm_a1-medicamento")!.value).toBe("MED A");
    expect(q<HTMLInputElement>("#item-itm_a1-laboratorio")!.value).toBe("Lab A");
    // A ordem C (agora a 2ª) manteve os dela, e o título dela virou "Ordem 2".
    expect(texto(q("#ordem-ord_cccccc h3"))).toBe("Ordem 2");
    expect(texto(q("#ordem-ord_cccccc-fornecedor"))).toBe("Fornecedor Teste C");
    expect(texto(q("#ordem-ord_cccccc-envio"))).toBe("Courier Simples");
    expect(texto(q("#ordem-ord_cccccc-cia"))).toBe("Cia C");
    expect(q<HTMLInputElement>("#ordem-ord_cccccc-po")!.value).toBe("PO26-11-0003");
    expect(q<HTMLInputElement>("#ordem-ord_cccccc-frete")!.value).toBe("30,50");
    expect(q<HTMLInputElement>("#ordem-ord_cccccc-frete-real")!.value).toBe("");
    expect(q<HTMLInputElement>("#item-itm_c1-medicamento")!.value).toBe("MED C");
    expect(q<HTMLInputElement>("#item-itm_c1-quantidade")!.value).toBe("3 cx");
    expect(q<HTMLInputElement>("#item-itm_c1-referencia")!.value).toBe("REF C");
    expect(q<HTMLDetailsElement>("#item-itm_c1 details")!.open).toBe(true);
    expect(q<HTMLDetailsElement>("#item-itm_a1 details")!.open).toBe(true); // a A tinha laboratório
    expect(q("#ordem-ord_bbbbbb")).toBeNull();
    expect(q("#item-itm_b1")).toBeNull();
  });

  it("o DOM da ordem que fica é o MESMO: o foco e o texto que estava sendo digitado na ordem C sobrevivem à remoção da B", async () => {
    const f = (montado = montarFormulario(compraTeste({ ordens: tresOrdensDiferentes() }), { opcoes: OPCOES }));
    const cartaoC = q<HTMLElement>("#ordem-ord_cccccc")!;
    const freteC = q<HTMLInputElement>("#ordem-ord_cccccc-frete")!;
    const poC = q<HTMLInputElement>("#ordem-ord_cccccc-po")!;
    await digitar("#ordem-ord_cccccc-frete", "12,3"); // texto cru, sem sair do campo
    poC.focus();
    expect(document.activeElement).toBe(poC);
    // A B some (como se outra pessoa/outro caminho a tivesse tirado; o foco estava na C).
    f.compra.value = { ...f.compra.value, ordens: [f.compra.value.ordens[0]!, { ...f.compra.value.ordens[2]!, posicao: 2 }] };
    await nextTick();
    expect(q("#ordem-ord_cccccc")).toBe(cartaoC); // o MESMO elemento (chave = id)
    expect(q("#ordem-ord_cccccc-po")).toBe(poC);
    expect(document.activeElement).toBe(poC); // o foco ficou onde estava
    expect(q("#ordem-ord_cccccc-frete")).toBe(freteC);
    expect(freteC.value).toBe("12,3"); // e o texto cru também
  });

  it("remover a 1ª ordem (pelo estado) também mantém o DOM das outras duas", async () => {
    const f = (montado = montarFormulario(compraTeste({ ordens: tresOrdensDiferentes() }), { opcoes: OPCOES }));
    const cartaoB = q<HTMLElement>("#ordem-ord_bbbbbb")!;
    const cartaoC = q<HTMLElement>("#ordem-ord_cccccc")!;
    f.compra.value = { ...f.compra.value, ordens: [{ ...f.compra.value.ordens[1]!, posicao: 1 }, { ...f.compra.value.ordens[2]!, posicao: 2 }] };
    await nextTick();
    expect(q("#ordem-ord_bbbbbb")).toBe(cartaoB);
    expect(q("#ordem-ord_cccccc")).toBe(cartaoC);
    expect(q("#ordem-ord_aaaaaa")).toBeNull();
  });
});

describe("foco depois de remover (nada se perde)", () => {
  it("remover um medicamento leva o foco ao campo Medicamento da linha de ANTES", async () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", 1, [item("itm_1", 1), item("itm_2", 2), item("itm_3", 3)])] }), { opcoes: OPCOES });
    await clicar("#item-itm_3-remover");
    await nextTick();
    expect((document.activeElement as HTMLElement).id).toBe("item-itm_2-medicamento");
    await clicar("#item-itm_2-remover");
    await nextTick();
    expect((document.activeElement as HTMLElement).id).toBe("item-itm_1-medicamento");
  });

  it("remover o item do MEIO também foca o de antes", async () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", 1, [item("itm_1", 1), item("itm_2", 2), item("itm_3", 3)])] }), { opcoes: OPCOES });
    await clicar("#item-itm_2-remover");
    await nextTick();
    expect((document.activeElement as HTMLElement).id).toBe("item-itm_1-medicamento");
  });

  it("remover uma ordem VAZIA leva o foco ao '+ Adicionar medicamento' da ordem de antes", async () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", 1, [item("itm_a", 1)]), ordem("ord_b", 2, [item("itm_b", 1)])] }), { opcoes: OPCOES });
    await clicar("#ordem-ord_b-remover");
    await nextTick();
    expect((document.activeElement as HTMLElement).id).toBe("ordem-ord_a-adicionar-item");
  });

  it("remover uma ordem PREENCHIDA (depois da confirmação) também leva o foco à ordem de antes", async () => {
    montado = montarFormulario(compraTeste({ ordens: [ordem("ord_a", 1, [item("itm_a", 1)]), ordem("ord_b", 2, [item("itm_b", 1, { medicamento: "MED B" })])] }), { opcoes: OPCOES });
    await clicar("#ordem-ord_b-remover");
    [...document.querySelectorAll("[role=alertdialog] button")].find((b) => texto(b) === "Remover ordem")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    await nextTick();
    expect((document.activeElement as HTMLElement).id).toBe("ordem-ord_a-adicionar-item");
  });
});

// ── Acessibilidade mínima ─────────────────────────────────────────────────────────────────────────────────

describe("salvamento: região aria-live e alerta só quando falha de vez", () => {
  function cabecalho(p: { estado: "ocioso" | "pendente" | "salvando" | "salvo" | "erro" | "conflito"; esperandoClique?: boolean }) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const app = createApp(
      defineComponent({
        render: () =>
          h(CompraFormCabecalho, {
            anoMes: "2026-11",
            sequencia: 1,
            status: "rascunho",
            pendencias: 0,
            cancelada: false,
            podeEditar: true,
            estado: p.estado,
            salvoEm: new Date("2026-11-19T19:22:00Z"),
            esperandoClique: p.esperandoClique ?? false,
          }),
      }),
    );
    app.mount(el);
    extras.push(() => {
      app.unmount();
      el.remove();
    });
  }

  it("a região é aria-live='polite' (e atômica) e sempre existe, mesmo com o texto vazio, para o leitor de tela anunciar o que entrar", () => {
    cabecalho({ estado: "ocioso" });
    const regiao = q<HTMLElement>("#compra-salvamento-regiao")!;
    expect(regiao.getAttribute("aria-live")).toBe("polite");
    expect(regiao.getAttribute("aria-atomic")).toBe("true");
    expect(texto(regiao)).toBe("");
  });

  it.each([
    ["pendente", "Salvando…"],
    ["salvando", "Salvando…"],
    ["salvo", "Salvo automaticamente às 16:22"],
    ["conflito", "Não salvo"],
  ] as const)("estado %s: o texto '%s' está DENTRO da região aria-live, e sem role=alert", (estado, esperado) => {
    cabecalho({ estado });
    expect(texto(q("#compra-salvamento-regiao #compra-salvamento"))).toBe(esperado);
    expect(q("[role=alert]")).toBeNull();
  });

  it("erro com tentativas automáticas ainda em curso: 'Tentando salvar de novo…' (polite) e NENHUM role=alert", () => {
    cabecalho({ estado: "erro", esperandoClique: false });
    expect(texto(q("#compra-salvamento-regiao"))).toBe("Tentando salvar de novo…");
    expect(q("[role=alert]")).toBeNull();
    expect(q("#compra-salvamento-erro")).toBeNull();
  });

  it("erro depois das tentativas (falhou de vez): role=alert com o botão 'Não foi possível salvar. Tentar de novo'", () => {
    cabecalho({ estado: "erro", esperandoClique: true });
    const alerta = q<HTMLElement>("[role=alert]")!;
    expect(alerta).not.toBeNull();
    expect(texto(alerta)).toBe("Não foi possível salvar. Tentar de novo");
    expect(alerta.querySelector("button")!.id).toBe("compra-salvamento-erro");
    expect(q("#compra-salvamento-regiao")!.contains(alerta)).toBe(true);
  });
});

describe("botões só de ícone têm nome acessível em português", () => {
  const SIMBOLOS = /^[✕‹›…×⋯]$/;

  it("no formulário com várias ordens e itens: todo botão sem texto de verdade (✕, setas, …) tem aria-label", () => {
    montado = montarFormulario(compraTeste({ ordens: tresOrdensDiferentes() }), { opcoes: OPCOES });
    const botoes = qa<HTMLButtonElement>("#compra-formulario button");
    const soIcone = botoes.filter((b) => texto(b) === "" || SIMBOLOS.test(texto(b)));
    expect(soIcone.length).toBeGreaterThan(0); // há ✕ de remover
    for (const b of soIcone) {
      expect(b.getAttribute("aria-label"), b.id || b.outerHTML.slice(0, 60)).toMatch(/\S/);
    }
    expect(q("#item-itm_b2-remover")!.getAttribute("aria-label")).toBe("Remover medicamento");
  });

  it("na lista: as setas do mês e o interruptor têm aria-label ('Mês anterior', 'Próximo mês', 'Mostrar canceladas')", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const app = createApp(
      defineComponent({
        render: () =>
          h(ComprasListaPainel, {
            rotuloMes: "Novembro/2026",
            totalDoMes: 0,
            compras: [],
            totais: { rascunho: 0, pronta: 0, parcial: 0, encaminhada: 0, cancelada: 0 },
            total: 0,
            temMais: false,
            status: null,
            mostrarCanceladas: false,
            selecionadaId: null,
            carregando: false,
            erro: null,
            podeEditar: true,
          }),
      }),
    );
    app.mount(el);
    extras.push(() => {
      app.unmount();
      el.remove();
    });
    expect(q("#compras-mes-anterior")!.getAttribute("aria-label")).toBe("Mês anterior");
    expect(q("#compras-mes-proximo")!.getAttribute("aria-label")).toBe("Próximo mês");
    expect(q("#compras-mostrar-canceladas")!.getAttribute("aria-label")).toBe("Mostrar canceladas");
    for (const b of qa<HTMLButtonElement>("#compras-lista button")) {
      expect(texto(b) !== "" || (b.getAttribute("aria-label") ?? "") !== "", b.id).toBe(true);
    }
  });

  it("o menu '…' do celular e o botão de voltar têm nome acessível", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const app = createApp(defineComponent({ render: () => h(CompraFormCabecalho, { anoMes: "2026-11", sequencia: 1, status: "rascunho", pendencias: 0, cancelada: false, podeEditar: true, estado: "ocioso", salvoEm: null }) }));
    app.mount(el);
    extras.push(() => {
      app.unmount();
      el.remove();
    });
    expect(q("#btn-menu-compra")!.getAttribute("aria-label")).toBe("Mais ações da compra");
    expect(q("#btn-voltar-lista")!.getAttribute("aria-label")).toBe("Voltar para a lista de compras");
  });
});

describe("chips de pendência: aria-pressed correto", () => {
  it("cada chip tem aria-pressed 'true' ou 'false' (nunca ausente) e muda ao clicar e ao desmarcar", async () => {
    montado = montarFormulario(compraTeste({ pendencias: ["Receita médica"] }));
    const chips = () => qa<HTMLButtonElement>("[id^='compra-pendencia-chip-']");
    expect(chips()).toHaveLength(PENDENCIAS_PADRAO.length);
    expect(chips().every((c) => c.getAttribute("aria-pressed") === "true" || c.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(chips().map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false", "false", "false", "true"]);
    await clicar("#compra-pendencia-chip-0");
    expect(chips()[0]!.getAttribute("aria-pressed")).toBe("true");
    await clicar("#compra-pendencia-chip-6");
    expect(chips()[6]!.getAttribute("aria-pressed")).toBe("false");
  });

  it("os chips têm um grupo com nome (aria-labelledby) e botão de verdade", () => {
    montado = montarFormulario(compraTeste());
    const grupo = q<HTMLElement>("[role=group][aria-labelledby='compra-pendencias-rotulo']")!;
    expect(grupo).not.toBeNull();
    expect(texto(q("#compra-pendencias-rotulo"))).toBe("Pendências (clique para marcar)");
    expect(qa("[id^='compra-pendencia-chip-']").every((c) => c.tagName === "BUTTON")).toBe(true);
  });
});
