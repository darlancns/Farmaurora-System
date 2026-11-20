import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { StatusDaCompra } from "../../shared/constants/compra";
import type { Compra, CompraSalvarDTO, ListaCompras, TotaisPorStatus } from "../../shared/types/compra";
import { itemDaLista } from "../../shared/utils/compraLista";
import { ApiError } from "../../app/utils/apiFetch";
import { MENSAGEM_NAO_SALVOU, useComprasPagina } from "../../app/composables/useComprasPagina";

// A orquestração da página Compras com a API simulada: trocar de compra e de mês com o salvamento descarregado ANTES (e sem trocar em
// silêncio se falhar), URL, nova/duplicar/cancelar, somente leitura. Dados fictícios (TESTE).

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const compraBase = (sequencia: number, extra: Partial<Compra> = {}): Compra => ({
  id: `cmp_${sequencia}`,
  anoMes: "2026-11",
  sequencia,
  cancelada: false,
  paciente: `PACIENTE TESTE ${sequencia}`,
  processoNumero: "",
  medico: "",
  localAplicacao: "",
  entrega: "",
  contatos: "",
  termoObservacao: "",
  despachante: "",
  isencaoPara: "",
  observacoes: "",
  vendedor: "",
  responsavel: "Cris",
  compraParticular: false,
  localDeclarado: false,
  termoPosterior: false,
  courierSimples: false,
  isencao: false,
  recorrente: false,
  pagamentoAlvara: null,
  pagamentoMomento: null,
  documentos: null,
  pendencias: [],
  criadoPor: "Cris",
  atualizadoPor: "Cris",
  createdAt: "2026-11-19T12:00:00.000Z",
  updatedAt: `2026-11-19T12:00:0${sequencia % 10}.000Z`,
  ordens: [],
  ...extra,
});

/** O servidor de mentira inteiro: lista, compra, salvamento e ações; guarda a ordem das chamadas. */
function mundo(inicial: Compra[], agora = "2026-11-19T15:00:00Z") {
  const banco = new Map<string, Compra>(inicial.map((c) => [c.id, c]));
  const chamadas: string[] = [];
  let falhaSalvar: unknown = null;
  let proxima = Math.max(0, ...inicial.map((c) => c.sequencia)) + 1;
  const mesCorrente = () => agora.slice(0, 7).replace(/-(\d\d)$/, "-$1");

  const apiLista = {
    listar: vi.fn(async (p: { anoMes: string; status: StatusDaCompra | null; incluirCanceladas: boolean; pagina: number }): Promise<ListaCompras> => {
      chamadas.push(`lista:${p.anoMes}`);
      const itens = [...banco.values()].filter((c) => c.anoMes === p.anoMes).map((c) => itemDaLista({ ...c, atualizadoEm: c.updatedAt })).sort((a, b) => b.sequencia - a.sequencia);
      const totais: TotaisPorStatus = { rascunho: 0, pronta: 0, parcial: 0, encaminhada: 0, cancelada: 0 };
      for (const i of itens) totais[i.status] += 1;
      const casam = itens.filter((i) => (p.status !== null ? i.status === p.status : p.incluirCanceladas || i.status !== "cancelada"));
      return { anoMes: p.anoMes, compras: casam.slice(0, 50), status: p.status, pagina: p.pagina, limite: 50, temMais: casam.length > 50, total: casam.length, totais };
    }),
  };
  const apiCompra = {
    obter: vi.fn(async (id: string): Promise<Compra> => {
      chamadas.push(`obter:${id}`);
      const c = banco.get(id);
      if (!c) throw new ApiError("Compra não encontrada.", 404);
      return { ...c };
    }),
    salvar: vi.fn(async (id: string, corpo: CompraSalvarDTO): Promise<Compra> => {
      chamadas.push(`salvar:${id}:${corpo.paciente ?? ""}`);
      if (falhaSalvar) throw falhaSalvar;
      const atual = banco.get(id)!;
      const novo = { ...atual, ...(corpo as unknown as Partial<Compra>), id, ordens: atual.ordens, updatedAt: new Date(Date.parse(atual.updatedAt) + 1000).toISOString() };
      banco.set(id, novo);
      return novo;
    }),
  };
  const apiAcoes = {
    criar: vi.fn(async (): Promise<Compra> => {
      chamadas.push("criar");
      const nova = compraBase(proxima++, { anoMes: mesCorrente(), paciente: "", responsavel: "Cris" });
      banco.set(nova.id, nova);
      return { ...nova };
    }),
    duplicar: vi.fn(async (id: string): Promise<Compra> => {
      chamadas.push(`duplicar:${id}`);
      const copia = { ...banco.get(id)!, id: `cmp_${proxima}`, sequencia: proxima, anoMes: mesCorrente() };
      proxima += 1;
      banco.set(copia.id, copia);
      return { ...copia };
    }),
    cancelar: vi.fn(async (id: string): Promise<Compra> => {
      chamadas.push(`cancelar:${id}`);
      const c = { ...banco.get(id)!, cancelada: true };
      banco.set(id, c);
      return { ...c };
    }),
  };
  return {
    banco,
    chamadas,
    apiLista,
    apiCompra,
    apiAcoes,
    falharSalvamentos(e: unknown) {
      falhaSalvar = e;
    },
    pararDeFalhar() {
      falhaSalvar = null;
    },
  };
}

