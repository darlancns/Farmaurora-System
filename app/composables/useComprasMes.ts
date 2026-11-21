import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { Compra, CompraDaLista, ListaCompras, TotaisDaLista } from "#shared/types/compra";
import { itemDaLista } from "#shared/utils/compraLista";
import { anoMesAtualBrasilia, anoMesValido, rotuloDoMes, somarMeses } from "#shared/utils/compraMes";
import { apiFetch } from "../utils/apiFetch";

// A lista de compras do mês (painel esquerdo): o mês (de BRASÍLIA), o filtro "Mostrar canceladas", os totais {ativas, canceladas}, o
// "mostrar mais" de 50 em 50 e a atualização do cartão logo depois de salvar. Não há filtro por status: a compra é ATIVA ou CANCELADA
// (derivado de `cancelada`). O mês e o filtro são do estado daqui; a página os põe na URL (comprasUrl.ts).
//
// COMO A LISTA ACOMPANHA O QUE FOI SALVO (decisão): depois de cada salvamento a página chama `aplicarCompra(compra)` com a compra que o
// servidor devolveu. O cartão e os totais são refeitos LOCALMENTE com as mesmas funções puras do servidor (`itemDaLista`: paciente,
// medicamentos e ordens saem iguais) — sem reler o mês a cada pausa na digitação. A lista de verdade volta do servidor ao trocar de mês, de filtro ou ao recarregar (`carregar`).

export interface ParametrosLista {
  anoMes: string;
  incluirCanceladas: boolean;
  pagina: number;
}

export interface ApiListaCompras {
  listar: (parametros: ParametrosLista) => Promise<ListaCompras>;
}

export function montarUrlLista(p: ParametrosLista): string {
  const q = new URLSearchParams({ ano_mes: p.anoMes });
  if (p.incluirCanceladas) q.set("incluir_canceladas", "1");
  if (p.pagina > 1) q.set("pagina", String(p.pagina));
  return `/api/compras?${q.toString()}`;
}

const apiPadrao: ApiListaCompras = {
  listar: (p) => apiFetch<ListaCompras>(montarUrlLista(p), undefined, "Não foi possível carregar as compras."),
};

export interface OpcoesUseComprasMes {
  /** O mês inicial ("AAAA-MM"); sem ele, o mês corrente de BRASÍLIA. */
  mes?: string;
  mostrarCanceladas?: boolean;
  /** Relógio (testes). */
  agora?: () => Date;
  api?: ApiListaCompras;
}

const totaisZerados = (): TotaisDaLista => ({ ativas: 0, canceladas: 0 });

export interface ComprasMes {
  mes: Ref<string>;
  mostrarCanceladas: Ref<boolean>;
  compras: Ref<CompraDaLista[]>;
  totais: Ref<TotaisDaLista>;
  /** Quantas compras casam com o filtro (todas as páginas). */
  total: Ref<number>;
  temMais: Ref<boolean>;
  carregando: Ref<boolean>;
  carregandoMais: Ref<boolean>;
  erro: Ref<string | null>;
  rotuloMes: ComputedRef<string>;
  /** "N compras" do mês: só as ATIVAS (as canceladas não contam). */
  totalDoMes: ComputedRef<number>;
  carregar: () => Promise<void>;
  mostrarMais: () => Promise<void>;
  irParaMes: (anoMes: string) => Promise<void>;
  mesAnterior: () => Promise<void>;
  mesSeguinte: () => Promise<void>;
  definirMostrarCanceladas: (valor: boolean) => Promise<void>;
  aplicarCompra: (compra: Compra, opcoes?: { nova?: boolean }) => void;
}

