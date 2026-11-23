import { nextTick, ref, watch, type Ref } from "vue";
import { CODIGO_NUMERO_JA_EXISTE } from "#shared/constants/compra";
import type { Compra, NovaCompraDTO } from "#shared/types/compra";
import { itemVazio } from "#shared/utils/compraForm";
import type { OrdemDaLista } from "#shared/utils/compraLista";
import { rotuloDoMes, tituloDaCompra } from "#shared/utils/compraMes";
import { ApiError, apiFetch, codigoDoErro } from "../utils/apiFetch";
import { abaInicial, type AbaCompras } from "../utils/comprasAbas";
import { gravarOrdem, lerOrdemSalva, type ArmazenamentoDaOrdem } from "../utils/comprasOrdem";
import { lerQueryCompras, montarQueryCompras } from "../utils/comprasUrl";
import { getErrorMessage } from "../utils/errorMessages";
import { useCompraEditor, type ApiCompra, type CompraEditor } from "./useCompraEditor";
import { useComprasMes, type ApiListaCompras, type ComprasMes } from "./useComprasMes";

// A ORQUESTRAÇÃO da página Compras: liga a lista do mês (useComprasMes), o editor da compra aberta (useCompraEditor) e a URL.
// A página (app/pages/compras.vue) só desenha. Aqui moram as regras de trocar de lugar:
//  - "+ Nova compra" e "Duplicar compra" abrem a caixinha do Nº da compra (o time combina o número; nada é gerado sozinho); a compra só é criada em "Criar compra"
//    e nasce no MÊS DA LISTA (o seletor da esquerda): Outubro na tela, compra de outubro, com a sugestão e a unicidade de outubro;
//  - ANTES de trocar de compra, de mês, criar, duplicar ou cancelar, o salvamento pendente é descarregado (flush); se falhar, a
//    pessoa é avisada e NADA troca em silêncio;
//  - mês e compra abertos vão na URL (?mes, ?id, ?canceladas; um ?status antigo é ignorado); id de uma compra de outro mês abre no mês dela;
//  - depois de cada salvamento a lista é atualizada com o que o servidor devolveu (sem reler o mês).

export interface ApiAcoesCompra {
  /** Cria com o Nº da compra DIGITADO (o servidor nunca escolhe o número) e no mês da lista que a pessoa via (`anoMes`). */
  criar: (corpo: NovaCompraDTO) => Promise<Compra>;
  duplicar: (id: string, corpo: NovaCompraDTO) => Promise<Compra>;
  cancelar: (id: string) => Promise<Compra>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

const apiAcoesPadrao: ApiAcoesCompra = {
  criar: (corpo) => apiFetch<Compra>("/api/compras", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(corpo) }, "Não foi possível criar a compra."),
  duplicar: (id, corpo) =>
    apiFetch<Compra>(`/api/compras/${encodeURIComponent(id)}/duplicar`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(corpo) }, "Não foi possível duplicar a compra."),
  cancelar: (id) => apiFetch<Compra>(`/api/compras/${encodeURIComponent(id)}/cancelar`, { method: "POST", headers: JSON_HEADERS }, "Não foi possível cancelar a compra."),
};

export const MENSAGEM_NAO_SALVOU = "Não foi possível salvar as alterações desta compra. Tente salvar de novo antes de continuar.";
export const MENSAGEM_NUMERO_PENDENTE = "O Nº desta compra já existe no mês. Troque o número antes de continuar.";

/** A caixinha do Nº da compra (nova ou duplicar): o que ela mostra e o que a pessoa já fez. */
export interface DialogoNumeroCompra {
  tipo: "nova" | "duplicar";
  /** O mês em que a compra vai nascer ("AAAA-MM"). */
  anoMes: string;
  /** O mês por extenso ("Novembro/2026"). */
  rotuloMes: string;
  /** O maior número do mês (0 = vazio; null = ainda buscando ou não foi possível ler). */
  maior: number | null;
  /** A sugestão (o maior + 1); null enquanto busca. */
  sugestao: number | null;
  /** O erro do servidor (número repetido...): aparece no campo, a caixinha continua aberta. */
  erro: string | null;
  /** Criando: novos cliques são ignorados. */
  ocupado: boolean;
  /** A compra que está sendo duplicada (só em "duplicar"). */
  origemId: string | null;
}

