<script setup lang="ts">
import { ref, watch } from "vue";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import { CHECKBOX_CLASS } from "../../utils/comprasEstilos";
import { INPUT_CLASS, INPUT_MONO_CLASS } from "../../utils/processoFormClasses";
import CompraCampo from "./CompraCampo.vue";
import { ROTULOS_DO_FORMULARIO } from "../../utils/comprasRotulos";

// As linhas 25 a 29 do formulário (a ordem do resumo): Número do processo (+ "Compra particular"), Médico, Local de aplicação, Entrega (Doctor/AJC)
// (+ "Mesmo local") e Contatos. Todos texto livre.
//
// "Mesmo local" é uma conveniência da tela, SEM coluna no banco: marcada, a Entrega copia o local a cada digitação e fica desabilitada. O estado
// inicial é marcada quando entrega === local e não vazio; desmarcar deixa a entrega como está, editável.
const props = defineProps<{ compra: Compra; desabilitado: boolean }>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const igual = (): boolean => props.compra.entrega !== "" && props.compra.entrega === props.compra.localAplicacao;
const mesmoLocal = ref(igual());

// Outra compra aberta: o estado inicial dela vale. (Só pelo id: depois de cada salvamento a versão muda e isso NÃO deve religar a caixa.)
watch(
  () => props.compra.id,
  () => {
    mesmoLocal.value = igual();
  },
);
// O local ou a entrega mudaram por fora (ex.: "carregar a versão salva") e deixaram de ser iguais: a caixa não pode mentir.
watch(
  () => [props.compra.localAplicacao, props.compra.entrega] as const,
  ([local, entrega]) => {
    if (mesmoLocal.value && entrega !== local) mesmoLocal.value = false;
  },
);

function aoDigitarLocal(event: Event): void {
  const valor = (event.target as HTMLInputElement).value;
  emit("alterar", mesmoLocal.value ? { localAplicacao: valor, entrega: valor } : { localAplicacao: valor });
}

function aoMarcarMesmoLocal(event: Event): void {
  const marcada = (event.target as HTMLInputElement).checked;
  mesmoLocal.value = marcada;
  if (marcada) emit("alterar", { entrega: props.compra.localAplicacao });
}

function aoMarcarParticular(event: Event): void {
  const marcada = (event.target as HTMLInputElement).checked;
  emit("alterar", marcada ? { compraParticular: true, processoNumero: "" } : { compraParticular: false });
}
</script>

<template>
  <CompraCampo id-linha="processo" :rotulo="ROTULOS_DO_FORMULARIO.processo" para="compra-processo">
    <input
      id="compra-processo"
      type="text"
      maxlength="300"
      :class="[INPUT_MONO_CLASS]"
      placeholder="0000000-00.0000.0.00.0000"
      :value="compra.compraParticular ? '' : compra.processoNumero"
      :disabled="desabilitado || compra.compraParticular"
      autocomplete="off"
      @input="emit('alterar', { processoNumero: ($event.target as HTMLInputElement).value })"
    />
    <label class="mt-2 flex min-h-11 items-center gap-2 text-[14px] text-ink lg:min-h-0 lg:text-[13px]" for="compra-particular">
      <input id="compra-particular" type="checkbox" :class="CHECKBOX_CLASS" :checked="compra.compraParticular" :disabled="desabilitado" @change="aoMarcarParticular" />
      <span>Compra particular (sem processo)</span>
    </label>
  </CompraCampo>

  <CompraCampo id-linha="medico" :rotulo="ROTULOS_DO_FORMULARIO.medico" para="compra-medico">
    <input
      id="compra-medico"
      type="text"
      maxlength="300"
      :class="INPUT_CLASS"
      :value="compra.medico"
      :disabled="desabilitado"
      autocomplete="off"
      @input="emit('alterar', { medico: ($event.target as HTMLInputElement).value })"
    />
  </CompraCampo>

  <CompraCampo id-linha="local_aplicacao" :rotulo="ROTULOS_DO_FORMULARIO.local_aplicacao" para="compra-local">
    <input id="compra-local" type="text" maxlength="300" :class="INPUT_CLASS" :value="compra.localAplicacao" :disabled="desabilitado" autocomplete="off" @input="aoDigitarLocal" />
  </CompraCampo>

  <CompraCampo id-linha="entrega" :rotulo="ROTULOS_DO_FORMULARIO.entrega" para="compra-entrega">
    <input
      id="compra-entrega"
      type="text"
      maxlength="300"
      :class="INPUT_CLASS"
      :value="compra.entrega"
      :disabled="desabilitado || mesmoLocal"
      autocomplete="off"
      @input="emit('alterar', { entrega: ($event.target as HTMLInputElement).value })"
    />
    <label class="mt-2 flex min-h-11 items-center gap-2 text-[14px] text-ink lg:min-h-0 lg:text-[13px]" for="compra-entrega-mesmo-local">
      <input id="compra-entrega-mesmo-local" type="checkbox" :class="CHECKBOX_CLASS" :checked="mesmoLocal" :disabled="desabilitado" @change="aoMarcarMesmoLocal" />
      <span>Mesmo local</span>
    </label>
  </CompraCampo>

  <CompraCampo id-linha="contatos" :rotulo="ROTULOS_DO_FORMULARIO.contatos" para="compra-contatos">
    <textarea
      id="compra-contatos"
      rows="2"
      maxlength="300"
      :class="INPUT_CLASS"
      :value="compra.contatos"
      :disabled="desabilitado"
      @input="emit('alterar', { contatos: ($event.target as HTMLTextAreaElement).value })"
    />
  </CompraCampo>
</template>
