<script setup lang="ts">
import { computed } from "vue";
import { CHECKLIST_DIR, STATUS_DIR_LABELS, STATUS_DIR_VAZIO } from "#shared/constants/dir";
import type { Dir, DirPatchDTO } from "#shared/types/dir";
import { formatarDataBR } from "#shared/utils/dataBrasilia";
import { contarChecklistMarcados, estaNaListaFechamentosRestantes } from "../../utils/dirFiltros";
import { DIR_GRID_CLASS } from "../../utils/dirLayout";
import { STATUS_DIR_BADGE_CLASS, STATUS_DIR_VAZIO_BADGE_CLASS } from "../../utils/dirOptions";
import DirBancoChip from "./DirBancoChip.vue";
import DirCheckbox from "./DirCheckbox.vue";

const props = withDefaults(
  defineProps<{
    dir: Dir;
    // PO que aparece em mais de um registro (permitido; só avisa).
    poRepetido: boolean;
    // Somente leitura (permissão "ver" na DIR): o "Conferido" aparece, mas não clica; abrir o PO segue valendo.
    readonly?: boolean;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  edit: [dir: Dir];
  patch: [id: string, patch: DirPatchDTO];
}>();

// PO na lista "Fechamentos restantes" (marcado e com a operação em andamento): bandeirinha ao lado do PO.
const naListaFechamentos = computed<boolean>(() => estaNaListaFechamentosRestantes(props.dir));
const marcados = computed<number>(() => contarChecklistMarcados(props.dir));
const totalChecklist = CHECKLIST_DIR.length;
const statusRotulo = computed<string>(() => (props.dir.status ? STATUS_DIR_LABELS[props.dir.status] : STATUS_DIR_VAZIO));
const statusClasse = computed<string>(() =>
  props.dir.status ? STATUS_DIR_BADGE_CLASS[props.dir.status] : STATUS_DIR_VAZIO_BADGE_CLASS,
);
const dataEntrega = computed<string>(() => formatarDataBR(props.dir.dataEntrega));
const emissao = computed<string>(() => formatarDataBR(props.dir.dataEmissao) || "—");
const chipClasse = computed<string>(() => {
  if (props.dir.exigencia) return "bg-danger/10 text-danger ring-1 ring-danger/40";
  return marcados.value === totalChecklist ? "bg-green-100 text-green-800" : "bg-paper text-ink-soft";
});
const chipTitulo = computed<string>(
  () => `Checklist: ${marcados.value} de ${totalChecklist} itens${props.dir.exigencia ? " — com exigência" : ""}`,
);

function alternarConferido(): void {
  if (props.readonly) return;
  emit("patch", props.dir.id, { conferido: !props.dir.conferido });
}
</script>

<template>
  <div class="border-b border-hairline last:border-b-0">
    <!-- Abaixo de lg: cartão. Ids com prefixo "dir-card-" pra não duplicar os do desktop. -->
    <div
      :id="`dir-card-${dir.id}`"
      role="button"
      tabindex="0"
      class="flex cursor-pointer flex-col gap-1 px-3.5 py-2.5 transition-colors hover:bg-paper lg:hidden"
      @click="emit('edit', dir)"
      @keydown.enter.self="emit('edit', dir)"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="font-mono text-[12.5px] font-semibold text-accent-dark">{{ dir.po }}</span>
          <span v-if="poRepetido" class="text-[12px] text-warning-gold" title="PO repetido" aria-label="PO repetido">⚠</span>
          <span
            v-if="naListaFechamentos"
            :id="`dir-card-marca-fech-${dir.id}`"
            class="text-[12px] text-farm-blue"
            title="Em fechamento restante"
            aria-label="Em fechamento restante"
          >⚑</span>
        </div>
        <DirCheckbox
          :id="`dir-card-conferido-${dir.id}`"
          class="-my-2.5 -mr-2.5"
          :model-value="dir.conferido"
          label="Conferido"
          :desabilitado="readonly"
          @toggle="alternarConferido"
        />
      </div>
      <p class="truncate text-[14px] font-semibold text-ink">{{ dir.paciente }}</p>
      <p class="truncate text-[12.5px] text-ink-soft">
        {{ dir.medicamento || "—" }}<template v-if="dir.vendedor"> · {{ dir.vendedor }}</template>
      </p>
      <div class="mt-0.5 flex flex-wrap items-center gap-2">
        <span class="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" :class="statusClasse">{{ statusRotulo }}</span>
        <span v-if="dataEntrega" class="font-mono text-[11.5px] text-ink-soft">{{ dataEntrega }}</span>
        <DirBancoChip v-if="dir.banco" :id="`dir-card-banco-${dir.id}`" :banco="dir.banco" />
        <span class="ml-auto rounded-full px-2 py-0.5 font-mono text-[11.5px]" :class="chipClasse" :title="chipTitulo">
          {{ dir.exigencia ? "! " : "" }}{{ marcados }}/{{ totalChecklist }}
        </span>
      </div>
    </div>

    <!-- lg+: linha da tabela (mesma grade do cabeçalho em DirList.vue). -->
    <div
      :id="`dir-row-${dir.id}`"
      role="row"
      tabindex="0"
      class="hidden cursor-pointer px-3.5 py-2 text-[12.5px] transition-colors hover:bg-paper"
      :class="DIR_GRID_CLASS"
      @click="emit('edit', dir)"
      @keydown.enter.self="emit('edit', dir)"
    >
      <DirCheckbox
        :id="`dir-conferido-${dir.id}`"
        :model-value="dir.conferido"
        label="Conferido"
        :desabilitado="readonly"
        @toggle="alternarConferido"
      />
      <span class="flex items-center gap-1 font-mono text-[12px] font-semibold text-accent-dark">
        {{ dir.po }}
        <span v-if="poRepetido" class="text-warning-gold" title="PO repetido" aria-label="PO repetido">⚠</span>
        <span
          v-if="naListaFechamentos"
          :id="`dir-marca-fech-${dir.id}`"
          class="text-farm-blue"
          title="Em fechamento restante"
          aria-label="Em fechamento restante"
        >⚑</span>
      </span>
      <span class="truncate font-semibold text-ink" :title="dir.paciente">{{ dir.paciente }}</span>
      <span class="truncate text-ink" :title="dir.medicamento">{{ dir.medicamento || "—" }}</span>
      <span class="truncate text-ink" :title="dir.vendedor">{{ dir.vendedor || "—" }}</span>
      <span class="truncate text-ink">{{ dir.responsavel || "—" }}</span>
      <span class="truncate text-ink" :title="dir.fornecedor">{{ dir.fornecedor || "—" }}</span>
      <span class="font-mono text-[12px] text-ink-soft">{{ emissao }}</span>
      <span class="flex flex-col items-start gap-0.5">
        <span class="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" :class="statusClasse">{{ statusRotulo }}</span>
        <span v-if="dataEntrega" class="font-mono text-[11px] text-ink-soft">{{ dataEntrega }}</span>
      </span>
      <span class="min-w-0">
        <DirBancoChip v-if="dir.banco" :id="`dir-banco-${dir.id}`" :banco="dir.banco" />
        <template v-else>—</template>
      </span>
      <span
        class="justify-self-start rounded-full px-2 py-0.5 font-mono text-[11.5px]"
        :class="chipClasse"
        :title="chipTitulo"
      >
        {{ dir.exigencia ? "! " : "" }}{{ marcados }}/{{ totalChecklist }}
      </span>
    </div>
  </div>
</template>