function pagina(m: ReturnType<typeof mundo>, extra: { query?: Record<string, unknown>; podeEditar?: boolean; agora?: string } = {}) {
  const avisos: string[] = [];
  const urls: Array<Record<string, string>> = [];
  const foco = vi.fn();
  const p = useComprasPagina({
    query: extra.query ?? {},
    podeEditar: () => extra.podeEditar ?? true,
    avisar: (msg) => avisos.push(msg),
    gravarUrl: (q) => urls.push(q),
    focarPaciente: foco,
    apiLista: m.apiLista,
    apiCompra: m.apiCompra,
    apiAcoes: m.apiAcoes,
    agora: () => new Date(extra.agora ?? "2026-11-19T15:00:00Z"),
  });
  return { p, avisos, urls, foco };
}

const soltar = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

describe("abrir a página", () => {
  it("sem URL: o mês corrente de BRASÍLIA, lista lida, nenhuma compra aberta e a URL ganha o mês", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p, urls } = pagina(m, { agora: "2026-12-01T02:00:00Z" }); // ainda é 30/11 em Brasília
    await p.iniciar();
    expect(p.lista.mes.value).toBe("2026-11");
    expect(p.selecionadaId.value).toBeNull();
    expect(p.editor.compra.value).toBeNull();
    expect(urls.at(-1)).toEqual({ mes: "2026-11" });
  });

  it("?mes= e ?status= abrem no mesmo lugar", async () => {
    const m = mundo([compraBase(1, { anoMes: "2026-10" })]);
    const { p } = pagina(m, { query: { mes: "2026-10", status: "rascunho" } });
    await p.iniciar();
    expect(p.lista.mes.value).toBe("2026-10");
    expect(p.lista.status.value).toBe("rascunho");
    expect(p.lista.compras.value.map((c) => c.id)).toEqual(["cmp_1"]);
  });

  it("?id= abre a compra no formulário e na lista", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p, urls } = pagina(m, { query: { mes: "2026-11", id: "cmp_2" } });
    await p.iniciar();
    expect(p.selecionadaId.value).toBe("cmp_2");
    expect(p.editor.compra.value!.id).toBe("cmp_2");
    expect(urls.at(-1)).toEqual({ mes: "2026-11", id: "cmp_2" });
  });

  it("id de uma compra de OUTRO mês abre no mês dela (mesmo com ?mes= diferente)", async () => {
    const m = mundo([compraBase(5, { anoMes: "2026-09" }), compraBase(1)]);
    const { p } = pagina(m, { query: { mes: "2026-11", id: "cmp_5" } });
    await p.iniciar();
    expect(p.lista.mes.value).toBe("2026-09");
    expect(p.lista.compras.value.map((c) => c.id)).toEqual(["cmp_5"]);
    expect(p.editor.compra.value!.id).toBe("cmp_5");
  });

  it("id que não existe: avisa 'Compra não encontrada.', não abre nada e a lista carrega", async () => {
    const m = mundo([compraBase(1)]);
    const { p, avisos, urls } = pagina(m, { query: { mes: "2026-11", id: "cmp_nao_existe" } });
    await p.iniciar();
    expect(avisos).toEqual(["Compra não encontrada."]);
    expect(p.selecionadaId.value).toBeNull();
    expect(p.editor.compra.value).toBeNull();
    expect(p.lista.compras.value).toHaveLength(1);
    expect(urls.at(-1)).toEqual({ mes: "2026-11" });
  });

  it("lixo na URL é ignorado (id inseguro, mês inválido)", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { mes: "2026-99", id: "../x" } });
    await p.iniciar();
    expect(p.lista.mes.value).toBe("2026-11");
    expect(m.apiCompra.obter).not.toHaveBeenCalled();
  });
});

