// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { REGRAS_CHECKLIST } from "../../shared/constants/compraChecklist";
import { MODAL_COURIER_SIMPLES } from "../../shared/constants/processos";
import type { Compra, ItemCompra, MudancasCompra, OrdemCompra } from "../../shared/types/compra";
import { checklistCompra } from "../../shared/utils/compraChecklist";
import { courierSimplesDasOrdens, itemVazio, ordemVazia } from "../../shared/utils/compraForm";
import CompraColunaDireita from "../../app/components/compras/CompraColunaDireita.vue";
import CompraFormulario from "../../app/components/compras/CompraFormulario.vue";
import { campoDoItem, CAMPOS_SIMPLES, linhaMaisLongaDaOrdem, REGRAS_SEM_ALVO } from "../../app/utils/comprasCampos";
import { acharCampo, DURACAO_DESTAQUE_MS, irParaCampoComAba, rolarEFocar } from "../../app/utils/comprasFoco";
import { OPCOES_VAZIAS } from "../../app/utils/comprasBlocos";
import { compraTeste } from "./helpers/formularioCompra";

// O checklist clicável: cada erro ou aviso que corresponde a um campo vira um botão que rola até o campo (a coluna do formulário), foca
// e destaca por ~1,5 s; no celular troca antes para a aba Formulário. O mapa do checklist para os campos é UM (comprasCampos.ts) e cada
// campo tem data-campo estável. Dados fictícios (TESTE).

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  while (montados.length) montados.pop()!();
  document.body.innerHTML = "";
});

const montados: Array<() => void> = [];
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];

const item = (id: string, posicao: number, extra: Partial<ItemCompra> = {}): ItemCompra => ({ ...itemVazio(posicao), id, ...extra });
const ordem = (id: string, posicao: number, itens: ItemCompra[], extra: Partial<OrdemCompra> = {}): OrdemCompra => ({ ...ordemVazia(posicao), id, posicao, itens, ...extra });

// ── O mapa único ──────────────────────────────────────────────────────────────────────────────────────────────

