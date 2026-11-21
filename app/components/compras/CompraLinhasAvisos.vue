<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { PENDENCIAS_PADRAO } from "#shared/constants/compra";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import { pendenciasDoFormulario, pendenciasParaFormulario } from "#shared/utils/compraForm";
import type { AppSelectOption } from "../../types/appSelect";
import { CHECKBOX_CLASS } from "../../utils/comprasEstilos";
import { INPUT_CLASS, LABEL_CLASS } from "../../utils/processoFormClasses";
import SegmentedControl from "../SegmentedControl.vue";
import CompraCampo from "./CompraCampo.vue";

// As linhas 18 a 22 do formulário (a ordem do resumo): Obs., Pedir isenção de imposto (caixinha, sem "para quem"), Verificação de documento e
// validação de assinatura (Pendente | Verificado; sem valor = null), Pendente (chips + "Outras pendências") e Recorrente (caixinha).
//
// PENDENTE: o que se salva em pendencias[] é a lista dos chips marcados (pelo rótulo) + UMA entrada final com o texto livre (se houver). Ao
// carregar, as entradas que não estão na lista padrão aparecem no campo livre, unidas por "; ".
const props = defineProps<{ compra: Compra; desabilitado: boolean }>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const OPCOES_DOCUMENTOS: AppSelectOption<string>[] = [
  { value: "pendente", label: "Pendente" },
  { value: "verificado", label: "Verificado" },
];

const documentos = computed(() => (props.compra.documentos === null ? "" : props.compra.documentos ? "verificado" : "pendente"));
const marcadas = computed(() => pendenciasParaFormulario(props.compra.pendencias).marcadas);

// O texto livre fica num campo local (a lista salva guarda o texto aparado: sem isto o espaço no fim sumiria enquanto se digita).
const livre = ref(pendenciasParaFormulario(props.compra.pendencias).livre);
watch(
  () => pendenciasParaFormulario(props.compra.pendencias).livre,
  (daCompra) => {
    if (daCompra !== livre.value.trim()) livre.value = daCompra; // mudou de fora (outra compra, versão salva carregada)
  },
);

function alternarChip(rotulo: string): void {
  const atuais = marcadas.value;
  const novas = atuais.includes(rotulo) ? atuais.filter((p) => p !== rotulo) : [...atuais, rotulo];
  emit("alterar", { pendencias: pendenciasDoFormulario(novas, livre.value) });
}

function aoDigitarLivre(event: Event): void {
  livre.value = (event.target as HTMLInputElement).value;
  emit("alterar", { pendencias: pendenciasDoFormulario(marcadas.value, livre.value) });
}
</script>

<template>
  <CompraCampo id-linha="observacoes" rotulo="Obs." para="compra-observacoes">
    <textarea
      id="compra-observacoes"
      rows="2"
      maxlength="2000"
      :class="INPUT_CLASS"
      :value="compra.observacoes"
      :disabled="desabilitado"
      @input="emit('alterar', { observacoes: ($event.target as HTMLTextAreaElement).value })"
    />
  </CompraCampo>

  <CompraCampo id-linha="isencao" rotulo="Pedir isenção de imposto" para="compra-isencao">
    <div class="flex min-h-11 items-center lg:min-h-0 lg:pt-2">
      <input id="compra-isencao" type="checkbox" :class="CHECKBOX_CLASS" :checked="compra.isencao" :disabled="desabilitado" @change="emit('alterar', { isencao: ($event.target as HTMLInputElement).checked })" />
    </div>
  </CompraCampo>

  <CompraCampo id-linha="documentos" rotulo="Verificação de documento e validação de assinatura">
    <SegmentedControl
      id="compra-documentos"
      label="Verificação de documento e validação de assinatura"
      :model-value="documentos"
      :options="OPCOES_DOCUMENTOS"
      :disabled="desabilitado"
      @update:model-value="(v: string) => emit('alterar', { documentos: v === 'verificado' })"
    />
  </CompraCampo>

  <CompraCampo id-linha="pendencias" rotulo="Pendente">
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="(rotulo, i) in PENDENCIAS_PADRAO"
        :id="`compra-pendencia-chip-${i}`"
        :key="rotulo"
        type="button"
        :aria-pressed="marcadas.includes(rotulo)"
        :disabled="desabilitado"
        class="min-h-11 rounded-md border px-2.5 py-1 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-0 lg:text-[12px]"
        :class="marcadas.includes(rotulo) ? 'border-transparent bg-accent-dark text-white' : 'border-hairline bg-paper text-ink-soft hover:border-accent-dark hover:text-accent-dark'"
        @click="alternarChip(rotulo)"
      >
        {{ rotulo }}
      </button>
    </div>
    <div class="mt-3">
      <label for="compra-pendencias-livre" :class="LABEL_CLASS">Outras pendências</label>
      <input id="compra-pendencias-livre" type="text" maxlength="300" :class="INPUT_CLASS" :value="livre" :disabled="desabilitado" autocomplete="off" @input="aoDigitarLivre" />
    </div>
  </CompraCampo>

  <CompraCampo id-linha="recorrente" rotulo="Recorrente" para="compra-recorrente">
    <div class="flex min-h-11 items-center lg:min-h-0 lg:pt-2">
      <input id="compra-recorrente" type="checkbox" :class="CHECKBOX_CLASS" :checked="compra.recorrente" :disabled="desabilitado" @change="emit('alterar', { recorrente: ($event.target as HTMLInputElement).checked })" />
    </div>
  </CompraCampo>
</template>
