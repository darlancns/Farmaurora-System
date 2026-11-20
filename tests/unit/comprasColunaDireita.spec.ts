// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { useState } from "#app";
import type { Compra, OpcoesCompra } from "../../shared/types/compra";
import { checklistCompra } from "../../shared/utils/compraChecklist";
import { compraParaResumoEntrada, montarResumoCompra } from "../../shared/utils/compraResumo";
import CompraChecklistPainel from "../../app/components/compras/CompraChecklistPainel.vue";
import CompraColunaDireita from "../../app/components/compras/CompraColunaDireita.vue";
import { useCompraOpcoes } from "../../app/composables/useCompraOpcoes";

// A coluna da direita com componentes REAIS no happy-dom: checklist agrupado, resumo IGUAL à função pura (despachante do Cadastro
// sem PIX), botão Copiar com a string exata e toast. E o useCompraOpcoes (uma vez por sessão, falha com "Tentar de novo").
// Dados fictícios (TESTE).

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
function montar(componente: ReturnType<typeof defineComponent>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(componente);
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}
beforeEach(() => {
  useState<string | null>("toast-message").value = null;
});
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  // @ts-expect-error: remove o stub entre os testes
  delete document.execCommand;
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];
const toast = () => useState<string | null>("toast-message").value;

const compraCompleta = (extra: Partial<Compra> = {}): Compra => ({
  id: "cmp_13",
  anoMes: "2026-11",
  sequencia: 13,
  cancelada: false,
  paciente: "PACIENTE TESTE",
  processoNumero: "0000000-00.0000.0.00.0000/SP",
  medico: "Dr. Teste",
  localAplicacao: "Clínica Teste",
  entrega: "Entrega Teste",
  contatos: "Contato Teste",
  termoObservacao: "",
  despachante: "Despachante Teste",
  isencaoPara: "",
  observacoes: "",
  vendedor: "Dani",
  responsavel: "Cris",
  compraParticular: false,
  localDeclarado: false,
  termoPosterior: false,
  courierSimples: false,
  isencao: false,
  recorrente: false,
  pagamentoAlvara: null,
  pagamentoMomento: "vamos_pagar",
  documentos: true,
  pendencias: [],
  criadoPor: "Cris",
  atualizadoPor: "Cris",
  createdAt: "2026-11-19T12:00:00.000Z",
  updatedAt: "2026-11-19T12:00:00.000Z",
  ordens: [
    {
      id: "ord_1",
      posicao: 1,
      fornecedor: "Fornecedor Teste",
      envio: "Air Cargo",
      cia: "Cia Teste",
      po: "PO26-11-0001",
      frete: null,
      freteReal: null,
      dirId: null,
      encaminhadaEm: null,
      itens: [{ id: "itm_1", posicao: 1, medicamento: "MED TESTE", medicamentoCadastroId: "med_1", preCadastroId: null, apresentacao: "10 mg", referencia: "", laboratorio: "", quantidade: "2 caixas", temperatura: "2°C a 8°C", valorUnitario: 5, valorReal: null }],
    },
  ],
  ...extra,
});

const DESPACHANTE = { nome: "Despachante Teste", telefone: "11 90000-0000", email: "d@teste.com", contatoNome: "Contato D" };

function coluna(c: Compra, despachanteCadastro: typeof DESPACHANTE | null = null) {
  montar(defineComponent({ render: () => h(CompraColunaDireita, { compra: c, despachanteCadastro }) }));
}

// ── Checklist ──────────────────────────────────────────────────────────────────────────────────────────────