export interface OpcoesComprasPagina {
  /** O que veio na URL (route.query). */
  query: Record<string, unknown>;
  /** Pode escrever em Compras? Lido a cada uso (a conta carrega depois). */
  podeEditar: () => boolean;
  /** O toast. */
  avisar: (mensagem: string) => void;
  /** Grava a nova query na URL. */
  gravarUrl: (query: Record<string, string>) => void;
  /** Onde a visão da lista ("Mais recentes" / "Por número") fica lembrada (o localStorage) e com que chave (uma por conta). Sem isso, não lembra. */
  armazenamento?: ArmazenamentoDaOrdem | null;
  chaveDaOrdem?: () => string;
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
  /** A caixinha do Nº da compra ("+ Nova compra" e "Duplicar compra"); null = fechada. */
  dialogo: Ref<DialogoNumeroCompra | null>;
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
  /** "Mais recentes" / "Por número": troca a visão, lembra a escolha no navegador e relê a lista (a compra aberta não é tocada). */
  definirOrdem: (ordem: OrdemDaLista) => Promise<void>;
  /** "Por número": inverte o sentido (e lembra). */
  alternarSentido: () => Promise<void>;
  /** Relê a lista em silêncio (a aba voltou, ou passaram 60 s). Parada enquanto uma ação (criar, duplicar, cancelar, trocar) está em andamento. */
  atualizarLista: () => Promise<void>;
  /** "+ Nova compra": abre a caixinha do número (nada é criado ainda). */
  criarNova: () => Promise<void>;
  /** "Duplicar compra": abre a caixinha do número da cópia (o número da original nunca é copiado). */
  duplicar: () => Promise<void>;
  /** "Criar compra" na caixinha: cria (ou duplica) com o número digitado. */
  confirmarDialogo: (numero: number) => Promise<void>;
  cancelarDialogo: () => void;
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
  const dialogo = ref<DialogoNumeroCompra | null>(null);
  const pedidoDeFocoMedicamento = ref(0);

  const editor = useCompraEditor({
    api: opcoes.apiCompra,
    somenteLeitura: () => !opcoes.podeEditar(),
    aoSalvar: (compra) => lista.aplicarCompra(compra),
  });

  // A URL acompanha o mês, a compra aberta e o filtro.
  watch([lista.mes, selecionadaId, lista.mostrarCanceladas, aba], () => {
    opcoes.gravarUrl(montarQueryCompras({ mes: lista.mes.value, id: selecionadaId.value, canceladas: lista.mostrarCanceladas.value, aba: aba.value }));
  });

