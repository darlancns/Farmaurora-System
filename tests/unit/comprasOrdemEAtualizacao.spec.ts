import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Compra, CompraDaLista, CompraSalvarDTO, ListaCompras, TotaisDaLista } from "../../shared/types/compra";
import { compararDaLista, isOrdemDaLista, itemDaLista, ORDEM_PADRAO_DA_LISTA, ORDENS_DA_LISTA, type OrdemDaLista } from "../../shared/utils/compraLista";
import { INTERVALO_DE_ATUALIZACAO_MS, useComprasAtualizacao } from "../../app/composables/useComprasAtualizacao";
import { useComprasMes, type ApiListaCompras, type ParametrosLista } from "../../app/composables/useComprasMes";
import { useComprasPagina } from "../../app/composables/useComprasPagina";
import { chaveDaOrdem, gravarOrdem, lerOrdemSalva, type ArmazenamentoDaOrdem } from "../../app/utils/comprasOrdem";
import { compraVaziaDeTeste } from "./helpers/compraFixtures";

// As duas visões da lista (Mais recentes / Por número, com o sentido), a preferência lembrada por conta e a atualização em silêncio (foco e 60 s) sem tocar
// na compra aberta nem no que está sendo digitado. API simulada, timers falsos. Dados fictícios (TESTE).

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-19T15:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const item = (sequencia: number, minuto: number, extra: Partial<CompraDaLista> = {}): CompraDaLista => ({
  id: `cmp_${sequencia}`,
  anoMes: "2026-11",
  sequencia,
  cancelada: false,
  paciente: `PACIENTE TESTE ${sequencia}`,
  medicamentos: [],
  numeroOrdens: 1,
  atualizadoEm: `2026-11-19T12:${String(minuto).padStart(2, "0")}:00.000Z`,
  ...extra,
});
const numeros = (lista: CompraDaLista[]): number[] => lista.map((c) => c.sequencia);