describe("o mapa único do checklist para os campos", () => {
  const PLANAS = [REGRAS_CHECKLIST.paciente, REGRAS_CHECKLIST.processo, REGRAS_CHECKLIST.medico, REGRAS_CHECKLIST.vendedor, REGRAS_CHECKLIST.responsavel, REGRAS_CHECKLIST.ordens, REGRAS_CHECKLIST.despachante, REGRAS_CHECKLIST.pagamentoMomento, REGRAS_CHECKLIST.localAplicacao, REGRAS_CHECKLIST.entrega, REGRAS_CHECKLIST.documentos];
  const DE_ORDEM = [REGRAS_CHECKLIST.fornecedor, REGRAS_CHECKLIST.envio, REGRAS_CHECKLIST.po, REGRAS_CHECKLIST.poNaDir, REGRAS_CHECKLIST.medicamentos, REGRAS_CHECKLIST.textoDir];
  const DE_MEDICAMENTO = [REGRAS_CHECKLIST.medNome, REGRAS_CHECKLIST.medTemperatura, REGRAS_CHECKLIST.medQuantidade, REGRAS_CHECKLIST.preCadastro];
  const compra = compraTeste({ ordens: [ordem("o1", 1, [item("i1", 1, { medicamento: "A" })])] });

  it("TODA regra de REGRAS_CHECKLIST tem alvo ou está na lista de exceções (uma regra nova sem alvo quebra este teste)", () => {
    const classificadas = new Set<string>([...PLANAS, ...DE_ORDEM, ...DE_MEDICAMENTO, ...REGRAS_SEM_ALVO]);
    const todas = Object.values(REGRAS_CHECKLIST);
    const semDestino = todas.filter((r) => !classificadas.has(r));
    expect(semDestino, `regras do checklist sem alvo nem exceção: ${semDestino.join(", ")}`).toEqual([]);
    expect(REGRAS_SEM_ALVO).toEqual(["encaminhada"]);
    for (const r of PLANAS) expect(campoDoItem(r, compra), r).not.toBeNull();
    for (const r of DE_ORDEM) expect(campoDoItem(`ordem-1-${r}`, compra), r).not.toBeNull();
    for (const r of DE_MEDICAMENTO) expect(campoDoItem(`ordem-1-med-1-${r}`, compra), r).not.toBeNull();
    expect(campoDoItem("ordem-1-encaminhada", compra)).toBeNull(); // só existe como 'ok'
  });

  it("os campos simples têm data-campo igual ao id do checklist", () => {
    for (const id of CAMPOS_SIMPLES) if (id !== REGRAS_CHECKLIST.processo) expect(campoDoItem(id, compra)).toBe(id);
  });

  it("processo com 'Compra particular': a caixa; sem: o campo do número", () => {
    expect(campoDoItem("processo", compraTeste({ compraParticular: true }))).toBe("processo-particular");
    expect(campoDoItem("processo", compraTeste({ compraParticular: false }))).toBe("processo");
  });

  it("ordem-N-fornecedor | envio | po | medicamentos e ordem-N-med-M-nome | temperatura | quantidade apontam para si mesmos", () => {
    for (const r of ["fornecedor", "envio", "po", "medicamentos"]) expect(campoDoItem(`ordem-2-${r}`, compra)).toBe(`ordem-2-${r}`);
    for (const r of ["nome", "temperatura", "quantidade"]) expect(campoDoItem(`ordem-2-med-3-${r}`, compra)).toBe(`ordem-2-med-3-${r}`);
  });

  it("med-M-pre-cadastro vai para o campo Medicamento da linha; po-na-dir para o PO da ordem", () => {
    expect(campoDoItem("ordem-2-med-3-pre-cadastro", compra)).toBe("ordem-2-med-3-nome");
    expect(campoDoItem("ordem-4-po-na-dir", compra)).toBe("ordem-4-po");
  });

  it("texto-dir vai para a linha do medicamento MAIS LONGA da ordem (o 1º em empate); sem itens, para o '+ Adicionar medicamento'", () => {
    const c = compraTeste({
      ordens: [
        ordem("o1", 1, [item("a", 1, { medicamento: "CURTO" }), item("b", 2, { medicamento: "MEDICAMENTO BEM MAIS COMPRIDO", apresentacao: "500 mg" }), item("c", 3, { medicamento: "MEDIO NOME" })]),
        ordem("o2", 2, [item("d", 1, { medicamento: "IGUAL" }), item("e", 2, { medicamento: "IGUAL" })]),
        ordem("o3", 3, []),
      ],
    });
    expect(linhaMaisLongaDaOrdem(c, 1)).toBe(2);
    expect(campoDoItem("ordem-1-texto-dir", c)).toBe("ordem-1-med-2-nome");
    expect(campoDoItem("ordem-2-texto-dir", c)).toBe("ordem-2-med-1-nome");
    expect(campoDoItem("ordem-3-texto-dir", c)).toBe("ordem-3-medicamentos");
    expect(linhaMaisLongaDaOrdem(c, 9)).toBeNull();
  });

  it("ordem e medicamento são POSIÇÕES exibidas: com as ordens fora de ordem no array, a linha mais longa usa a posição", () => {
    const c = compraTeste({ ordens: [ordem("o2", 2, [item("x", 1, { medicamento: "X" })]), ordem("o1", 1, [item("y", 2, { medicamento: "YYYYYYYY" }), item("z", 1, { medicamento: "Z" })])] });
    expect(linhaMaisLongaDaOrdem(c, 1)).toBe(2);
  });

  it("id desconhecido não tem alvo", () => {
    expect(campoDoItem("inventado", compra)).toBeNull();
    expect(campoDoItem("ordem-1-inventado", compra)).toBeNull();
    expect(campoDoItem("ordem-1-med-1-inventado", compra)).toBeNull();
  });
});

// ── O formulário + o checklist juntos ─────────────────────────────────────────────────────────────────────

