<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { telaLargaAgora } from "../utils/telaLarga";
import { INPUT_CLASS } from "../utils/processoFormClasses";

// Combobox com BUSCA (acessível): digita, espera 250 ms, busca no servidor e mostra as sugestões. Genérico: quem usa decide o que
// buscar (`buscar`) e o que fazer com a escolha (`escolher`) ou com o texto que não casou com nada (`novo`).
//
//  - role="combobox" no <input> (aria-expanded, aria-controls, aria-activedescendant) e role="listbox" na lista.
//  - Teclado: setas movem o destaque; Enter escolhe o destacado (sem destaque: a 1ª sugestão ou, se não há, "Usar “texto”");
//    Esc fecha; Tab sai SEM escolher (e o texto digitado segue a regra de sair do campo, abaixo).
//  - Resposta fora de ordem não sobrescreve a mais recente: cada busca leva um número (e um AbortSignal, cancelado quando chega outra).
//  - Ao SAIR do campo com texto diferente do valor: com `permitirNovo` o texto vira `novo` (a mesma regra de "Usar “X”"); sem ele, o
//    campo volta ao valor de antes. Campo esvaziado avisa `limpar`.
//  - Mínimo de 1 caractere para buscar; "Carregando…" e "Nada encontrado" na lista.
//  - CELULAR: ao focar o campo ele rola para o meio da tela (o teclado e a barra de navegação do app não cobrem a lista) e a lista abre para
//    o lado que tem mais espaço visível (para baixo ou para cima), com altura máxima ajustada a esse espaço e rolagem própria.
export interface OpcaoBusca {
  valor: string;
  rotulo: string;
  /** Qualquer dado extra que quem usa queira receber de volta na escolha (ex.: a temperatura do medicamento). */
  extra?: unknown;
}

const props = withDefaults(
  defineProps<{
    /** O texto mostrado no campo (o valor já escolhido). */
    modelValue: string;
    buscar: (q: string, sinal: AbortSignal) => Promise<OpcaoBusca[]>;
    id: string;
    placeholder?: string;
    disabled?: boolean;
    /** Oferece a opção "Usar “texto”" (e trata o texto solto ao sair do campo). */
    permitirNovo?: boolean;
    rotuloNovo?: (texto: string) => string;
    debounceMs?: number;
    minimo?: number;
    ariaLabel?: string;
  }>(),
  {
    placeholder: "",
    disabled: false,
    permitirNovo: false,
    rotuloNovo: (texto: string) => `Usar “${texto}”`,
    debounceMs: 250,
    minimo: 1,
    ariaLabel: undefined,
  },
);

const emit = defineEmits<{
  escolher: [opcao: OpcaoBusca];
  novo: [texto: string];
  limpar: [];
  digitar: [texto: string];
}>();

const texto = ref(props.modelValue);
const aberto = ref(false);
const carregando = ref(false);
const erroBusca = ref(false);
const resultados = ref<OpcaoBusca[]>([]);
const destaque = ref(-1);
const raiz = ref<HTMLElement | null>(null);
const opcaoRefs = ref<(HTMLElement | null)[]>([]);
// Onde e quão alta a lista abre (calculado ao abrir, pelo espaço visível: o teclado do celular encolhe a área visível).
const paraCima = ref(false);
const alturaMaxima = ref(224);

let temporizador: ReturnType<typeof setTimeout> | null = null;
let numeroBusca = 0;
let controlador: AbortController | null = null;
// Enter apertado antes da busca terminar: espera o resultado e só então escolhe (senão viraria "Usar X" por pressa).
let enterPendente = false;

const listaId = computed(() => `${props.id}-listbox`);
const idOpcao = (i: number): string => `${props.id}-opcao-${i}`;

const textoLimpo = computed(() => texto.value.trim().replace(/\s+/g, " "));
const chave = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

// A opção "Usar “X”" só aparece quando X não é exatamente uma das sugestões.
const mostrarNovo = computed(() => props.permitirNovo && textoLimpo.value !== "" && !resultados.value.some((r) => chave(r.rotulo) === chave(textoLimpo.value)));
const totalOpcoes = computed(() => resultados.value.length + (mostrarNovo.value ? 1 : 0));

// O valor de fora mudou (outra compra, escolha aplicada): o campo mostra o novo texto.
watch(
  () => props.modelValue,
  (novo) => {
    texto.value = novo;
  },
);

const ALTURA_MAXIMA_LISTA = 224;
const ALTURA_MINIMA_LISTA = 96;
const RESERVA_BARRA_INFERIOR_PX = 72; // a barra de navegação do app (60px) + folga, só no celular

