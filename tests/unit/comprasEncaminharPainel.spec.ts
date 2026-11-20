// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import type { Compra, PreviaEncaminhar } from "../../shared/types/compra";
import CompraEncaminharPainel from "../../app/components/compras/CompraEncaminharPainel.vue";
import type { EstadoPainelEncaminhar } from "../../app/composables/useEncaminharCompra";
import { chaveConfirmacao } from "../../app/utils/comprasEncaminhar";
import { compraTeste, linhaPrevia, ordemTeste, previaTeste } from "./helpers/encaminharFixtures";

// O painel "Encaminhar para a DIR" com o componente REAL no happy-dom: carregando, erros clicáveis, conflito de PO, vendedor inativo, aviso de
// pré-cadastro, temperatura mista, linhas (Courier Simples com COURIER I N/A, ordem já encaminhada em cinza), botão e resultado.
// Dados fictícios (TESTE).

const montados: Array<() => void> = [];
afterEach(() => {
  while (montados.length) montados.pop()!();
  document.body.innerHTML = "";
});

const NuxtLinkFalso = defineComponent({
  props: { to: { type: String, required: true } },
  setup(props, { slots, attrs }) {
    return () => h("a", { href: props.to, ...attrs }, slots.default?.());
  },
});

function estado(extra: Partial<EstadoPainelEncaminhar> = {}): EstadoPainelEncaminhar {
  return {
    aberto: true,
    previa: null,
    carregando: false,
    atualizando: false,
    erroPrevia: null,
    confirmadas: [],
    enviando: false,
    resultado: null,
    erroEnvio: null,
    linhasPendentes: 0,
    podeEnviar: false,
    motivoBloqueio: null,
    ...extra,
  };
}

interface Eventos {
  voltar: number;
  enviar: number;
  confirmar: Array<[string, boolean]>;
  irParaCampo: string[];
  recarregar: number;
}

function montar(painel: EstadoPainelEncaminhar, compra: Compra = compraTeste()): Eventos {
  const ev: Eventos = { voltar: 0, enviar: 0, confirmar: [], irParaCampo: [], recarregar: 0 };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(CompraEncaminharPainel, {
          painel,
          compra,
          onVoltar: () => (ev.voltar += 1),
          onEnviar: () => (ev.enviar += 1),
          onConfirmar: (chave: string, valor: boolean) => ev.confirmar.push([chave, valor]),
          onIrParaCampo: (campo: string) => ev.irParaCampo.push(campo),
          onRecarregar: () => (ev.recarregar += 1),
        }),
    }),
  );
  app.component("NuxtLink", NuxtLinkFalso);
  app.mount(el);
  montados.push(() => app.unmount());
  return ev;
}

const texto = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string): T | null => document.querySelector<T>(sel);
const qa = <T extends Element>(sel: string): T[] => [...document.querySelectorAll<T>(sel)];

/** Uma prévia com as duas ordens (a 2ª Courier Simples) e `n` linhas pendentes, pronta para enviar. */
function painelPronto(extraPrevia: Partial<PreviaEncaminhar> = {}, extra: Partial<EstadoPainelEncaminhar> = {}): { painel: EstadoPainelEncaminhar; compra: Compra } {
  const compra = compraTeste();
  return { compra, painel: estado({ previa: previaTeste(compra, extraPrevia), linhasPendentes: 2, podeEnviar: true, ...extra }) };
}

