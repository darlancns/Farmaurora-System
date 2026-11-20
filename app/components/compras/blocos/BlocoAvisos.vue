<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { PENDENCIAS_PADRAO } from "#shared/constants/compra";
import type { MudancasCompra } from "#shared/types/compra";
import { pendenciasDoFormulario, pendenciasParaFormulario } from "#shared/utils/compraForm";
import type { AppSelectOption } from "../../../types/appSelect";
import { CHECKBOX_CLASS, ROTULO_CHECKBOX_CLASS, type PropsBloco } from "../../../utils/comprasBlocos";
import { INPUT_CLASS, LABEL_CLASS } from "../../../utils/processoFormClasses";
import SegmentedControl from "../../SegmentedControl.vue";

// Bloco `avisos`: "Pedir isenção de imposto" (marcado mostra "Para (opcional)"), "Verificação de documento e assinatura" (Pendente |
// Verificado; sem valor = null), "Pendências (clique para marcar)" (chips + "Outras pendências" livre), "Observações" e "Recorrente".
//
// PENDÊNCIAS: o que se salva em pendencias[] é a lista dos chips marcados (pelo rótulo) + UMA entrada final com o texto livre (se
// houver). Ao carregar, as entradas que não estão na lista padrão aparecem no campo livre, unidas por "; ".
const props = defineProps<PropsBloco>();
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
  <div data-bloco="avisos" class="contents">
    <div class="sm:col-span-2">
      <label :class="ROTULO_CHECKBOX_CLASS" for="compra-isencao">
        <input
          id="compra-isencao"
          type="checkbox"
          :class="CHECKBOX_CLASS"
          :checked="compra.isencao"
          :disabled="desabilitado"
          @change="emit('alterar', { isencao: ($event.target as HTMLInputElement).checked })"
        />
        <span>Pedir isenção de imposto</span>
      </label>
      <div v-if="compra.isencao" class="mt-2">
        <label for="compra-isencao-para" :class="LABEL_CLASS">Para (opcional)</label>
        <input
          id="compra-isencao-para"
          type="text"
          :class="INPUT_CLASS"
          :value="compra.isencaoPara"
          :disabled="desabilitado"
          autocomplete="off"
          @input="emit('alterar', { isencaoPara: ($event.target as HTMLInputElement).value })"
        />
      </div>
    </div>

    <div class="sm:col-span-2">
      <span :class="LABEL_CLASS">Verificação de documento e assinatura</span>
      <SegmentedControl
        id="compra-documentos"
        label="Verificação de documento e assinatura"
        :model-value="documentos"
        :options="OPCOES_DOCUMENTOS"
        :disabled="desabilitado"
        @update:model-value="(v: string) => emit('alterar', { documentos: v === 'verificado' })"
      />
    </div>

    <div class="sm:col-span-2 xl:col-span-4">
      <span id="compra-pendencias-rotulo" :class="LABEL_CLASS">Pendências (clique para marcar)</span>
      <div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="compra-pendencias-rotulo">
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
    </div>

    <div class="sm:col-span-2 xl:col-span-4">
      <label for="compra-pendencias-livre" :class="LABEL_CLASS">Outras pendências</label>
      <input id="compra-pendencias-livre" type="text" maxlength="300" :class="INPUT_CLASS" :value="livre" :disabled="desabilitado" autocomplete="off" @input="aoDigitarLivre" />
    </div>

    <div class="sm:col-span-2 xl:col-span-4">
      <label for="compra-observacoes" :class="LABEL_CLASS">Observações</label>
      <textarea
        id="compra-observacoes"
        rows="3"
        maxlength="2000"
        :class="INPUT_CLASS"
        :value="compra.observacoes"
        :disabled="desabilitado"
        @input="emit('alterar', { observacoes: ($event.target as HTMLTextAreaElement).value })"
      />
    </div>

    <label :class="ROTULO_CHECKBOX_CLASS" for="compra-recorrente">
      <input
        id="compra-recorrente"
        type="checkbox"
        :class="CHECKBOX_CLASS"
        :checked="compra.recorrente"
        :disabled="desabilitado"
        @change="emit('alterar', { recorrente: ($event.target as HTMLInputElement).checked })"
      />
      <span>Recorrente</span>
    </label>
  </div>
</template>