function montarJunto(inicial: Compra, extra: { podeEditar?: boolean } = {}) {
  const compra = ref(inicial) as { value: Compra };
  const cliques: string[] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h("div", [
          h(CompraFormulario, {
            compra: compra.value,
            estado: "ocioso",
            salvoEm: null,
            podeEditar: extra.podeEditar !== false,
            opcoes: { ...OPCOES_VAZIAS, temperaturas: [{ nome: "Ambiente" }] },
            onAlterar: (m: MudancasCompra) => {
              const nova = { ...compra.value, ...m };
              if (m.ordens) nova.courierSimples = courierSimplesDasOrdens(nova.ordens);
              compra.value = nova;
            },
          }),
          h(CompraColunaDireita, {
            compra: compra.value,
            despachanteCadastro: null,
            onIrParaCampo: (campo: string) => {
              cliques.push(campo);
              rolarEFocar(campo);
            },
          }),
        ]),
    }),
  );
  app.mount(el);
  montados.push(() => {
    app.unmount();
    el.remove();
  });
  return { compra, cliques };
}

/** Uma compra com ERRO ou AVISO em quase tudo: o checklist tem um botão para cada tipo de item. */
function compraCheiaDeErros(): Compra {
  const longo = (n: number): string => "M".repeat(n);
  return compraTeste({
    paciente: "",
    processoNumero: "",
    medico: "",
    vendedor: "",
    responsavel: "",
    despachante: "",
    localAplicacao: "",
    entrega: "",
    documentos: null,
    pagamentoMomento: null,
    ordens: [
      ordem("o1", 1, [item("a1", 1, { medicamento: "", temperatura: "", quantidade: "" })]), // fornecedor, envio, po, med-1 nome/temperatura/quantidade
      ordem("o2", 2, [], { fornecedor: "F", envio: "Air Cargo", po: "PO26-11-0002" }), // ordem-2-medicamentos
      ordem("o3", 3, [item("c1", 1, { medicamento: longo(150), temperatura: "Ambiente", quantidade: "1" }), item("c2", 2, { medicamento: longo(160), temperatura: "Ambiente", quantidade: "1" })], { fornecedor: "F", envio: "Air Cargo", po: "PO26-11-0003" }), // texto-dir (linha 2) e pré-cadastro
    ],
  });
}

