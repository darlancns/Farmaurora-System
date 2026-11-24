// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import type { Compra, CompraSalvarDTO, ListaCompras } from "../../shared/types/compra";
import { compararDaLista, itemDaLista } from "../../shared/utils/compraLista";
import CompraFormCabecalho from "../../app/components/compras/CompraFormCabecalho.vue";
import CompraFormulario from "../../app/components/compras/CompraFormulario.vue";
import { useCompraEditor } from "../../app/composables/useCompraEditor";
import { useComprasPagina, type ApiAcoesCompra } from "../../app/composables/useComprasPagina";
import { ApiError } from "../../app/utils/apiFetch";
import { ICONES_COMPRA } from "../../app/utils/comprasIcones";
import { OPCOES_VAZIAS } from "../../app/utils/comprasOpcoes";
import { ICONES_PROCESSO } from "../../app/utils/processoIcones";
import { compraVaziaDeTeste, itemDeTeste } from "./helpers/compraFixtures";

// Bloco D: os botões do cabeçalho (ícone à esquerda, o molde do "Excluir processo" do Follow-Up), "Apagar compra" com confirmação e o aviso quando OUTRA pessoa
// apagou a compra que estava aberta (sem perder o que foi digitado). Dados fictícios (TESTE).

const montados: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  while (montados.length) montados.pop()!();
  document.body.innerHTML = "";
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];

function montar(render: () => ReturnType<typeof h>): void {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render }));
  app.mount(el);
  montados.push(() => {
    app.unmount();
    el.remove();
  });
}

// ── Os botões do cabeçalho ──────────────────────────────────────────────────────────────────────────────────────

function cabecalho(extra: Record<string, unknown> = {}) {
  const ev: string[] = [];
  montar(() =>
    h(CompraFormCabecalho, {
      anoMes: "2026-11",
      sequencia: 14,
      cancelada: false,
      podeEditar: true,
      estado: "salvo",
      onDuplicar: () => ev.push("duplicar"),
      onCancelar: () => ev.push("cancelar"),
      onApagar: () => ev.push("apagar"),
      ...extra,
    }),
  );
  return ev;
}

