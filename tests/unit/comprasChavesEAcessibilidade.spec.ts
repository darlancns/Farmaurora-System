// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { ItemCompra } from "../../shared/types/compra";
import CompraFormCabecalho from "../../app/components/compras/CompraFormCabecalho.vue";
import ComprasListaPainel from "../../app/components/compras/ComprasListaPainel.vue";
import { PENDENCIAS_PADRAO } from "../../shared/constants/compra";
import { clicar, compraComUmMedicamento, digitar, itemDeTeste, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/montarFormulario";

// (1) A CHAVE DOS MEDICAMENTOS é o id (nunca o índice): remover o do MEIO, com campos diferentes em cada um, não troca nada nos outros — e o
//     DOM do que fica é o MESMO (foco e texto em digitação sobrevivem). (2) Acessibilidade mínima: região aria-live do salvamento, role=alert só
//     quando falha de vez, botões só de ícone com aria-label, foco depois de remover, chips com aria-pressed. Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
const extras: Array<() => void> = [];
afterEach(() => {
  montado?.desmontar();
  montado = null;
  while (extras.length) extras.pop()!();
  document.body.innerHTML = "";
});

const med = (id: string, campo: string): string => `#compra-item-${id}-${campo}`;

function tresMedicamentosDiferentes(): ItemCompra[] {
  return [
    itemDeTeste(1, { id: "itm_aaaaaa", medicamento: "MED A", laboratorio: "Lab A", brand: "bioequivalente", quantidade: "1 cx", temperatura: "Ambiente", valorUnitario: 1.5, valorReal: 1 }),
    itemDeTeste(2, { id: "itm_bbbbbb", medicamento: "MED B", laboratorio: "Lab B", brand: "referencia", quantidade: "2 cx", temperatura: "2°C a 8°C", valorUnitario: 2.5, valorReal: 2 }),
    itemDeTeste(3, { id: "itm_cccccc", medicamento: "MED C", laboratorio: "Lab C", brand: "", quantidade: "3 cx", temperatura: "", valorUnitario: 3.5, valorReal: null }),
  ];
}

const OPCOES = { temperaturas: [{ nome: "2°C a 8°C" }, { nome: "Ambiente" }] };

describe("chave por id nos medicamentos: remover o do MEIO", () => {
  it("os outros dois mantêm TODOS os seus valores (medicamento, laboratório, brand, quantidade, temperatura e valores), cada um diferente do outro", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: tresMedicamentosDiferentes() }), { opcoes: OPCOES });
    await clicar(med("itm_bbbbbb", "remover"));
    expect(montado.compra().itens.map((i) => [i.id, i.posicao])).toEqual([["itm_aaaaaa", 1], ["itm_cccccc", 2]]);
    expect(q<HTMLInputElement>(med("itm_aaaaaa", "laboratorio"))!.value).toBe("Lab A");
    expect(q<HTMLInputElement>(med("itm_cccccc", "laboratorio"))!.value).toBe("Lab C");
    expect(q<HTMLInputElement>(med("itm_aaaaaa", "quantidade"))!.value).toBe("1 cx");
    expect(q<HTMLInputElement>(med("itm_cccccc", "quantidade"))!.value).toBe("3 cx");
    expect(q<HTMLInputElement>(med("itm_aaaaaa", "medicamento"))!.value).toBe("MED A");
    expect(q<HTMLInputElement>(med("itm_cccccc", "medicamento"))!.value).toBe("MED C");
    expect(texto(q(med("itm_aaaaaa", "brand")))).toBe("Bioequivalente");
    expect(texto(q(med("itm_aaaaaa", "temperatura")))).toBe("Ambiente");
    expect(q<HTMLInputElement>(med("itm_aaaaaa", "valor-unitario"))!.value).toBe("1,50");
    expect(q(med("itm_bbbbbb", "laboratorio"))).toBeNull();
  });

  it("o DOM do que fica é o MESMO: o texto que estava sendo digitado no Med. C sobrevive à remoção do B", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: tresMedicamentosDiferentes() }));
    const antes = q<HTMLInputElement>(med("itm_cccccc", "laboratorio"))!;
    await digitar(med("itm_cccccc", "laboratorio"), "Lab C digitando");
    await clicar(med("itm_bbbbbb", "remover"));
    const depois = q<HTMLInputElement>(med("itm_cccccc", "laboratorio"))!;
    expect(depois).toBe(antes); // o mesmo elemento (chave por id, não por índice)
    expect(depois.value).toBe("Lab C digitando");
  });

  it("remover o 1º (pelo estado) também mantém o DOM dos outros dois", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: tresMedicamentosDiferentes() }));
    const b = q(med("itm_bbbbbb", "laboratorio"));
    const c = q(med("itm_cccccc", "laboratorio"));
    await clicar(med("itm_aaaaaa", "remover"));
    expect(q(med("itm_bbbbbb", "laboratorio"))).toBe(b);
    expect(q(med("itm_cccccc", "laboratorio"))).toBe(c);
    expect(qa('[data-linha="laboratorio"] label').map((l) => texto(l)).filter((t) => t.startsWith("Med."))).toEqual(["Med. 1", "Med. 2"]); // renumerado
  });
});