describe("clicar no item leva o foco ao campo certo (um botão por tipo de item)", () => {
  it("cada item de erro/aviso com campo é um botão com data-ir-campo; item ok nunca é botão", () => {
    montarJunto(compraCheiaDeErros());
    const botoes = qa<HTMLButtonElement>("[data-ir-campo]");
    expect(botoes.length).toBeGreaterThan(15);
    expect(botoes.every((b) => b.tagName === "BUTTON" && b.type === "button")).toBe(true);
    // Nenhum item ok virou botão.
    const lis = qa<HTMLElement>("#compra-checklist-oks li");
    expect(lis.every((li) => li.querySelector("button") === null)).toBe(true);
    // Cada botão está dentro de um <li> de erro ou de aviso.
    expect(botoes.every((b) => b.closest("#compra-checklist-erros, #compra-checklist-avisos") !== null)).toBe(true);
  });

  it("para CADA botão do checklist existe o campo [data-campo], e clicar leva o foco a ele (ou a um controle dentro dele)", () => {
    montarJunto(compraCheiaDeErros());
    const botoes = qa<HTMLButtonElement>("[data-ir-campo]");
    const visitados = new Set<string>();
    for (const botao of botoes) {
      const campo = botao.getAttribute("data-ir-campo")!;
      const alvo = acharCampo(campo)!;
      expect(alvo, `campo ${campo} não existe no formulário`).not.toBeNull();
      botao.click();
      const ativo = document.activeElement as HTMLElement;
      expect(alvo === ativo || alvo.contains(ativo), `foco de ${campo} foi para ${ativo?.id || ativo?.tagName}`).toBe(true);
      expect(alvo.hasAttribute("data-destaque"), `destaque de ${campo}`).toBe(true);
      visitados.add(campo);
    }
    // Os tipos de item que a compra deste teste produz (todos os grupos do mapa):
    for (const esperado of ["paciente", "processo", "medico", "vendedor", "responsavel", "despachante", "pagamento-momento", "local-aplicacao", "entrega", "documentos", "ordens"]) {
      if (esperado === "ordens") continue; // há ordens: o item é 'ok'
      expect(visitados.has(esperado), esperado).toBe(true);
    }
    for (const esperado of ["ordem-1-fornecedor", "ordem-1-envio", "ordem-1-po", "ordem-2-medicamentos", "ordem-1-med-1-nome", "ordem-1-med-1-temperatura", "ordem-1-med-1-quantidade", "ordem-3-med-2-nome"]) {
      expect(visitados.has(esperado), esperado).toBe(true);
    }
  });

  it("onde cai o foco: select → o botão do select; rádio → o 1º rádio; campo de busca → o input; '+ Adicionar' → o botão", () => {
    montarJunto(compraCheiaDeErros());
    const foco = (campo: string): HTMLElement => {
      qa<HTMLButtonElement>(`[data-ir-campo='${campo}']`)[0]!.click();
      return document.activeElement as HTMLElement;
    };
    expect(foco("paciente").id).toBe("compra-paciente");
    expect(foco("vendedor").id).toBe("compra-vendedor"); // o botão do AppSelect
    expect(foco("despachante").id).toBe("compra-despachante");
    expect(foco("pagamento-momento").getAttribute("role")).toBe("radio"); // o SegmentedControl: o 1º rádio (o que entra no Tab)
    expect(foco("pagamento-momento").closest("#compra-pagamento-momento")).not.toBeNull();
    expect(foco("documentos").closest("#compra-documentos")).not.toBeNull();
    expect(foco("local-aplicacao").id).toBe("compra-local");
    expect(foco("ordem-2-medicamentos").id).toBe("ordem-o2-adicionar-item");
    expect(foco("ordem-1-med-1-nome").id).toBe("item-a1-medicamento"); // o input do AppSearchSelect
    expect(foco("ordem-1-med-1-temperatura").id).toBe("item-a1-temperatura");
    expect(foco("ordem-1-med-1-quantidade").id).toBe("item-a1-quantidade");
    expect(foco("ordem-1-po").id).toBe("ordem-o1-po");
  });

  it("texto-dir leva à linha do medicamento MAIS LONGA da ordem (a 2ª da ordem 3)", () => {
    montarJunto(compraCheiaDeErros());
    expect(q("[data-ir-campo='ordem-3-med-2-nome']")).not.toBeNull();
    qa<HTMLButtonElement>("[data-ir-campo='ordem-3-med-2-nome']").forEach((b) => b.click());
    expect((document.activeElement as HTMLElement).id).toBe("item-c2-medicamento");
  });

  it("o aviso de pré-cadastro leva ao campo Medicamento da linha", () => {
    montarJunto(compraCheiaDeErros());
    const botao = qa<HTMLButtonElement>("[data-item$='-pre-cadastro'] [data-ir-campo]")[0]!;
    expect(botao.getAttribute("data-ir-campo")).toMatch(/^ordem-3-med-\d-nome$/);
    botao.click();
    expect((document.activeElement as HTMLElement).id).toMatch(/^item-c[12]-medicamento$/);
  });

  it("Compra particular: o item do processo é 'ok' (não é botão) e o campo some do mapa de erros", () => {
    montarJunto(compraTeste({ compraParticular: true, ordens: [ordem("o1", 1, [item("a1", 1)])] }));
    expect(q("[data-item='processo'] button")).toBeNull();
    expect(q("[data-ir-campo='processo']")).toBeNull();
  });

  it("todas as ordens Courier Simples: o despachante é 'ok' (dispensado), sem botão e sem campo", () => {
    montarJunto(compraTeste({ despachante: "", courierSimples: true, ordens: [ordem("o1", 1, [item("a1", 1)], { envio: MODAL_COURIER_SIMPLES })] }));
    expect(q("[data-ir-campo='despachante']")).toBeNull();
    expect(acharCampo("despachante")).toBeNull();
    expect(checklistCompra(compraTeste({ despachante: "", ordens: [ordem("o1", 1, [item("a1", 1)], { envio: MODAL_COURIER_SIMPLES })] })).itens.find((i) => i.id === "despachante")!.nivel).toBe("ok");
  });

  it("'Nenhuma ordem na compra' leva ao botão '+ Adicionar ordem'", () => {
    montarJunto(compraTeste({ ordens: [] }));
    qa<HTMLButtonElement>("[data-ir-campo='ordens']")[0]!.click();
    expect((document.activeElement as HTMLElement).id).toBe("compra-adicionar-ordem");
  });

  it("a Entrega desabilitada ('mesmo local') leva o foco ao Local de aplicação (campo alternativo)", () => {
    montarJunto(compraTeste({ localAplicacao: "Clínica", entrega: "Clínica", ordens: [ordem("o1", 1, [item("a1", 1)])] }));
    // O aviso de entrega só existe com a entrega vazia; força o clique pelo mapa.
    rolarEFocar("entrega");
    expect((document.activeElement as HTMLElement).id).toBe("compra-local");
  });

  it("as posições valem depois de remover uma ordem do meio: o botão da ordem 2 aponta para a ordem que AGORA é a 2ª", async () => {
    const c = compraTeste({
      ordens: [ordem("o1", 1, [item("a1", 1, { medicamento: "A", temperatura: "T", quantidade: "1" })], { fornecedor: "F", envio: "Air Cargo", po: "PO26-11-0001" }), ordem("o2", 2, [item("b1", 1)]), ordem("o3", 3, [item("c1", 1)])],
    });
    const { compra } = montarJunto(c);
    // Troca de lugar: a antiga ordem 3 passa a ser a 2ª.
    compra.value = { ...compra.value, ordens: [compra.value.ordens[0]!, { ...compra.value.ordens[2]!, posicao: 2 }] };
    await nextTick();
    qa<HTMLButtonElement>("[data-ir-campo='ordem-2-fornecedor']")[0]!.click();
    expect((document.activeElement as HTMLElement).id).toBe("ordem-o3-fornecedor");
  });
});

