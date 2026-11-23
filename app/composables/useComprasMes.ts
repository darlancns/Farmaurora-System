import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { Compra, CompraDaLista, ListaCompras, TotaisDaLista } from "#shared/types/compra";
import { compararDaLista, itemDaLista, ORDEM_PADRAO_DA_LISTA, type OrdemDaLista } from "#shared/utils/compraLista";
import { anoMesAtualBrasilia, anoMesValido, rotuloDoMes, somarMeses } from "#shared/utils/compraMes";
import { apiFetch } from "../utils/apiFetch";

// A lista de compras do mês (painel esquerdo): o mês (de BRASÍLIA), a visão ("Mais recentes" ou "Por número"), o filtro "Mostrar canceladas", os totais {ativas, canceladas}, o
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
  /** A visão da lista (sem ela, o servidor usa "numero"). */
  ordem?: OrdemDaLista;
  inverter?: boolean;
}

export interface ApiListaCompras {
  listar: (parametros: ParametrosLista) => Promise<ListaCompras>;
}

export function montarUrlLista(p: ParametrosLista): string {
  const q = new URLSearchParams({ ano_mes: p.anoMes });
  if (p.incluirCanceladas) q.set("incluir_canceladas", "1");
  if (p.pagina > 1) q.set("pagina", String(p.pagina));
  if (p.ordem !== undefined) q.set("ordem", p.ordem);
  if (p.inverter === true) q.set("inverter", "1");
  return `/api/compras?${q.toString()}`;
}

const apiPadrao: ApiListaCompras = {
  listar: (p) => apiFetch<ListaCompras>(montarUrlLista(p), undefined, "Não foi possível carregar as compras."),
};

export interface OpcoesUseComprasMes {
  /** O mês inicial ("AAAA-MM"); sem ele, o mês corrente de BRASÍLIA. */
  mes?: string;
  mostrarCanceladas?: boolean;
  /** A visão inicial (a preferência salva); sem ela, "Mais recentes". */
  ordem?: OrdemDaLista;
  inverter?: boolean;
  /** Relógio (testes). */
  agora?: () => Date;
  api?: ApiListaCompras;
}

const totaisZerados = (): TotaisDaLista => ({ ativas: 0, canceladas: 0 });

export interface ComprasMes {
  mes: Ref<string>;
  mostrarCanceladas: Ref<boolean>;
  /** A visão da lista: "recentes" (a versão mais nova primeiro) ou "numero" (do maior para o menor). */
  ordem: Ref<OrdemDaLista>;
  /** Só com "numero": do menor para o maior. */
  inverter: Ref<boolean>;
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
  /** O maior Nº de compra do mês da lista (as canceladas contam: o número delas continua ocupado); 0 = mês vazio. */
  maiorSequencia: Ref<number>;
  /** O maior Nº de compra de QUALQUER mês, lido na hora (a base da sugestão do "+ Nova compra"); null se não foi possível ler. */
  consultarMaiorSequencia: (anoMes: string) => Promise<number | null>;
  carregar: () => Promise<void>;
  mostrarMais: () => Promise<void>;
  irParaMes: (anoMes: string) => Promise<void>;
  mesAnterior: () => Promise<void>;
  mesSeguinte: () => Promise<void>;
  definirMostrarCanceladas: (valor: boolean) => Promise<void>;
  /** Troca a visão e relê a lista. */
  definirOrdem: (ordem: OrdemDaLista) => Promise<void>;
  /** "Por número": do maior para o menor <-> do menor para o maior. */
  alternarSentido: () => Promise<void>;
  /**
   * Relê a lista EM SILÊNCIO (a aba voltou a ficar à vista, ou passaram 60 s): sem "Carregando…", sem fechar nada e sem tocar na compra aberta. Uma versão
   * local MAIS NOVA (`atualizadoEm`) que a do servidor é mantida; se algo mudou na lista durante a leitura (salvou, criou, trocou de mês...), a leitura
   * velha é descartada. Erro de rede: fica a lista de antes.
   */
  atualizar: () => Promise<void>;
  aplicarCompra: (compra: Compra, opcoes?: { nova?: boolean }) => void;
  /**
   * A compra foi APAGADA (por esta pessoa ou por outra): sai do cartão e dos totais do mês. `cancelada` (se a compra estava cancelada) ajuda quando ela não está na
   * lista (aberta por link, ou cancelada com "Mostrar canceladas" desligado). Id que a lista não conhece e sem essa dica: não faz nada.
   */
  removerCompra: (id: string, cancelada?: boolean) => void;
}

