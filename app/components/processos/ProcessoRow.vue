<script setup lang="ts">
import { computed, ref } from "vue";
import type { AtualizacaoProcesso, NewProcessoDTO, Processo } from "#shared/types/processo";
import { STATUS_PROCESSO_META } from "../../utils/processoStatus";
import ConfirmDialog from "../ConfirmDialog.vue";
import ProcessoDetail from "./ProcessoDetail.vue";

const props = withDefaults(
  defineProps<{
    processo: Processo;
    readonly?: boolean;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  edit: [processo: Processo];
  delete: [id: string];
  patch: [id: string, patch: Partial<NewProcessoDTO>];
}>();

const expanded = ref(false);
const showDeleteConfirm = ref(false);
const deleteConfirmMessage = computed(
  () => `Excluir o processo de ${props.processo.paciente}? Essa ação não pode ser desfeita.`
);

const statusMeta = computed(() => STATUS_PROCESSO_META[props.processo.status]);
const hasPendencias = computed(() => props.processo.pendencias.length > 0);
const medicamentoResumo = computed(() => {
  const [first, ...rest] = props.processo.medicamentos;
  if (!first) return "—";
  const label = [first.nome, first.dosagem].filter(Boolean).join(" ");
  return rest.length ? `${label} +${rest.length}` : label;
});

function toggleExpand(): void {
  expanded.value = !expanded.value;
}

function confirmDelete(): void {
  showDeleteConfirm.value = false;
  emit("delete", props.processo.id);
}

function handleAddAtualizacao(id: string, atualizacao: AtualizacaoProcesso): void {
  emit("patch", id, { atualizacoes: [...props.processo.atualizacoes, atualizacao] });
}
</script>

<template>
  <div :id="`processo-row-${processo.id}`" class="border-b border-hairline last:border-b-0">
    <button
      type="button"
      class="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-paper"
      @click="toggleExpand"
    >
      <svg
        viewBox="0 0 20 20"
        class="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform"
        :class="{ 'rotate-90': expanded }"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 5l5 5-5 5" />
      </svg>

      <svg
        v-if="hasPendencias"
        :id="`icon-pendencia-${processo.id}`"
        title="Possui pendências"
        viewBox="0 0 24 24"
        class="h-4 w-4 shrink-0 text-danger"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>

      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="truncate text-[13.5px] font-medium text-ink">{{ processo.paciente }}</span>
          <span v-if="processo.ordem" class="shrink-0 text-[11.5px] text-ink-soft">{{ processo.ordem }}</span>
          <span class="shrink-0 text-[11.5px] text-ink-soft/60">·</span>
          <span class="shrink-0 font-mono text-[11.5px] text-ink-soft">{{ processo.pasta }}</span>
        </div>
        <span class="block truncate text-[12px] text-ink-soft">{{ medicamentoResumo }}</span>
      </div>

      <span
        :id="`badge-status-${processo.id}`"
        class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        :class="statusMeta.badgeClass"
      >
        {{ statusMeta.label }}
      </span>

      <span class="w-[92px] shrink-0 text-right font-mono text-[12px] text-ink-soft">
        {{ processo.datas.previsaoEntrega || "—" }}
      </span>

      <span class="w-[110px] shrink-0 truncate text-right text-[12px] text-ink-soft">
        {{ processo.responsavelOperacional || "—" }}
      </span>

      <button
        v-if="!readonly"
        :id="`btn-delete-processo-${processo.id}`"
        type="button"
        title="Excluir"
        aria-label="Excluir"
        class="shrink-0 rounded-md p-1.5 text-ink-soft transition-colors hover:text-danger"
        @click.stop="showDeleteConfirm = true"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </button>

    <ProcessoDetail
      v-if="expanded"
      :processo="processo"
      :readonly="readonly"
      @edit="emit('edit', $event)"
      @add-atualizacao="handleAddAtualizacao"
    />
  </div>

  <ConfirmDialog
    v-if="showDeleteConfirm"
    title="Excluir processo"
    :message="deleteConfirmMessage"
    confirm-label="Sim, excluir"
    cancel-label="Cancelar"
    danger
    @confirm="confirmDelete"
    @close="showDeleteConfirm = false"
  />
</template>
