import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { StatusDaCompra } from "#shared/constants/compra";
import type { Compra, CompraDaLista, ListaCompras, TotaisPorStatus } from "#shared/types/compra";
import { itemDaLista } from "#shared/utils/compraLista";
import { anoMesAtualBrasilia, anoMesValido, rotuloDoMes, somarMeses } from "#shared/utils/compraMes";
import { apiFetch } from "../utils/apiFetch";

// A lista de compras do mês (painel esquerdo): o mês (de BRASÍLIA), o filtro por estado, os totais para os chips, o "mostrar mais" de 50
// em 50 e a atualização do cartão logo depois de salvar. O mês e o filtro são do estado daqui; a página os põe na URL (comprasUrl.ts).
//
// COMO A LISTA ACOMPANHA O QUE FOI SALVO (decisão): depois de cada salvamento a página chama `aplicarCompra(compra)` com a compra que o
// servidor devolveu. O cartão e os totais são refeitos LOCALMENTE com as mesmas funções puras do servidor (`itemDaLista`: estado,
// pendências e medicamentos saem iguais) — sem reler o mês a cada pausa na digitação (o servidor lê o mês inteiro para calcular o
// estado). A lista de verdade volta do servidor ao trocar de mês, de filtro ou ao recarregar (`carregar`).

export interface ParametrosLista {
  anoMes: string;
  status: StatusDaCompra | null;
  incluirCanceladas: boolean;
  pagina: number;
}

export interface ApiListaCompras {
  listar: (parametros: ParametrosLista) => Promise<ListaCompras>;
}

export function montarUrlLista(p: ParametrosLista): string {
  const q = new URLSearchParams({ ano_mes: p.anoMes });
  if (p.status !== null) q.set("status", p.status);
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
  status?: StatusDaCompra | null;
  mostrarCanceladas?: boolean;
  /** Relógio (testes). */
  agora?: () => Date;
  api?: ApiListaCompras;
}

const totaisZerados = (): TotaisPorStatus => ({ rascunho: 0, pronta: 0, parcial: 0, encaminhada: 0, cancelada: 0 });

export interface ComprasMes {
  mes: Ref<string>;
  status: Ref<StatusDaCompra | null>;
  mostrarCanceladas: Ref<boolean>;
  compras: Ref<CompraDaLista[]>;
  totais: Ref<TotaisPorStatus>;
  /** Quantas compras casam com o filtro (todas as páginas). */
  total: Ref<number>;
  temMais: Ref<boolean>;
  carregando: Ref<boolean>;
  carregandoMais: Ref<boolean>;
  erro: Ref<string | null>;
  rotuloMes: ComputedRef<string>;
  /** "N compras" do mês: a soma de todos os estados, MENOS as canceladas. */
  totalDoMes: ComputedRef<number>;
  carregar: () => Promise<void>;
  mostrarMais: () => Promise<void>;
  irParaMes: (anoMes: string) => Promise<void>;
  mesAnterior: () => Promise<void>;
  mesSeguinte: () => Promise<void>;
  definirStatus: (status: StatusDaCompra | null) => Promise<void>;
  definirMostrarCanceladas: (valor: boolean) => Promise<void>;
  aplicarCompra: (compra: Compra, opcoes?: { nova?: boolean }) => void;
}

export function useComprasMes(opcoes: OpcoesUseComprasMes = {}): ComprasMes {
  const api = opcoes.api ?? apiPadrao;
  const mes = ref<string>(anoMesValido(opcoes.mes) ? opcoes.mes : anoMesAtualBrasilia(opcoes.agora?.()));
  const status = ref<StatusDaCompra | null>(opcoes.status ?? null);
  const mostrarCanceladas = ref<boolean>(opcoes.mostrarCanceladas === true);

  const compras = ref<CompraDaLista[]>([]);
  const totais = ref<TotaisPorStatus>(totaisZerados());
  const total = ref(0);
  const temMais = ref(false);
  const carregando = ref(false);
  const carregandoMais = ref(false);
  const erro = ref<string | null>(null);
  const pagina = ref(1);

  // O estado conhecido de cada compra (das páginas lidas e das aplicadas): é de onde sai "de qual estado para qual" nos totais.
  const statusConhecido = new Map<string, StatusDaCompra>();
  // Cada leitura leva um número: a resposta de uma leitura que já foi superada (outro mês ou filtro no meio) é descartada.
  let leitura = 0;

  const parametros = (p: number): ParametrosLista => ({ anoMes: mes.value, status: status.value, incluirCanceladas: mostrarCanceladas.value, pagina: p });

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
      statusConhecido.clear();
      for (const c of r.compras) statusConhecido.set(c.id, c.status);
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
      for (const c of r.compras) statusConhecido.set(c.id, c.status);
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

  async function definirStatus(novo: StatusDaCompra | null): Promise<void> {
    if (status.value === novo) return;
    status.value = novo;
    await carregar();
  }

  async function definirMostrarCanceladas(valor: boolean): Promise<void> {
    if (mostrarCanceladas.value === valor) return;
    mostrarCanceladas.value = valor;
    await carregar();
  }

  // A mesma regra do servidor: com filtro, só o estado pedido; sem filtro, tudo menos as canceladas (a menos que o interruptor).
  const casaComOFiltro = (item: CompraDaLista): boolean =>
    status.value !== null ? item.status === status.value : mostrarCanceladas.value || item.status !== "cancelada";

  function aplicarCompra(compra: Compra, aplicacao: { nova?: boolean } = {}): void {
    if (compra.anoMes !== mes.value) return;
    const item = itemDaLista({ ...compra, atualizadoEm: compra.updatedAt });
    const antes = statusConhecido.get(compra.id);
    const posicaoNaLista = compras.value.findIndex((c) => c.id === compra.id);

    // Totais do mês: sai do estado de antes e entra no de agora (compra nova só entra; compra de página não lida não se sabe).
    const novosTotais = { ...totais.value };
    if (antes !== undefined && antes !== item.status) {
      novosTotais[antes] = Math.max(0, novosTotais[antes] - 1);
      novosTotais[item.status] += 1;
    } else if (antes === undefined && aplicacao.nova === true) {
      novosTotais[item.status] += 1;
    }
    totais.value = novosTotais;
    statusConhecido.set(compra.id, item.status);

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
  const totalDoMes = computed(() => totais.value.rascunho + totais.value.pronta + totais.value.parcial + totais.value.encaminhada);

  return {
    mes,
    status,
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
    definirStatus,
    definirMostrarCanceladas,
    aplicarCompra,
  };
}
