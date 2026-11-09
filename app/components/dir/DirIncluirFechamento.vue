<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Dir } from "#shared/types/dir";
import { candidatosAFechamentoRestante, sufixoOrdemPaciente } from "../../utils/dirFiltros";
import { INPUT_CLASS, LABEL_CLASS, MODAL_PAD_X_CLASS } from "../../utils/processoFormClasses";
import BaseModal from "../BaseModal.vue";
import DirBancoChip from "./DirBancoChip.vue";

// Busca para INCLUIR um PO na lista "Fechamentos restantes". Lista só POs com a operação em andamento
// e ainda não incluídos (PO encerrado não pode ser marcado). Clicar no PO inclui na hora (a página
// faz o PATCH) e a busca continua aberta para incluir outros; o PO incluído some dos resultados.
// Desktop: modal; abaixo de lg: tela cheia (mesmo casco do DirFormModal).
const props = defineProps<{
  registros: Dir[];
}>();

const emit = defineEmits<{
  incluir: [dir: Dir];
  close: [];
}>();

const busca = ref("");
const entrada = ref<HTMLInputElement | null>(null);

const resultado = computed(() => candidatosAFechamentoRestante(props.registros, busca.value));

onMounted(() => {
  entrada.value?.focus();
});
</script>

<template>
  <BaseModal id="dir-incluir-overlay" @close="emit('close')">
    <div
      id="dir-incluir-modal"
      class="fixed inset-0 flex h-dvh w-full flex-col bg-paper-raised lg:static lg:inset-auto lg:h-auto lg:max-h-[85vh] lg:max-w-[560px] lg:rounded-[10px] lg:border lg:border-hairline"
    >
      <div
        class="flex shrink-0 items-center justify-between border-b border-hairline py-2 lg:px-5 lg:py-4"
        :class="MODAL_PAD_X_CLASS"
      >
        <div>
          <p class="mb-1 font-mono text-[11px] tracking-wider text-accent-dark uppercase">Fechamentos restantes</p>
          <h2 class="font-display text-[18px] font-semibold text-ink">Incluir paciente</h2>
        </div>
        <button
          id="btn-close-dir-incluir"
          type="button"
          title="Fechar"
          class="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:text-danger lg:mr-0 lg:block lg:h-auto lg:w-auto lg:px-2 lg:py-1"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="shrink-0 pt-3 pb-2 lg:px-5" :class="MODAL_PAD_X_CLASS">
        <label for="dir-incluir-busca" :class="LABEL_CLASS">Paciente ou PO</label>
        <input
          id="dir-incluir-busca"
          ref="entrada"
          v-model="busca"
          type="search"
          autocomplete="off"
          placeholder="Digite o nome do paciente ou o PO..."
          :class="INPUT_CLASS"
        />
        <p class="mt-1.5 text-[12px] text-ink-soft">
          Só aparecem POs com a operação em andamento que ainda não estão na lista.
        </p>
      </div>

      <div id="dir-incluir-resultados" class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 lg:px-5" :class="MODAL_PAD_X_CLASS">
        <p v-if="!busca.trim()" id="dir-incluir-dica" class="py-4 text-center text-[13px] text-ink-soft">
          Digite para buscar.
        </p>
        <p v-else-if="!resultado.itens.length" id="dir-incluir-vazio" class="py-4 text-center text-[13px] text-ink-soft">
          Nenhum PO em andamento encontrado (ou já está na lista).
        </p>
        <template v-else>
          <ul class="flex flex-col gap-1.5">
            <li v-for="dir in resultado.itens" :key="dir.id">
              <button
                :id="`dir-incluir-item-${dir.id}`"
                type="button"
                class="flex min-h-14 w-full flex-col gap-1 rounded-lg border border-hairline bg-paper px-3 py-2 text-left transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-accent-dark"
                @click="emit('incluir', dir)"
              >
                <span class="flex items-center justify-between gap-2">
                  <span class="min-w-0 truncate text-[14px] font-semibold text-ink">{{ dir.paciente }}</span>
                  <span class="shrink-0 font-mono text-[12px] font-semibold text-accent-dark">{{ dir.po }}</span>
                </span>
                <span class="flex items-center justify-between gap-2">
                  <span class="min-w-0 truncate text-[12.5px] text-ink-soft">
                    {{ dir.medicamento || "—" }}<template v-if="sufixoOrdemPaciente(dir.paciente)"> · ordem {{ sufixoOrdemPaciente(dir.paciente) }}</template>
                  </span>
                  <DirBancoChip :id="`dir-incluir-banco-${dir.id}`" :banco="dir.banco" />
                </span>
              </button>
            </li>
          </ul>
          <p v-if="resultado.total > resultado.itens.length" id="dir-incluir-mais" class="pt-3 text-center text-[12px] text-ink-soft">
            Mostrando {{ resultado.itens.length }} de {{ resultado.total }}. Refine a busca.
          </p>
        </template>
      </div>
    </div>
  </BaseModal>
</template>