/** Decide se a lista abre para baixo ou para cima e a altura máxima, pelo espaço que está VISÍVEL (visualViewport: sem o teclado). */
function posicionarLista(): void {
  const campo = raiz.value?.querySelector("input");
  if (!campo || typeof window === "undefined") return;
  const caixa = campo.getBoundingClientRect();
  const vv = window.visualViewport;
  const topoVisivel = vv ? vv.offsetTop : 0;
  const fundoVisivel = topoVisivel + (vv ? vv.height : window.innerHeight);
  const reserva = telaLargaAgora() ? 8 : RESERVA_BARRA_INFERIOR_PX;
  const abaixo = fundoVisivel - caixa.bottom - reserva;
  const acima = caixa.top - topoVisivel - 8;
  const limitar = (v: number): number => Math.round(Math.min(ALTURA_MAXIMA_LISTA, Math.max(ALTURA_MINIMA_LISTA, v)));
  if (abaixo >= 160 || abaixo >= acima) {
    paraCima.value = false;
    alturaMaxima.value = limitar(abaixo);
  } else {
    paraCima.value = true;
    alturaMaxima.value = limitar(acima);
  }
}

watch(aberto, (agoraAberto) => {
  if (agoraAberto) void nextTick(posicionarLista);
});

function cancelarBusca(): void {
  if (temporizador !== null) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  controlador?.abort();
  controlador = null;
  numeroBusca += 1; // a resposta que ainda estiver a caminho é descartada
  enterPendente = false;
}

async function executarBusca(q: string): Promise<void> {
  controlador?.abort();
  const meu = ++numeroBusca;
  const c = new AbortController();
  controlador = c;
  carregando.value = true;
  erroBusca.value = false;
  try {
    const achados = await props.buscar(q, c.signal);
    if (meu !== numeroBusca) return; // chegou depois de uma busca mais nova: descarta
    resultados.value = achados;
    destaque.value = -1;
    if (enterPendente) {
      enterPendente = false;
      aplicarEnter();
    }
  } catch {
    if (meu !== numeroBusca) return;
    resultados.value = [];
    erroBusca.value = true;
    if (enterPendente) {
      enterPendente = false;
      aplicarEnter();
    }
  } finally {
    if (meu === numeroBusca) carregando.value = false;
  }
}

function aoDigitar(event: Event): void {
  if (props.disabled) return;
  texto.value = (event.target as HTMLInputElement).value;
  emit("digitar", texto.value);
  cancelarBusca();
  destaque.value = -1;
  resultados.value = []; // nada de sugestão velha: o Enter nunca escolhe o que era do texto de antes
  if (textoLimpo.value.length < props.minimo) {
    aberto.value = false;
    resultados.value = [];
    carregando.value = false;
    return;
  }
  aberto.value = true;
  carregando.value = true;
  const q = textoLimpo.value;
  temporizador = setTimeout(() => {
    temporizador = null;
    void executarBusca(q);
  }, props.debounceMs);
}

function fechar(): void {
  aberto.value = false;
  destaque.value = -1;
}

function escolherIndice(i: number): void {
  if (i < resultados.value.length) {
    const opcao = resultados.value[i];
    if (!opcao) return;
    cancelarBusca();
    texto.value = opcao.rotulo;
    fechar();
    emit("escolher", opcao);
    return;
  }
  usarTexto();
}

function usarTexto(): void {
  if (!props.permitirNovo || textoLimpo.value === "") return;
  const t = textoLimpo.value;
  cancelarBusca();
  texto.value = t;
  fechar();
  emit("novo", t);
}

/** Enter sem seleção: o destacado; senão a 1ª sugestão; senão "Usar “texto”". */
function aplicarEnter(): void {
  if (destaque.value >= 0) escolherIndice(destaque.value);
  else if (resultados.value.length > 0) escolherIndice(0);
  else usarTexto();
}

function mover(delta: number): void {
  if (totalOpcoes.value === 0) return;
  destaque.value = Math.min(Math.max(destaque.value + delta, 0), totalOpcoes.value - 1);
  void nextTick(() => opcaoRefs.value[destaque.value]?.scrollIntoView?.({ block: "nearest" }));
}