describe("checklist (painel)", () => {
  function painel(itens: Parameters<typeof checklistCompra>[0], pronta?: boolean) {
    const r = checklistCompra(itens);
    montar(defineComponent({ render: () => h(CompraChecklistPainel, { itens: r.itens, pronta: pronta ?? r.pronta }) }));
    return r;
  }

  it("erros primeiro (✕), depois avisos (!), e os ok recolhidos num contador", () => {
    const r = painel(compraCompleta({ paciente: "", localAplicacao: "", ordens: [{ ...compraCompleta().ordens[0]!, po: "" }] }));
    expect(texto(q("#compra-checklist-titulo"))).toBe("Antes de encaminhar");
    const erros = qa("#compra-checklist-erros li");
    expect(erros.map((li) => li.getAttribute("data-item"))).toEqual(["paciente", "ordem-1-po"]);
    expect(erros[0]!.textContent).toContain("✕");
    expect(erros[0]!.querySelector("span")!.className).toContain("text-danger");
    const avisos = qa("#compra-checklist-avisos li");
    expect(avisos.map((li) => li.getAttribute("data-item"))).toEqual(["local-aplicacao"]);
    expect(avisos[0]!.textContent).toContain("!");
    // Ordem de tela: erros, avisos, contador de ok.
    const html = q("#compra-checklist")!.innerHTML;
    expect(html.indexOf("compra-checklist-erros")).toBeLessThan(html.indexOf("compra-checklist-avisos"));
    expect(html.indexOf("compra-checklist-avisos")).toBeLessThan(html.indexOf("compra-checklist-ok-toggle"));
    const oks = r.itens.filter((i) => i.nivel === "ok").length;
    expect(texto(q("#compra-checklist-ok-toggle"))).toBe(`${oks} itens ok`);
  });

  it("os itens ok ficam recolhidos e abrem no clique (aria-expanded)", async () => {
    painel(compraCompleta());
    const toggle = q<HTMLButtonElement>("#compra-checklist-ok-toggle")!;
    expect(q("#compra-checklist-oks")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.click();
    await nextTick();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(qa("#compra-checklist-oks li").length).toBeGreaterThan(5);
    toggle.click();
    await nextTick();
    expect(q("#compra-checklist-oks")).toBeNull();
  });

  it("cada erro de ordem mostra 'Ordem N'; erro da compra não", () => {
    painel(compraCompleta({ medico: "", ordens: [{ ...compraCompleta().ordens[0]!, posicao: 2, fornecedor: "" }] }));
    const medico = q('[data-item="medico"]')!;
    const fornecedor = q('[data-item="ordem-2-fornecedor"]')!;
    expect(texto(medico)).not.toContain("Ordem 2");
    expect(texto(fornecedor)).toContain("Fornecedor da ordem 2 não preenchido");
    expect(texto(fornecedor)).toContain("Ordem 2");
  });

  it("pronta: a mensagem 'Nada pendente'; com erro ela não aparece", () => {
    painel(compraCompleta());
    expect(q("#compra-checklist-pronta")).not.toBeNull();
    expect(q("#compra-checklist-erros")).toBeNull();
    document.body.innerHTML = "";
    painel(compraCompleta({ paciente: "" }));
    expect(q("#compra-checklist-pronta")).toBeNull();
  });
});

// ── A coluna ────────────────────────────────────────────────────────────────────────────────────────────────

describe("coluna direita", () => {
  it("o resumo na tela é IGUAL à string da função pura (com o despachante do Cadastro), em <pre> mono", () => {
    const c = compraCompleta();
    coluna(c, DESPACHANTE);
    const esperado = montarResumoCompra(compraParaResumoEntrada(c, DESPACHANTE));
    const pre = q<HTMLPreElement>("#compra-resumo-texto")!;
    expect(pre.tagName).toBe("PRE");
    expect(pre.textContent).toBe(esperado);
    expect(pre.className).toContain("font-mono");
    expect(pre.className).toContain("whitespace-pre-wrap");
    expect(pre.className).toContain("select-text");
    expect(pre.textContent).toContain("Phone: 11 90000-0000");
    expect(pre.textContent).toContain("Email: d@teste.com");
    expect(pre.textContent).toContain("Contact: Contato D");
  });

  it("título e nota do resumo", () => {
    coluna(compraCompleta());
    expect(texto(q("#compra-resumo-titulo"))).toBe("Resumo (atualiza enquanto você digita)");
    expect(texto(q("#compra-resumo"))).toContain("Linhas vazias somem");
  });

  it("sem o despachante no Cadastro, o resumo sai só com o nome (sem telefone nem e-mail)", () => {
    const c = compraCompleta();
    coluna(c, null);
    const pre = q("#compra-resumo-texto")!.textContent!;
    expect(pre).toBe(montarResumoCompra(compraParaResumoEntrada(c, null)));
    expect(pre).not.toContain("Phone:");
  });

  it("nada de PIX no resumo nem na tela, mesmo que o objeto do despachante traga a chave", () => {
    const comPix = { ...DESPACHANTE, chavePix: "CHAVE-PIX-SECRETA-TESTE", chave_pix: "CHAVE-PIX-SECRETA-TESTE" };
    coluna(compraCompleta(), comPix);
    expect(document.body.textContent).not.toContain("CHAVE-PIX-SECRETA-TESTE");
    expect(document.body.innerHTML.toLowerCase()).not.toMatch(/chave_?pix/);
  });

  it("'Copiar resumo' (primário) copia EXATAMENTE a string do resumo e avisa 'Resumo copiado'", async () => {
    const c = compraCompleta({ paciente: "PACIENTE <TESTE> & 'aspas'" });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    coluna(c, DESPACHANTE);
    const esperado = montarResumoCompra(compraParaResumoEntrada(c, DESPACHANTE));
    const botao = q<HTMLButtonElement>("#btn-copiar-resumo")!;
    expect(texto(botao)).toBe("Copiar resumo");
    expect(botao.className).toContain("bg-accent-dark"); // primário
    botao.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]![0]).toBe(esperado);
    expect(writeText.mock.calls[0]![0]).toBe(q("#compra-resumo-texto")!.textContent);
    await vi.waitFor(() => expect(toast()).toBe("Resumo copiado"));
  });

  it("falha ao copiar: toast de erro", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => { throw new Error("negado"); }) } });
    coluna(compraCompleta());
    q<HTMLButtonElement>("#btn-copiar-resumo")!.click();
    await vi.waitFor(() => expect(toast()).toMatch(/^Não foi possível copiar o resumo/));
  });

  it("o resumo e o checklist acompanham a compra AO VIVO (a prop muda, a tela muda, sem salvar)", async () => {
    const compra = ref(compraCompleta({ paciente: "" }));
    montar(defineComponent({ render: () => h(CompraColunaDireita, { compra: compra.value, despachanteCadastro: null }) }));
    expect(q('[data-item="paciente"]')).not.toBeNull();
    expect(q("#compra-resumo-texto")!.textContent).not.toContain("PACIENTE NOVO");
    compra.value = { ...compra.value, paciente: "PACIENTE NOVO" };
    await nextTick();
    expect(q('[data-item="paciente"]')).toBeNull(); // saiu dos erros
    expect(q("#compra-resumo-texto")!.textContent).toContain("Paciente: *Paciente Novo*");
  });

  it("'Encaminhar para a DIR': secundário; sem as permissões (a coluna não as recebe) fica DESABILITADO com a razão ao lado (o resto está em comprasEncaminharBotao.spec.ts)", () => {
    coluna(compraCompleta());
    const b = q<HTMLButtonElement>("#btn-encaminhar-dir")!;
    expect(b.disabled).toBe(true);
    expect(texto(b)).toBe("Encaminhar para a DIR");
    expect(b.className).not.toContain("bg-accent-dark");
    expect(texto(q("#encaminhar-dir-aviso"))).toBe("Sem permissão para editar Compras");
    expect(b.getAttribute("aria-describedby")).toBe("encaminhar-dir-aviso");
  });

  it("o 'Copiar resumo' não depende de permissão: está sempre habilitado (a coluna nem recebe a permissão)", () => {
    coluna(compraCompleta());
    expect(q<HTMLButtonElement>("#btn-copiar-resumo")!.disabled).toBe(false);
  });
});