describe("estados do painel", () => {
  it("carregando: 'Carregando…' e nada mais (sem linhas, sem botão)", () => {
    montar(estado({ carregando: true }));
    expect(texto(q("#encaminhar-carregando"))).toBe("Carregando…");
    expect(q("#encaminhar-linhas")).toBeNull();
    expect(q("#btn-encaminhar-confirmar")).toBeNull();
    expect(texto(q("#compra-encaminhar-titulo"))).toBe("Encaminhar para a DIR");
  });

  it("a prévia falhou na primeira vez: mensagem e 'Tentar de novo' (emite recarregar)", () => {
    const ev = montar(estado({ erroPrevia: "Falha ao ler a conferência." }));
    expect(texto(q("#encaminhar-erro-previa"))).toContain("Falha ao ler a conferência.");
    q<HTMLButtonElement>("#btn-encaminhar-previa-tentar")!.click();
    expect(ev.recarregar).toBe(1);
  });

  it("a prévia falhou numa atualização: a última prévia continua e o erro aparece em cima", () => {
    const { painel, compra } = painelPronto({}, { erroPrevia: "Sem rede.", podeEnviar: false });
    montar(painel, compra);
    expect(q("#encaminhar-linhas")).not.toBeNull();
    expect(texto(q("#encaminhar-erro-previa-atualizar"))).toContain("Sem rede.");
  });

  it("atualizando: a prévia antiga continua na tela com o aviso 'Atualizando a conferência…' (sem piscar)", () => {
    const { painel, compra } = painelPronto({}, { atualizando: true, podeEnviar: false, motivoBloqueio: "Atualizando a conferência…" });
    montar(painel, compra);
    expect(q("#encaminhar-linhas")).not.toBeNull();
    expect(texto(q("#encaminhar-atualizando"))).toBe("Atualizando a conferência…");
    expect(q("#encaminhar-carregando")).toBeNull();
  });

  it("o cabeçalho diz quantas linhas serão criadas (singular e plural) e o formulário segue editável", () => {
    const { painel, compra } = painelPronto();
    montar(painel, compra);
    expect(texto(q("#encaminhar-intro"))).toBe("Serão criadas 2 linhas, uma por ordem. O formulário ao lado continua editável.");
    document.body.innerHTML = "";
    const c1 = compraTeste({ ordens: [ordemTeste(1)] });
    montar(estado({ previa: previaTeste(c1), linhasPendentes: 1, podeEnviar: true }), c1);
    expect(texto(q("#encaminhar-intro"))).toBe("Será criada 1 linha, uma por ordem. O formulário ao lado continua editável.");
  });

  it("'‹ Voltar ao resumo' emite voltar", () => {
    const { painel, compra } = painelPronto();
    const ev = montar(painel, compra);
    expect(texto(q("#btn-encaminhar-voltar"))).toBe("‹ Voltar ao resumo");
    q<HTMLButtonElement>("#btn-encaminhar-voltar")!.click();
    expect(ev.voltar).toBe(1);
  });
});

describe("conferência", () => {
  it("erro da checagem: item vermelho clicável que leva ao campo e NÃO fecha o painel", () => {
    const compra = compraTeste({ medico: "" });
    const previa = previaTeste(compra, { erros: [{ id: "medico", nivel: "erro", texto: "Médico não preenchido" }] });
    const ev = montar(estado({ previa, linhasPendentes: 2 }), compra);
    const botao = q<HTMLButtonElement>('#compra-checklist-erros [data-ir-campo="medico"]');
    expect(texto(botao)).toBe("Médico não preenchido");
    botao!.click();
    expect(ev.irParaCampo).toEqual(["medico"]);
    expect(ev.voltar).toBe(0);
    expect(texto(q("#compra-checklist-titulo"))).toBe("Conferência");
  });

  it("PO que já existe na DIR: 'PO… já existe na DIR', clicável para o PO da ordem", () => {
    const compra = compraTeste();
    const previa = previaTeste(compra, { conflitosPo: ["PO26-12-9999"] });
    const ev = montar(estado({ previa, linhasPendentes: 2 }), compra);
    const botao = q<HTMLButtonElement>("#compra-checklist-erros button");
    expect(texto(botao)).toBe("PO26-12-9999 já existe na DIR");
    botao!.click();
    expect(ev.irParaCampo).toEqual(["ordem-2-po"]);
  });

  it("PO repetido na compra: erro clicável para o PO da 1ª ordem com ele", () => {
    const compra = compraTeste();
    const ev = montar(estado({ previa: previaTeste(compra, { posRepetidosNaCompra: ["PO26-12-9998"] }), linhasPendentes: 2 }), compra);
    const botao = q<HTMLButtonElement>("#compra-checklist-erros button");
    expect(texto(botao)).toBe("PO repetido na compra: PO26-12-9998");
    botao!.click();
    expect(ev.irParaCampo).toEqual(["ordem-1-po"]);
  });

  it("vendedor inativo: 'Escolha um consultor ativo para o vendedor desta compra', clicável para o campo Vendedor", () => {
    const compra = compraTeste();
    const ev = montar(estado({ previa: previaTeste(compra, { vendedorInativo: true }), linhasPendentes: 2 }), compra);
    const botao = q<HTMLButtonElement>("#compra-checklist-erros button");
    expect(texto(botao)).toBe("Escolha um consultor ativo para o vendedor desta compra");
    botao!.click();
    expect(ev.irParaCampo).toEqual(["vendedor"]);
  });

  it("aviso de pré-cadastro aparece como aviso (clicável para o medicamento) e não impede", () => {
    const base = compraTeste();
    const compra = compraTeste({ ordens: [ordemTeste(1, { itens: [{ ...base.ordens[0]!.itens[0]!, medicamentoCadastroId: null, preCadastroId: "pre_1", medicamento: "MED NOVO TESTE" }] })] });
    const ev = montar(estado({ previa: previaTeste(compra), linhasPendentes: 1, podeEnviar: true }), compra);
    const aviso = q<HTMLButtonElement>("#compra-checklist-avisos button");
    expect(texto(aviso)).toContain("MED NOVO TESTE no pré-cadastro");
    aviso!.click();
    expect(ev.irParaCampo).toEqual(["ordem-1-med-1-nome"]);
    expect(q<HTMLButtonElement>("#btn-encaminhar-confirmar")!.disabled).toBe(false);
  });

  it("os itens ok ficam recolhidos num contador", () => {
    const { painel, compra } = painelPronto();
    montar(painel, compra);
    expect(texto(q("#compra-checklist-ok-toggle"))).toMatch(/^\d+ itens ok$/);
    expect(q("#compra-checklist-oks")).toBeNull();
    expect(texto(q("#compra-checklist-pronta"))).toContain("Nada pendente");
  });
});

