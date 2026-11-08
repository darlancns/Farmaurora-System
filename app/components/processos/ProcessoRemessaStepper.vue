<script setup lang="ts">
import {
  aumentarNumeroRemessa,
  diminuirNumeroRemessa,
  finalizarNumeroRemessa,
  mascararNumeroRemessa,
  podeAumentarNumeroRemessa,
  podeDiminuirNumeroRemessa,
} from "#shared/utils/numeroRemessa";
import {
  STEPPER_CAMPO_CLASS,
  STEPPER_COLUNA_CLASS,
  STEPPER_INPUT_CLASS,
  STEPPER_SETA_CLASS,
} from "../../utils/processoFormClasses";

// Input de QUANTIDADE do Nº Remessa: um campo só, com o número à esquerda e, à direita DENTRO da borda, duas setas empilhadas
// (▲ aumenta, ▼ diminui), no estilo das setas de um campo numérico — mas nossas, iguais em todos os navegadores. A regra (mínimo 1, máximo 2147483647, só
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

</script>

<template>
  <div :class="STEPPER_CAMPO_CLASS">
    <input
      :id="id"
      data-sem-maiuscula
      :value="modelValue"
      type="text"
      inputmode="numeric"
      maxlength="10"
      autocomplete="off"
      :class="STEPPER_INPUT_CLASS"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <!-- As setas não entram no Tab (o teclado usa ArrowUp/ArrowDown no campo, como num campo numérico) e o mousedown
         não tira o foco do campo. Cada uma ocupa a largura da coluna (32px) e metade da altura do campo. -->
    <div :class="STEPPER_COLUNA_CLASS">
      <button
        :id="`${id}-mais`"
        type="button"
        tabindex="-1"
        :class="STEPPER_SETA_CLASS"
        :aria-label="`Aumentar ${rotulo}`"
        :disabled="!podeAumentar()"
        @mousedown.prevent
        @click="aumentar"
      >
        <svg viewBox="0 0 20 20" class="h-2.5 w-2.5" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.5L10 7l5.5 5.5" />
        </svg>
      </button>
      <button
        :id="`${id}-menos`"
        type="button"
        tabindex="-1"
        :class="STEPPER_SETA_CLASS"
        :aria-label="`Diminuir ${rotulo}`"
        :disabled="!podeDiminuir()"
        @mousedown.prevent
        @click="diminuir"
      >
        <svg viewBox="0 0 20 20" class="h-2.5 w-2.5" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 7.5L10 13l5.5-5.5" />
        </svg>
      </button>
    </div>
  </div>
</template>
