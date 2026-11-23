<script setup lang="ts">
import { ref, watch } from "vue";
import { COMPRA_NUMERO_MAX } from "#shared/constants/compra";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import { NUMERO_DA_COMPRA_ERRO } from "#shared/utils/compraValidacao";
import { INPUT_CLASS } from "../../utils/processoFormClasses";
import CompraCampo from "./CompraCampo.vue";
import { ROTULOS_DO_FORMULARIO } from "../../utils/comprasRotulos";

// A 1ª linha do formulário: "Nº da compra" (o número que o time combina; aparece no título e na 1ª linha do resumo). Inteiro de 1 a 9999, obrigatório,
// EDITÁVEL depois de criada. O valor só é aplicado ao SAIR do campo (ou no Enter): digitar "14" passa por "1", e o autosave não pode tentar o número 1 no meio
// do caminho. Texto inválido (vazio, 0) mostra o erro no campo e NÃO é gravado. Número repetido: o servidor devolve 409 e o erro dele (`erroDoServidor`) aparece
// aqui, sem perder o que foi digitado (o campo segue com o texto da pessoa até ela trocar o número).
const props = defineProps<{ compra: Compra; desabilitado: boolean; erroDoServidor?: string | null }>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const ID = "compra-numero";
const texto = ref(String(props.compra.sequencia));
const erroLocal = ref<string | null>(null);

// O número mudou de fora (outra compra aberta, versão salva carregada): o campo mostra o novo, salvo enquanto a pessoa está no meio de uma edição com erro.
watch(
  () => props.compra.sequencia,
  (n) => {
    if (erroLocal.value === null && props.erroDoServidor == null && texto.value !== String(n)) texto.value = String(n);
  },
);
watch(
  () => props.compra.id,
  () => {
    erroLocal.value = null;
    texto.value = String(props.compra.sequencia);
  },
);

function aoDigitar(event: Event): void {
  const campo = event.target as HTMLInputElement;
  const limpo = campo.value.replace(/\D/g, ""); // só dígitos
  if (limpo !== campo.value) campo.value = limpo;
  texto.value = limpo;
  erroLocal.value = null;
}

/** Ao sair do campo (change) ou no Enter: valida e, se mudou, aplica. */
function aplicar(): void {
  const n = /^\d+$/.test(texto.value) ? Number(texto.value) : Number.NaN;
  if (!Number.isInteger(n) || n < 1 || n > COMPRA_NUMERO_MAX) {
    erroLocal.value = NUMERO_DA_COMPRA_ERRO;
    return;
  }
  erroLocal.value = null;
  if (n !== props.compra.sequencia) emit("alterar", { sequencia: n });
}

function aoTeclar(event: KeyboardEvent): void {
  if (event.key !== "Enter") return;
  event.preventDefault(); // não envia nada: só aplica o número
  aplicar();
}
</script>

<template>
  <CompraCampo id-linha="titulo" :rotulo="ROTULOS_DO_FORMULARIO.titulo" :para="ID" :erro="erroLocal ?? erroDoServidor ?? null">
    <input
      :id="ID"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      maxlength="4"
      data-sem-maiuscula
      :value="texto"
      :disabled="desabilitado"
      :aria-invalid="erroLocal ?? erroDoServidor ? 'true' : undefined"
      :aria-describedby="erroLocal ?? erroDoServidor ? 'compra-linha-titulo-erro' : undefined"
      :class="INPUT_CLASS"
      @input="aoDigitar"
      @change="aplicar"
      @keydown="aoTeclar"
    />
  </CompraCampo>
</template>