  /** Descarrega o salvamento pendente; se não deu, avisa e devolve false (quem chama não troca nada). */
  async function descarregar(): Promise<boolean> {
    const ok = await editor.flush();
    if (!ok) opcoes.avisar(editor.erroNumero.value !== null ? MENSAGEM_NUMERO_PENDENTE : MENSAGEM_NAO_SALVOU);
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
    // A visão que esta pessoa deixou escolhida (lida AQUI, no cliente, depois de montar: o HTML do servidor não tem como saber).
    const salva = lerOrdemSalva(opcoes.armazenamento, opcoes.chaveDaOrdem?.() ?? "");
    if (salva) {
      lista.ordem.value = salva.ordem;
      lista.inverter.value = salva.inverter;
    }
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

  const lembrarOrdem = (): void => gravarOrdem(opcoes.armazenamento, opcoes.chaveDaOrdem?.() ?? "", { ordem: lista.ordem.value, inverter: lista.inverter.value });

  async function definirOrdem(ordem: OrdemDaLista): Promise<void> {
    await lista.definirOrdem(ordem);
    lembrarOrdem();
  }

  async function alternarSentido(): Promise<void> {
    await lista.alternarSentido();
    lembrarOrdem();
  }

  async function atualizarLista(): Promise<void> {
    if (ocupado.value) return;
    await lista.atualizar();
  }

  /** Mostra a compra recém-criada ou duplicada: no mês dela (que pode não ser o da tela), no topo da lista, aberta no formulário. */
  async function mostrarNova(compra: Compra): Promise<void> {
    if (compra.anoMes !== lista.mes.value) await lista.irParaMes(compra.anoMes);
    else lista.aplicarCompra(compra, { nova: true });
    editor.definir(compra);
    selecionadaId.value = compra.id;
    aba.value = "formulario"; // a compra nova ou duplicada abre no formulário (no celular)
  }

  /** O mês em que a compra nasce: o que a pessoa está vendo na lista (o seletor "Novembro/2026" com as setas), não o mês corrente. */
  function anoMesDaNovaCompra(): string {
    return lista.mes.value;
  }

  /** Abre a caixinha do número e busca a sugestão (o maior do mês + 1) sem travar a abertura. */
  async function abrirDialogo(tipo: "nova" | "duplicar", origemId: string | null): Promise<void> {
    const anoMes = anoMesDaNovaCompra();
    const aberto: DialogoNumeroCompra = { tipo, anoMes, rotuloMes: rotuloDoMes(anoMes), maior: null, sugestao: null, erro: null, ocupado: false, origemId };
    dialogo.value = aberto;
    const maior = await lista.consultarMaiorSequencia(anoMes);
    // A pessoa pode ter fechado a caixinha (ou aberto outra) enquanto a lista era lida.
    if (dialogo.value?.anoMes !== anoMes || dialogo.value.tipo !== tipo || dialogo.value.origemId !== origemId) return;
    if (maior !== null) {
      dialogo.value.maior = maior;
      dialogo.value.sugestao = maior + 1;
    }
  }

  async function criarNova(): Promise<void> {
    if (!opcoes.podeEditar() || ocupado.value) return;
    await abrirDialogo("nova", null);
  }

  async function duplicar(): Promise<void> {
    const atual = editor.compra.value;
    if (!opcoes.podeEditar() || ocupado.value || !atual || atual.cancelada) return;
    await abrirDialogo("duplicar", atual.id);
  }

  function cancelarDialogo(): void {
    if (dialogo.value?.ocupado) return;
    dialogo.value = null;
  }

  /** "Criar compra" na caixinha. Número repetido (ou qualquer recusa do servidor): o erro aparece NO CAMPO e a caixinha fica aberta com o que foi digitado. */
  async function confirmarDialogo(numero: number): Promise<void> {
    const aberto = dialogo.value;
    if (!aberto || aberto.ocupado || ocupado.value || !opcoes.podeEditar()) return;
    aberto.ocupado = true;
    aberto.erro = null;
    ocupado.value = true;
    try {
      if (!(await descarregar())) return; // o aviso já foi dado; a caixinha continua aberta
      const nova = aberto.tipo === "duplicar" && aberto.origemId !== null ? await acoes.duplicar(aberto.origemId, { sequencia: numero, anoMes: aberto.anoMes }) : await acoes.criar({ sequencia: numero, anoMes: aberto.anoMes });
      dialogo.value = null;
      await mostrarNova(nova);
      if (aberto.tipo === "duplicar") {
        opcoes.avisar(`Compra duplicada: ${tituloDaCompra(nova.anoMes, nova.sequencia)}`);
        return;
      }
      // A compra nasce com o 1º medicamento (vazio): o servidor aceita rascunho parcial e o autosave o grava. O foco vai para o campo
      // Medicamento do Med. 1 (a tela observa `pedidoDeFocoMedicamento`).
      if (nova.itens.length === 0) editor.alterar({ itens: [itemVazio(1)] });
      await nextTick();
      pedidoDeFocoMedicamento.value += 1;
    } catch (e) {
      const repetido = e instanceof ApiError && e.status === 409 && codigoDoErro(e) === CODIGO_NUMERO_JA_EXISTE;
      aberto.erro = getErrorMessage(e, aberto.tipo === "duplicar" ? "Não foi possível duplicar a compra." : "Não foi possível criar a compra.");
      if (!repetido && dialogo.value === null) opcoes.avisar(aberto.erro); // já fechou: o erro não tem onde aparecer
    } finally {
      aberto.ocupado = false;
      ocupado.value = false;
    }
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
    dialogo,
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
    definirOrdem,
    alternarSentido,
    atualizarLista,
    criarNova,
    duplicar,
    confirmarDialogo,
    cancelarDialogo,
    pedirCancelar,
    confirmarCancelar,
    antesDeSair,
  };
}
