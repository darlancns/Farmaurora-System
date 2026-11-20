import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { Compra, CorpoEncaminhar, OrdemEncaminhada, PreviaEncaminhar, RespostaEncaminhar } from "#shared/types/compra";
import { ApiError, apiFetch, codigoDoErro } from "../utils/apiFetch";
import {
  MENSAGEM_FALHA_ENCAMINHAR,
  MENSAGEM_NAO_SALVOU_ENCAMINHAR,
  MENSAGEM_VENDEDOR_INATIVO,
  chaveConfirmacao,
  linhasMistasDaPrevia,
  linhasPendentesDaPrevia,
  previaTemImpedimento,
} from "../utils/comprasEncaminhar";
import { useTravaEnvio } from "./useTravaEnvio";

// O fluxo "Encaminhar para a DIR" da coluna direita: abrir o painel (com o salvamento descarregado), a PRÉVIA que se atualiza a cada versão
// salva (debounce curto; a última prévia fica na tela enquanto a nova carrega), a confirmação da temperatura mista, o POST (NUNCA dois ao mesmo
// tempo) e o resultado. O servidor é idempotente: repetir depois de um erro é seguro. NÃO envia `ordemIds` (sempre todas as ordens pendentes).
//
// Quem desenha (CompraEncaminharPainel.vue) recebe só `painel`, um retrato com valores simples.

export interface ApiEncaminhar {
  previa: (compraId: string) => Promise<PreviaEncaminhar>;
  encaminhar: (compraId: string, corpo: CorpoEncaminhar) => Promise<RespostaEncaminhar>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

const apiPadrao: ApiEncaminhar = {
  previa: (id) => apiFetch<PreviaEncaminhar>(`/api/compras/${encodeURIComponent(id)}/encaminhar-previa`, undefined, "Não foi possível carregar a conferência."),
  encaminhar: (id, corpo) =>
    apiFetch<RespostaEncaminhar>(`/api/compras/${encodeURIComponent(id)}/encaminhar`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(corpo) }, MENSAGEM_FALHA_ENCAMINHAR),
};

/** A espera depois da última versão salva antes de buscar a prévia de novo. */
export const DEBOUNCE_PREVIA_MS = 400;

export type ResultadoEncaminhar = { tipo: "criadas"; criadas: OrdemEncaminhada[] } | { tipo: "ja-encaminhada" };

export interface ErroEncaminhar {
  /** O `data.code` do servidor, "versao" (409 de versão) ou null (rede/500/outro). */
  codigo: string | null;
  mensagem: string;
  /** Não adianta repetir: a pessoa precisa carregar a versão salva (versão antiga ou compra cancelada). */
  bloqueia: boolean;
}

/** O retrato do painel para a tela. */
export interface EstadoPainelEncaminhar {
  aberto: boolean;
  previa: PreviaEncaminhar | null;
  /** Primeira busca em curso (ainda não há prévia nenhuma para mostrar). */
  carregando: boolean;
  /** Uma busca nova está em curso (ou agendada) com a prévia antiga ainda na tela. */
  atualizando: boolean;
  erroPrevia: string | null;
  /** As chaves (chaveConfirmacao) das linhas de temperatura mista já confirmadas. */
  confirmadas: string[];
  enviando: boolean;
  resultado: ResultadoEncaminhar | null;
  erroEnvio: ErroEncaminhar | null;
  /** Quantas linhas serão criadas (ordens pendentes). */
  linhasPendentes: number;
  podeEnviar: boolean;
  /** Por que o botão está desabilitado (texto de apoio); null quando pode enviar ou não há o que explicar. */
  motivoBloqueio: string | null;
}

export interface OpcoesUseEncaminharCompra {
  /** A compra aberta no editor (a versão atual: `updatedAt`). */
  compra: () => Compra | null;
  /** Descarrega o autosave; false = não salvou. */
  flush: () => Promise<boolean>;
  /** Há algo ainda não salvo? Enquanto houver, o Encaminhar espera (a prévia é do que está salvo). */
  pendente?: () => boolean;
  /** O editor está parado num conflito de versão? Enquanto estiver, o Encaminhar espera a pessoa resolver. */
  emConflito?: () => boolean;
  /** Troca a compra do editor pela devolvida pelo servidor (e atualiza o cartão e os totais da lista). */
  aplicarCompra: (compra: Compra) => void;
  /** 409 de versão: abre a faixa de conflito do editor (com "Carregar a versão salva"). */
  sinalizarConflito: () => void;
  /** Criou linhas na DIR: a página invalida o cache da DIR e avisa com um toast. */
  aoEncaminhar?: (criadas: OrdemEncaminhada[]) => void;
  /** Toast curto (ex.: o salvamento falhou ao abrir). */
  avisar?: (mensagem: string) => void;
  api?: ApiEncaminhar;
  debounceMs?: number;
}