describe("as linhas da DIR", () => {
  it("uma por ordem: 'Linha N da DIR', chip da temperatura e a lista de rótulo/valor", () => {
    const { painel, compra } = painelPronto();
    montar(painel, compra);
    const itens = qa("#encaminhar-linhas > li");
    expect(itens).toHaveLength(2);
    const l1 = itens[0]!;
    expect(texto(l1.querySelector("h4"))).toBe("Linha 1 da DIR");
    expect(texto(l1.querySelector("#encaminhar-temperatura-ord_teste_0001"))).toBe("2°C a 8°C");
    const valor = (rotulo: string): string => texto(l1.querySelector(`[data-valor="${rotulo}"]`));
    expect(valor("PO")).toBe("PO26-12-9998");
    expect(valor("Paciente")).toBe("TESTE PACIENTE");
    expect(valor("Medicamento")).toBe("MED TESTE 10 MG");
    expect(valor("Fornecedor")).toBe("Fornecedor Teste");
    expect(valor("Envio")).toBe("Air Cargo");
    expect(valor("Cia aérea")).toBe("Cia Teste");
    expect(valor("Despachante")).toBe("Despachante Teste");
    expect(valor("Vendedor")).toBe("Mateus Morais");
    expect(valor("Responsável")).toBe("Rebeca");
    expect(valor("Status")).toBe("on_going");
    expect(l1.querySelector('[data-valor="Observação"]')).toBeNull(); // vazia: não aparece
    expect(l1.querySelector("dl")!.className).toContain("font-mono");
  });

  it("ordem Courier Simples: o Despachante é o valor que a DIR vai receber (COURIER I N/A) e não há Cia aérea", () => {
    const { painel, compra } = painelPronto();
    montar(painel, compra);
    const l2 = qa("#encaminhar-linhas > li")[1]!;
    expect(texto(l2.querySelector('[data-valor="Despachante"]'))).toBe("COURIER I N/A");
    expect(texto(l2.querySelector('[data-valor="Envio"]'))).toBe("Courier Simples");
    expect(l2.querySelector('[data-valor="Cia aérea"]')).toBeNull();
  });

  it("observação aparece quando há (recorrente / particular)", () => {
    const compra = compraTeste({ ordens: [ordemTeste(1)] });
    const previa = previaTeste(compra, { linhas: [linhaPrevia(compra.ordens[0]!, {}, { observacao: "RECORRENTE / COMPRA PARTICULAR" })] });
    montar(estado({ previa, linhasPendentes: 1, podeEnviar: true }), compra);
    expect(texto(q('[data-valor="Observação"]'))).toBe("RECORRENTE / COMPRA PARTICULAR");
  });

  it("ordem já encaminhada: cartão cinza com 'Encaminhada em dd/mm' (Brasília), sem lista e sem caixa de nada", () => {
    const compra = compraTeste({ ordens: [ordemTeste(1, { dirId: "dir_ord_teste_0001", encaminhadaEm: "2026-12-02T01:30:00.000Z" }), ordemTeste(2)] });
    const previa = previaTeste(compra);
    montar(estado({ previa, linhasPendentes: 1, podeEnviar: true }), compra);
    const l1 = q('[data-linha="ord_teste_0001"]')!;
    expect(l1.getAttribute("data-encaminhada")).toBe("true");
    expect(l1.querySelector("article")!.className).toContain("bg-hairline/40");
    expect(texto(l1.querySelector("#encaminhar-encaminhada-ord_teste_0001"))).toBe("Encaminhada em 01/12"); // 22h30 de 01/12 em Brasília
    expect(l1.querySelector("dl")).toBeNull();
    expect(l1.querySelector("input")).toBeNull();
    expect(q('[data-linha="ord_teste_0002"] dl')).not.toBeNull();
  });
});