describe("a rolagem e o destaque", () => {
  it("rola o campo para o CENTRO (scrollIntoView, que rola a coluna com rolagem própria) e destaca por ~1,5 s", () => {
    montarJunto(compraCheiaDeErros());
    const alvo = acharCampo("paciente")!;
    const rolar = vi.fn();
    alvo.scrollIntoView = rolar;
    rolarEFocar("paciente");
    expect(rolar).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(alvo.hasAttribute("data-destaque")).toBe(true);
    vi.advanceTimersByTime(DURACAO_DESTAQUE_MS - 1);
    expect(alvo.hasAttribute("data-destaque")).toBe(true);
    vi.advanceTimersByTime(2);
    expect(alvo.hasAttribute("data-destaque")).toBe(false);
    expect(DURACAO_DESTAQUE_MS).toBe(1500);
  });

  it("prefers-reduced-motion: rola sem animação (behavior 'auto')", () => {
    vi.stubGlobal("matchMedia", (c: string) => ({ matches: c.includes("prefers-reduced-motion"), media: c }));
    montarJunto(compraCheiaDeErros());
    const alvo = acharCampo("medico")!;
    const rolar = vi.fn();
    alvo.scrollIntoView = rolar;
    rolarEFocar("medico");
    expect(rolar).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
  });

  it("clicar de novo reinicia o destaque (não some no meio)", () => {
    montarJunto(compraCheiaDeErros());
    const alvo = acharCampo("paciente")!;
    rolarEFocar("paciente");
    vi.advanceTimersByTime(1000);
    rolarEFocar("paciente");
    vi.advanceTimersByTime(1000);
    expect(alvo.hasAttribute("data-destaque")).toBe(true);
    vi.advanceTimersByTime(600);
    expect(alvo.hasAttribute("data-destaque")).toBe(false);
  });

  it("campo que não existe: devolve null e não faz nada; o nome do campo é validado (nada de seletor arbitrário)", () => {
    expect(rolarEFocar("nao-existe")).toBeNull();
    expect(acharCampo('x"] , body, ["y')).toBeNull();
    expect(acharCampo("")).toBeNull();
  });

  it("o destaque tem contorno na cor primária e sem transição com prefers-reduced-motion (main.css)", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/assets/css/main.css", "utf-8");
    expect(css).toMatch(/\[data-destaque\]\s*\{[^}]*outline:\s*2px solid var\(--color-accent-dark\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\[data-destaque\]\s*\{\s*transition:\s*none/);
  });
});

describe("somente leitura: o botão existe, a página rola e destaca, mas o foco não entra num campo desabilitado", () => {
  it("clicar rola e destaca o campo desabilitado, sem lançar erro", () => {
    montarJunto(compraCheiaDeErros(), { podeEditar: false });
    const botao = qa<HTMLButtonElement>("[data-ir-campo='paciente']")[0]!;
    const alvo = acharCampo("paciente")!;
    const rolar = vi.fn();
    alvo.scrollIntoView = rolar;
    botao.focus();
    botao.click();
    expect(rolar).toHaveBeenCalled();
    expect(alvo.hasAttribute("data-destaque")).toBe(true);
    expect((alvo as HTMLInputElement).disabled).toBe(true);
  });
});

// ── Celular: troca de aba antes de rolar ──────────────────────────────────────────────────────────────────

describe("no celular o clique também troca para a aba Formulário, antes de rolar", () => {
  function montarComAbas(largura: number, abaInicial: "lista" | "formulario" | "resumo") {
    montarJunto(compraCheiaDeErros());
    let aba = abaInicial;
    const trocas: string[] = [];
    const ordemDosEventos: string[] = [];
    const alvo = acharCampo("paciente")!;
    alvo.scrollIntoView = () => ordemDosEventos.push("rolou");
    const deps = {
      telaLarga: () => largura >= 1024,
      abaAtual: () => aba,
      irParaAba: (a: typeof aba) => {
        aba = a;
        trocas.push(a);
        ordemDosEventos.push(`aba:${a}`);
      },
      aguardar: async () => {
        ordemDosEventos.push("aguardou");
      },
    };
    return { deps, trocas, ordemDosEventos, abaAgora: () => aba };
  }

  it("375 px, aba Resumo: vai para 'formulario', espera o painel e SÓ DEPOIS rola e foca", async () => {
    const m = montarComAbas(375, "resumo");
    const campo = await irParaCampoComAba("paciente", m.deps);
    expect(m.trocas).toEqual(["formulario"]);
    expect(m.ordemDosEventos).toEqual(["aba:formulario", "aguardou", "rolou"]);
    expect(m.abaAgora()).toBe("formulario");
    expect(document.activeElement).toBe(campo);
  });

  it("375 px já no Formulário: não troca nada", async () => {
    const m = montarComAbas(375, "formulario");
    await irParaCampoComAba("paciente", m.deps);
    expect(m.trocas).toEqual([]);
    expect(m.ordemDosEventos).toEqual(["rolou"]);
  });

  it.each([1280, 2130])("%i px (tela larga): NUNCA troca de aba (as três colunas estão juntas), mesmo com a aba 'resumo' na URL", async (largura) => {
    const m = montarComAbas(largura, "resumo");
    await irParaCampoComAba("paciente", m.deps);
    expect(m.trocas).toEqual([]);
    expect(m.ordemDosEventos).toEqual(["rolou"]);
  });

  it("a aba padrão espera o DOM e um quadro (esperarQuadro) quando não há `aguardar`", async () => {
    vi.useRealTimers();
    montarJunto(compraCheiaDeErros());
    let aba: "lista" | "formulario" | "resumo" = "lista";
    const campo = await irParaCampoComAba("paciente", { telaLarga: () => false, abaAtual: () => aba, irParaAba: (a) => (aba = a) });
    expect(aba).toBe("formulario");
    expect(campo).not.toBeNull();
  });
});