describe("foco depois de remover (nada se perde)", () => {
  it("remover um medicamento leva o foco ao campo Medicamento do de ANTES", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: tresMedicamentosDiferentes() }));
    await clicar(med("itm_cccccc", "remover"));
    await nextTick();
    expect(document.activeElement).toBe(q(med("itm_bbbbbb", "medicamento")));
  });

  it("remover o do MEIO também foca o de antes", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: tresMedicamentosDiferentes() }));
    await clicar(med("itm_bbbbbb", "remover"));
    await nextTick();
    expect(document.activeElement).toBe(q(med("itm_aaaaaa", "medicamento")));
  });

  it("remover o PRIMEIRO foca o que passou a ser o primeiro", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: tresMedicamentosDiferentes() }));
    await clicar(med("itm_aaaaaa", "remover"));
    await nextTick();
    expect(document.activeElement).toBe(q(med("itm_bbbbbb", "medicamento")));
  });
});

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
            cancelada: false,
            podeEditar: true,
            estado: p.estado,
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

  it.each(["ocioso", "pendente", "salvando", "salvo", "conflito"] as const)("estado normal (%s): NADA aparece (nem texto de salvamento, nem alerta)", (estado) => {
    cabecalho({ estado });
    expect(texto(q("#compra-salvamento-regiao"))).toBe("");
    expect(q("#compra-salvamento")).toBeNull();
    expect(q("[role=alert]")).toBeNull();
    expect(texto(q("#compra-cabecalho-bloco"))).not.toMatch(/Salvo|Salvando|autom/i);
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

  it("no formulário com vários medicamentos: todo botão sem texto de verdade (✕, setas, …) tem aria-label", () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: tresMedicamentosDiferentes() }), { opcoes: OPCOES });
    const botoes = qa<HTMLButtonElement>("#compra-formulario button");
    const soIcone = botoes.filter((b) => texto(b) === "" || SIMBOLOS.test(texto(b)));
    expect(soIcone.length).toBeGreaterThan(0); // há ✕ de remover
    for (const b of soIcone) expect(b.getAttribute("aria-label"), b.id || b.outerHTML.slice(0, 60)).toMatch(/\S/);
    expect(q(med("itm_bbbbbb", "remover"))!.getAttribute("aria-label")).toBe("Remover Med. 2");
  });

  it("os botões de seta do stepper de Ordens têm aria-label ('Aumentar Ordens', 'Diminuir Ordens')", () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q("#compra-ordens-mais")!.getAttribute("aria-label")).toBe("Aumentar Ordens");
    expect(q("#compra-ordens-menos")!.getAttribute("aria-label")).toBe("Diminuir Ordens");
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
            totais: { ativas: 0, canceladas: 0 },
            total: 0,
            temMais: false,
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
    const app = createApp(defineComponent({ render: () => h(CompraFormCabecalho, { anoMes: "2026-11", sequencia: 1, cancelada: false, podeEditar: true, estado: "ocioso" }) }));
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
    montado = montarFormulario(compraComUmMedicamento({ pendencias: ["Receita médica"] }));
    const chips = () => qa<HTMLButtonElement>("[id^='compra-pendencia-chip-']");
    expect(chips()).toHaveLength(PENDENCIAS_PADRAO.length);
    expect(chips().every((c) => c.getAttribute("aria-pressed") === "true" || c.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(chips().map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false", "false", "false", "true"]);
    await clicar("#compra-pendencia-chip-0");
    expect(chips()[0]!.getAttribute("aria-pressed")).toBe("true");
    await clicar("#compra-pendencia-chip-6");
    expect(chips()[6]!.getAttribute("aria-pressed")).toBe("false");
  });

  it("os chips ficam num grupo com nome (o rótulo 'Pendente', por aria-labelledby) e são botões de verdade", () => {
    montado = montarFormulario(compraComUmMedicamento());
    const grupo = q<HTMLElement>("[role=group][aria-labelledby='compra-linha-pendencias-rotulo']")!;
    expect(grupo).not.toBeNull();
    expect(texto(q("#compra-linha-pendencias-rotulo"))).toBe("Pendente");
    expect(qa("[id^='compra-pendencia-chip-']").every((c) => c.tagName === "BUTTON")).toBe(true);
  });
});
