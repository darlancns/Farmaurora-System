import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { Compra, CompraSalvarDTO, ListaCompras, NovaCompraDTO, TotaisDaLista } from "../../shared/types/compra";
import { itemDaLista } from "../../shared/utils/compraLista";
import { descricaoDaCompra } from "../../shared/utils/compraMes";
import { ApiError } from "../../app/utils/apiFetch";
import { MENSAGEM_NAO_SALVOU, useComprasPagina } from "../../app/composables/useComprasPagina";
import { compraVaziaDeTeste, itemDeTeste } from "./helpers/compraFixtures";

// A orquestração da página Compras com a API simulada: trocar de compra e de mês com o salvamento descarregado ANTES (e sem trocar em
// silêncio se falhar), URL, nova/duplicar/cancelar, somente leitura. Dados fictícios (TESTE).

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const compraBase = (sequencia: number, extra: Partial<Compra> = {}): Compra =>
  compraVaziaDeTeste({
    id: `cmp_${sequencia}`,
    sequencia,
    paciente: `PACIENTE TESTE ${sequencia}`,
    responsavel: "Cris",
    updatedAt: `2026-11-19T12:00:0${sequencia % 10}.000Z`,
    ...extra,
  });

/** O servidor de mentira inteiro: lista, compra, salvamento e ações; guarda a ordem das chamadas. */
function mundo(inicial: Compra[], agora = "2026-11-19T15:00:00Z") {
  const banco = new Map<string, Compra>(inicial.map((c) => [c.id, c]));
  const chamadas: string[] = [];
  let falhaSalvar: unknown = null;
  const mesCorrente = () => agora.slice(0, 7).replace(/-(\d\d)$/, "-$1");
  /** O id da compra nova: `cmp_14` no mês corrente; em outro mês leva o mês (o mesmo número pode existir em meses diferentes). */
  const idNovo = (anoMes: string, sequencia: number): string => (anoMes === mesCorrente() ? `cmp_${sequencia}` : `cmp_${anoMes}_${sequencia}`);
  /** O unique do banco: o mesmo número no mesmo mês é o 409 amigável do servidor (e nada é criado). */
  const conferirNumero = (anoMes: string, sequencia: number): void => {
    const dono = [...banco.values()].find((c) => c.anoMes === anoMes && c.sequencia === sequencia);
    if (dono) throw new ApiError(`A ${descricaoDaCompra(anoMes, sequencia)} já existe. Escolha outro número.`, 409, { code: "NUMERO_JA_EXISTE", anoMes, sequencia });
  };

  const apiLista = {
    listar: vi.fn(async (p: { anoMes: string; incluirCanceladas: boolean; pagina: number }): Promise<ListaCompras> => {
      chamadas.push(`lista:${p.anoMes}`);
      const itens = [...banco.values()].filter((c) => c.anoMes === p.anoMes).map((c) => itemDaLista({ ...c, atualizadoEm: c.updatedAt })).sort((a, b) => b.sequencia - a.sequencia);
      const totais: TotaisDaLista = { ativas: itens.filter((i) => !i.cancelada).length, canceladas: itens.filter((i) => i.cancelada).length };
      const casam = itens.filter((i) => p.incluirCanceladas || !i.cancelada);
      const maiorSequencia = itens.reduce((maior, i) => Math.max(maior, i.sequencia), 0);
      return { anoMes: p.anoMes, compras: casam.slice(0, 50), pagina: p.pagina, limite: 50, temMais: casam.length > 50, total: casam.length, totais, maiorSequencia };
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
      const itens = corpo.itens === undefined ? atual.itens : corpo.itens.map((it, k) => itemDeTeste(k + 1, { ...it }));
      const novo = { ...atual, ...(corpo as unknown as Partial<Compra>), id, itens, updatedAt: new Date(Date.parse(atual.updatedAt) + 1000).toISOString() };
      banco.set(id, novo);
      return novo;
    }),
  };
  const apiAcoes = {
    criar: vi.fn(async (corpo: NovaCompraDTO): Promise<Compra> => {
      chamadas.push(`criar:${corpo.sequencia}`);
      const anoMes = corpo.anoMes ?? mesCorrente();
      conferirNumero(anoMes, corpo.sequencia);
      const nova = compraBase(corpo.sequencia, { id: idNovo(anoMes, corpo.sequencia), anoMes, paciente: "", responsavel: "Cris" });
      banco.set(nova.id, nova);
      return { ...nova };
    }),
    duplicar: vi.fn(async (id: string, corpo: NovaCompraDTO): Promise<Compra> => {
      chamadas.push(`duplicar:${id}:${corpo.sequencia}`);
      const anoMes = corpo.anoMes ?? mesCorrente();
      conferirNumero(anoMes, corpo.sequencia);
      const copia = { ...banco.get(id)!, id: idNovo(anoMes, corpo.sequencia), sequencia: corpo.sequencia, anoMes };
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
  const p = useComprasPagina({
    query: extra.query ?? {},
    podeEditar: () => extra.podeEditar ?? true,
    avisar: (msg) => avisos.push(msg),
    gravarUrl: (q) => urls.push(q),
    apiLista: m.apiLista,
    apiCompra: m.apiCompra,
    apiAcoes: m.apiAcoes,
    agora: () => new Date(extra.agora ?? "2026-11-19T15:00:00Z"),
  });
  return { p, avisos, urls };
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
    expect(urls.at(-1)).toEqual({ mes: "2026-11", aba: "lista" });
  });

  it("?mes= e ?canceladas=1 abrem no mesmo lugar", async () => {
    const m = mundo([compraBase(1, { anoMes: "2026-10" }), compraBase(2, { anoMes: "2026-10", cancelada: true })]);
    const { p } = pagina(m, { query: { mes: "2026-10", canceladas: "1" } });
    await p.iniciar();
    expect(p.lista.mes.value).toBe("2026-10");
    expect(p.lista.mostrarCanceladas.value).toBe(true);
    expect(p.lista.compras.value.map((c) => c.id)).toEqual(["cmp_2", "cmp_1"]);
  });

  it("um link ANTIGO com ?status= é ignorado: a lista vem sem filtro de status e a URL é regravada sem ele", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p, urls } = pagina(m, { query: { mes: "2026-11", id: "cmp_1", status: "pronta" } });
    await p.iniciar();
    expect(p.lista.compras.value.map((c) => c.id)).toEqual(["cmp_2", "cmp_1"]); // nada foi filtrado por status
    expect(m.apiLista.listar).toHaveBeenCalledWith({ anoMes: "2026-11", incluirCanceladas: false, pagina: 1 });
    expect(urls.at(-1)).toEqual({ mes: "2026-11", id: "cmp_1", aba: "formulario" });
    expect(urls.every((u) => !("status" in u))).toBe(true);
  });

  it("?id= abre a compra no formulário e na lista", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p, urls } = pagina(m, { query: { mes: "2026-11", id: "cmp_2" } });
    await p.iniciar();
    expect(p.selecionadaId.value).toBe("cmp_2");
    expect(p.editor.compra.value!.id).toBe("cmp_2");
    expect(urls.at(-1)).toEqual({ mes: "2026-11", id: "cmp_2", aba: "formulario" });
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
    expect(urls.at(-1)).toEqual({ mes: "2026-11", aba: "lista" });
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
    expect(urls.at(-1)).toEqual({ mes: "2026-10", aba: "lista" });
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

  it("'mostrar canceladas' entra na URL e não fecha a compra aberta; não existe filtro por status", async () => {
    const m = mundo([compraBase(1)]);
    const { p, urls } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    expect("definirStatus" in p).toBe(false);
    await p.definirMostrarCanceladas(true);
    await nextTick();
    expect(urls.at(-1)).toEqual({ mes: "2026-11", id: "cmp_1", canceladas: "1", aba: "formulario" });
    expect(p.selecionadaId.value).toBe("cmp_1");
    await p.definirMostrarCanceladas(false);
    await nextTick();
    expect(urls.at(-1)).toEqual({ mes: "2026-11", id: "cmp_1", aba: "formulario" });
  });
});