describe("trocar de compra: o pendente é descarregado ANTES", () => {
  it("salva a compra atual e só depois abre a outra (ordem das chamadas)", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p, urls } = pagina(m, { query: { mes: "2026-11", id: "cmp_1" } });
    await p.iniciar();
    m.chamadas.length = 0;
    p.editor.alterar({ paciente: "EDITADO ANTES DE TROCAR" });
    await p.selecionar("cmp_2");
    expect(m.chamadas).toEqual(["salvar:cmp_1:EDITADO ANTES DE TROCAR", "obter:cmp_2"]);
    expect(p.selecionadaId.value).toBe("cmp_2");
    expect(p.editor.compra.value!.id).toBe("cmp_2");
    expect(m.banco.get("cmp_1")!.paciente).toBe("EDITADO ANTES DE TROCAR");
    expect(urls.at(-1)).toMatchObject({ id: "cmp_2" });
  });

  it("sem pendência troca direto (nenhum PATCH)", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    await p.selecionar("cmp_2");
    expect(m.apiCompra.salvar).not.toHaveBeenCalled();
  });

  it("se NÃO deu para salvar: avisa, fica na compra de antes e o que digitei continua na tela (nada troca em silêncio)", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p, avisos } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.editor.alterar({ paciente: "NAO SALVOU" });
    m.falharSalvamentos(new TypeError("Failed to fetch"));
    await p.selecionar("cmp_2");
    expect(avisos).toEqual([MENSAGEM_NAO_SALVOU]);
    expect(p.selecionadaId.value).toBe("cmp_1");
    expect(p.editor.compra.value!.paciente).toBe("NAO SALVOU");
    expect(m.apiCompra.obter).toHaveBeenCalledTimes(1); // só a abertura inicial; a cmp_2 não foi lida
  });

  it("clicar na compra que já está aberta não faz nada", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    m.chamadas.length = 0;
    await p.selecionar("cmp_1");
    expect(m.chamadas).toEqual([]);
  });

  it("compra que sumiu no meio: avisa o erro e mantém a aberta", async () => {
    const m = mundo([compraBase(1)]);
    const { p, avisos } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    await p.selecionar("cmp_fantasma");
    expect(avisos).toEqual(["Compra não encontrada."]);
    expect(p.selecionadaId.value).toBe("cmp_1");
  });

  it("o cartão da lista reflete o que acabou de ser salvo (sem reler o mês)", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    m.apiLista.listar.mockClear();
    p.editor.alterar({ paciente: "NOME NOVO NO CARTAO" });
    await soltar(800);
    expect(p.lista.compras.value.find((c) => c.id === "cmp_1")!.paciente).toBe("NOME NOVO NO CARTAO");
    expect(m.apiLista.listar).not.toHaveBeenCalled();
  });
});

describe("trocar de mês", () => {
  it("descarrega o pendente, fecha a compra aberta, lê o outro mês e atualiza a URL", async () => {
    const m = mundo([compraBase(1), compraBase(4, { anoMes: "2026-10" })]);
    const { p, urls } = pagina(m, { query: { mes: "2026-11", id: "cmp_1" } });
    await p.iniciar();
    m.chamadas.length = 0;
    p.editor.alterar({ paciente: "PENDENTE" });
    await p.mesAnterior();
    expect(m.chamadas).toEqual(["salvar:cmp_1:PENDENTE", "lista:2026-10"]);
    expect(p.lista.mes.value).toBe("2026-10");
    expect(p.selecionadaId.value).toBeNull();
    expect(p.editor.compra.value).toBeNull();
    expect(urls.at(-1)).toEqual({ mes: "2026-10" });
    await p.mesSeguinte();
    expect(p.lista.mes.value).toBe("2026-11");
  });

  it("se não deu para salvar, o mês NÃO muda e a compra continua aberta", async () => {
    const m = mundo([compraBase(1)]);
    const { p, avisos } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.editor.alterar({ paciente: "PENDENTE" });
    m.falharSalvamentos(erro500());
    await p.mesSeguinte();
    expect(avisos).toEqual([MENSAGEM_NAO_SALVOU]);
    expect(p.lista.mes.value).toBe("2026-11");
    expect(p.selecionadaId.value).toBe("cmp_1");
  });

  it("filtro e 'mostrar canceladas' entram na URL e não fecham a compra aberta", async () => {
    const m = mundo([compraBase(1)]);
    const { p, urls } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    await p.definirStatus("pronta");
    await nextTick();
    expect(urls.at(-1)).toEqual({ mes: "2026-11", id: "cmp_1", status: "pronta" });
    await p.definirMostrarCanceladas(true);
    await nextTick();
    expect(urls.at(-1)).toEqual({ mes: "2026-11", id: "cmp_1", status: "pronta", canceladas: "1" });
    expect(p.selecionadaId.value).toBe("cmp_1");
  });
});

