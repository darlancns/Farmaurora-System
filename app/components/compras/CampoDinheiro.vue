<script setup lang="ts">
import { ref, watch } from "vue";
import { dinheiroDoTexto, dinheiroParaTexto } from "../../utils/comprasDinheiro";
import { formatInvoiceAmountBR } from "../../utils/formatters";
import { INPUT_MONO_CLASS } from "../../utils/processoFormClasses";

// Campo de dinheiro em US$ (mono): o texto digitado fica no campo (nada de reescrever enquanto se digita) e o valor sai como número
// ou null. Vazio = null; "0" = 0. Ao sair do campo o texto vira "1.234,50". Colar "$8,550.00" ou "8.550,00" funciona.
const props = defineProps<{
  modelValue: number | null;
  id: string;
  disabled?: boolean;
  ariaLabel?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [valor: number | null] }>();

const texto = ref(dinheiroParaTexto(props.modelValue));

// O valor mudou de fora (outra compra, versão salva carregada): o campo mostra o novo. Não mexe enquanto o texto já vale o mesmo.
watch(
  () => props.modelValue,
  (valor) => {
    if (dinheiroDoTexto(texto.value) !== valor) texto.value = dinheiroParaTexto(valor);
  },
);

function aoDigitar(event: Event): void {
  texto.value = (event.target as HTMLInputElement).value;
  emit("update:modelValue", dinheiroDoTexto(texto.value));
}

function aoSair(): void {
  if (texto.value.trim() !== "") texto.value = formatInvoiceAmountBR(texto.value);
}
</script>

<template>
  <input
    :id="id"
    type="text"
    inputmode="decimal"
    maxlength="17"
    autocomplete="off"
    placeholder="0,00"
    :class="INPUT_MONO_CLASS"
    :value="texto"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @input="aoDigitar"
    @blur="aoSair"
  />
</template>
