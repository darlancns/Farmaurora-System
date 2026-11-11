<script setup lang="ts">
import { CHECKLIST_DIR } from "#shared/constants/dir";
import type { ChecklistChaveDir, ChecklistDir } from "#shared/types/dir";
import DirCheckbox from "./DirCheckbox.vue";

// Os 8 itens do checklist da DIR (DACTES … Termômetro). Controlado: o pai decide o valor de
// cada item e grava (PATCH na hora quando o PO já existe).
withDefaults(
  defineProps<{
    values: ChecklistDir;
    // Somente leitura: os itens aparecem marcados/desmarcados, mas não clicam.
    desabilitado?: boolean;
  }>(),
  { desabilitado: false },
);

const emit = defineEmits<{ toggle: [chave: ChecklistChaveDir] }>();
</script>

<template>
  <div id="dir-checklist" class="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
    <DirCheckbox
      v-for="item in CHECKLIST_DIR"
      :id="`dir-check-${item.chave}`"
      :key="item.chave"
      :model-value="values[item.chave]"
      :label="item.rotulo"
      mostrar-rotulo
      :desabilitado="desabilitado"
      @toggle="emit('toggle', item.chave)"
    />
  </div>
</template>