describe("os três botões do cabeçalho: Duplicar, Cancelar, Apagar", () => {
  it("nesta ORDEM, lado a lado no mesmo bloco, com o texto CURTO e o nome completo em aria-label e title", () => {
    cabecalho();
    const botoes = qa<HTMLButtonElement>("#compra-acoes > button");
    expect(botoes.map((b) => b.id)).toEqual(["btn-duplicar-compra", "btn-cancelar-compra", "btn-apagar-compra"]);
    expect(botoes.map((b) => texto(b))).toEqual(["Duplicar", "Cancelar", "Apagar"]);
    expect(botoes.map((b) => b.getAttribute("aria-label"))).toEqual(["Duplicar compra", "Cancelar compra", "Apagar compra"]);
    expect(botoes.map((b) => b.getAttribute("title"))).toEqual(["Duplicar compra", "Cancelar compra", "Apagar compra"]);
    for (const b of botoes) expect(b.type).toBe("button");
  });

  it("cada um com o ÍCONE À ESQUERDA do texto (svg primeiro, texto depois), de 16px e traço de 1,75, escondido dos leitores de tela", () => {
    cabecalho();
    for (const b of qa<HTMLButtonElement>("#compra-acoes > button")) {
      const svg = b.querySelector("svg")!;
      expect(b.firstElementChild, b.id).toBe(svg);
      expect(b.firstChild, b.id).toBe(svg); // nada (nem texto) antes do ícone
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg.getAttribute("class")).toContain("h-4 w-4 shrink-0");
      expect(svg.getAttribute("stroke-width")).toBe("1.75");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(texto(b).length).toBeGreaterThan(5);
    }
  });

  it("os ícones: copiar, círculo com X e a LIXEIRA do Follow-Up (a mesma, caminho por caminho)", () => {
    cabecalho();
    const caminhos = (id: string) => qa<SVGPathElement>(`${id} svg path`).map((p) => p.getAttribute("d"));
    expect(caminhos("#btn-duplicar-compra")).toEqual(ICONES_COMPRA.duplicar);
    expect(caminhos("#btn-cancelar-compra")).toEqual(ICONES_COMPRA.cancelar);
    expect(caminhos("#btn-apagar-compra")).toEqual(ICONES_PROCESSO.lixeira);
    expect(new Set([ICONES_COMPRA.duplicar.join(), ICONES_COMPRA.cancelar.join(), ICONES_COMPRA.apagar.join()]).size).toBe(3); // três desenhos diferentes
    expect(ICONES_COMPRA.cancelar).toContain("m15 9-6 6"); // o X dentro do círculo
  });

  it("o molde é o do 'Excluir processo' do Follow-Up: as MESMAS classes de altura, borda, fonte e cor (só o respiro lateral é menor, o tamanho compacto); o Apagar leva a cor de perigo discreta dele", () => {
    const fonte = readFileSync(join(process.cwd(), "app/components/processos/ProcessoPainel.vue"), "utf-8");
    const classeDoExcluir = /id="btn-painel-excluir"[\s\S]*?class="([^"]+)"/.exec(fonte)![1]!.split(/\s+/);
    cabecalho();
    const apagar = q<HTMLButtonElement>("#btn-apagar-compra")!.className.split(/\s+/);
    const COMPACTO = ["gap-2", "px-3.5"]; // o "Excluir processo" é folgado; o do cabeçalho da compra usa gap-1.5 e px-3 para caber na coluna
    for (const token of classeDoExcluir.filter((t) => !COMPACTO.includes(t))) expect(apagar, `Excluir processo usa "${token}"`).toContain(token);
    expect(apagar).toContain("gap-1.5");
    expect(apagar).toContain("px-3");
    // o neutro: o mesmo molde, mas sem as cores de perigo
    const duplicar = q<HTMLButtonElement>("#btn-duplicar-compra")!.className.split(/\s+/);
    for (const token of ["inline-flex", "min-h-11", "items-center", "gap-1.5", "rounded-lg", "border", "bg-paper-raised", "px-3", "text-[12.5px]", "font-semibold", "lg:min-h-9"]) {
      expect(duplicar, token).toContain(token);
    }
    expect(duplicar).not.toContain("text-[#9a3828]");
    expect(duplicar).not.toContain("border-[#efd3cc]");
  });

  it("cada botão avisa a página; 'ocupado' trava os três", async () => {
    const ev = cabecalho();
    q<HTMLButtonElement>("#btn-duplicar-compra")!.click();
    q<HTMLButtonElement>("#btn-cancelar-compra")!.click();
    q<HTMLButtonElement>("#btn-apagar-compra")!.click();
    expect(ev).toEqual(["duplicar", "cancelar", "apagar"]);
    document.body.innerHTML = "";
    cabecalho({ ocupado: true });
    expect(qa<HTMLButtonElement>("#compra-acoes > button").map((b) => b.disabled)).toEqual([true, true, true]);
  });

  it("no celular os botões ficam no bloco que QUEBRA de linha, à direita, com alvo de toque de 44px; em lg+ (coluna larga) é uma linha só, junto do título", () => {
    cabecalho();
    const bloco = q("#compra-acoes")!;
    expect(bloco.className).toContain("flex-wrap");
    expect(bloco.className).toContain("justify-end");
    expect(bloco.className).toContain("lg:@min-[28rem]:flex-nowrap");
    expect(bloco.className).toContain("lg:@min-[28rem]:shrink-0");
    expect(qa<HTMLButtonElement>("#compra-acoes > button").every((b) => b.className.includes("min-h-11") && b.className.includes("lg:min-h-9"))).toBe(true);
  });

  it("sócio (só lê): nenhum dos três, nem o bloco; compra cancelada: só o Apagar", () => {
    cabecalho({ podeEditar: false });
    expect(q("#compra-acoes")).toBeNull();
    document.body.innerHTML = "";
    cabecalho({ cancelada: true });
    expect(qa("#compra-acoes > button").map((b) => b.id)).toEqual(["btn-apagar-compra"]);
  });

  it("compra que OUTRA pessoa apagou (estado 'apagada'): nenhuma ação (todas dariam 404)", () => {
    cabecalho({ estado: "apagada" });
    expect(q("#compra-acoes")).toBeNull();
  });

  it("o título mostra o mês e o número da PRÓPRIA compra, e nada mudou nele", () => {
    cabecalho({ anoMes: "2026-10", sequencia: 5 });
    expect(texto(q("#compra-titulo"))).toBe("Compra 05 - Outubro/2026");
  });
});

