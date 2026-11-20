<script setup lang="ts">
import { ref, watch } from "vue";
import type { MudancasCompra } from "#shared/types/compra";
import { CHECKBOX_CLASS, ROTULO_CHECKBOX_CLASS, type PropsBloco } from "../../../utils/comprasBlocos";
import { INPUT_CLASS, LABEL_CLASS } from "../../../utils/processoFormClasses";

// Bloco `local_entrega`: "Local de aplicação", "Declarado" (o local é o declarado pelo cliente: muda o rótulo no resumo),
// "Entrega no mesmo local" (conveniência da tela, SEM coluna no banco) e "Entrega (Doctor/AJC)".
//
// "Entrega no mesmo local" marcada: o campo Entrega copia o local a cada digitação e fica desabilitado. O estado inicial é marcada
// quando entrega === local e não vazio; desmarcar deixa a entrega como está, editável.
const props = defineProps<PropsBloco>();
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
</script>

<template>
  <div data-bloco="local_entrega" class="contents">
    <div class="sm:col-span-2">
      <label for="compra-local" :class="LABEL_CLASS">Local de aplicação</label>
      <input id="compra-local" type="text"
        maxlength="300" :class="INPUT_CLASS" :value="compra.localAplicacao" :disabled="desabilitado" autocomplete="off" @input="aoDigitarLocal" />
    </div>

    <label :class="[ROTULO_CHECKBOX_CLASS, 'self-end']" for="compra-local-declarado">
      <input
        id="compra-local-declarado"
        type="checkbox"
        :class="CHECKBOX_CLASS"
        :checked="compra.localDeclarado"
        :disabled="desabilitado"
        @change="emit('alterar', { localDeclarado: ($event.target as HTMLInputElement).checked })"
      />
      <span>Declarado</span>
    </label>

    <label :class="[ROTULO_CHECKBOX_CLASS, 'self-end']" for="compra-entrega-mesmo-local">
      <input id="compra-entrega-mesmo-local" type="checkbox" :class="CHECKBOX_CLASS" :checked="mesmoLocal" :disabled="desabilitado" @change="aoMarcarMesmoLocal" />
      <span>Entrega no mesmo local</span>
    </label>

    <div class="sm:col-span-2 xl:col-span-4">
      <label for="compra-entrega" :class="LABEL_CLASS">Entrega (Doctor/AJC)</label>
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
    </div>
  </div>
</template>