function erro500(): ApiError {
  return new ApiError("Erro interno.", 500);
}

/** "+ Nova compra" e "Criar compra" com o número digitado. */
async function criarCom(p: ReturnType<typeof pagina>["p"], numero: number): Promise<void> {
  await p.criarNova();
  await p.confirmarDialogo(numero);
}

describe("+ Nova compra: a caixinha do Nº da compra", () => {
  it("só ABRE a caixinha (nada é criado): mês por extenso, a sugestão = o maior do mês + 1 e o maior para a frase de apoio", async () => {
    const m = mundo([compraBase(3), compraBase(18)]);
    const { p } = pagina(m);
    await p.iniciar();
    await p.criarNova();
    expect(p.dialogo.value).toMatchObject({ tipo: "nova", anoMes: "2026-11", rotuloMes: "Novembro/2026", maior: 18, sugestao: 19, erro: null, ocupado: false, origemId: null });
    expect(m.apiAcoes.criar).not.toHaveBeenCalled();
    expect(p.editor.compra.value).toBeNull();
  });

  it("mês vazio: a sugestão é 1 (e o maior é 0)", async () => {
    const m = mundo([]);
    const { p } = pagina(m);
    await p.iniciar();
    await p.criarNova();
    expect(p.dialogo.value).toMatchObject({ maior: 0, sugestao: 1 });
  });

  it("a sugestão conta as CANCELADAS (o número delas continua ocupado) e vem do servidor na hora, não da lista de antes", async () => {
    const m = mundo([compraBase(4), compraBase(9, { cancelada: true })]);
    const { p } = pagina(m);
    await p.iniciar();
    m.banco.set("cmp_12", compraBase(12)); // outra pessoa criou depois de a lista abrir
    await p.criarNova();
    expect(p.dialogo.value).toMatchObject({ maior: 12, sugestao: 13 });
  });

  it("não deu para ler a lista: usa o que a tela já tem (o mês da caixinha é o da lista); a caixinha abre, a pessoa digita e criar funciona", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { mes: "2026-08" } });
    await p.iniciar();
    m.apiLista.listar.mockRejectedValue(new TypeError("Failed to fetch"));
    await p.criarNova();
    expect(p.dialogo.value).toMatchObject({ anoMes: "2026-08", maior: 0, sugestao: 1 }); // a lista de agosto na tela está vazia
    await p.confirmarDialogo(5);
    expect(p.editor.compra.value).toMatchObject({ anoMes: "2026-08", sequencia: 5 });
  });

  it("cancelar a caixinha: nada é criado e a caixinha fecha", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m);
    await p.iniciar();
    await p.criarNova();
    p.cancelarDialogo();
    expect(p.dialogo.value).toBeNull();
    expect(m.apiAcoes.criar).not.toHaveBeenCalled();
    expect(p.editor.compra.value).toBeNull();
  });

  it("estando com a compra aberta, abrir a caixinha NÃO troca nada (só 'Criar compra' descarrega e troca)", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    m.chamadas.length = 0;
    p.editor.alterar({ paciente: "PENDENTE" });
    await p.criarNova();
    expect(m.chamadas.filter((c) => c.startsWith("salvar") || c.startsWith("criar"))).toEqual([]);
    expect(p.editor.compra.value!.id).toBe("cmp_1");
  });
});

