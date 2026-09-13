<script setup lang="ts">
import { computed, reactive } from "vue";
import { CONSULTORES_PROCESSO } from "#shared/constants/processos";
import type { ConsultorProcesso, NewProcessoDTO, Processo } from "#shared/types/processo";
import ProcessoRow from "./ProcessoRow.vue";

const props = withDefaults(
  defineProps<{
    processos: Processo[];
    // Somente leitura: esconde os controles de criar/editar/excluir nas linhas.
    readonly?: boolean;
    // Lista direta, sem o agrupamento por consultor (usado pelo cargo consultor,
    // que só vê os próprios processos).
    flat?: boolean;
  }>(),
  { readonly: false, flat: false },
);

const emit = defineEmits<{
  edit: [processo: Processo];
  delete: [id: string];
  patch: [id: string, patch: Partial<NewProcessoDTO>];
}>();

// Todos os grupos começam colapsados — ao entrar na página o usuário vê só os
// nomes dos consultores, e expande o que quiser conferir.
const collapsedGroups = reactive(new Set<ConsultorProcesso>(CONSULTORES_PROCESSO));

function toggleGroup(consultor: ConsultorProcesso): void {
  if (collapsedGroups.has(consultor)) {
    collapsedGroups.delete(consultor);
  } else {
    collapsedGroups.add(consultor);
  }
}

interface ProcessoGroup {
  consultor: ConsultorProcesso;
  processos: Processo[];
}

const groups = computed<ProcessoGroup[]>(() =>
  CONSULTORES_PROCESSO.map((consultor) => ({
    consultor,
    processos: props.processos.filter((p) => p.consultor === consultor),
  })).filter((group) => group.processos.length > 0)
);
</script>

<template>
  <div id="processo-group-list" class="flex flex-col gap-3">
    <p
      v-if="(flat ? !processos.length : !groups.length)"
      class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
    >
      Nenhum processo encontrado.
    </p>

    <div
      v-if="flat && processos.length"
      id="processo-flat-list"
      class="overflow-hidden rounded-lg border border-hairline bg-paper-raised"
    >
      <ProcessoRow
        v-for="processo in processos"
        :key="processo.id"
        :processo="processo"
        :readonly="readonly"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
        @patch="(id, patch) => emit('patch', id, patch)"
      />
    </div>

    <div
      v-for="group in (flat ? [] : groups)"
      :key="group.consultor"
      :id="`processo-group-${group.consultor}`"
      class="overflow-hidden rounded-lg border border-hairline bg-paper-raised"
    >
      <button
        type="button"
        class="flex w-full items-center justify-between px-3.5 py-2.5 text-left transition-colors hover:bg-paper"
        @click="toggleGroup(group.consultor)"
      >
        <div class="flex items-center gap-2">
          <svg
            viewBox="0 0 20 20"
            class="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform"
            :class="{ 'rotate-90': !collapsedGroups.has(group.consultor) }"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 5l5 5-5 5" />
          </svg>
          <span class="font-display text-[14.5px] font-semibold text-ink">{{ group.consultor }}</span>
        </div>
        <span class="rounded-full bg-paper px-2.5 py-0.5 font-mono text-[11.5px] text-ink-soft">
          {{ group.processos.length }}
        </span>
      </button>

      <div v-if="!collapsedGroups.has(group.consultor)">
        <ProcessoRow
          v-for="processo in group.processos"
          :key="processo.id"
          :processo="processo"
          :readonly="readonly"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
          @patch="(id, patch) => emit('patch', id, patch)"
        />
      </div>
    </div>
  </div>
</template>