// ── A faixa de "apagada por outra pessoa" ───────────────────────────────────────────────────────────────────────

describe("compra apagada por outra pessoa: o formulário avisa e o que foi digitado fica", () => {
  function formulario(estado: string) {
    const ev: string[] = [];
    montar(() =>
      h(CompraFormulario, {
        compra: compraVaziaDeTeste({ id: "cmp_14", sequencia: 14, paciente: "TEXTO DIGITADO ANTES DE APAGAREM", itens: [itemDeTeste(1, { medicamento: "MED DIGITADO" })] }),
        estado,
        podeEditar: true,
        opcoes: OPCOES_VAZIAS,
        onFecharApagada: () => ev.push("fechar"),
      }),
    );
    return ev;
  }

  it("a faixa diz 'Esta compra foi apagada por outra pessoa.' (e que o digitado não será salvo), com 'Voltar para a lista'", () => {
    const ev = formulario("apagada");
    const faixa = q("#compra-faixa-apagada")!;
    expect(faixa.getAttribute("role")).toBe("alert");
    expect(texto(faixa)).toContain("Esta compra foi apagada por outra pessoa.");
    expect(texto(faixa)).toContain("O que você digitou continua aqui, mas não será salvo.");
    q<HTMLButtonElement>("#btn-apagada-fechar")!.click();
    expect(ev).toEqual(["fechar"]);
  });

  it("o texto digitado continua nos campos (nada é limpo) e sem erro técnico na tela", () => {
    formulario("apagada");
    expect(q<HTMLInputElement>("#compra-paciente")!.value).toBe("TEXTO DIGITADO ANTES DE APAGAREM");
    expect(qa<HTMLInputElement>("[id^='compra-item-'][id$='-medicamento']")[0]!.value).toBe("MED DIGITADO");
    expect(texto(q("#compra-formulario"))).not.toMatch(/404|Not Found|não encontrada|statusCode/i);
    expect(q("#compra-salvamento")).toBeNull();
    expect(q("#compra-salvamento-alerta")).toBeNull();
  });

  it("nos outros estados a faixa não existe", () => {
    for (const estado of ["ocioso", "pendente", "salvando", "salvo", "erro", "conflito"]) {
      document.body.innerHTML = "";
      formulario(estado);
      expect(q("#compra-faixa-apagada"), estado).toBeNull();
    }
  });
});

// ── O editor: o autosave leva 404 ───────────────────────────────────────────────────────────────────────────────

