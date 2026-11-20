<script setup lang="ts">
import { computed } from "vue";
import type { CamposCompraEditaveis, Compra, OpcaoNome } from "#shared/types/compra";
import { montarConsultorOptions } from "../../utils/consultorOptions";
import { FIELDSET_CLASS, INPUT_CLASS, LABEL_CLASS, LEGEND_CLASS, SELECT_CAMPO_CLASS } from "../../utils/processoFormClasses";
import AppSelect from "../AppSelect.vue";

// O bloco "Paciente e processo" do formulário da Compra: Paciente, Nº do processo, Médico(a), Vendedor (consultores ativos do
// Cadastro), Responsável, "Compra particular (sem processo)" e "Recorrente". Só desenha e avisa (`alterar`): quem guarda e salva é
// o useCompraEditor. Sem validação por campo (o checklist é a validação). Ids fixos (hidratação e testes).
//
// Compra particular marcada: o Nº do processo fica desabilitado e vazio (o valor sai junto, no mesmo `alterar`).
const props = defineProps<{
  compra: Compra;
  /** Compra cancelada ou conta que só lê: nenhum campo editável. */
  desabilitado: boolean;
  /** Consultores ativos de GET /api/compras/opcoes. */
  consultores: OpcaoNome[];
}>();

const emit = defineEmits<{ alterar: [mudancas: Partial<CamposCompraEditaveis>] }>();

const vendedorOptions = computed(() =>
  montarConsultorOptions(
    props.compra.vendedor,
    props.consultores.map((c) => ({ nome: c.nome, ativo: true })),
  ),
);

function aoDigitar(campo: "paciente" | "processoNumero" | "medico" | "responsavel", event: Event): void {
  emit("alterar", { [campo]: (event.target as HTMLInputElement).value });
}

function aoMarcarParticular(event: Event): void {
  const marcada = (event.target as HTMLInputElement).checked;
  emit("alterar", marcada ? { compraParticular: true, processoNumero: "" } : { compraParticular: false });
}

function aoMarcarRecorrente(event: Event): void {
  emit("alterar", { recorrente: (event.target as HTMLInputElement).checked });
}

const CHECKBOX_CLASS = "h-[18px] w-[18px] shrink-0 accent-accent-dark disabled:cursor-not-allowed";
const ROTULO_CHECKBOX_CLASS = "flex min-h-11 items-center gap-2 text-[14px] text-ink lg:min-h-0 lg:text-[13px]";
</script>

<template>
  <fieldset id="compra-bloco-paciente" :class="FIELDSET_CLASS" :disabled="desabilitado" :aria-disabled="desabilitado ? 'true' : undefined">
    <legend :class="LEGEND_CLASS">Paciente e processo</legend>

    <div class="grid gap-3 lg:grid-cols-2">
      <div class="lg:col-span-2">
        <label for="compra-paciente" :class="LABEL_CLASS">Paciente</label>
        <input id="compra-paciente" type="text" :class="INPUT_CLASS" :value="compra.paciente" :disabled="desabilitado" autocomplete="off" @input="aoDigitar('paciente', $event)" />
      </div>

      <div>
        <label for="compra-processo" :class="LABEL_CLASS">Nº do processo</label>
        <input
          id="compra-processo"
          type="text"
          :class="INPUT_CLASS"
          :value="compra.compraParticular ? '' : compra.processoNumero"
          :disabled="desabilitado || compra.compraParticular"
          autocomplete="off"
          @input="aoDigitar('processoNumero', $event)"
        />
      </div>

      <div>
        <label for="compra-medico" :class="LABEL_CLASS">Médico(a)</label>
        <input id="compra-medico" type="text" :class="INPUT_CLASS" :value="compra.medico" :disabled="desabilitado" autocomplete="off" @input="aoDigitar('medico', $event)" />
      </div>

      <div :class="SELECT_CAMPO_CLASS">
        <label for="compra-vendedor" :class="LABEL_CLASS">Vendedor</label>
        <AppSelect id="compra-vendedor" :model-value="compra.vendedor" :options="vendedorOptions" :disabled="desabilitado" @update:model-value="(v: string) => emit('alterar', { vendedor: v })" />
      </div>

      <div>
        <label for="compra-responsavel" :class="LABEL_CLASS">Responsável</label>
        <input id="compra-responsavel" type="text" :class="INPUT_CLASS" :value="compra.responsavel" :disabled="desabilitado" autocomplete="off" @input="aoDigitar('responsavel', $event)" />
      </div>

      <label :class="ROTULO_CHECKBOX_CLASS" for="compra-particular">
        <input id="compra-particular" type="checkbox" :class="CHECKBOX_CLASS" :checked="compra.compraParticular" :disabled="desabilitado" @change="aoMarcarParticular" />
        <span>Compra particular (sem processo)</span>
      </label>

      <label :class="ROTULO_CHECKBOX_CLASS" for="compra-recorrente">
        <input id="compra-recorrente" type="checkbox" :class="CHECKBOX_CLASS" :checked="compra.recorrente" :disabled="desabilitado" @change="aoMarcarRecorrente" />
        <span>Recorrente</span>
      </label>
    </div>
  </fieldset>
</template>