export interface EncaminharCompra {
  painel: ComputedRef<EstadoPainelEncaminhar>;
  aberto: Ref<boolean>;
  /** Descarrega o salvamento e abre o painel (busca a prévia). false = não abriu (o salvamento falhou). */
  abrir: () => Promise<boolean>;
  fechar: () => void;
  confirmar: (chave: string, valor: boolean) => void;
  /** Busca a prévia agora (o "Tentar de novo"). */
  recarregarPrevia: () => Promise<void>;
  enviar: () => Promise<void>;
  /** Os POs que a prévia diz que já existem na DIR (alimenta o checklist normal: `poJaNaDir`). */
  conflitosPo: ComputedRef<string[]>;
}

export function useEncaminharCompra(opcoes: OpcoesUseEncaminharCompra): EncaminharCompra {
  const api = opcoes.api ?? apiPadrao;
  const debounceMs = opcoes.debounceMs ?? DEBOUNCE_PREVIA_MS;
  const trava = useTravaEnvio();

  const aberto = ref(false);
  const previa = ref<PreviaEncaminhar | null>(null);
  const carregando = ref(false);
  const atualizando = ref(false);
  const agendada = ref(false);
  const erroPrevia = ref<string | null>(null);
  const confirmadas = ref<string[]>([]);
  const resultado = ref<ResultadoEncaminhar | null>(null);
  const erroEnvio = ref<ErroEncaminhar | null>(null);

  /** A versão da compra em que a prévia visível foi calculada. */
  const versaoDaPrevia = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Cada busca leva um número: a resposta de uma busca superada (ou de outra compra) é descartada.
  let sequencia = 0;

  const versaoAtual = (): string | null => opcoes.compra()?.updatedAt ?? null;

  function limparTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    agendada.value = false;
  }

  async function buscarPrevia(): Promise<void> {
    limparTimer();
    const c = opcoes.compra();
    if (!c) return;
    const minha = ++sequencia;
    const versao = c.updatedAt;
    if (previa.value === null) carregando.value = true;
    else atualizando.value = true;
    erroPrevia.value = null;
    try {
      const r = await api.previa(c.id);
      if (minha !== sequencia) return;
      previa.value = r;
      versaoDaPrevia.value = versao;
      // Só ficam as confirmações de linhas que continuam mistas com a MESMA temperatura.
      const validas = new Set(linhasMistasDaPrevia(r).map(chaveConfirmacao));
      confirmadas.value = confirmadas.value.filter((k) => validas.has(k));
    } catch (e) {
      if (minha !== sequencia) return;
      erroPrevia.value = e instanceof ApiError ? e.message : "Não foi possível carregar a conferência. Tente de novo.";
    } finally {
      if (minha === sequencia) {
        carregando.value = false;
        atualizando.value = false;
      }
    }
  }

  function agendarPrevia(): void {
    limparTimer();
    agendada.value = true;
    timer = setTimeout(() => {
      timer = null;
      agendada.value = false;
      void buscarPrevia();
    }, debounceMs);
  }

  function zerar(): void {
    limparTimer();
    sequencia += 1; // descarta o que ainda estiver voando
    previa.value = null;
    versaoDaPrevia.value = null;
    carregando.value = false;
    atualizando.value = false;
    erroPrevia.value = null;
    confirmadas.value = [];
    resultado.value = null;
    erroEnvio.value = null;
  }

  async function abrir(): Promise<boolean> {
    if (aberto.value) return true;
    if (!opcoes.compra()) return false;
    // O que está pendente no formulário é salvo ANTES de abrir: a prévia (e o POST) são do que o servidor tem.
    if (!(await opcoes.flush())) {
      opcoes.avisar?.(MENSAGEM_NAO_SALVOU_ENCAMINHAR);
      return false;
    }
    zerar();
    aberto.value = true;
    await buscarPrevia();
    return true;
  }

  function fechar(): void {
    aberto.value = false;
    zerar();
  }

  // Cada versão salva nova (autosave) refaz a prévia, com debounce; trocar de compra fecha o painel.
  watch(
    () => opcoes.compra()?.updatedAt,
    () => {
      if (!aberto.value || resultado.value !== null || trava.emAndamento.value) return;
      erroEnvio.value = null;
      agendarPrevia();
    },
  );
  watch(
    () => opcoes.compra()?.id,
    () => {
      if (aberto.value) fechar();
    },
  );

  function confirmar(chave: string, valor: boolean): void {
    const sem = confirmadas.value.filter((k) => k !== chave);
    confirmadas.value = valor ? [...sem, chave] : sem;
  }

  const linhasPendentes = computed(() => linhasPendentesDaPrevia(previa.value));
  const faltaConfirmar = computed(() => linhasMistasDaPrevia(previa.value).some((l) => !confirmadas.value.includes(chaveConfirmacao(l))));
  const desatualizada = computed(() => atualizando.value || agendada.value || (previa.value !== null && versaoDaPrevia.value !== versaoAtual()));

  const motivoBloqueio = computed<string | null>(() => {
    if (!aberto.value || resultado.value !== null || trava.emAndamento.value) return null;
    if (carregando.value || (previa.value === null && erroPrevia.value === null)) return "Carregando a conferência…";
    if (erroPrevia.value !== null) return "Não foi possível carregar a conferência. Tente de novo.";
    if (opcoes.emConflito?.()) return "Resolva o conflito de versão da compra (faixa no topo do formulário).";
    if (opcoes.pendente?.()) return "Salvando as alterações da compra…";
    if (desatualizada.value) return "Atualizando a conferência…";
    if (erroEnvio.value?.bloqueia) return "Carregue a versão salva da compra para continuar.";
    if (previaTemImpedimento(previa.value)) return "Resolva os itens em vermelho para encaminhar.";
    if (linhasPendentes.value.length === 0) return "Todas as ordens já foram encaminhadas.";
    if (faltaConfirmar.value) return "Confirme a temperatura das linhas marcadas.";
    return null;
  });

  const podeEnviar = computed(() => aberto.value && resultado.value === null && !trava.emAndamento.value && previa.value !== null && motivoBloqueio.value === null);

  function tratarErro(e: unknown): void {
    if (e instanceof ApiError) {
      const codigo = codigoDoErro(e);
      const data = (e.data ?? {}) as { atual?: Compra; pos?: string[] };
      if (e.status === 409 && codigo === null) {
        opcoes.sinalizarConflito();
        erroEnvio.value = { codigo: "versao", mensagem: "Esta compra foi alterada por outra pessoa. Carregue a versão salva e confira de novo.", bloqueia: true };
        return;
      }
      if (codigo === "compra_cancelada") {
        if (data.atual) opcoes.aplicarCompra(data.atual);
        erroEnvio.value = { codigo, mensagem: "Esta compra foi cancelada e não pode ser encaminhada.", bloqueia: true };
        return;
      }
      const porCodigo: Record<string, string> = {
        po_ja_na_dir: `PO já existe na DIR: ${(data.pos ?? []).join(", ")}`,
        checklist_com_erros: "A compra ainda tem pendências. Resolva os itens em vermelho e tente de novo.",
        vendedor_inativo: MENSAGEM_VENDEDOR_INATIVO,
        po_repetido_na_compra: `PO repetido nas ordens desta compra: ${(data.pos ?? []).join(", ")}`,
        temperatura_mista_nao_confirmada: "Confirme a temperatura das linhas marcadas e tente de novo.",
      };
      if (codigo !== null && porCodigo[codigo] !== undefined) {
        erroEnvio.value = { codigo, mensagem: porCodigo[codigo]!, bloqueia: false };
        void buscarPrevia(); // a conferência passa a mostrar o motivo
        return;
      }
      if (e.status >= 400 && e.status < 500) {
        erroEnvio.value = { codigo, mensagem: e.message, bloqueia: false };
        return;
      }
    }
    // Rede ou 500: pode ter criado linhas. Repetir é seguro (o servidor é idempotente).
    erroEnvio.value = { codigo: null, mensagem: MENSAGEM_FALHA_ENCAMINHAR, bloqueia: false };
  }

  async function enviar(): Promise<void> {
    if (!podeEnviar.value) return;
    await trava.executar(async () => {
      erroEnvio.value = null;
      if (!(await opcoes.flush())) {
        erroEnvio.value = { codigo: null, mensagem: MENSAGEM_NAO_SALVOU_ENCAMINHAR, bloqueia: false };
        return;
      }
      const compra = opcoes.compra();
      if (!compra) return;
      // O flush salvou algo (a versão mudou desde a prévia): a pessoa confere de novo antes de enviar.
      if (versaoDaPrevia.value !== compra.updatedAt) {
        erroEnvio.value = { codigo: null, mensagem: "A compra mudou. Confira a conferência atualizada e envie de novo.", bloqueia: false };
        void buscarPrevia();
        return;
      }
      const corpo: CorpoEncaminhar = { atualizadoEm: compra.updatedAt };
      if (linhasMistasDaPrevia(previa.value).length > 0) corpo.confirmarTemperaturaMista = true;
      try {
        const r = await api.encaminhar(compra.id, corpo);
        limparTimer();
        opcoes.aplicarCompra(r.compra);
        resultado.value = r.jaEncaminhada ? { tipo: "ja-encaminhada" } : { tipo: "criadas", criadas: r.criadas };
        if (!r.jaEncaminhada) opcoes.aoEncaminhar?.(r.criadas);
      } catch (e) {
        tratarErro(e);
      }
    });
  }

  const painel = computed<EstadoPainelEncaminhar>(() => ({
    aberto: aberto.value,
    previa: previa.value,
    carregando: carregando.value || (aberto.value && previa.value === null && erroPrevia.value === null),
    atualizando: desatualizada.value && previa.value !== null,
    erroPrevia: erroPrevia.value,
    confirmadas: confirmadas.value,
    enviando: trava.emAndamento.value,
    resultado: resultado.value,
    erroEnvio: erroEnvio.value,
    linhasPendentes: linhasPendentes.value.length,
    podeEnviar: podeEnviar.value,
    motivoBloqueio: motivoBloqueio.value,
  }));

  return {
    painel,
    aberto,
    abrir,
    fechar,
    confirmar,
    recarregarPrevia: buscarPrevia,
    enviar,
    conflitosPo: computed(() => (aberto.value && previa.value ? previa.value.conflitosPo : [])),
  };
}