describe("useCompraEditor: outra pessoa apagou a compra (o salvamento leva 404)", () => {
  function mundo() {
    let apagada = false;
    const salvamentos: CompraSalvarDTO[] = [];
    const base = compraVaziaDeTeste({ id: "cmp_1", sequencia: 1, updatedAt: "2026-11-19T12:00:00.000Z", responsavel: "Cris" });
    const salvar = vi.fn(async (_id: string, corpo: CompraSalvarDTO): Promise<Compra> => {
      salvamentos.push(corpo);
      if (apagada) throw new ApiError("Compra não encontrada.", 404);
      return { ...base, updatedAt: "2026-11-19T13:00:00.000Z" };
    });
    const aoApagada = vi.fn();
    const editor = useCompraEditor({ api: { obter: async () => base, salvar }, somenteLeitura: () => false, aoApagada });
    return { editor, salvar, salvamentos, aoApagada, apagarNoServidor: () => (apagada = true) };
  }

  it("estado 'apagada': o digitado FICA na tela, o aviso à página sobe uma vez e nada é mostrado como erro técnico", async () => {
    const m = mundo();
    await m.editor.carregar("cmp_1");
    m.apagarNoServidor();
    m.editor.alterar({ paciente: "DIGITADO" });
    await vi.advanceTimersByTimeAsync(800);
    expect(m.editor.estado.value).toBe("apagada");
    expect(m.editor.apagada.value).toBe(true);
    expect(m.editor.compra.value!.paciente).toBe("DIGITADO");
    expect(m.editor.mensagemErro.value).toBeNull();
    expect(m.editor.esperandoClique.value).toBe(false);
    expect(m.aoApagada).toHaveBeenCalledTimes(1);
    expect(m.aoApagada.mock.calls[0]![0]).toMatchObject({ id: "cmp_1" });
  });

  it("depois disso NADA mais é enviado (nem as mudanças seguintes, nem 'tentar de novo'), e o texto continua editável na tela", async () => {
    const m = mundo();
    await m.editor.carregar("cmp_1");
    m.apagarNoServidor();
    m.editor.alterar({ paciente: "A" });
    await vi.advanceTimersByTimeAsync(800);
    const enviados = m.salvar.mock.calls.length;
    m.editor.alterar({ paciente: "AB" });
    m.editor.alterar({ medico: "Dr. Teste" });
    await m.editor.tentarDeNovo();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(m.salvar.mock.calls.length).toBe(enviados);
    expect(m.editor.compra.value).toMatchObject({ paciente: "AB", medico: "Dr. Teste" });
    expect(m.editor.estado.value).toBe("apagada");
  });

  it("sair não é barrado (flush devolve true), mas fechar a aba ainda avisa (temPendencia)", async () => {
    const m = mundo();
    await m.editor.carregar("cmp_1");
    m.apagarNoServidor();
    m.editor.alterar({ paciente: "DIGITADO" });
    await vi.advanceTimersByTimeAsync(800);
    expect(await m.editor.flush()).toBe(true);
    expect(m.editor.temPendencia.value).toBe(true);
  });

  it("os outros erros 4xx (400, 403, 422) continuam sendo erro de salvamento, não 'apagada'", async () => {
    const base = compraVaziaDeTeste({ id: "cmp_1" });
    for (const status of [400, 403, 422]) {
      const e = useCompraEditor({ api: { obter: async () => base, salvar: async () => Promise.reject(new ApiError("recusado", status)) }, somenteLeitura: () => false });
      await e.carregar("cmp_1");
      e.alterar({ paciente: "X" });
      await vi.advanceTimersByTimeAsync(800);
      expect(e.estado.value, String(status)).toBe("erro");
      expect(e.apagada.value, String(status)).toBe(false);
    }
  });

  it("abrir outra compra limpa o estado 'apagada'", async () => {
    const m = mundo();
    await m.editor.carregar("cmp_1");
    m.apagarNoServidor();
    m.editor.alterar({ paciente: "X" });
    await vi.advanceTimersByTimeAsync(800);
    expect(m.editor.apagada.value).toBe(true);
    m.editor.definir(compraVaziaDeTeste({ id: "cmp_2" }));
    expect(m.editor.apagada.value).toBe(false);
    expect(m.editor.estado.value).toBe("ocioso");
  });
});

// ── A página: Apagar compra ─────────────────────────────────────────────────────────────────────────────────────

