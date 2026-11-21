<script setup lang="ts">
import { ref, watch } from "vue";
import { COMPRA_MAX_ORDENS } from "#shared/constants/compra";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import { NUMERO_REMESSA_ERRO } from "#shared/utils/numeroRemessa";
import { INPUT_CLASS } from "../../utils/processoFormClasses";
import ProcessoRemessaStepper from "../processos/ProcessoRemessaStepper.vue";
import CompraCampo from "./CompraCampo.vue";
import { ROTULOS_DO_FORMULARIO } from "../../utils/comprasRotulos";

// A linha "Ordens" (a 5ª, logo depois da Quantidade): o MESMO stepper do Nº Ordem do Follow-Up (ProcessoRemessaStepper, sem alterá-lo). A compra
// guarda um NÚMERO de 1 a COMPRA_MAX_ORDENS; o stepper trabalha com o TEXTO do campo, então aqui o número vira texto e o texto vira número.
// Fora de 1..10 (ex.: 11, que o stepper em si aceitaria) NADA é gravado: aparece NUMERO_REMESSA_ERRO ligado ao campo e, ao sair do campo,
// ele volta ao último número válido. Vazio ou 0 vira 1 (a regra do stepper ao sair do campo).
const props = defineProps<{ compra: Compra; desabilitado: boolean }>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const ID = "compra-ordens";
const texto = ref(String(props.compra.numeroOrdens));
const erro = ref<string | null>(null);

// O número mudou de fora (outra compra, versão salva carregada): o campo mostra o novo, salvo enquanto há um texto inválido em edição.
watch(
  () => props.compra.numeroOrdens,
  (n) => {
    if (erro.value === null && texto.value !== String(n)) texto.value = String(n);
  },
);
watch(
  () => props.compra.id,
  () => {
    erro.value = null;
    texto.value = String(props.compra.numeroOrdens);
  },
);

// O stepper não repassa atributos ao <input>: a ligação campo → mensagem (aria-describedby) é posta aqui, depois de cada desenho.
watch(
  erro,
  (mensagem) => {
    const campo = document.getElementById(ID);
    if (!campo) return;
    if (mensagem === null) campo.removeAttribute("aria-describedby");
    else campo.setAttribute("aria-describedby", "compra-linha-ordens-erro");
  },
  { flush: "post" },
);

function aoMudar(novo: string): void {
  texto.value = novo;
  const n = /^\d+$/.test(novo) ? Number(novo) : Number.NaN;
  if (!Number.isInteger(n) || n < 1 || n > COMPRA_MAX_ORDENS) {
    erro.value = NUMERO_REMESSA_ERRO;
    return;
  }
  erro.value = null;
  if (n !== props.compra.numeroOrdens) emit("alterar", { numeroOrdens: n });
}

// Saiu do campo com um número inválido: volta ao último válido (o que está salvo).
function aoSair(): void {
  if (erro.value === null) return;
  erro.value = null;
  texto.value = String(props.compra.numeroOrdens);
}
</script>

<template>
  <CompraCampo id-linha="ordens" :rotulo="ROTULOS_DO_FORMULARIO.ordens" :para="ID" :erro="erro">
    <div class="max-w-[9rem]" @focusout="aoSair">
      <!-- Só leitura: o stepper não tem a propriedade `disabled` (e não se mexe nele, ele é do Follow-Up): mostra-se o número num campo desabilitado. -->
      <input v-if="desabilitado" :id="ID" type="text" :value="texto" disabled data-sem-maiuscula :class="INPUT_CLASS" />
      <ProcessoRemessaStepper v-else :id="ID" :model-value="texto" rotulo="Ordens" @update:model-value="aoMudar" />
    </div>
  </CompraCampo>
</template>