describe("temperatura mista", () => {
  function mista(confirmadas: string[] = []) {
    const compra = compraTeste();
    const linhas = [linhaPrevia(compra.ordens[0]!, { temperaturaMista: true }, { temperatura: "2°C a 8°C / Ambiente" }), linhaPrevia(compra.ordens[1]!)];
    const previa = previaTeste(compra, { linhas });
    return { compra, previa, chave: chaveConfirmacao(linhas[0]!), painel: estado({ previa, linhasPendentes: 2, confirmadas, podeEnviar: confirmadas.length > 0, motivoBloqueio: confirmadas.length > 0 ? null : "Confirme a temperatura das linhas marcadas." }) };
  }

  it("mostra a temperatura unida e UMA caixa obrigatória só na linha mista", () => {
    const m = mista();
    montar(m.painel, m.compra);
    expect(texto(q("#encaminhar-temperatura-ord_teste_0001"))).toBe("2°C a 8°C / Ambiente");
    const caixa = q<HTMLInputElement>("#encaminhar-confirma-ord_teste_0001")!;
    expect(caixa.type).toBe("checkbox");
    expect(caixa.checked).toBe(false);
    expect(texto(q('label[for="encaminhar-confirma-ord_teste_0001"]'))).toBe("Confirmo a temperatura desta linha: 2°C a 8°C / Ambiente");
    expect(q("#encaminhar-confirma-ord_teste_0002")).toBeNull();
    expect(q<HTMLButtonElement>("#btn-encaminhar-confirmar")!.disabled).toBe(true);
    expect(texto(q("#encaminhar-apoio"))).toBe("Confirme a temperatura das linhas marcadas.");
  });

  it("marcar a caixa emite confirmar(chave, true); desmarcar, confirmar(chave, false)", () => {
    const m = mista();
    const ev = montar(m.painel, m.compra);
    const caixa = q<HTMLInputElement>("#encaminhar-confirma-ord_teste_0001")!;
    caixa.checked = true;
    caixa.dispatchEvent(new Event("change", { bubbles: true }));
    expect(ev.confirmar).toEqual([[m.chave, true]]);
    caixa.checked = false;
    caixa.dispatchEvent(new Event("change", { bubbles: true }));
    expect(ev.confirmar[1]).toEqual([m.chave, false]);
  });

  it("confirmada: a caixa aparece marcada e o botão habilitado", () => {
    const m = mista();
    const confirmada = mista([m.chave]);
    montar(confirmada.painel, confirmada.compra);
    expect(q<HTMLInputElement>("#encaminhar-confirma-ord_teste_0001")!.checked).toBe(true);
    expect(q<HTMLButtonElement>("#btn-encaminhar-confirmar")!.disabled).toBe(false);
  });
});

