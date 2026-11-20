import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { Compra, CompraSalvarDTO, MudancasCompra } from "#shared/types/compra";
import { courierSimplesDasOrdens } from "#shared/utils/compraForm";
import { corpoParaSalvar } from "#shared/utils/compraPayload";
import { ApiError, apiFetch } from "../utils/apiFetch";

// O editor da compra aberta no formulário: o estado local (uma cópia da compra do servidor) e o SALVAMENTO AUTOMÁTICO.
//
//  - Cada mudança agenda o salvamento com debounce (800 ms) do ESTADO COMPLETO (PATCH /api/compras/:id) com o `atualizadoEm` da última
//    leitura/gravação; ao sucesso a versão passa a ser a devolvida.
//  - NUNCA dois PATCH ao mesmo tempo: mudou durante um salvamento? marca "sujo" e salva de novo logo depois do que está em curso.
//  - `flush()` descarrega o que está pendente ANTES de trocar de compra/mês ou sair da página; false = não salvou (quem chama não troca).
//  - 409 (outra pessoa salvou antes): para o autosave e espera a escolha — `carregarVersaoSalva()` (descarta as mudanças locais) ou
//    `manterMinhas()` (reenvia o estado local com a versão atual). Nada some sem a pessoa escolher.
//  - Erro de rede ou 5xx: o estado local fica; tenta de novo sozinho com recuo (3 tentativas); depois espera `tentarDeNovo()`. Erro 4xx
//    (dado recusado) não repete sozinho: espera o clique, com a mensagem do servidor.
//  - Somente leitura (sem permissão de escrita, ou compra cancelada): nenhum campo muda, nenhum timer, nenhuma chamada.

export type EstadoSalvamento = "ocioso" | "pendente" | "salvando" | "salvo" | "erro" | "conflito";