function mundoDaPagina(inicial: Compra[]) {
  const banco = new Map<string, Compra>(inicial.map((c) => [c.id, c]));
  const chamadas: string[] = [];
  const listar = vi.fn(async (p: { anoMes: string; incluirCanceladas: boolean; pagina: number; ordem?: "recentes" | "numero"; inverter?: boolean }): Promise<ListaCompras> => {
    const itens = [...banco.values()].filter((c) => c.anoMes === p.anoMes).map((c) => itemDaLista({ ...c, atualizadoEm: c.updatedAt })).sort(compararDaLista(p.ordem ?? "numero", p.inverter === true));
    const casam = itens.filter((i) => p.incluirCanceladas || !i.cancelada);
    return {
      anoMes: p.anoMes,
      maiorSequencia: itens.reduce((m, c) => Math.max(m, c.sequencia), 0),
      compras: casam,
      pagina: 1,
      limite: 50,
      temMais: false,
      total: casam.length,
      totais: { ativas: itens.filter((i) => !i.cancelada).length, canceladas: itens.filter((i) => i.cancelada).length },
    };
  });
  const obter = vi.fn(async (id: string): Promise<Compra> => {
    const c = banco.get(id);
    if (!c) throw new ApiError("Compra não encontrada.", 404);
    return { ...c };
  });
  const salvar = vi.fn(async (id: string, corpo: CompraSalvarDTO): Promise<Compra> => {
    chamadas.push(`salvar:${id}`);
    const atual = banco.get(id);
    if (!atual) throw new ApiError("Compra não encontrada.", 404);
    const novo = { ...atual, ...(corpo as unknown as Partial<Compra>), id, updatedAt: new Date(Date.parse(atual.updatedAt) + 1000).toISOString() };
    banco.set(id, novo);
    return novo;
  });
  const apagar = vi.fn(async (id: string): Promise<void> => {
    chamadas.push(`apagar:${id}`);
    if (!banco.has(id)) throw new ApiError("Compra não encontrada.", 404);
    banco.delete(id);
  });
  const acoes: ApiAcoesCompra = { criar: vi.fn(), duplicar: vi.fn(), cancelar: vi.fn(), apagar };
  return { banco, chamadas, listar, obter, salvar, apagar, acoes };
}

const compra = (sequencia: number, extra: Partial<Compra> = {}): Compra =>
  compraVaziaDeTeste({ id: `cmp_${sequencia}`, sequencia, anoMes: "2026-11", paciente: `PACIENTE TESTE ${sequencia}`, responsavel: "Cris", updatedAt: `2026-11-19T12:0${sequencia % 10}:00.000Z`, ...extra });

function paginaDe(m: ReturnType<typeof mundoDaPagina>, extra: { query?: Record<string, unknown>; podeEditar?: boolean } = {}) {
  const avisos: string[] = [];
  const urls: Array<Record<string, string>> = [];
  const p = useComprasPagina({
    query: extra.query ?? {},
    podeEditar: () => extra.podeEditar ?? true,
    avisar: (msg) => avisos.push(msg),
    gravarUrl: (u) => urls.push(u),
    apiLista: { listar: m.listar },
    apiCompra: { obter: m.obter, salvar: m.salvar },
    apiAcoes: m.acoes,
    agora: () => new Date("2026-11-19T15:00:00Z"),
  });
  return { p, avisos, urls };
}