// ── O comparador ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("compararDaLista: o mesmo comparador no servidor e na tela", () => {
  const base = [item(3, 30), item(18, 10), item(7, 50), item(12, 50)];

  it("'recentes': a versão mais nova primeiro; empate de versão: o maior Nº", () => {
    expect(numeros([...base].sort(compararDaLista("recentes")))).toEqual([12, 7, 3, 18]);
  });

  it("'numero': do maior para o menor; inverter: do menor para o maior", () => {
    expect(numeros([...base].sort(compararDaLista("numero")))).toEqual([18, 12, 7, 3]);
    expect(numeros([...base].sort(compararDaLista("numero", true)))).toEqual([3, 7, 12, 18]);
  });

  it("'recentes' invertida é a mais antiga primeiro (o comparador vale para qualquer visão)", () => {
    expect(numeros([...base].sort(compararDaLista("recentes", true)))).toEqual([18, 3, 7, 12]);
  });

  it("os formatos do instante do Postgres ('+00:00') e do JS ('Z') são o mesmo instante; data ilegível vai para o fim", () => {
    const a = item(1, 0, { atualizadoEm: "2026-11-19T12:00:00+00:00" });
    const b = item(2, 0, { atualizadoEm: "2026-11-19T12:00:00.000Z" });
    expect(numeros([a, b].sort(compararDaLista("recentes")))).toEqual([2, 1]); // empate: o maior Nº
    const lixo = item(9, 0, { atualizadoEm: "lixo" });
    expect(numeros([lixo, a].sort(compararDaLista("recentes")))).toEqual([1, 9]);
  });

  it("é determinístico: o mesmo Nº e a mesma versão desempatam pelo id", () => {
    const x = item(5, 0, { id: "b" });
    const y = item(5, 0, { id: "a" });
    expect([x, y].sort(compararDaLista("numero")).map((c) => c.id)).toEqual(["a", "b"]);
    expect([y, x].sort(compararDaLista("numero")).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("as duas visões e o padrão: 'Mais recentes'", () => {
    expect([...ORDENS_DA_LISTA]).toEqual(["recentes", "numero"]);
    expect(ORDEM_PADRAO_DA_LISTA).toBe("recentes");
    expect(isOrdemDaLista("numero")).toBe(true);
    for (const ruim of ["", "data", null, undefined, 1, ["numero"]]) expect(isOrdemDaLista(ruim), String(ruim)).toBe(false);
  });
});

// ── A preferência lembrada no navegador ──────────────────────────────────────────────────────────────────────────

function armazenamentoFalso(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  const a: ArmazenamentoDaOrdem & { dados: Map<string, string> } = {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
  };
  return a;
}

describe("a visão lembrada (por conta, no navegador, com try/catch)", () => {
  it("a chave é de UMA conta: duas pessoas no mesmo navegador não trocam a visão", () => {
    expect(chaveDaOrdem("u_1")).not.toBe(chaveDaOrdem("u_2"));
    expect(chaveDaOrdem(undefined)).toBe(chaveDaOrdem(""));
    const a = armazenamentoFalso();
    gravarOrdem(a, chaveDaOrdem("u_1"), { ordem: "numero", inverter: true });
    expect(lerOrdemSalva(a, chaveDaOrdem("u_1"))).toEqual({ ordem: "numero", inverter: true });
    expect(lerOrdemSalva(a, chaveDaOrdem("u_2"))).toBeNull();
  });

  it("grava e lê de volta; o sentido invertido só vale em 'numero'", () => {
    const a = armazenamentoFalso();
    gravarOrdem(a, "k", { ordem: "recentes", inverter: false });
    expect(lerOrdemSalva(a, "k")).toEqual({ ordem: "recentes", inverter: false });
    a.dados.set("k", JSON.stringify({ ordem: "recentes", inverter: true }));
    expect(lerOrdemSalva(a, "k")).toEqual({ ordem: "recentes", inverter: false });
  });

  it.each(["", "lixo", "null", "[]", "42", JSON.stringify({ ordem: "data" }), JSON.stringify({ inverter: true })])("valor salvo ilegível (%s) → null (o padrão vale)", (texto) => {
    expect(lerOrdemSalva(armazenamentoFalso({ k: texto }), "k")).toBeNull();
  });

  it("sem localStorage, ou com ele quebrado (modo privado, cota): nada lança", () => {
    const quebrado: ArmazenamentoDaOrdem = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(lerOrdemSalva(quebrado, "k")).toBeNull();
    expect(() => gravarOrdem(quebrado, "k", { ordem: "numero", inverter: false })).not.toThrow();
    expect(lerOrdemSalva(null, "k")).toBeNull();
    expect(() => gravarOrdem(undefined, "k", { ordem: "numero", inverter: false })).not.toThrow();
  });
});

// ── A lista do mês: visão e atualização em silêncio ──────────────────────────────────────────────────────────────

function servidor(inicial: CompraDaLista[], tamanhoPagina = 50) {
  let todas = [...inicial];
  const chamadas: ParametrosLista[] = [];
  let falha: unknown = null;
  let segurar: Promise<void> | null = null;
  const api: ApiListaCompras = {
    listar: async (p) => {
      chamadas.push({ ...p });
      if (segurar) await segurar;
      if (falha) throw falha;
      const ordenadas = todas.filter((c) => c.anoMes === p.anoMes).sort(compararDaLista(p.ordem ?? "numero", p.inverter === true));
      const casam = ordenadas.filter((c) => p.incluirCanceladas || !c.cancelada);
      const de = (p.pagina - 1) * tamanhoPagina;
      const totais: TotaisDaLista = { ativas: ordenadas.filter((c) => !c.cancelada).length, canceladas: ordenadas.filter((c) => c.cancelada).length };
      const r: ListaCompras = {
        anoMes: p.anoMes,
        maiorSequencia: ordenadas.reduce((m, c) => Math.max(m, c.sequencia), 0),
        compras: casam.slice(de, de + tamanhoPagina),
        pagina: p.pagina,
        limite: tamanhoPagina,
        temMais: casam.length > de + tamanhoPagina,
        total: casam.length,
        totais,
      };
      return r;
    },
  };
  return {
    api,
    chamadas,
    mudar(novas: CompraDaLista[]) {
      todas = [...novas];
    },
    falhar(e: unknown) {
      falha = e;
    },
    segurar(): () => void {
      let soltar = () => undefined as void;
      segurar = new Promise<void>((r) => {
        soltar = () => {
          segurar = null;
          r();
        };
      });
      return soltar;
    },
  };
}

const compraSalva = (sequencia: number, minuto: number, extra: Partial<Compra> = {}): Compra =>
  compraVaziaDeTeste({ id: `cmp_${sequencia}`, sequencia, anoMes: "2026-11", paciente: `PACIENTE TESTE ${sequencia}`, updatedAt: `2026-11-19T12:${String(minuto).padStart(2, "0")}:00.000Z`, ...extra });

describe("a visão da lista (useComprasMes)", () => {
  it("o padrão é 'Mais recentes' e o pedido ao servidor leva a visão", async () => {
    const s = servidor([item(3, 30), item(18, 10), item(7, 50)]);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    expect(m.ordem.value).toBe("recentes");
    expect(s.chamadas[0]).toMatchObject({ ordem: "recentes", inverter: false });
    expect(numeros(m.compras.value)).toEqual([7, 3, 18]);
  });

  it("'Por número' ordena do maior para o menor e recarrega; o botão de inverter vira do menor para o maior", async () => {
    const s = servidor([item(3, 30), item(18, 10), item(7, 50)]);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    await m.definirOrdem("numero");
    expect(numeros(m.compras.value)).toEqual([18, 7, 3]);
    await m.alternarSentido();
    expect(m.inverter.value).toBe(true);
    expect(s.chamadas.at(-1)).toMatchObject({ ordem: "numero", inverter: true });
    expect(numeros(m.compras.value)).toEqual([3, 7, 18]);
    await m.alternarSentido();
    expect(numeros(m.compras.value)).toEqual([18, 7, 3]);
  });

  it("voltar para 'Mais recentes' desliga a inversão; inverter só existe em 'Por número'", async () => {
    const s = servidor([item(3, 30), item(18, 10)]);
    const m = useComprasMes({ mes: "2026-11", api: s.api, ordem: "numero", inverter: true });
    await m.carregar();
    await m.definirOrdem("recentes");
    expect(m.inverter.value).toBe(false);
    const antes = s.chamadas.length;
    await m.alternarSentido(); // em 'recentes' não faz nada
    expect(s.chamadas).toHaveLength(antes);
    expect(m.inverter.value).toBe(false);
  });

  it("escolher a mesma visão de novo não relê nada", async () => {
    const s = servidor([item(3, 30)]);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    await m.definirOrdem("recentes");
    expect(s.chamadas).toHaveLength(1);
  });

  it("a visão vale em todas as páginas ('mostrar mais' pede a mesma)", async () => {
    const s = servidor([item(1, 1), item(2, 2), item(3, 3)], 2);
    const m = useComprasMes({ mes: "2026-11", api: s.api, ordem: "numero" });
    await m.carregar();
    await m.mostrarMais();
    expect(s.chamadas[1]).toMatchObject({ pagina: 2, ordem: "numero" });
    expect(numeros(m.compras.value)).toEqual([3, 2, 1]);
  });

  it("depois de salvar, em 'Mais recentes' o cartão sobe para o topo; em 'Por número' fica no lugar", async () => {
    const s = servidor([item(3, 30), item(18, 10), item(7, 50)]);
    const r = useComprasMes({ mes: "2026-11", api: s.api });
    await r.carregar();
    r.aplicarCompra(compraSalva(18, 59)); // a mais antiga acabou de ser mexida
    expect(numeros(r.compras.value)).toEqual([18, 7, 3]);

    const n = useComprasMes({ mes: "2026-11", api: s.api, ordem: "numero" });
    await n.carregar();
    n.aplicarCompra(compraSalva(3, 59));
    expect(numeros(n.compras.value)).toEqual([18, 7, 3]);
  });

  it("compra nova entra no lugar da visão (no topo em 'recentes'; pelo número em 'numero', inclusive invertida)", async () => {
    const s = servidor([item(3, 30), item(18, 10)]);
    const r = useComprasMes({ mes: "2026-11", api: s.api });
    await r.carregar();
    r.aplicarCompra(compraSalva(5, 58), { nova: true });
    expect(numeros(r.compras.value)).toEqual([5, 3, 18]);

    const n = useComprasMes({ mes: "2026-11", api: s.api, ordem: "numero", inverter: true });
    await n.carregar();
    n.aplicarCompra(compraSalva(5, 58), { nova: true });
    expect(numeros(n.compras.value)).toEqual([3, 5, 18]);
  });
});

describe("atualizar: a releitura em silêncio da lista", () => {
  it("traz o que mudou no servidor (compra nova, totais, maior número) SEM 'Carregando…' e sem erro", async () => {
    const s = servidor([item(1, 1)]);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    s.mudar([item(1, 1), item(2, 2, { cancelada: true }), item(9, 9)]);
    const vistos: boolean[] = [];
    const parar = vi.fn();
    void parar;
    const p = m.atualizar();
    vistos.push(m.carregando.value);
    await p;
    expect(vistos).toEqual([false]);
    expect(numeros(m.compras.value)).toEqual([9, 1]);
    expect(m.totais.value).toEqual({ ativas: 2, canceladas: 1 });
    expect(m.maiorSequencia.value).toBe(9);
    expect(m.erro.value).toBeNull();
  });

  it("uma compra que sumiu no servidor sai da lista", async () => {
    const s = servidor([item(1, 1), item(2, 2)]);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    s.mudar([item(2, 2)]);
    await m.atualizar();
    expect(numeros(m.compras.value)).toEqual([2]);
  });

  it("a versão daqui MAIS NOVA que a do servidor não é pisada; a do servidor mais nova vence", async () => {
    const s = servidor([item(1, 10, { paciente: "VELHO 1" }), item(2, 10, { paciente: "VELHO 2" })]);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    m.aplicarCompra(compraSalva(1, 40, { paciente: "SALVO AQUI 1" })); // gravação que o servidor ainda não mostra
    s.mudar([item(1, 10, { paciente: "VELHO 1" }), item(2, 30, { paciente: "OUTRA PESSOA 2" })]);
    await m.atualizar();
    const por = (n: number) => m.compras.value.find((c) => c.sequencia === n)!;
    expect(por(1).paciente).toBe("SALVO AQUI 1");
    expect(por(2).paciente).toBe("OUTRA PESSOA 2");
  });

  it("se a lista mudou por uma ação daqui DURANTE a leitura (salvou, criou), a leitura velha é descartada", async () => {
    const s = servidor([item(1, 1)]);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    const soltar = s.segurar();
    const leitura = m.atualizar();
    m.aplicarCompra(compraSalva(2, 20), { nova: true }); // a pessoa criou outra enquanto a releitura voava
    soltar();
    await leitura;
    expect(numeros(m.compras.value).sort()).toEqual([1, 2]); // a compra nova continua na lista
  });

  it("se o mês mudou durante a leitura, a leitura velha (que chega por ÚLTIMO) não pisa a lista do mês novo", async () => {
    const s = servidor([item(1, 1), item(5, 5, { anoMes: "2026-10", id: "cmp_out_5" })]);
    let primeira = true;
    let soltar: () => void = () => undefined;
    const portao = new Promise<void>((r) => {
      soltar = r;
    });
    // só a PRIMEIRA leitura (a da releitura em silêncio) fica presa; as outras passam
    const api: ApiListaCompras = {
      listar: async (p) => {
        if (primeira && p.anoMes === "2026-11" && m.compras.value.length > 0) {
          primeira = false;
          const resposta = await s.api.listar(p);
          await portao;
          return resposta;
        }
        return s.api.listar(p);
      },
    };
    const m = useComprasMes({ mes: "2026-11", api });
    await m.carregar();
    const leitura = m.atualizar();
    await m.irParaMes("2026-10"); // a pessoa trocou de mês e a lista de outubro já está na tela
    expect(m.compras.value.map((c) => c.id)).toEqual(["cmp_out_5"]);
    soltar(); // agora chega a resposta VELHA, com as compras de novembro
    await leitura;
    expect(m.mes.value).toBe("2026-10");
    expect(m.compras.value.map((c) => c.id)).toEqual(["cmp_out_5"]);
  });

  it("erro de rede ou do servidor: a lista de antes fica, sem aviso", async () => {
    const s = servidor([item(1, 1)]);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    s.falhar(new TypeError("Failed to fetch"));
    await expect(m.atualizar()).resolves.toBeUndefined();
    expect(numeros(m.compras.value)).toEqual([1]);
    expect(m.erro.value).toBeNull();
  });

  it("duas releituras juntas viram uma; e não relê enquanto a lista está carregando", async () => {
    const s = servidor([item(1, 1)]);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    const antes = s.chamadas.length;
    await Promise.all([m.atualizar(), m.atualizar()]);
    expect(s.chamadas.length - antes).toBe(1);

    const soltar = s.segurar();
    const carregando = m.carregar();
    const depois = s.chamadas.length;
    await m.atualizar();
    expect(s.chamadas.length).toBe(depois); // carregando: nada a fazer
    soltar();
    await carregando;
  });

  it("com 'mostrar mais' aberto, relê TODAS as páginas já vistas (não volta para a 1ª página)", async () => {
    const s = servidor([item(1, 1), item(2, 2), item(3, 3), item(4, 4)], 2);
    const m = useComprasMes({ mes: "2026-11", api: s.api, ordem: "numero" });
    await m.carregar();
    await m.mostrarMais();
    expect(numeros(m.compras.value)).toEqual([4, 3, 2, 1]);
    s.mudar([item(1, 1), item(2, 2), item(3, 3), item(4, 4), item(5, 5)]);
    await m.atualizar();
    expect(numeros(m.compras.value)).toEqual([5, 4, 3, 2]); // as duas páginas já vistas, relidas (o 1 foi para a 3ª, que ainda não foi aberta)
    expect(m.temMais.value).toBe(true);
  });

  it("respeita a visão escolhida e o filtro de canceladas", async () => {
    const s = servidor([item(1, 1), item(2, 2, { cancelada: true })]);
    const m = useComprasMes({ mes: "2026-11", api: s.api, ordem: "numero", inverter: true, mostrarCanceladas: true });
    await m.carregar();
    await m.atualizar();
    expect(s.chamadas.at(-1)).toMatchObject({ ordem: "numero", inverter: true, incluirCanceladas: true });
    expect(numeros(m.compras.value)).toEqual([1, 2]);
  });
});

// ── A página: preferência lembrada e a compra aberta intocada ───────────────────────────────────────────────────

function mundoDaPagina(inicial: Compra[]) {
  const banco = new Map<string, Compra>(inicial.map((c) => [c.id, c]));
  const listar = vi.fn(async (p: ParametrosLista): Promise<ListaCompras> => {
    const itens = [...banco.values()].filter((c) => c.anoMes === p.anoMes).map((c) => itemDaLista({ ...c, atualizadoEm: c.updatedAt })).sort(compararDaLista(p.ordem ?? "numero", p.inverter === true));
    return {
      anoMes: p.anoMes,
      maiorSequencia: itens.reduce((m, c) => Math.max(m, c.sequencia), 0),
      compras: itens,
      pagina: 1,
      limite: 50,
      temMais: false,
      total: itens.length,
      totais: { ativas: itens.filter((i) => !i.cancelada).length, canceladas: itens.filter((i) => i.cancelada).length },
    };
  });
  const obter = vi.fn(async (id: string): Promise<Compra> => ({ ...banco.get(id)! }));
  const salvar = vi.fn(async (id: string, corpo: CompraSalvarDTO): Promise<Compra> => {
    const atual = banco.get(id)!;
    const novo = { ...atual, ...(corpo as unknown as Partial<Compra>), id, updatedAt: new Date(Date.parse(atual.updatedAt) + 1000).toISOString() };
    banco.set(id, novo);
    return novo;
  });
  return { banco, listar, obter, salvar };
}

function paginaDe(m: ReturnType<typeof mundoDaPagina>, extra: { armazenamento?: ArmazenamentoDaOrdem | null; chave?: string; query?: Record<string, unknown> } = {}) {
  const avisos: string[] = [];
  const p = useComprasPagina({
    query: extra.query ?? {},
    podeEditar: () => true,
    avisar: (msg) => avisos.push(msg),
    gravarUrl: () => undefined,
    apiLista: { listar: m.listar },
    apiCompra: { obter: m.obter, salvar: m.salvar },
    apiAcoes: { criar: vi.fn(), duplicar: vi.fn(), cancelar: vi.fn() },
    armazenamento: extra.armazenamento,
    chaveDaOrdem: () => extra.chave ?? chaveDaOrdem("u_1"),
    agora: () => new Date("2026-11-19T15:00:00Z"),
  });
  return { p, avisos };
}

describe("a visão lembrada pela página", () => {
  it("quem nunca escolheu: 'Mais recentes' e nada salvo; a escolha é lembrada e a lista é relida", async () => {
    const m = mundoDaPagina([compraSalva(1, 1), compraSalva(2, 2)]);
    const a = armazenamentoFalso();
    const { p } = paginaDe(m, { armazenamento: a });
    await p.iniciar();
    expect(p.lista.ordem.value).toBe("recentes");
    expect(m.listar).toHaveBeenLastCalledWith(expect.objectContaining({ ordem: "recentes" }));
    expect(a.dados.size).toBe(0);
    await p.definirOrdem("numero");
    expect(numeros(p.lista.compras.value)).toEqual([2, 1]);
    expect(JSON.parse(a.dados.get(chaveDaOrdem("u_1"))!)).toEqual({ ordem: "numero", inverter: false });
    await p.alternarSentido();
    expect(numeros(p.lista.compras.value)).toEqual([1, 2]);
    expect(JSON.parse(a.dados.get(chaveDaOrdem("u_1"))!)).toEqual({ ordem: "numero", inverter: true });
  });

  it("na próxima visita a visão salva vale JÁ na primeira leitura (sem piscar a outra)", async () => {
    const m = mundoDaPagina([compraSalva(1, 1), compraSalva(2, 2)]);
    const a = armazenamentoFalso({ [chaveDaOrdem("u_1")]: JSON.stringify({ ordem: "numero", inverter: true }) });
    const { p } = paginaDe(m, { armazenamento: a });
    await p.iniciar();
    expect(m.listar).toHaveBeenCalledTimes(1);
    expect(m.listar).toHaveBeenCalledWith(expect.objectContaining({ ordem: "numero", inverter: true }));
    expect(p.lista.ordem.value).toBe("numero");
    expect(p.lista.inverter.value).toBe(true);
    expect(numeros(p.lista.compras.value)).toEqual([1, 2]);
  });

  it("é por conta: a visão salva de outra conta não vale", async () => {
    const m = mundoDaPagina([compraSalva(1, 1)]);
    const a = armazenamentoFalso({ [chaveDaOrdem("u_2")]: JSON.stringify({ ordem: "numero", inverter: true }) });
    const { p } = paginaDe(m, { armazenamento: a, chave: chaveDaOrdem("u_1") });
    await p.iniciar();
    expect(p.lista.ordem.value).toBe("recentes");
  });

  it("localStorage quebrado ou ausente: a página funciona, na visão padrão", async () => {
    const m = mundoDaPagina([compraSalva(1, 1)]);
    const quebrado: ArmazenamentoDaOrdem = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const { p } = paginaDe(m, { armazenamento: quebrado });
    await p.iniciar();
    await p.definirOrdem("numero");
    expect(p.lista.ordem.value).toBe("numero");
    const { p: p2 } = paginaDe(m, { armazenamento: null });
    await p2.iniciar();
    await p2.definirOrdem("numero");
    expect(p2.lista.ordem.value).toBe("numero");
  });

  it("trocar a visão NÃO fecha a compra aberta nem mexe no que está sendo digitado", async () => {
    const m = mundoDaPagina([compraSalva(1, 1), compraSalva(2, 2)]);
    const { p } = paginaDe(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.editor.alterar({ paciente: "DIGITANDO" });
    await p.definirOrdem("numero");
    expect(p.selecionadaId.value).toBe("cmp_1");
    expect(p.editor.compra.value!.paciente).toBe("DIGITANDO");
    expect(p.editor.estado.value).toBe("pendente");
    await vi.advanceTimersByTimeAsync(1000);
    expect(m.banco.get("cmp_1")!.paciente).toBe("DIGITANDO"); // o autosave seguiu o seu caminho
  });
});

describe("atualizar a lista com uma compra aberta e digitação em andamento", () => {
  it("a releitura NÃO fecha a compra, NÃO apaga a digitação e NÃO atrapalha o autosave", async () => {
    const m = mundoDaPagina([compraSalva(1, 1), compraSalva(2, 2)]);
    const { p } = paginaDe(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    m.obter.mockClear();
    p.editor.alterar({ paciente: "DIGITANDO" });
    // outra pessoa mexe na MESMA compra no servidor e cria outra
    m.banco.set("cmp_1", { ...m.banco.get("cmp_1")!, paciente: "DA OUTRA PESSOA", updatedAt: "2026-11-19T12:30:00.000Z" });
    m.banco.set("cmp_3", compraSalva(3, 31));
    await p.atualizarLista();
    expect(p.selecionadaId.value).toBe("cmp_1");
    expect(p.editor.compra.value!.paciente).toBe("DIGITANDO"); // a tela de edição não foi tocada
    expect(p.editor.estado.value).toBe("pendente");
    expect(m.obter).not.toHaveBeenCalled(); // nem releu a compra aberta
    expect(numeros(p.lista.compras.value)).toEqual([3, 1, 2]); // a lista, sim, ficou em dia
    expect(p.lista.compras.value.find((c) => c.sequencia === 1)!.paciente).toBe("DA OUTRA PESSOA");
  });

  it("o que foi salvo aqui e ainda não apareceu na leitura do servidor NÃO volta ao antigo no cartão", async () => {
    const m = mundoDaPagina([compraSalva(1, 1)]);
    const { p } = paginaDe(m, { query: { id: "cmp_1" } });
    await p.iniciar();
    p.editor.alterar({ paciente: "SALVO AGORA" });
    await p.editor.flush();
    const aposSalvar = p.lista.compras.value.find((c) => c.sequencia === 1)!;
    expect(aposSalvar.paciente).toBe("SALVO AGORA");
    // o servidor (réplica atrasada) ainda mostra a versão de antes
    m.listar.mockResolvedValueOnce({
      anoMes: "2026-11",
      maiorSequencia: 1,
      compras: [item(1, 1, { id: "cmp_1", paciente: "PACIENTE TESTE 1", atualizadoEm: "2026-11-19T12:01:00.000Z" })],
      pagina: 1,
      limite: 50,
      temMais: false,
      total: 1,
      totais: { ativas: 1, canceladas: 0 },
    });
    await p.atualizarLista();
    expect(p.lista.compras.value.find((c) => c.sequencia === 1)!.paciente).toBe("SALVO AGORA");
  });

  it("com uma ação em andamento (criar, duplicar, cancelar, trocar), a releitura espera", async () => {
    const m = mundoDaPagina([compraSalva(1, 1)]);
    const { p } = paginaDe(m);
    await p.iniciar();
    p.ocupado.value = true;
    m.listar.mockClear();
    await p.atualizarLista();
    expect(m.listar).not.toHaveBeenCalled();
    p.ocupado.value = false;
    await p.atualizarLista();
    expect(m.listar).toHaveBeenCalledTimes(1);
  });
});

// ── Quando atualizar: foco e 60 s ────────────────────────────────────────────────────────────────────────────────

function ambiente() {
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  const janela = new EventTarget();
  const atualizar = vi.fn(async () => undefined);
  const c = useComprasAtualizacao({ atualizar, doc: doc as never, janela: janela as never });
  return { doc, janela, atualizar, c };
}

describe("useComprasAtualizacao: quando a lista se atualiza", () => {
  it("o intervalo é de 60 s e, depois de iniciar, não lê na hora (a página acabou de carregar a lista)", () => {
    expect(INTERVALO_DE_ATUALIZACAO_MS).toBe(60_000);
    const { atualizar, c } = ambiente();
    c.iniciar();
    expect(atualizar).not.toHaveBeenCalled();
    c.parar();
  });

  it("a cada 60 s enquanto a aba está visível", async () => {
    const { atualizar, c } = ambiente();
    c.iniciar();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(atualizar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(atualizar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(atualizar).toHaveBeenCalledTimes(3);
    c.parar();
  });

  it("aba escondida: nada é consultado; ao voltar a ficar à vista, lê na hora", async () => {
    const { atualizar, c, doc } = ambiente();
    c.iniciar();
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(180_000);
    expect(atualizar).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(atualizar).toHaveBeenCalledTimes(1);
    c.parar();
  });

  it("a janela que volta a ter foco lê na hora; foco e visibilidade juntos viram UMA leitura", async () => {
    const { atualizar, c, doc, janela } = ambiente();
    c.iniciar();
    await vi.advanceTimersByTimeAsync(5_000);
    janela.dispatchEvent(new Event("focus"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(atualizar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_500);
    janela.dispatchEvent(new Event("focus"));
    expect(atualizar).toHaveBeenCalledTimes(2);
    c.parar();
  });

  it("parar encerra tudo (nem o intervalo nem os eventos leem mais); iniciar duas vezes não duplica", async () => {
    const { atualizar, c, doc, janela } = ambiente();
    c.iniciar();
    c.iniciar();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(atualizar).toHaveBeenCalledTimes(1);
    c.parar();
    await vi.advanceTimersByTimeAsync(300_000);
    janela.dispatchEvent(new Event("focus"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(atualizar).toHaveBeenCalledTimes(1);
  });

  it("a leitura que falha não derruba nada", async () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
    const atualizar = vi.fn(async () => {
      throw new Error("sem rede");
    });
    const c = useComprasAtualizacao({ atualizar, doc: doc as never, janela: new EventTarget() as never });
    c.iniciar();
    await vi.advanceTimersByTimeAsync(60_000); // se a rejeição escapasse, o teste cairia aqui
    expect(atualizar).toHaveBeenCalledTimes(1);
    c.parar();
  });
});