// ── useCompraOpcoes ──────────────────────────────────────────────────────────────────────────────────────────

const OPCOES: OpcoesCompra = {
  fornecedores: [{ nome: "Fornecedor Teste", pais: "Alemanha", prazoAlertaDias: 30, semAlerta: false }],
  despachantes: [{ nome: "Despachante Teste", contatoNome: "Contato D", telefone: "11 90000-0000", email: "d@teste.com" }],
  ciasAereas: [{ nome: "Cia Teste" }],
  transportadoras: [{ nome: "Transportadora Teste" }],
  consultores: [{ nome: "Dani" }, { nome: "Flávia" }],
  temperaturas: [{ nome: "2°C a 8°C" }],
  medicamentos: { itens: [], pagina: 1, limite: 50, temMais: false, q: "" },
};

let chaveN = 0;
const novaChave = () => `compras-opcoes-teste-${++chaveN}`;

describe("useCompraOpcoes", () => {
  it("lê UMA vez por sessão: chamadas seguidas de carregar() não repetem", async () => {
    const obter = vi.fn(async () => OPCOES);
    const o = useCompraOpcoes({ api: { obter }, chave: novaChave() });
    await o.carregar();
    await o.carregar();
    await Promise.all([o.carregar(), o.carregar()]);
    expect(obter).toHaveBeenCalledTimes(1);
    expect(o.consultores.value.map((c) => c.nome)).toEqual(["Dani", "Flávia"]);
    expect(o.despachantes.value).toHaveLength(1);
    expect(o.erro.value).toBeNull();
  });

  it("outra instância na mesma sessão reaproveita o que já foi lido", async () => {
    const chave = novaChave();
    const obter = vi.fn(async () => OPCOES);
    await useCompraOpcoes({ api: { obter }, chave }).carregar();
    const outra = useCompraOpcoes({ api: { obter }, chave });
    await outra.carregar();
    expect(obter).toHaveBeenCalledTimes(1);
    expect(outra.consultores.value).toHaveLength(2);
  });

  it("falha: guarda a mensagem; 'Tentar de novo' (forçar) relê e limpa o erro", async () => {
    const obter = vi.fn().mockRejectedValueOnce(new Error("Sem conexão.")).mockResolvedValue(OPCOES);
    const o = useCompraOpcoes({ api: { obter }, chave: novaChave() });
    await o.carregar();
    expect(o.erro.value).toBe("Sem conexão.");
    expect(o.opcoes.value).toBeNull();
    expect(o.consultores.value).toEqual([]);
    await o.carregar(true);
    expect(o.erro.value).toBeNull();
    expect(o.consultores.value).toHaveLength(2);
    expect(obter).toHaveBeenCalledTimes(2);
  });

  it("despachantePeloNome: acha pela chave (sem acento nem caixa) e copia SÓ nome, telefone, e-mail e contato", async () => {
    const comPix = { ...OPCOES, despachantes: [{ ...OPCOES.despachantes[0]!, chavePix: "SECRETA", chave_pix: "SECRETA" } as unknown as OpcoesCompra["despachantes"][number]] };
    const o = useCompraOpcoes({ api: { obter: async () => comPix }, chave: novaChave() });
    await o.carregar();
    expect(o.despachantePeloNome("  DESPACHANTE   teste ")).toEqual({ nome: "Despachante Teste", telefone: "11 90000-0000", email: "d@teste.com", contatoNome: "Contato D" });
    expect(JSON.stringify(o.despachantePeloNome("Despachante Teste"))).not.toContain("SECRETA");
    expect(o.despachantePeloNome("Outro")).toBeNull();
    expect(o.despachantePeloNome("")).toBeNull();
  });

  it("antes de carregar não há despachante nem consultor", () => {
    const o = useCompraOpcoes({ api: { obter: async () => OPCOES }, chave: novaChave() });
    expect(o.despachantePeloNome("Despachante Teste")).toBeNull();
    expect(o.consultores.value).toEqual([]);
  });
});