function aoTeclar(event: KeyboardEvent): void {
  if (props.disabled) return;
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      if (!aberto.value && textoLimpo.value.length >= props.minimo) {
        aberto.value = true;
        void executarBusca(textoLimpo.value);
      } else mover(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      mover(-1);
      break;
    case "Enter":
      if (!aberto.value) return;
      event.preventDefault();
      if (carregando.value) {
        // A busca ainda não voltou: pula o resto do debounce e escolhe quando ela voltar.
        enterPendente = true;
        if (temporizador !== null) {
          clearTimeout(temporizador);
          temporizador = null;
          void executarBusca(textoLimpo.value);
        }
      } else aplicarEnter();
      break;
    case "Escape":
      if (aberto.value) {
        event.preventDefault();
        fechar();
      }
      break;
    case "Tab":
      fechar(); // sai sem escolher
      break;
  }
}

function aoSair(): void {
  // Sair do campo é "sem escolher" (Tab ou clique fora): o que foi digitado segue a regra do campo.
  cancelarBusca();
  carregando.value = false;
  fechar();
  if (textoLimpo.value === props.modelValue.trim().replace(/\s+/g, " ")) {
    texto.value = props.modelValue;
    return;
  }
  if (textoLimpo.value === "") {
    emit("limpar");
    return;
  }
  if (props.permitirNovo) emit("novo", textoLimpo.value);
  else texto.value = props.modelValue; // não aceita texto solto: volta ao que estava escolhido
}

function aoFocar(): void {
  if (props.disabled) return;
  // No celular o campo vai para o meio da tela (depois de o teclado subir), para a lista não ficar sob ele nem sob a barra de baixo.
  if (!telaLargaAgora()) {
    setTimeout(() => raiz.value?.querySelector('input')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 250);
  }
  if (textoLimpo.value.length >= props.minimo && resultados.value.length > 0) aberto.value = true;
}

onBeforeUnmount(cancelarBusca);
</script>

<template>
  <div ref="raiz" class="relative">
    <input
      :id="id"
      type="text"
      role="combobox"
      autocomplete="off"
      :class="INPUT_CLASS"
      :value="texto"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-label="ariaLabel"
      aria-autocomplete="list"
      :aria-expanded="aberto"
      :aria-controls="listaId"
      :aria-activedescendant="aberto && destaque >= 0 ? idOpcao(destaque) : undefined"
      @input="aoDigitar"
      @keydown="aoTeclar"
      @blur="aoSair"
      @focus="aoFocar"
    />
    <ul
      v-if="aberto"
      :id="listaId"
      role="listbox"
      class="absolute z-50 w-full min-w-[12rem] overflow-y-auto overscroll-contain rounded-md border border-hairline bg-paper-raised py-1 text-[16px] shadow-lg lg:text-[13.5px]"
      :class="paraCima ? 'bottom-full mb-1' : 'mt-1'"
      :style="{ maxHeight: `${alturaMaxima}px` }"
    >
      <li v-if="carregando" role="presentation" class="px-2.5 py-2 text-ink-soft"><span role="status">Carregando…</span></li>
      <li v-else-if="erroBusca" role="presentation" class="px-2.5 py-2 text-danger"><span role="status">Não foi possível buscar.</span></li>
      <li v-else-if="resultados.length === 0" role="presentation" class="px-2.5 py-2 text-ink-soft"><span role="status">Nada encontrado</span></li>
      <li
        v-for="(opcao, i) in resultados"
        :id="idOpcao(i)"
        :key="opcao.valor"
        :ref="(el) => (opcaoRefs[i] = el as HTMLElement | null)"
        role="option"
        :aria-selected="i === destaque"
        class="cursor-pointer px-2.5 py-2.5 transition-colors lg:py-2"
        :class="i === destaque ? 'bg-paper text-accent-dark' : 'text-ink'"
        @mousedown.prevent="escolherIndice(i)"
        @mouseenter="destaque = i"
      >
        {{ opcao.rotulo }}
      </li>
      <li
        v-if="mostrarNovo && !carregando"
        :id="idOpcao(resultados.length)"
        :ref="(el) => (opcaoRefs[resultados.length] = el as HTMLElement | null)"
        role="option"
        data-opcao-novo
        :aria-selected="destaque === resultados.length"
        class="cursor-pointer border-t border-hairline px-2.5 py-2.5 font-semibold transition-colors lg:py-2"
        :class="destaque === resultados.length ? 'bg-paper text-accent-dark' : 'text-ink'"
        @mousedown.prevent="escolherIndice(resultados.length)"
        @mouseenter="destaque = resultados.length"
      >
        {{ rotuloNovo(textoLimpo) }}
      </li>
    </ul>
  </div>
</template>