describe("Apagar compra: confirmação, apagar de verdade e voltar para a lista", () => {
  it("o botão só ABRE a confirmação (nada é apagado) com o texto pedido; Cancelar fecha sem apagar", async () => {
    const m = mundoDaPagina([compra(14), compra(15)]);
    const { p } = paginaDe(m, { query: { id: "cmp_14" } });
    await p.iniciar();
    p.pedirApagar();
    expect(p.confirmandoApagar.value).toBe(true);
    expect(p.mensagemApagar()).toBe("Apagar a Compra 14 de novembro? Essa ação não pode ser desfeita.");
    expect(m.apagar).not.toHaveBeenCalled();
    p.confirmandoApagar.value = false; // "Cancelar"
    expect(m.banco.has("cmp_14")).toBe(true);
    expect(p.editor.compra.value!.id).toBe("cmp_14");
  });

  it("confirmar APAGA: chama a API, tira o cartão e os totais, fecha o formulário, volta para a lista, avisa e tira o id da URL", async () => {
    const m = mundoDaPagina([compra(14), compra(15)]);
    const { p, avisos, urls } = paginaDe(m, { query: { id: "cmp_14" } });
    await p.iniciar();
    p.pedirApagar();
    await p.confirmarApagar();
    expect(m.apagar).toHaveBeenCalledWith("cmp_14");
    expect(m.banco.has("cmp_14")).toBe(false);
    expect(p.confirmandoApagar.value).toBe(false);
    expect(p.editor.compra.value).toBeNull();
    expect(p.selecionadaId.value).toBeNull();
    expect(p.aba.value).toBe("lista");
    expect(p.lista.compras.value.map((c) => c.sequencia)).toEqual([15]);
    expect(p.lista.totais.value).toEqual({ ativas: 1, canceladas: 0 });
    expect(p.lista.total.value).toBe(1);
    expect(avisos.at(-1)).toBe("Compra 14 de novembro apagada");
    await vi.advanceTimersByTimeAsync(0);
    expect(urls.at(-1)).not.toHaveProperty("id");
  });

  it("o número FICA LIVRE: a sugestão do 'Nova compra' volta a contar sem ele", async () => {
    const m = mundoDaPagina([compra(3), compra(14)]);
    const { p } = paginaDe(m, { query: { id: "cmp_14" } });
    await p.iniciar();
    await p.criarNova();
    expect(p.dialogo.value).toMatchObject({ maior: 14, sugestao: 15 });
    p.cancelarDialogo();
    p.pedirApagar();
    await p.confirmarApagar();
    await p.criarNova();
    expect(p.dialogo.value).toMatchObject({ maior: 3, sugestao: 4 });
  });

  it("compra CANCELADA também se apaga, e o total de canceladas cai", async () => {
    const m = mundoDaPagina([compra(1), compra(2, { cancelada: true })]);
    const { p } = paginaDe(m, { query: { id: "cmp_2" } });
    await p.iniciar();
    expect(p.lista.totais.value).toEqual({ ativas: 1, canceladas: 1 });
    p.pedirApagar();
    await p.confirmarApagar();
    expect(m.banco.has("cmp_2")).toBe(false);
    expect(p.lista.totais.value).toEqual({ ativas: 1, canceladas: 0 });
  });

  it("o que estava por salvar NÃO é salvo depois (a compra foi embora) e não vira erro nem 404 na tela", async () => {
    const m = mundoDaPagina([compra(14)]);
    const { p } = paginaDe(m, { query: { id: "cmp_14" } });
    await p.iniciar();
    p.editor.alterar({ paciente: "PENDENTE" });
    p.pedirApagar();
    await p.confirmarApagar();
    await vi.advanceTimersByTimeAsync(5000);
    expect(m.chamadas.filter((c) => c.startsWith("salvar"))).toEqual([]);
    expect(p.editor.estado.value).toBe("ocioso");
  });

  it("sócio (só lê) não abre a confirmação; sem compra aberta também não", async () => {
    const m = mundoDaPagina([compra(14)]);
    const so = paginaDe(m, { query: { id: "cmp_14" }, podeEditar: false });
    await so.p.iniciar();
    so.p.pedirApagar();
    expect(so.p.confirmandoApagar.value).toBe(false);
    const vazio = paginaDe(m);
    await vazio.p.iniciar();
    vazio.p.pedirApagar();
    expect(vazio.p.confirmandoApagar.value).toBe(false);
  });

  it("clique duplo em 'Apagar compra': só uma chamada", async () => {
    const m = mundoDaPagina([compra(14)]);
    const { p } = paginaDe(m, { query: { id: "cmp_14" } });
    await p.iniciar();
    p.pedirApagar();
    await Promise.all([p.confirmarApagar(), p.confirmarApagar()]);
    expect(m.apagar).toHaveBeenCalledTimes(1);
  });

  it("o servidor recusou (503: o banco ainda não liberou o DELETE): a mensagem dele aparece, a compra continua aberta e na lista", async () => {
    const m = mundoDaPagina([compra(14)]);
    m.apagar.mockRejectedValueOnce(new ApiError("Apagar compras ainda não está liberado no banco de dados. Peça ao administrador do sistema para liberar e tente de novo.", 503));
    const { p, avisos } = paginaDe(m, { query: { id: "cmp_14" } });
    await p.iniciar();
    p.pedirApagar();
    await p.confirmarApagar();
    expect(avisos.at(-1)).toMatch(/Apagar compras ainda não está liberado/);
    expect(p.confirmandoApagar.value).toBe(false);
    expect(p.editor.compra.value!.id).toBe("cmp_14");
    expect(p.lista.compras.value.map((c) => c.id)).toEqual(["cmp_14"]);
    expect(p.lista.totais.value.ativas).toBe(1);
  });

  it("outra pessoa já tinha apagado (404 no DELETE): avisa com clareza e fecha do mesmo jeito", async () => {
    const m = mundoDaPagina([compra(14)]);
    const { p, avisos } = paginaDe(m, { query: { id: "cmp_14" } });
    await p.iniciar();
    m.banco.delete("cmp_14"); // outra pessoa foi mais rápida
    p.pedirApagar();
    await p.confirmarApagar();
    expect(avisos.at(-1)).toBe("Esta compra já tinha sido apagada por outra pessoa.");
    expect(p.editor.compra.value).toBeNull();
    expect(p.lista.compras.value).toEqual([]);
  });

  it("a compra já aberta de outra pessoa que apaga: o próximo autosave leva 404 → aviso na tela, o digitado fica e o cartão sai da lista", async () => {
    const m = mundoDaPagina([compra(14), compra(15)]);
    const { p } = paginaDe(m, { query: { id: "cmp_14" } });
    await p.iniciar();
    m.banco.delete("cmp_14"); // outra pessoa apagou
    p.editor.alterar({ paciente: "ESTAVA DIGITANDO" });
    await vi.advanceTimersByTimeAsync(800);
    expect(p.editor.estado.value).toBe("apagada");
    expect(p.editor.compra.value!.paciente).toBe("ESTAVA DIGITANDO");
    expect(p.lista.compras.value.map((c) => c.sequencia)).toEqual([15]);
    expect(p.lista.totais.value.ativas).toBe(1);
    expect(p.selecionadaId.value).toBe("cmp_14"); // o formulário continua à vista, com a faixa
    p.pedirApagar(); // nem dá para tentar apagar de novo
    expect(p.confirmandoApagar.value).toBe(false);
    p.fecharApagada();
    expect(p.editor.compra.value).toBeNull();
    expect(p.selecionadaId.value).toBeNull();
    expect(p.aba.value).toBe("lista");
  });

  it("Duplicar e Cancelar continuam funcionando (a caixinha do número abre; cancelar pede confirmação)", async () => {
    const m = mundoDaPagina([compra(14)]);
    const { p } = paginaDe(m, { query: { id: "cmp_14" } });
    await p.iniciar();
    await p.duplicar();
    expect(p.dialogo.value).toMatchObject({ tipo: "duplicar", origemId: "cmp_14" });
    p.cancelarDialogo();
    p.pedirCancelar();
    expect(p.confirmandoCancelar.value).toBe(true);
  });
});

