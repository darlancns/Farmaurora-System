<script setup lang="ts">
import {
  aumentarNumeroRemessa,
  diminuirNumeroRemessa,
  finalizarNumeroRemessa,
  mascararNumeroRemessa,
  podeAumentarNumeroRemessa,
  podeDiminuirNumeroRemessa,
} from "#shared/utils/numeroRemessa";
import { INPUT_STEPPER_CLASS } from "../../utils/processoFormClasses";

// Input de QUANTIDADE do Nº Remessa: botão "−", campo numérico e botão "+". A regra (mínimo 1, máximo 2147483647, só
// dígitos, sem zeros à esquerda, vazio/0 → 1) vive em shared/utils/numeroRemessa.ts; aqui só liga a tela a ela.
// O valor é o TEXTO do campo (o formulário guarda string). O rótulo (<label for=id>) fica com quem usa.
const props = defineProps<{
  id: string;
  modelValue: string;
  // Texto que entra nos aria-labels dos botões: "Diminuir <rotulo>" e "Aumentar <rotulo>".
  rotulo: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const podeDiminuir = () => podeDiminuirNumeroRemessa(props.modelValue);
const podeAumentar = () => podeAumentarNumeroRemessa(props.modelValue);

function diminuir(): void {
  if (podeDiminuir()) emit("update:modelValue", diminuirNumeroRemessa(props.modelValue));
}

function aumentar(): void {
  if (podeAumentar()) emit("update:modelValue", aumentarNumeroRemessa(props.modelValue));
}

// Digitar/colar: só dígitos, sem zeros à esquerda, até 10 dígitos. O texto filtrado é escrito de volta no campo, com o
// cursor no lugar certo (nada de pular para o fim).
function onInput(event: Event): void {
  const alvo = event.target as HTMLInputElement;
  const { valor, cursor } = mascararNumeroRemessa(alvo.value, alvo.selectionStart);
  emit("update:modelValue", valor);
  if (alvo.value !== valor) {
    alvo.value = valor;
    try {
      alvo.setSelectionRange(cursor, cursor);
    } catch {
      // sem seleção (campo fora do DOM): nada a restaurar
    }
  }
}

// Ao sair do campo vazio ou 0, vira 1.
function onBlur(event: Event): void {
  const texto = (event.target as HTMLInputElement).value; // o que está no campo agora (o `v-model` pode ainda não ter re-renderizado)
  const final = finalizarNumeroRemessa(texto);
  if (final !== props.modelValue || final !== texto) emit("update:modelValue", final);
  if (final !== texto) (event.target as HTMLInputElement).value = final;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    aumentar();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    diminuir();
  }
}

// Botões de 40px (mínimo) abaixo de lg; em lg+ ficam do tamanho do campo (mesma altura, sem mexer na linha).
const BOTAO_CLASS =
  "flex min-h-11 w-10 shrink-0 items-center justify-center rounded-md border border-hairline bg-paper text-[18px] leading-none text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark focus-visible:outline-2 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-ink-soft lg:min-h-auto lg:w-8";
</script>

<template>
  <div class="flex items-stretch gap-1">
    <button
      :id="`${id}-menos`"
      type="button"
      :class="BOTAO_CLASS"
      :aria-label="`Diminuir ${rotulo}`"
      :disabled="!podeDiminuir()"
      @click="diminuir"
    >
      <span aria-hidden="true">−</span>
    </button>
    <input
      :id="id"
      data-sem-maiuscula
      :value="modelValue"
      type="text"
      inputmode="numeric"
      maxlength="10"
      autocomplete="off"
      :class="INPUT_STEPPER_CLASS"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <button
      :id="`${id}-mais`"
      type="button"
      :class="BOTAO_CLASS"
      :aria-label="`Aumentar ${rotulo}`"
      :disabled="!podeAumentar()"
      @click="aumentar"
    >
      <span aria-hidden="true">+</span>
    </button>
  </div>
</template>