describe("+ Nova compra: criar com o número digitado", () => {
  it("cria com o número DIGITADO (fora de ordem), mostra no topo da lista, abre no formulário com o 1º medicamento (vazio) e pede o foco no campo Medicamento do Med. 1", async () => {
    const m = mundo([compraBase(1)]);
    const { p, urls } = pagina(m);
    await p.iniciar();
    expect(p.pedidoDeFocoMedicamento.value).toBe(0);
    await criarCom(p, 14);
    expect(m.apiAcoes.criar).toHaveBeenCalledWith({ sequencia: 14, anoMes: "2026-11" });
    expect(p.dialogo.value).toBeNull();
    expect(p.editor.compra.value!.sequencia).toBe(14);
    expect(p.selecionadaId.value).toBe("cmp_14");
    expect(p.lista.compras.value.map((c) => c.sequencia)).toEqual([14, 1]);
    expect(p.lista.totais.value.ativas).toBe(2);
    const itens = p.editor.compra.value!.itens;
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ posicao: 1, medicamento: "", medicamentoCadastroId: null, laboratorio: "", brand: "", quantidade: "", temperatura: "", valorUnitario: null, valorReal: null });
    expect(p.pedidoDeFocoMedicamento.value).toBe(1);
    expect(p.editor.estado.value).toBe("pendente"); // o autosave grava o 1º medicamento
    expect(urls.at(-1)).toMatchObject({ id: "cmp_14" });
  });

  it("o servidor já devolveu itens? Não cria outro; o pedido de foco sobe a cada compra nova", async () => {
    const m = mundo([]);
    m.apiAcoes.criar.mockResolvedValueOnce(compraBase(1, { itens: [itemDeTeste(1, { medicamento: "" })] }));
    const { p } = pagina(m);
    await p.iniciar();
    await criarCom(p, 1);
    expect(p.editor.compra.value!.itens).toHaveLength(1);
    expect(p.editor.estado.value).toBe("ocioso"); // nada mudou: nada a salvar
    expect(p.pedidoDeFocoMedicamento.value).toBe(1);
    await criarCom(p, 2);
    expect(p.pedidoDeFocoMedicamento.value).toBe(2);
  });

  it("descarrega o pendente da compra aberta antes de criar", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    m.chamadas.length = 0;
    p.editor.alterar({ paciente: "PENDENTE" });
    await criarCom(p, 2);
    expect(m.chamadas.filter((c) => !c.startsWith("lista"))).toEqual(["salvar:cmp_1:PENDENTE", "criar:2"]);
  });

  it("se o pendente não salvou, NÃO cria (avisa) e a caixinha continua aberta", async () => {
    const m = mundo([compraBase(1)]);
    const { p, avisos } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.editor.alterar({ paciente: "PENDENTE" });
    m.falharSalvamentos(new TypeError("Failed to fetch"));
    await criarCom(p, 2);
    expect(m.apiAcoes.criar).not.toHaveBeenCalled();
    expect(avisos).toEqual([MENSAGEM_NAO_SALVOU]);
    expect(p.dialogo.value).not.toBeNull();
    expect(p.dialogo.value!.ocupado).toBe(false);
    expect(p.pedidoDeFocoMedicamento.value).toBe(0);
  });

  it("número que já existe: o erro vai para a caixinha (que continua aberta), nada abre, e trocar o número cria", async () => {
    const m = mundo([compraBase(14)]);
    const { p, avisos } = pagina(m);
    await p.iniciar();
    await p.criarNova();
    await p.confirmarDialogo(14);
    expect(p.dialogo.value).not.toBeNull();
    expect(p.dialogo.value!.erro).toBe("A Compra 14 de novembro já existe. Escolha outro número.");
    expect(p.dialogo.value!.ocupado).toBe(false);
    expect(p.editor.compra.value).toBeNull();
    expect(p.lista.compras.value).toHaveLength(1);
    expect(avisos).toEqual([]); // o erro está no campo, não em toast
    await p.confirmarDialogo(15);
    expect(p.dialogo.value).toBeNull();
    expect(p.editor.compra.value!.sequencia).toBe(15);
  });

  it("não cria de novo com outro número sozinho: um 409 é UMA chamada", async () => {
    const m = mundo([compraBase(14)]);
    const { p } = pagina(m);
    await p.iniciar();
    await criarCom(p, 14);
    expect(m.apiAcoes.criar).toHaveBeenCalledTimes(1);
    expect(m.apiAcoes.criar).toHaveBeenCalledWith({ sequencia: 14, anoMes: "2026-11" });
  });

  it("falha na criação (503): a mensagem do servidor aparece na caixinha e nada abre", async () => {
    const m = mundo([]);
    m.apiAcoes.criar.mockRejectedValueOnce(new ApiError("Não foi possível criar a compra. Tente novamente.", 503));
    const { p } = pagina(m);
    await p.iniciar();
    await criarCom(p, 1);
    expect(p.dialogo.value!.erro).toBe("Não foi possível criar a compra. Tente novamente.");
    expect(p.editor.compra.value).toBeNull();
  });

  it("a compra nasce no MÊS DA LISTA (não no corrente): a lista fica nele e a compra aparece nele", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { mes: "2026-08" } });
    await p.iniciar();
    expect(p.lista.mes.value).toBe("2026-08");
    await criarCom(p, 2);
    expect(m.apiAcoes.criar).toHaveBeenCalledWith({ sequencia: 2, anoMes: "2026-08" });
    expect(p.lista.mes.value).toBe("2026-08");
    expect(p.editor.compra.value).toMatchObject({ anoMes: "2026-08", sequencia: 2 });
    expect(p.lista.compras.value.map((c) => c.sequencia)).toEqual([2]);
    expect(p.selecionadaId.value).toBe("cmp_2026-08_2");
  });

  it("escolher Outubro nas setas: a caixinha diz 'Outubro/2026', a sugestão é a de OUTUBRO (maior + 1) e a compra nasce em outubro", async () => {
    const m = mundo([compraBase(18), compraBase(3, { id: "cmp_out_3", anoMes: "2026-10" }), compraBase(9, { id: "cmp_out_9", anoMes: "2026-10" })]);
    const { p } = pagina(m);
    await p.iniciar();
    await p.mesAnterior();
    expect(p.lista.mes.value).toBe("2026-10");
    await p.criarNova();
    expect(p.dialogo.value).toMatchObject({ anoMes: "2026-10", rotuloMes: "Outubro/2026", maior: 9, sugestao: 10 });
    await p.confirmarDialogo(10);
    expect(p.editor.compra.value).toMatchObject({ anoMes: "2026-10", sequencia: 10 });
    expect(p.lista.compras.value.map((c) => c.sequencia)).toEqual([10, 9, 3]); // aparece na lista de outubro
    expect(p.lista.mes.value).toBe("2026-10");
    // a de novembro não ganhou nada
    await p.mesSeguinte();
    expect(p.lista.compras.value.map((c) => c.sequencia)).toEqual([18]);
  });

  it("a unicidade é por mês: o 18 de novembro não impede o 18 de outubro, mas o 9 de outubro impede o 9 de outubro", async () => {
    const m = mundo([compraBase(18), compraBase(9, { id: "cmp_out_9", anoMes: "2026-10" })]);
    const { p } = pagina(m, { query: { mes: "2026-10" } });
    await p.iniciar();
    await criarCom(p, 18); // existe em novembro, não em outubro
    expect(p.editor.compra.value).toMatchObject({ anoMes: "2026-10", sequencia: 18 });
    await p.criarNova();
    await p.confirmarDialogo(9);
    expect(p.dialogo.value!.erro).toBe("A Compra 09 de outubro já existe. Escolha outro número.");
  });

  it("o título da compra mostra o mês DELA (a de outubro aberta com a lista em novembro)", async () => {
    const m = mundo([compraBase(5, { id: "cmp_out_5", anoMes: "2026-10" })]);
    const { p } = pagina(m, { query: { id: "cmp_out_5" } });
    await p.iniciar();
    expect(p.lista.mes.value).toBe("2026-10"); // o id de outro mês abre no mês dele
    expect(p.tituloParaDialogo()).toBe("Compra 05 - Outubro/2026");
  });

  it("clique duplo em 'Criar compra': só uma compra é criada (ocupado)", async () => {
    const m = mundo([]);
    const { p } = pagina(m);
    await p.iniciar();
    await p.criarNova();
    await Promise.all([p.confirmarDialogo(1), p.confirmarDialogo(1)]);
    expect(m.apiAcoes.criar).toHaveBeenCalledTimes(1);
  });
});