describe("a confirmação na página (compras.vue)", () => {
  const fonte = readFileSync(join(process.cwd(), "app/pages/compras.vue"), "utf-8");
  const bloco = /<ConfirmDialog\s+v-if="pagina\.confirmandoApagar\.value"[\s\S]*?\/>/.exec(fonte)?.[0] ?? "";

  it("é o ConfirmDialog de sempre, com 'Apagar compra' e 'Cancelar', no estilo de perigo reforçado, ligado ao fluxo da página", () => {
    expect(bloco).not.toBe("");
    expect(bloco).toContain('title="Apagar compra"');
    expect(bloco).toContain(':message="pagina.mensagemApagar()"');
    expect(bloco).toContain('confirm-label="Apagar compra"');
    expect(bloco).toContain('cancel-label="Cancelar"');
    expect(bloco).toMatch(/\sdanger\s/);
    expect(bloco).toMatch(/\sreforcado\s/);
    expect(bloco).toContain('@confirm="pagina.confirmarApagar()"');
    expect(bloco).toContain('@close="pagina.confirmandoApagar.value = false"');
  });

  it("o formulário liga os botões e a faixa à página", () => {
    expect(fonte).toContain('@apagar="pagina.pedirApagar()"');
    expect(fonte).toContain('@fechar-apagada="pagina.fecharApagada()"');
  });
});
