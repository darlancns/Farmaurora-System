<script setup lang="ts">
import type { Dir, DirPatchDTO } from "#shared/types/dir";
import { DIR_GRID_CLASS } from "../../utils/dirLayout";
import DirRow from "./DirRow.vue";

// Lista da DIR: tabela em lg+ (rola na horizontal só se faltar largura) e cartões abaixo de lg.
// Recebe a página já fatiada ("Mostrar mais" fica na página).
defineProps<{
  registros: Dir[];
  // Quantos registros existem por PO (> 1 = PO repetido).
  contagemPorPo: ReadonlyMap<string, number>;
}>();

const emit = defineEmits<{
  edit: [dir: Dir];
  patch: [id: string, patch: DirPatchDTO];
}>();
</script>

<template>
  <div id="dir-list" class="flex flex-col gap-3">
    <p
      v-if="!registros.length"
      id="dir-vazio"
      class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
    >
      Nenhum PO encontrado.
    </p>

    <div v-else class="overflow-hidden rounded-lg border border-hairline bg-paper-raised">
      <div class="overflow-x-auto">
        <div
          id="dir-list-header"
          role="row"
          class="hidden border-b border-hairline bg-paper px-3.5 py-2 text-[10.5px] font-semibold tracking-wide text-ink-soft uppercase"
          :class="DIR_GRID_CLASS"
        >
          <span title="Conferido">✔</span>
          <span>PO</span>
          <span>Paciente</span>
          <span>Medicamento</span>
          <span>Vendedor</span>
          <span>Resp.</span>
          <span>Fornecedor</span>
          <span>Emissão</span>
          <span>Status</span>
          <span>Banco</span>
          <span title="Itens do checklist marcados">Check</span>
        </div>

        <div class="lg:min-w-[1060px]">
          <DirRow
            v-for="dir in registros"
            :key="dir.id"
            :dir="dir"
            :po-repetido="(contagemPorPo.get(dir.po) ?? 0) > 1"
            @edit="emit('edit', $event)"
            @patch="(id, patch) => emit('patch', id, patch)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
