<script setup lang="ts">
import { computed, ref } from "vue";
import type { NewProcessoDTO, Processo, StatusPagamentoProcesso } from "#shared/types/processo";
import { STATUS_PAGAMENTO_PROCESSO } from "#shared/constants/processos";
import AppSelect from "../AppSelect.vue";
import type { AppSelectOption } from "../../types/appSelect";
import ConfirmDialog from "../ConfirmDialog.vue";

const props = withDefaults(
  defineProps<{
    processos: Processo[];
    readonly?: boolean;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  edit: [processo: Processo];
  delete: [id: string];
  patch: [id: string, patch: Partial<NewProcessoDTO>];
}>();

const statusPagamentoOptions: AppSelectOption<StatusPagamentoProcesso>[] = STATUS_PAGAMENTO_PROCESSO.map(
  (status) => ({ value: status, label: status === "pago" ? "Pago" : "Pendente" })
);

// Ordenação por "data de entrega" — campo é texto livre (aceita "20/08", "já tem",
// "ASD" etc., ver shared/types/processo.ts), então este é um sort lexicográfico
// simples, não um parse de data real. Processos sem previsão de entrega vão pro fim.
const sortedProcessos = computed<Processo[]>(() =>
  [...props.processos].sort((a, b) => {
    const da = a.datas.previsaoEntrega ?? "";
    const db = b.datas.previsaoEntrega ?? "";
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  })
);

function onStatusPagamentoChange(processo: Processo, statusPagamento: StatusPagamentoProcesso): void {
  emit("patch", processo.id, { statusPagamento });
}

const deleteConfirmProcesso = ref<Processo | null>(null);

function confirmDelete(): void {
  if (!deleteConfirmProcesso.value) return;
  emit("delete", deleteConfirmProcesso.value.id);
  deleteConfirmProcesso.value = null;
}
</script>

<template>
  <div id="processo-delivered-list" class="flex flex-col rounded-lg border border-hairline bg-paper-raised">
    <p v-if="!sortedProcessos.length" class="px-4 py-6 text-center text-[13px] text-ink-soft">
      Nenhum processo entregue ainda.
    </p>

    <div
      v-for="processo in sortedProcessos"
      :key="processo.id"
      :id="`processo-delivered-${processo.id}`"
      class="@container border-b border-hairline last:border-b-0"
    >
      <div
        class="flex flex-col gap-1.5 px-3.5 py-2.5 @[760px]:flex-row @[760px]:items-center @[760px]:gap-3"
      >
        <div class="min-w-0 @[760px]:flex-1">
          <span class="block truncate text-[13.5px] font-medium text-ink">{{ processo.paciente }}</span>
          <span class="block text-[11.5px] text-ink-soft">{{ processo.empresa }}</span>
        </div>

        <!--
          Transportadora é texto livre (nome de empresa) — ao contrário de
          data/status abaixo, pode ser longo o bastante pra estourar a linha
          se só tirarmos a largura fixa. Por isso fica na sua própria linha
          (bloco, quebra com break-words) abaixo do breakpoint, em vez de
          dividir espaço com data/status num flex-wrap — evita o texto ser
          cortado silenciosamente pelo overflow-x-hidden do main (Rodada 1)
          sem nenhuma pista visual, já que sem largura + truncate juntos o
          navegador não mostra reticências, só deixa vazar.
        -->
        <span
          class="block min-w-0 text-[12px] break-words text-ink-soft @[760px]:w-[160px] @[760px]:shrink-0 @[760px]:truncate @[760px]:break-normal @[760px]:whitespace-nowrap"
        >
          {{ processo.transportadoraNacional?.nome || "—" }}
        </span>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 @[760px]:flex-nowrap @[760px]:gap-3">
          <span class="shrink-0 text-right font-mono text-[12px] text-ink-soft @[760px]:w-[92px]">
            {{ processo.datas.previsaoEntrega || "—" }}
          </span>

          <div class="w-[130px] shrink-0">
            <AppSelect
              v-if="!readonly"
              :id="`select-pagamento-${processo.id}`"
              :model-value="processo.statusPagamento ?? 'pendente'"
              :options="statusPagamentoOptions"
              @update:model-value="(value) => onStatusPagamentoChange(processo, value)"
            />
            <span v-else class="block text-right text-[12px] text-ink-soft">
              {{ (processo.statusPagamento ?? "pendente") === "pago" ? "Pago" : "Pendente" }}
            </span>
          </div>
        </div>

        <div v-if="!readonly" class="flex shrink-0 items-center justify-end gap-1 self-end @[760px]:contents">
          <button
            :id="`btn-edit-processo-entregue-${processo.id}`"
            type="button"
            title="Editar"
            aria-label="Editar"
            class="shrink-0 rounded-md p-3.5 text-ink-soft transition-colors hover:text-accent-dark md:p-1.5"
            @click="emit('edit', processo)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.862 4.487" />
            </svg>
          </button>

          <button
            :id="`btn-delete-processo-entregue-${processo.id}`"
            type="button"
            title="Excluir"
            aria-label="Excluir"
            class="shrink-0 rounded-md p-3.5 text-ink-soft transition-colors hover:text-danger md:p-1.5"
            @click="deleteConfirmProcesso = processo"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="deleteConfirmProcesso"
      title="Excluir processo"
      :message="`Excluir o processo de ${deleteConfirmProcesso.paciente}? Essa ação não pode ser desfeita.`"
      confirm-label="Sim, excluir"
      cancel-label="Cancelar"
      danger
      @confirm="confirmDelete"
      @close="deleteConfirmProcesso = null"
    />
  </div>
</template>