export function useComprasMes(opcoes: OpcoesUseComprasMes = {}): ComprasMes {
  const api = opcoes.api ?? apiPadrao;
  const mes = ref<string>(anoMesValido(opcoes.mes) ? opcoes.mes : anoMesAtualBrasilia(opcoes.agora?.()));
  const mostrarCanceladas = ref<boolean>(opcoes.mostrarCanceladas === true);
  const ordem = ref<OrdemDaLista>(opcoes.ordem ?? ORDEM_PADRAO_DA_LISTA);
  const inverter = ref<boolean>(opcoes.inverter === true);

  const compras = ref<CompraDaLista[]>([]);
  const totais = ref<TotaisDaLista>(totaisZerados());
  const total = ref(0);
  const temMais = ref(false);
  const carregando = ref(false);
  const carregandoMais = ref(false);
  const erro = ref<string | null>(null);
  const pagina = ref(1);
  const maiorSequencia = ref(0);

  // Se cada compra está cancelada (das páginas lidas e das aplicadas): é de onde sai "de ativa para cancelada" nos totais.
  const canceladaConhecida = new Map<string, boolean>();
  // Cada leitura leva um número: a resposta de uma leitura que já foi superada (outro mês ou filtro no meio) é descartada.
  let leitura = 0;
  // Quantas vezes a lista mudou por AÇÃO LOCAL (salvou, criou, cancelou): uma releitura em silêncio que começou antes disso está velha e é descartada.
  let mudancasLocais = 0;
  let atualizando = false;

  const parametros = (p: number): ParametrosLista => ({ anoMes: mes.value, incluirCanceladas: mostrarCanceladas.value, pagina: p, ordem: ordem.value, inverter: inverter.value });
  const comparador = (): ((a: CompraDaLista, b: CompraDaLista) => number) => compararDaLista(ordem.value, inverter.value);

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
      maiorSequencia.value = r.maiorSequencia;
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
    if (!temMais.value || carregandoMais.value || carregando.value || atualizando) return;
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

  /** Lê o maior número do mês pedido (a lista dele, sem filtro de canceladas: o número delas continua ocupado). Falhou: null. */
  async function consultarMaiorSequencia(anoMes: string): Promise<number | null> {
    try {
      const r = await api.listar({ anoMes, incluirCanceladas: true, pagina: 1 });
      return r.maiorSequencia;
    } catch {
      return anoMes === mes.value && !carregando.value && erro.value === null ? maiorSequencia.value : null;
    }
  }

  async function atualizar(): Promise<void> {
    if (carregando.value || carregandoMais.value || atualizando) return;
    atualizando = true;
    const minha = leitura;
    const local = mudancasLocais;
    const paginas = pagina.value;
    try {
      const lidas: CompraDaLista[] = [];
      let ultima: ListaCompras | null = null;
      for (let n = 1; n <= paginas; n += 1) {
        ultima = await api.listar(parametros(n));
        lidas.push(...ultima.compras);
      }
      if (ultima === null || minha !== leitura || local !== mudancasLocais || paginas !== pagina.value) return; // a lista mudou no meio: esta leitura está velha
      const daTela = new Map(compras.value.map((c) => [c.id, c]));
      const mescladas = new Map<string, CompraDaLista>();
      for (const lida of lidas) {
        const aqui = daTela.get(lida.id);
        // A versão daqui mais nova que a do servidor (uma gravação que ainda não apareceu na leitura) NÃO é pisada.
        mescladas.set(lida.id, aqui && Date.parse(aqui.atualizadoEm) > Date.parse(lida.atualizadoEm) ? aqui : lida);
      }
      compras.value = [...mescladas.values()].sort(comparador());
      totais.value = ultima.totais;
      total.value = ultima.total;
      temMais.value = ultima.temMais;
      maiorSequencia.value = ultima.maiorSequencia;
      canceladaConhecida.clear();
      for (const c of compras.value) canceladaConhecida.set(c.id, c.cancelada);
    } catch {
      // sem rede ou erro do servidor: fica a lista de antes, sem aviso (a próxima rodada tenta de novo)
    } finally {
      atualizando = false;
    }
  }

  async function definirOrdem(nova: OrdemDaLista): Promise<void> {
    if (ordem.value === nova) return;
    ordem.value = nova;
    if (nova !== "numero") inverter.value = false; // o sentido só existe em "Por número"
    await carregar();
  }

  async function alternarSentido(): Promise<void> {
    if (ordem.value !== "numero") return;
    inverter.value = !inverter.value;
    await carregar();
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
    mudancasLocais += 1;
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
    if (compra.sequencia > maiorSequencia.value) maiorSequencia.value = compra.sequencia;

    if (posicaoNaLista >= 0) {
      if (casaComOFiltro(item)) {
        // Salvou: o cartão se atualiza e, em "Mais recentes", sobe para o topo (a versão dele é a mais nova).
        compras.value = compras.value.map((c) => (c.id === compra.id ? item : c)).sort(comparador());
      } else {
        compras.value = compras.value.filter((c) => c.id !== compra.id);
        total.value = Math.max(0, total.value - 1);
      }
      return;
    }

    // Não estava na lista: só entra se for nova (as outras estão em páginas ainda não lidas ou não casam com o filtro).
    if (aplicacao.nova === true && casaComOFiltro(item)) {
      compras.value = [...compras.value, item].sort(comparador());
      total.value += 1;
    }
  }

  function removerCompra(id: string, dica?: boolean): void {
    const cancelada = canceladaConhecida.get(id) ?? compras.value.find((c) => c.id === id)?.cancelada ?? dica;
    const estavaNaLista = compras.value.some((c) => c.id === id);
    if (!estavaNaLista && cancelada === undefined) return;
    mudancasLocais += 1;
    if (cancelada !== undefined) {
      const chave: keyof TotaisDaLista = cancelada ? "canceladas" : "ativas";
      totais.value = { ...totais.value, [chave]: Math.max(0, totais.value[chave] - 1) };
    }
    canceladaConhecida.delete(id);
    if (estavaNaLista) {
      compras.value = compras.value.filter((c) => c.id !== id);
      total.value = Math.max(0, total.value - 1);
    }
  }

  const rotuloMes = computed(() => rotuloDoMes(mes.value));
  const totalDoMes = computed(() => totais.value.ativas);

  return {
    mes,
    mostrarCanceladas,
    ordem,
    inverter,
    compras,
    totais,
    total,
    temMais,
    carregando,
    carregandoMais,
    erro,
    rotuloMes,
    totalDoMes,
    maiorSequencia,
    consultarMaiorSequencia,
    carregar,
    mostrarMais,
    irParaMes,
    mesAnterior,
    mesSeguinte,
    definirMostrarCanceladas,
    definirOrdem,
    alternarSentido,
    atualizar,
    aplicarCompra,
    removerCompra,
  };
}
