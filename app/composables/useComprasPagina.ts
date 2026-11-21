import { nextTick, ref, watch, type Ref } from "vue";
import type { Compra } from "#shared/types/compra";
import { itemVazio } from "#shared/utils/compraForm";
import { tituloDaCompra } from "#shared/utils/compraMes";
import { ApiError, apiFetch } from "../utils/apiFetch";
import { abaInicial, type AbaCompras } from "../utils/comprasAbas";
import { lerQueryCompras, montarQueryCompras } from "../utils/comprasUrl";
import { getErrorMessage } from "../utils/errorMessages";
import { useCompraEditor, type ApiCompra, type CompraEditor } from "./useCompraEditor";
import { useComprasMes, type ApiListaCompras, type ComprasMes } from "./useComprasMes";

// A ORQUESTRAÇÃO da página Compras: liga a lista do mês (useComprasMes), o editor da compra aberta (useCompraEditor) e a URL.
// A página (app/pages/compras.vue) só desenha. Aqui moram as regras de trocar de lugar:
//  - ANTES de trocar de compra, de mês, criar, duplicar ou cancelar, o salvamento pendente é descarregado (flush); se falhar, a
//    pessoa é avisada e NADA troca em silêncio;
//  - mês e compra abertos vão na URL (?mes, ?id, ?canceladas; um ?status antigo é ignorado); id de uma compra de outro mês abre no mês dela;
//  - depois de cada salvamento a lista é atualizada com o que o servidor devolveu (sem reler o mês).