export interface ApiCompra {
  obter: (id: string) => Promise<Compra>;
  salvar: (id: string, corpo: CompraSalvarDTO) => Promise<Compra>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

const apiPadrao: ApiCompra = {
  obter: (id) => apiFetch<Compra>(`/api/compras/${encodeURIComponent(id)}`, undefined, "Não foi possível carregar a compra."),
  salvar: (id, corpo) =>
    apiFetch<Compra>(`/api/compras/${encodeURIComponent(id)}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(corpo) }, "Não foi possível salvar."),
};

export const DEBOUNCE_SALVAR_MS = 800;
/** Esperas antes de cada nova tentativa automática depois de uma falha de rede ou 5xx (3 tentativas). */
export const RECUO_TENTATIVAS_MS: readonly number[] = [2000, 5000, 10000];

/** Por que o editor parou em "conflito": `codigo` é o `data.code` do 409 (null = alguém salvou antes), `mensagem` a do servidor, se houver. */
export interface ConflitoEditor {
  codigo: string | null;
  mensagem: string | null;
}

export interface OpcoesCompraEditor {
  api?: ApiCompra;
  /** true = ninguém edita (conta sem permissão de escrita). Lido a cada uso (a permissão pode carregar depois). */
  somenteLeitura: () => boolean;
  /** Chamado com a compra que o servidor devolveu depois de cada salvamento bem-sucedido (a lista do mês se atualiza com ela). */
  aoSalvar?: (compra: Compra) => void;
  debounceMs?: number;
  recuoMs?: readonly number[];
  /** Relógio (testes). */
  agora?: () => Date;
}

export interface CompraEditor {
  compra: Ref<Compra | null>;
  estado: Ref<EstadoSalvamento>;
  /** Quando o último salvamento terminou. */
  salvoEm: Ref<Date | null>;
  /** A mensagem do servidor quando ele recusou o salvamento (4xx). */
  mensagemErro: Ref<string | null>;
  /** Acabaram as tentativas automáticas (ou o erro não se repete sozinho): só o clique salva de novo. */
  esperandoClique: Ref<boolean>;
  /** Quando `estado` é "conflito": o motivo (a faixa de conflito mostra a mensagem e decide as saídas). */
  conflito: Ref<ConflitoEditor | null>;
  /** Nenhum campo é editável (sem permissão, ou compra cancelada, ou nenhuma compra aberta). */
  somenteLeituraAgora: ComputedRef<boolean>;
  /** Há algo ainda não salvo (ou salvando, ou com falha): é o que o aviso de "sair da página" olha. */
  temPendencia: ComputedRef<boolean>;
  carregar: (id: string) => Promise<Compra>;
  definir: (compra: Compra | null) => void;
  alterar: (mudancas: MudancasCompra) => void;
  flush: () => Promise<boolean>;
  tentarDeNovo: () => Promise<void>;
  carregarVersaoSalva: () => Promise<void>;
  manterMinhas: () => Promise<void>;
  /** Para o salvamento e abre a faixa de conflito (quem soube do 409 por outro caminho, como o Encaminhar). Nada local some. */
  sinalizarConflito: (motivo?: ConflitoEditor) => void;
}

export function useCompraEditor(opcoes: OpcoesCompraEditor): CompraEditor {
  const api = opcoes.api ?? apiPadrao;
  const debounceMs = opcoes.debounceMs ?? DEBOUNCE_SALVAR_MS;
  const recuo = opcoes.recuoMs ?? RECUO_TENTATIVAS_MS;
  const agora = opcoes.agora ?? ((): Date => new Date());

  const compra = ref<Compra | null>(null);
  const estado = ref<EstadoSalvamento>("ocioso");
  const salvoEm = ref<Date | null>(null);
  const mensagemErro = ref<string | null>(null);
  const esperandoClique = ref(false);
  const conflito = ref<ConflitoEditor | null>(null);
  /** Mudou, não salvou? (contadores: `versao` sobe a cada mudança; `versaoSalva` é a do último PATCH que passou). */
  const versao = ref(0);
  const versaoSalva = ref(0);

  let atualizadoEm = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let emVoo: Promise<void> | null = null;
  let sujo = false;
  let tentativasAutomaticas = 0;
  // Cada compra carregada leva um número: o resultado de um salvamento/leitura de uma compra que já foi trocada é descartado.
  let geracao = 0;

  const sujoPendente = computed(() => versao.value !== versaoSalva.value);
  const somenteLeituraAgora = computed(() => opcoes.somenteLeitura() || compra.value === null || compra.value.cancelada);
  const temPendencia = computed(
    () => !somenteLeituraAgora.value && (sujoPendente.value || estado.value === "salvando" || estado.value === "erro" || estado.value === "conflito"),
  );

  // Direto da fonte (não do computed): a permissão pode mudar sem que um ref do editor mude.
  const podeSalvar = (): boolean => !opcoes.somenteLeitura() && compra.value !== null && !compra.value.cancelada;
  // Lê o estado sem o estreitamento de tipo do compilador (ele muda dentro dos `await`).
  const estadoAtual = (): EstadoSalvamento => estado.value;

  function limparTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function agendar(espera: number): void {
    limparTimer();
    timer = setTimeout(() => {
      timer = null;
      void executar();
    }, espera);
  }

  function executar(): Promise<void> {
    if (emVoo) {
      sujo = true; // o que está em curso, ao terminar, vê isto e salva de novo (nunca dois PATCH juntos)
      return emVoo;
    }
    const minha: Promise<void> = ciclo().finally(() => {
      if (emVoo === minha) emVoo = null;
    });
    emVoo = minha;
    return minha;
  }

  function aposFalha(e: unknown): void {
    if (e instanceof ApiError && e.status === 409) {
      estado.value = "conflito";
      return;
    }
    estado.value = "erro";
    const recusa = e instanceof ApiError && e.status >= 400 && e.status < 500;
    if (recusa) {
      // O servidor recusou o dado (400/403/404/422): repetir igual não adianta. Espera o clique e mostra a mensagem dele.
      mensagemErro.value = (e as ApiError).message;
      esperandoClique.value = true;
      return;
    }
    mensagemErro.value = null;
    if (tentativasAutomaticas < recuo.length) {
      agendar(recuo[tentativasAutomaticas] ?? 0);
      tentativasAutomaticas += 1;
    } else {
      esperandoClique.value = true;
    }
  }

  async function ciclo(): Promise<void> {
    for (;;) {
      const atual = compra.value;
      if (!atual || !podeSalvar() || estado.value === "conflito" || versao.value === versaoSalva.value) return;

      const minhaGeracao = geracao;
      const instantaneo = versao.value;
      sujo = false;
      estado.value = "salvando";
      try {
        const salvo = await api.salvar(atual.id, corpoParaSalvar(atual, atualizadoEm));
        if (minhaGeracao !== geracao) return; // outra compra foi aberta no meio: este resultado não é desta tela
        atualizadoEm = salvo.updatedAt;
        if (compra.value) compra.value = { ...compra.value, updatedAt: salvo.updatedAt, atualizadoPor: salvo.atualizadoPor };
        versaoSalva.value = instantaneo;
        tentativasAutomaticas = 0;
        esperandoClique.value = false;
        mensagemErro.value = null;
        salvoEm.value = agora();
        opcoes.aoSalvar?.(salvo);
      } catch (e) {
        if (minhaGeracao !== geracao) return;
        aposFalha(e);
        return;
      }

      if (versao.value === versaoSalva.value) {
        estado.value = "salvo";
        return;
      }
      // Mudou durante o salvamento. Se já há um debounce marcado, ele salva; senão salva já (não deixa pendente à toa).
      if (timer !== null && !sujo) {
        estado.value = "pendente";
        return;
      }
    }
  }

  function definir(nova: Compra | null): void {
    limparTimer();
    geracao += 1;
    compra.value = nova;
    atualizadoEm = nova?.updatedAt ?? "";
    versao.value = 0;
    versaoSalva.value = 0;
    sujo = false;
    tentativasAutomaticas = 0;
    esperandoClique.value = false;
    mensagemErro.value = null;
    conflito.value = null;
    estado.value = "ocioso";
    emVoo = null;
  }

  async function carregar(id: string): Promise<Compra> {
    const lida = await api.obter(id);
    definir(lida);
    return lida;
  }

  function alterar(mudancas: MudancasCompra): void {
    if (!compra.value || !podeSalvar()) return;
    const nova = { ...compra.value, ...mudancas };
    // Courier Simples da compra NÃO é campo editável: é sempre derivado dos envios das ordens e sincronizado a cada mudança delas.
    if (mudancas.ordens) nova.courierSimples = courierSimplesDasOrdens(nova.ordens);
    compra.value = nova;
    versao.value += 1;
    tentativasAutomaticas = 0;
    esperandoClique.value = false;
    if (estado.value === "conflito") return; // o estado local muda, mas nada é salvo até a pessoa escolher
    estado.value = emVoo ? "salvando" : "pendente";
    agendar(debounceMs);
  }

  async function flush(): Promise<boolean> {
    limparTimer();
    while (emVoo) await emVoo;
    if (!podeSalvar()) return true;
    if (estado.value === "conflito") return false;
    if (versao.value === versaoSalva.value) return estado.value !== "erro";
    await executar();
    const depois = estadoAtual(); // o estado pode ter mudado durante o salvamento
    return versao.value === versaoSalva.value && depois !== "conflito" && depois !== "erro";
  }

  async function tentarDeNovo(): Promise<void> {
    if (!compra.value || !podeSalvar() || estado.value === "conflito") return;
    limparTimer();
    tentativasAutomaticas = 0;
    esperandoClique.value = false;
    if (versao.value === versaoSalva.value) versao.value += 1; // nada pendente, mas a pessoa pediu: regrava o estado atual
    await executar();
  }

  function sinalizarConflito(motivo: ConflitoEditor = { codigo: null, mensagem: null }): void {
    if (!compra.value) return;
    limparTimer();
    conflito.value = motivo;
    estado.value = "conflito";
  }

  async function carregarVersaoSalva(): Promise<void> {
    const id = compra.value?.id;
    if (!id) return;
    await carregar(id);
  }

  async function manterMinhas(): Promise<void> {
    const atual = compra.value;
    if (!atual) return;
    const naBase = await api.obter(atual.id);
    if (compra.value?.id !== atual.id) return;
    atualizadoEm = naBase.updatedAt; // o meu estado local vai por cima, mas com a versão que está valendo agora
    conflito.value = null;
    estado.value = "ocioso";
    versao.value += 1;
    await executar();
  }

  return {
    compra,
    estado,
    salvoEm,
    mensagemErro,
    esperandoClique,
    conflito,
    somenteLeituraAgora,
    temPendencia,
    carregar,
    definir,
    alterar,
    flush,
    tentarDeNovo,
    carregarVersaoSalva,
    manterMinhas,
    sinalizarConflito,
  };
}