describe("Duplicar e Cancelar", () => {
  it("duplicar: abre a caixinha com a sugestão (a cópia NUNCA leva o número da original); só 'Criar compra' duplica, descarregando o pendente antes", async () => {
    const m = mundo([compraBase(1, { paciente: "PACIENTE ORIGINAL" })]);
    const { p, avisos } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    m.chamadas.length = 0;
    p.editor.alterar({ medico: "Dr. Antes" });
    await p.duplicar();
    expect(p.dialogo.value).toMatchObject({ tipo: "duplicar", origemId: "cmp_1", anoMes: "2026-11", maior: 1, sugestao: 2 });
    expect(m.apiAcoes.duplicar).not.toHaveBeenCalled();
    await p.confirmarDialogo(7);
    expect(m.chamadas.filter((c) => !c.startsWith("lista"))).toEqual(["salvar:cmp_1:PACIENTE ORIGINAL", "duplicar:cmp_1:7"]);
    expect(m.apiAcoes.duplicar).toHaveBeenCalledWith("cmp_1", { sequencia: 7, anoMes: "2026-11" });
    expect(p.editor.compra.value!.sequencia).toBe(7);
    expect(p.editor.compra.value!.medico).toBe("Dr. Antes");
    expect(p.selecionadaId.value).toBe("cmp_7");
    expect(p.lista.compras.value.map((c) => c.sequencia)).toEqual([7, 1]);
    expect(avisos.at(-1)).toBe("Compra duplicada: Compra 07 - Novembro/2026");
  });

  it("duplicar com um número que já existe (inclusive o da original): o erro fica na caixinha e nada é copiado", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    await p.duplicar();
    await p.confirmarDialogo(1);
    expect(p.dialogo.value!.erro).toBe("A Compra 01 de novembro já existe. Escolha outro número.");
    expect(p.editor.compra.value!.id).toBe("cmp_1");
    await p.confirmarDialogo(2);
    expect(p.dialogo.value!.erro).toBe("A Compra 02 de novembro já existe. Escolha outro número.");
    expect(p.lista.compras.value).toHaveLength(2);
  });

  it("duplicar nasce no mês da LISTA (normalmente o da original), com a sugestão desse mês", async () => {
    const m = mundo([compraBase(1, { id: "cmp_out_1", anoMes: "2026-10" }), compraBase(40, { id: "cmp_nov_40" })]);
    const { p } = pagina(m, { query: { id: "cmp_out_1" } });
    await p.iniciar();
    expect(p.lista.mes.value).toBe("2026-10");
    await p.duplicar();
    expect(p.dialogo.value).toMatchObject({ tipo: "duplicar", anoMes: "2026-10", rotuloMes: "Outubro/2026", maior: 1, sugestao: 2 });
    await p.confirmarDialogo(2);
    expect(m.apiAcoes.duplicar).toHaveBeenCalledWith("cmp_out_1", { sequencia: 2, anoMes: "2026-10" });
    expect(p.editor.compra.value).toMatchObject({ anoMes: "2026-10", sequencia: 2 });
  });

  it("cancelar a caixinha do duplicar não copia nada", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    await p.duplicar();
    p.cancelarDialogo();
    expect(p.dialogo.value).toBeNull();
    expect(m.apiAcoes.duplicar).not.toHaveBeenCalled();
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
    expect(p.lista.totais.value).toEqual({ ativas: 1, canceladas: 1 });
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
    expect(p.dialogo.value).toBeNull();
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
    await p.confirmarDialogo(9);
    p.pedirCancelar();
    p.editor.alterar({ paciente: "NAO PODE" });
    await soltar(10_000);
    expect(m.apiAcoes.criar).not.toHaveBeenCalled();
    expect(m.apiAcoes.duplicar).not.toHaveBeenCalled();
    expect(p.dialogo.value).toBeNull(); // a caixinha nem abre para quem só lê
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

describe("aba do celular (lista, formulário, resumo)", () => {
  it("sem aba na URL: 'lista' sem compra e 'formulario' com ?id=; uma ?aba= válida vence; lixo é ignorado", async () => {
    const m1 = mundo([compraBase(1)]);
    expect(pagina(m1).p.aba.value).toBe("lista");
    expect(pagina(mundo([compraBase(1)]), { query: { id: "cmp_1" } }).p.aba.value).toBe("formulario");
    expect(pagina(mundo([compraBase(1)]), { query: { id: "cmp_1", aba: "resumo" } }).p.aba.value).toBe("resumo");
    expect(pagina(mundo([compraBase(1)]), { query: { aba: "tabela" } }).p.aba.value).toBe("lista");
  });

  it("recarregar com ?aba=resumo&id=... volta ao mesmo lugar (a aba fica; a compra abre)", async () => {
    const m = mundo([compraBase(1)]);
    const { p, urls } = pagina(m, { query: { mes: "2026-11", id: "cmp_1", aba: "resumo" } });
    await p.iniciar();
    expect(p.aba.value).toBe("resumo");
    expect(p.editor.compra.value!.id).toBe("cmp_1");
    expect(urls.at(-1)).toEqual({ mes: "2026-11", id: "cmp_1", aba: "resumo" });
  });

  it("ESCOLHER uma compra na lista leva ao Formulário", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p, urls } = pagina(m);
    await p.iniciar();
    expect(p.aba.value).toBe("lista");
    await p.selecionar("cmp_2");
    expect(p.aba.value).toBe("formulario");
    await nextTick();
    expect(urls.at(-1)).toMatchObject({ id: "cmp_2", aba: "formulario" });
  });

  it("CRIAR uma nova e DUPLICAR também levam ao Formulário", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m);
    await p.iniciar();
    await criarCom(p, 2);
    expect(p.aba.value).toBe("formulario");
    p.irParaAba("lista");
    await p.duplicar();
    await p.confirmarDialogo(3);
    expect(p.aba.value).toBe("formulario");
  });

  it("trocar de mês volta para a lista; a escolha manual das abas funciona e vai para a URL", async () => {
    const m = mundo([compraBase(1)]);
    const { p, urls } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.irParaAba("resumo");
    await nextTick();
    expect(urls.at(-1)).toMatchObject({ aba: "resumo" });
    await p.mesAnterior();
    expect(p.aba.value).toBe("lista");
  });

  it("?id= que não existe: a aba cai para a lista (não fica num formulário vazio)", async () => {
    const m = mundo([compraBase(1)]);
    const { p } = pagina(m, { query: { id: "cmp_nao_existe" } });
    expect(p.aba.value).toBe("formulario"); // começa assim, até saber que a compra não existe
    await p.iniciar();
    expect(p.aba.value).toBe("lista");
  });

  it("o aviso de falha ao salvar também vale no celular: não troca de aba por baixo do pendente (selecionar falha, a aba fica)", async () => {
    const m = mundo([compraBase(1), compraBase(2)]);
    const { p } = pagina(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.irParaAba("lista");
    p.editor.alterar({ paciente: "PENDENTE" });
    m.falharSalvamentos(new TypeError("Failed to fetch"));
    await p.selecionar("cmp_2");
    expect(p.aba.value).toBe("lista");
    expect(p.selecionadaId.value).toBe("cmp_1");
  });
});
