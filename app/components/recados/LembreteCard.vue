<script setup lang="ts">
import { computed, ref } from "vue";
import type { LembretePessoal } from "#shared/types/lembretePessoal";
import { TIPO_RECADO_META } from "../../utils/recadoTipo";
import { formatarDataRecado } from "../../utils/dataRecado";
import ConfirmDialog from "../ConfirmDialog.vue";

const props = defineProps<{
  lembrete: LembretePessoal;
}>();

const emit = defineEmits<{
  editar: [lembrete: LembretePessoal];
  excluir: [id: string];
  fixar: [id: string, fixado: boolean];
  concluir: [id: string];
}>();

const tipoMeta = computed(() => TIPO_RECADO_META[props.lembrete.tipo]);
const dataFormatada = computed(() => formatarDataRecado(props.lembrete.createdAt));

const showConcluirConfirm = ref(false);
const showExcluirConfirm = ref(false);

function confirmarConcluir(): void {
  showConcluirConfirm.value = false;
  emit("concluir", props.lembrete.id);
}

function confirmarExcluir(): void {
  showExcluirConfirm.value = false;
  emit("excluir", props.lembrete.id);
}
</script>

<template>
  <div
    :id="`lembrete-card-${lembrete.id}`"
    class="shadow-postit flex flex-col gap-2 rounded-md p-4"
    :class="tipoMeta.bgClass"
  >
    <div class="flex items-start justify-between gap-2">
      <span :id="`badge-tipo-lembrete-${lembrete.id}`" class="text-[11px] font-semibold" :class="tipoMeta.labelClass">
        {{ tipoMeta.label }}
      </span>

      <div class="grid shrink-0 grid-cols-2 gap-0.5">
        <button
          :id="`btn-fixar-lembrete-${lembrete.id}`"
          type="button"
          :title="lembrete.fixado ? 'Desfixar' : 'Fixar'"
          :aria-label="lembrete.fixado ? 'Desfixar' : 'Fixar'"
          class="rounded-md p-1 transition-colors"
          :class="lembrete.fixado ? 'text-danger' : 'text-ink/55 hover:text-ink'"
          @click="emit('fixar', lembrete.id, !lembrete.fixado)"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4"
            :fill="lembrete.fixado ? 'currentColor' : 'none'"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5h14l-4.091-4.091a2.25 2.25 0 01-.659-1.591V3.104M12 14.5V21"
            />
          </svg>
        </button>

        <button
          :id="`btn-concluir-lembrete-${lembrete.id}`"
          type="button"
          title="Marcar como concluído"
          aria-label="Marcar como concluído"
          class="rounded-md p-1 text-ink/55 transition-colors hover:text-ink"
          @click="showConcluirConfirm = true"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </button>

        <button
          :id="`btn-editar-lembrete-${lembrete.id}`"
          type="button"
          title="Editar"
          aria-label="Editar"
          class="rounded-md p-1 text-ink/55 transition-colors hover:text-ink"
          @click="emit('editar', lembrete)"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
            />
          </svg>
        </button>
        <button
          :id="`btn-excluir-lembrete-${lembrete.id}`"
          type="button"
          title="Excluir"
          aria-label="Excluir"
          class="rounded-md p-1 text-ink/55 transition-colors hover:text-danger"
          @click="showExcluirConfirm = true"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
            />
          </svg>
        </button>
      </div>
    </div>

    <h3 class="font-display text-[15px] font-semibold text-ink">{{ lembrete.titulo }}</h3>
    <p class="whitespace-pre-line text-[13px] text-ink/80">{{ lembrete.mensagem }}</p>

    <p class="mt-auto pt-1.5 font-mono text-[11px] text-ink/70">{{ dataFormatada }}</p>
  </div>

  <ConfirmDialog
    v-if="showConcluirConfirm"
    title="Marcar lembrete como concluído?"
    :message="`O lembrete ${lembrete.titulo} vai sumir da sua lista. Essa ação não pode ser desfeita.`"
    confirm-label="Confirmar"
    cancel-label="Cancelar"
    @confirm="confirmarConcluir"
    @close="showConcluirConfirm = false"
  />

  <ConfirmDialog
    v-if="showExcluirConfirm"
    title="Excluir lembrete"
    :message="`Excluir o lembrete ${lembrete.titulo}? Essa ação não pode ser desfeita.`"
    confirm-label="Sim, excluir"
    cancel-label="Cancelar"
    danger
    @confirm="confirmarExcluir"
    @close="showExcluirConfirm = false"
  />
</template>