describe("o botão Encaminhar", () => {
  it("'Encaminhar N linhas' (plural) habilitado emite enviar; ligado ao texto de apoio por aria-describedby", () => {
    const { painel, compra } = painelPronto();
    const ev = montar(painel, compra);
    const botao = q<HTMLButtonElement>("#btn-encaminhar-confirmar")!;
    expect(texto(botao)).toBe("Encaminhar 2 linhas");
    expect(botao.disabled).toBe(false);
    expect(botao.getAttribute("aria-describedby")).toBe("encaminhar-apoio");
    expect(texto(q("#encaminhar-apoio"))).toContain("as linhas serão criadas na DIR com status on_going");
    botao.click();
    expect(ev.enviar).toBe(1);
  });

  it("'Encaminhar 1 linha' (singular)", () => {
    const c1 = compraTeste({ ordens: [ordemTeste(1)] });
    montar(estado({ previa: previaTeste(c1), linhasPendentes: 1, podeEnviar: true }), c1);
    expect(texto(q("#btn-encaminhar-confirmar"))).toBe("Encaminhar 1 linha");
  });

  it("desabilitado mostra o porquê no texto de apoio (o motivo do composable)", () => {
    const { painel, compra } = painelPronto({ conflitosPo: ["PO26-12-9999"] }, { podeEnviar: false, motivoBloqueio: "Resolva os itens em vermelho para encaminhar." });
    montar(painel, compra);
    expect(q<HTMLButtonElement>("#btn-encaminhar-confirmar")!.disabled).toBe(true);
    expect(texto(q("#encaminhar-apoio"))).toBe("Resolva os itens em vermelho para encaminhar.");
  });

  it("enviando: o botão fica parado ('Encaminhando…') e as caixas também", () => {
    const { painel, compra } = painelPronto({}, { enviando: true, podeEnviar: false });
    montar(painel, compra);
    expect(texto(q("#btn-encaminhar-confirmar"))).toBe("Encaminhando…");
    expect(q<HTMLButtonElement>("#btn-encaminhar-confirmar")!.disabled).toBe(true);
    expect(texto(q("#encaminhar-apoio"))).toBe("Enviando para a DIR…");
  });

  it("erro do envio: mensagem em alerta e o botão segue disponível (repetir é seguro)", () => {
    const { painel, compra } = painelPronto({}, { erroEnvio: { codigo: null, mensagem: "Não foi possível encaminhar. Nada foi criado ou pode ter sido criado parcialmente: tente de novo (repetir é seguro).", bloqueia: false } });
    montar(painel, compra);
    const alerta = q("#encaminhar-erro-envio")!;
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(texto(alerta)).toContain("repetir é seguro");
    expect(q<HTMLButtonElement>("#btn-encaminhar-confirmar")!.disabled).toBe(false);
  });
});

describe("resultado", () => {
  it("sucesso: 'Encaminhada: N linhas criadas na DIR', os POs, Voltar ao resumo e o link para a DIR", () => {
    const compra = compraTeste();
    const ev = montar(
      estado({
        previa: previaTeste(compra),
        resultado: { tipo: "criadas", criadas: [{ ordemId: "ord_teste_0001", dirId: "dir_ord_teste_0001", po: "PO26-12-9998" }, { ordemId: "ord_teste_0002", dirId: "dir_ord_teste_0002", po: "PO26-12-9999" }] },
      }),
      compra,
    );
    expect(texto(q("#encaminhar-resultado-titulo"))).toBe("Encaminhada: 2 linhas criadas na DIR");
    expect(qa("#encaminhar-resultado-pos li").map((li) => texto(li))).toEqual(["PO26-12-9998", "PO26-12-9999"]);
    expect(q<HTMLAnchorElement>("#link-abrir-dir")!.getAttribute("href")).toBe("/dir");
    expect(texto(q("#link-abrir-dir"))).toBe("Abrir a DIR");
    expect(q("#encaminhar-linhas")).toBeNull();
    expect(q("#btn-encaminhar-confirmar")).toBeNull();
    expect(q("#encaminhar-intro")).toBeNull();
    q<HTMLButtonElement>("#btn-encaminhar-voltar-resultado")!.click();
    expect(ev.voltar).toBe(1);
  });

  it("sucesso com 1 linha: singular", () => {
    montar(estado({ resultado: { tipo: "criadas", criadas: [{ ordemId: "ord_teste_0001", dirId: "dir_ord_teste_0001", po: "PO26-12-9998" }] } }));
    expect(texto(q("#encaminhar-resultado-titulo"))).toBe("Encaminhada: 1 linha criada na DIR");
  });

  it("já estava encaminhada: mensagem neutra (não é erro) e sem lista de POs", () => {
    montar(estado({ resultado: { tipo: "ja-encaminhada" } }));
    expect(texto(q("#encaminhar-ja-encaminhada"))).toBe("Esta compra já estava encaminhada.");
    expect(q("#encaminhar-resultado-pos")).toBeNull();
    expect(q("#encaminhar-erro-envio")).toBeNull();
    expect(q("#link-abrir-dir")).not.toBeNull();
  });
});

describe("acessibilidade", () => {
  it("a seção é nomeada pelo título e os erros do envio e da prévia são alertas", () => {
    const { painel, compra } = painelPronto();
    montar(painel, compra);
    const secao = q("#compra-encaminhar")!;
    expect(secao.getAttribute("aria-labelledby")).toBe("compra-encaminhar-titulo");
    expect(qa("button").every((b) => b.getAttribute("type") === "button")).toBe(true);
  });
});