function erro500(): ApiError {
  return new ApiError("Erro interno.", 500);
}

describe("+ Nova compra", () => {
  it("cria, mostra no topo da lista, abre no formulário e leva o foco ao Paciente", async () => {
    const m = mundo([compraBase(1)]);
    const { p, foco, urls } = pagina(m);
    await p.iniciar();
    await p.criarNova();
    expect(p.editor.compra.value!.sequencia).toBe(2);
    expect(p.selecionadaId.value).toBe("cmp_2");
    expect(p.lista.compras.value.map((c) => c.sequencia)).toEqual([2, 1]);
    expect(p.lista.totais.value.rascunho).toBe(2);
    expect(foco).toHaveBeenCalledTimes(1);
    expect(urls.at(-1)).toMatchObject({ id: "cmp_2" });
  });

  it("descarrega o pendente da compra aberta antes de criar", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    m.chamadas.length = 0;
    p.editor.alterar({ paciente: "PENDENTE" });
    await p.criarNova();
    expect(m.chamadas).toEqual(["salvar:cmp_1:PENDENTE", "criar"]);
  });

  it("se o pendente não salvou, NÃO cria (e avisa)", async () => {
    const m = mundo([compraBase(1)]);
    const { p, avisos, foco } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.editor.alterar({ paciente: "PENDENTE" });
    m.falharSalvamentos(new TypeError("Failed to fetch"));
    await p.criarNova();
    expect(m.apiAcoes.criar).not.toHaveBeenCalled();
    expect(avisos).toEqual([MENSAGEM_NAO_SALVOU]);
    expect(foco).not.toHaveBeenCalled();
  });

  it("falha na criação: avisa com a mensagem do servidor e nada abre", async () => {
    const m = mundo([]);
    m.apiAcoes.criar.mockRejectedValueOnce(new ApiError("Não foi possível gerar o número da compra. Tente novamente.", 503));
    const { p, avisos } = pagina(m);
    await p.iniciar();
    await p.criarNova();
    expect(avisos).toEqual(["Não foi possível gerar o número da compra. Tente novamente."]);
    expect(p.editor.compra.value).toBeNull();
  });

  it("estando em outro mês na tela, a compra nova (do mês corrente) abre no mês dela", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { mes: "2026-08" } });
    await p.iniciar();
    expect(p.lista.mes.value).toBe("2026-08");
    await p.criarNova();
    expect(p.lista.mes.value).toBe("2026-11");
    expect(p.lista.compras.value.map((c) => c.id)).toContain("cmp_2");
    expect(p.selecionadaId.value).toBe("cmp_2");
  });

  it("clique duplo: só uma compra é criada (ocupado)", async () => {
    const m = mundo([]);
    const { p } = pagina(m);
    await p.iniciar();
    await Promise.all([p.criarNova(), p.criarNova()]);
    expect(m.apiAcoes.criar).toHaveBeenCalledTimes(1);
  });
});