export interface ApiAcoesCompra {
  criar: () => Promise<Compra>;
  duplicar: (id: string) => Promise<Compra>;
  cancelar: (id: string) => Promise<Compra>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

const apiAcoesPadrao: ApiAcoesCompra = {
  criar: () => apiFetch<Compra>("/api/compras", { method: "POST", headers: JSON_HEADERS }, "Não foi possível criar a compra."),
  duplicar: (id) => apiFetch<Compra>(`/api/compras/${encodeURIComponent(id)}/duplicar`, { method: "POST", headers: JSON_HEADERS }, "Não foi possível duplicar a compra."),
  cancelar: (id) => apiFetch<Compra>(`/api/compras/${encodeURIComponent(id)}/cancelar`, { method: "POST", headers: JSON_HEADERS }, "Não foi possível cancelar a compra."),
};

export const MENSAGEM_NAO_SALVOU = "Não foi possível salvar as alterações desta compra. Tente salvar de novo antes de continuar.";

export interface OpcoesComprasPagina {
  /** O que veio na URL (route.query). */
  query: Record<string, unknown>;
  /** Pode escrever em Compras? Lido a cada uso (a conta carrega depois). */
  podeEditar: () => boolean;
  /** O toast. */
  avisar: (mensagem: string) => void;
  /** Grava a nova query na URL. */
  gravarUrl: (query: Record<string, string>) => void;
  apiLista?: ApiListaCompras;
  apiCompra?: ApiCompra;
  apiAcoes?: ApiAcoesCompra;
  agora?: () => Date;
}

export interface ComprasPagina {
  lista: ComprasMes;
  editor: CompraEditor;
  selecionadaId: Ref<string | null>;
  /** A aba do celular (lista, formulário ou resumo); no desktop não faz nada. */
  aba: Ref<AbaCompras>;
  irParaAba: (aba: AbaCompras) => void;
  /** Uma ação (nova, duplicar, cancelar, trocar) está em andamento: os botões ficam parados. */
  ocupado: Ref<boolean>;
  /**
   * Pedido de foco no campo Medicamento do Med. 1: sobe um número a cada "+ Nova compra" (a tela observa e foca o campo; 0 = nunca
   * pediu). Em ref (e não em callback) para a tela reagir também quando a compra só aparece depois.
   */
  pedidoDeFocoMedicamento: Ref<number>;
  /** O diálogo de "Cancelar compra" está aberto. */
  confirmandoCancelar: Ref<boolean>;
  tituloParaDialogo: () => string;
  /** O texto do diálogo de cancelar. */
  mensagemCancelar: () => string;
  iniciar: () => Promise<void>;
  selecionar: (id: string) => Promise<void>;
  mesAnterior: () => Promise<void>;
  mesSeguinte: () => Promise<void>;
  definirMostrarCanceladas: (valor: boolean) => Promise<void>;
  criarNova: () => Promise<void>;
  duplicar: () => Promise<void>;
  pedirCancelar: () => void;
  confirmarCancelar: () => Promise<void>;
  /** Para sair da página (onBeforeRouteLeave): descarrega o pendente; false = não saia. */
  antesDeSair: () => Promise<boolean>;
}

export function useComprasPagina(opcoes: OpcoesComprasPagina): ComprasPagina {
  const inicial = lerQueryCompras(opcoes.query);
  const lista = useComprasMes({ mes: inicial.mes ?? undefined, mostrarCanceladas: inicial.canceladas, api: opcoes.apiLista, agora: opcoes.agora });
  const acoes = opcoes.apiAcoes ?? apiAcoesPadrao;
  const selecionadaId = ref<string | null>(null);
  const aba = ref<AbaCompras>(abaInicial(inicial.aba, inicial.id !== null));
  const ocupado = ref(false);
  const confirmandoCancelar = ref(false);
  const pedidoDeFocoMedicamento = ref(0);

  const editor = useCompraEditor({
    api: opcoes.apiCompra,
    somenteLeitura: () => !opcoes.podeEditar(),
    aoSalvar: (compra) => lista.aplicarCompra(compra),
    agora: opcoes.agora,
  });

  // A URL acompanha o mês, a compra aberta e o filtro.
  watch([lista.mes, selecionadaId, lista.mostrarCanceladas, aba], () => {
    opcoes.gravarUrl(montarQueryCompras({ mes: lista.mes.value, id: selecionadaId.value, canceladas: lista.mostrarCanceladas.value, aba: aba.value }));
  });

  /** Descarrega o salvamento pendente; se não deu, avisa e devolve false (quem chama não troca nada). */
  async function descarregar(): Promise<boolean> {
    const ok = await editor.flush();
    if (!ok) opcoes.avisar(MENSAGEM_NAO_SALVOU);
    return ok;
  }

  /** Roda uma ação com os botões parados (ocupado), avisando o erro. */
  async function comOcupado(acao: () => Promise<void>, falha: string): Promise<void> {
    if (ocupado.value) return;
    ocupado.value = true;
    try {
      await acao();
    } catch (e) {
      opcoes.avisar(getErrorMessage(e, falha));
    } finally {
      ocupado.value = false;
    }
  }

  async function abrir(id: string): Promise<void> {
    await editor.carregar(id);
    selecionadaId.value = id;
    aba.value = "formulario"; // escolher uma compra leva ao formulário (no celular)
  }

  async function iniciar(): Promise<void> {
    if (inicial.id !== null) {
      try {
        const compra = await editor.carregar(inicial.id);
        selecionadaId.value = compra.id;
        // Id de uma compra de OUTRO mês: abre no mês dela.
        lista.mes.value = compra.anoMes;
      } catch (e) {
        selecionadaId.value = null;
        editor.definir(null);
        aba.value = "lista";
        opcoes.avisar(e instanceof ApiError && e.status === 404 ? "Compra não encontrada." : getErrorMessage(e, "Não foi possível abrir a compra."));
      }
    }
    await lista.carregar();
    // Grava na URL o ponto de partida (o mês sempre), mesmo que nada tenha mudado desde que a página abriu.
    opcoes.gravarUrl(montarQueryCompras({ mes: lista.mes.value, id: selecionadaId.value, canceladas: lista.mostrarCanceladas.value, aba: aba.value }));
  }

  async function selecionar(id: string): Promise<void> {
    if (id === selecionadaId.value) return;
    await comOcupado(async () => {
      if (!(await descarregar())) return;
      await abrir(id);
    }, "Não foi possível abrir a compra.");
  }

  async function trocarMes(ir: () => Promise<void>): Promise<void> {
    await comOcupado(async () => {
      if (!(await descarregar())) return;
      selecionadaId.value = null;
      editor.definir(null);
      aba.value = "lista";
      await ir();
    }, "Não foi possível trocar o mês.");
  }

  const mesAnterior = (): Promise<void> => trocarMes(() => lista.mesAnterior());
  const mesSeguinte = (): Promise<void> => trocarMes(() => lista.mesSeguinte());

  async function definirMostrarCanceladas(valor: boolean): Promise<void> {
    await lista.definirMostrarCanceladas(valor);
  }

  /** Mostra a compra recém-criada ou duplicada: no mês dela (que pode não ser o da tela), no topo da lista, aberta no formulário. */
  async function mostrarNova(compra: Compra): Promise<void> {
    if (compra.anoMes !== lista.mes.value) await lista.irParaMes(compra.anoMes);
    else lista.aplicarCompra(compra, { nova: true });
    editor.definir(compra);
    selecionadaId.value = compra.id;
    aba.value = "formulario"; // a compra nova ou duplicada abre no formulário (no celular)
  }

  async function criarNova(): Promise<void> {
    if (!opcoes.podeEditar()) return;
    await comOcupado(async () => {
      if (!(await descarregar())) return;
      const nova = await acoes.criar();
      await mostrarNova(nova);
      // A compra nasce com o 1º medicamento (vazio): o servidor aceita rascunho parcial e o autosave o grava. O foco vai para o campo
      // Medicamento do Med. 1 (a tela observa `pedidoDeFocoMedicamento`).
      if (nova.itens.length === 0) editor.alterar({ itens: [itemVazio(1)] });
      await nextTick();
      pedidoDeFocoMedicamento.value += 1;
    }, "Não foi possível criar a compra.");
  }

  async function duplicar(): Promise<void> {
    const atual = editor.compra.value;
    if (!opcoes.podeEditar() || !atual || atual.cancelada) return;
    await comOcupado(async () => {
      if (!(await descarregar())) return;
      const copia = await acoes.duplicar(atual.id);
      await mostrarNova(copia);
      opcoes.avisar(`Compra duplicada: ${tituloDaCompra(copia.anoMes, copia.sequencia)}`);
    }, "Não foi possível duplicar a compra.");
  }

  function pedirCancelar(): void {
    const atual = editor.compra.value;
    if (!opcoes.podeEditar() || !atual || atual.cancelada) return;
    confirmandoCancelar.value = true;
  }

  async function confirmarCancelar(): Promise<void> {
    const atual = editor.compra.value;
    if (!atual) {
      confirmandoCancelar.value = false;
      return;
    }
    await comOcupado(async () => {
      try {
        if (!(await descarregar())) return;
        const cancelada = await acoes.cancelar(atual.id);
        editor.definir(cancelada); // fica aberta, só para leitura
        lista.aplicarCompra(cancelada);
        opcoes.avisar("Compra cancelada");
      } finally {
        confirmandoCancelar.value = false;
      }
    }, "Não foi possível cancelar a compra.");
  }

  function irParaAba(destino: AbaCompras): void {
    aba.value = destino;
  }

  async function antesDeSair(): Promise<boolean> {
    return descarregar();
  }

  return {
    lista,
    editor,
    selecionadaId,
    aba,
    irParaAba,
    ocupado,
    confirmandoCancelar,
    pedidoDeFocoMedicamento,
    tituloParaDialogo: () => (editor.compra.value ? tituloDaCompra(editor.compra.value.anoMes, editor.compra.value.sequencia) : ""),
    mensagemCancelar: () => {
      const c = editor.compra.value;
      return `Cancelar a ${c ? tituloDaCompra(c.anoMes, c.sequencia) : ""}? Ela continua na lista como cancelada e não poderá mais ser editada.`;
    },
    iniciar,
    selecionar,
    mesAnterior,
    mesSeguinte,
    definirMostrarCanceladas,
    criarNova,
    duplicar,
    pedirCancelar,
    confirmarCancelar,
    antesDeSair,
  };
}