export function useComprasMes(opcoes: OpcoesUseComprasMes = {}): ComprasMes {
  const api = opcoes.api ?? apiPadrao;
  const mes = ref<string>(anoMesValido(opcoes.mes) ? opcoes.mes : anoMesAtualBrasilia(opcoes.agora?.()));
  const mostrarCanceladas = ref<boolean>(opcoes.mostrarCanceladas === true);

  const compras = ref<CompraDaLista[]>([]);
  const totais = ref<TotaisDaLista>(totaisZerados());
  const total = ref(0);
  const temMais = ref(false);
  const carregando = ref(false);
  const carregandoMais = ref(false);
  const erro = ref<string | null>(null);
  const pagina = ref(1);

  // Se cada compra está cancelada (das páginas lidas e das aplicadas): é de onde sai "de ativa para cancelada" nos totais.
  const canceladaConhecida = new Map<string, boolean>();
  // Cada leitura leva um número: a resposta de uma leitura que já foi superada (outro mês ou filtro no meio) é descartada.
  let leitura = 0;

  const parametros = (p: number): ParametrosLista => ({ anoMes: mes.value, incluirCanceladas: mostrarCanceladas.value, pagina: p });

  async function carregar(): Promise<void> {
    const minha = ++leitura;
    carregando.value = true;
    erro.value = null;
    try {
      const r = await api.listar(parametros(1));
      if (minha !== leitura) return;
      compras.value = r.compras;
      totais.value = r.totais;
      total.value = r.total;
      temMais.value = r.temMais;
      pagina.value = 1;
      canceladaConhecida.clear();
      for (const c of r.compras) canceladaConhecida.set(c.id, c.cancelada);
    } catch (e) {
      if (minha !== leitura) return;
      erro.value = e instanceof Error ? e.message : "Não foi possível carregar as compras.";
    } finally {
      if (minha === leitura) carregando.value = false;
    }
  }

  async function mostrarMais(): Promise<void> {
    if (!temMais.value || carregandoMais.value || carregando.value) return;
    const minha = leitura;
    carregandoMais.value = true;
    try {
      const r = await api.listar(parametros(pagina.value + 1));
      if (minha !== leitura) return;
      const jaTem = new Set(compras.value.map((c) => c.id));
      compras.value = [...compras.value, ...r.compras.filter((c) => !jaTem.has(c.id))];
      totais.value = r.totais;
      total.value = r.total;
      temMais.value = r.temMais;
      pagina.value += 1;
      for (const c of r.compras) canceladaConhecida.set(c.id, c.cancelada);
    } catch (e) {
      if (minha === leitura) erro.value = e instanceof Error ? e.message : "Não foi possível carregar as compras.";
    } finally {
      carregandoMais.value = false;
    }
  }

  async function irParaMes(anoMes: string): Promise<void> {
    if (!anoMesValido(anoMes)) return;
    mes.value = anoMes;
    await carregar();
  }

  const mesAnterior = (): Promise<void> => irParaMes(somarMeses(mes.value, -1));
  const mesSeguinte = (): Promise<void> => irParaMes(somarMeses(mes.value, 1));

  async function definirMostrarCanceladas(valor: boolean): Promise<void> {
    if (mostrarCanceladas.value === valor) return;
    mostrarCanceladas.value = valor;
    await carregar();
  }

  // A mesma regra do servidor: as canceladas só aparecem com o interruptor "Mostrar canceladas".
  const casaComOFiltro = (item: CompraDaLista): boolean => mostrarCanceladas.value || !item.cancelada;

  function aplicarCompra(compra: Compra, aplicacao: { nova?: boolean } = {}): void {
    if (compra.anoMes !== mes.value) return;
    const item = itemDaLista({ ...compra, atualizadoEm: compra.updatedAt });
    const antes = canceladaConhecida.get(compra.id);
    const posicaoNaLista = compras.value.findIndex((c) => c.id === compra.id);

    // Totais do mês: sai do estado de antes (ativa/cancelada) e entra no de agora (compra nova só entra; compra de página não lida não se sabe).
    const chave = (cancelada: boolean): keyof TotaisDaLista => (cancelada ? "canceladas" : "ativas");
    const novosTotais = { ...totais.value };
    if (antes !== undefined && antes !== item.cancelada) {
      novosTotais[chave(antes)] = Math.max(0, novosTotais[chave(antes)] - 1);
      novosTotais[chave(item.cancelada)] += 1;
    } else if (antes === undefined && aplicacao.nova === true) {
      novosTotais[chave(item.cancelada)] += 1;
    }
    totais.value = novosTotais;
    canceladaConhecida.set(compra.id, item.cancelada);

    if (posicaoNaLista >= 0) {
      if (casaComOFiltro(item)) {
        compras.value = compras.value.map((c) => (c.id === compra.id ? item : c));
      } else {
        compras.value = compras.value.filter((c) => c.id !== compra.id);
        total.value = Math.max(0, total.value - 1);
      }
      return;
    }

    // Não estava na lista: só entra se for nova (as outras estão em páginas ainda não lidas ou não casam com o filtro).
    if (aplicacao.nova === true && casaComOFiltro(item)) {
      const antesDe = compras.value.findIndex((c) => c.sequencia < item.sequencia);
      const lista = [...compras.value];
      lista.splice(antesDe === -1 ? lista.length : antesDe, 0, item);
      compras.value = lista;
      total.value += 1;
    }
  }

  const rotuloMes = computed(() => rotuloDoMes(mes.value));
  const totalDoMes = computed(() => totais.value.ativas);

  return {
    mes,
    mostrarCanceladas,
    compras,
    totais,
    total,
    temMais,
    carregando,
    carregandoMais,
    erro,
    rotuloMes,
    totalDoMes,
    carregar,
    mostrarMais,
    irParaMes,
    mesAnterior,
    mesSeguinte,
    definirMostrarCanceladas,
    aplicarCompra,
  };
}