describe("Duplicar e Cancelar", () => {
  it("duplicar: cópia com o número seguinte, aberta no formulário, com aviso; descarrega o pendente antes", async () => {
    const m = mundo([compraBase(1, { paciente: "PACIENTE ORIGINAL" })]);
    const { p, avisos } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    m.chamadas.length = 0;
    p.editor.alterar({ medico: "Dr. Antes" });
    await p.duplicar();
    expect(m.chamadas).toEqual(["salvar:cmp_1:PACIENTE ORIGINAL", "duplicar:cmp_1"]);
    expect(p.editor.compra.value!.sequencia).toBe(2);
    expect(p.editor.compra.value!.medico).toBe("Dr. Antes");
    expect(p.selecionadaId.value).toBe("cmp_2");
    expect(p.lista.compras.value.map((c) => c.sequencia)).toEqual([2, 1]);
    expect(avisos.at(-1)).toBe("Compra duplicada: Compra 02 - Novembro/2026");
  });

  it("cancelar: pede confirmação; confirmar cancela, deixa a compra aberta SÓ PARA LEITURA e atualiza a lista e os totais", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p, avisos } = pagina(m, { query: { id: "cmp_2" } });
    await p.iniciar();
    p.pedirCancelar();
    expect(p.confirmandoCancelar.value).toBe(true);
    expect(p.tituloParaDialogo()).toBe("Compra 02 - Novembro/2026");
    expect(m.apiAcoes.cancelar).not.toHaveBeenCalled(); // só pediu
    await p.confirmarCancelar();
    expect(m.apiAcoes.cancelar).toHaveBeenCalledWith("cmp_2");
    expect(p.confirmandoCancelar.value).toBe(false);
    expect(p.editor.compra.value!.cancelada).toBe(true);
    expect(p.editor.somenteLeituraAgora.value).toBe(true);
    expect(p.lista.compras.value.map((c) => c.sequencia)).toEqual([1]); // saiu da lista (sem 'mostrar canceladas')
    expect(p.lista.totais.value).toMatchObject({ rascunho: 1, cancelada: 1 });
    expect(avisos.at(-1)).toBe("Compra cancelada");
    p.editor.alterar({ paciente: "NAO PODE" });
    await soltar(5000);
    expect(m.apiCompra.salvar).not.toHaveBeenCalled();
  });

  it("cancelar descarrega o pendente antes (e não cancela se não salvou)", async () => {
    const m = mundo([compraBase(1)]);
    const { p, avisos } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.editor.alterar({ paciente: "PENDENTE" });
    m.falharSalvamentos(new TypeError("Failed to fetch"));
    p.pedirCancelar();
    await p.confirmarCancelar();
    expect(m.apiAcoes.cancelar).not.toHaveBeenCalled();
    expect(avisos).toEqual([MENSAGEM_NAO_SALVOU]);
    expect(p.confirmandoCancelar.value).toBe(false);
  });

  it("compra já cancelada: nem duplica nem pede para cancelar", async () => {
    const m = mundo([compraBase(1, { cancelada: true })]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    await p.duplicar();
    p.pedirCancelar();
    expect(m.apiAcoes.duplicar).not.toHaveBeenCalled();
    expect(p.confirmandoCancelar.value).toBe(false);
  });
});

describe("somente leitura (sócio, mapa 'ver')", () => {
  it("abre e lê, mas Nova, Duplicar e Cancelar não fazem nada e nada é salvo", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { id: "cmp_1" }, podeEditar: false });
    await p.iniciar();
    expect(p.editor.compra.value!.id).toBe("cmp_1");
    await p.criarNova();
    await p.duplicar();
    p.pedirCancelar();
    p.editor.alterar({ paciente: "NAO PODE" });
    await soltar(10_000);
    expect(m.apiAcoes.criar).not.toHaveBeenCalled();
    expect(m.apiAcoes.duplicar).not.toHaveBeenCalled();
    expect(p.confirmandoCancelar.value).toBe(false);
    expect(m.apiCompra.salvar).not.toHaveBeenCalled();
    expect(p.editor.compra.value!.paciente).toBe("PACIENTE TESTE 1");
    expect(p.editor.temPendencia.value).toBe(false);
  });

  it("trocar de compra e de mês funciona sem tentar salvar", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p } = pagina(m, { query: { id: "cmp_1" }, podeEditar: false });
    await p.iniciar();
    await p.selecionar("cmp_2");
    expect(p.selecionadaId.value).toBe("cmp_2");
    await p.mesAnterior();
    expect(p.lista.mes.value).toBe("2026-10");
    expect(m.apiCompra.salvar).not.toHaveBeenCalled();
  });
});

describe("sair da página", () => {
  it("antesDeSair: true quando não há pendência; descarrega o pendente e devolve true", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    expect(await p.antesDeSair()).toBe(true);
    p.editor.alterar({ paciente: "PENDENTE" });
    expect(await p.antesDeSair()).toBe(true);
    expect(m.banco.get("cmp_1")!.paciente).toBe("PENDENTE");
  });

  it("não deu para salvar: avisa e devolve false (a navegação fica)", async () => {
    const m = mundo([compraBase(1)]);
    const { p, avisos } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.editor.alterar({ paciente: "PENDENTE" });
    m.falharSalvamentos(erro500());
    expect(await p.antesDeSair()).toBe(false);
    expect(avisos).toEqual([MENSAGEM_NAO_SALVOU]);
  });

  it("em conflito (409) também não deixa sair em silêncio", async () => {
    const m = mundo([compraBase(1)]);
    const { p, avisos } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.editor.alterar({ paciente: "PENDENTE" });
    m.falharSalvamentos(new ApiError("Esta compra foi alterada por outra pessoa.", 409));
    expect(await p.antesDeSair()).toBe(false);
    expect(p.editor.estado.value).toBe("conflito");
    expect(avisos).toEqual([MENSAGEM_NAO_SALVOU]);
  });
});
