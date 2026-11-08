<script setup lang="ts">
import { computed, watch } from "vue";
import type { ConsultorProcesso, Processo } from "#shared/types/processo";
import { useAberturaPorBusca, type AberturaPorBusca } from "../../composables/useAberturaPorBusca";
import { agruparProcessosPorConsultor, type ProcessoGroup } from "../../utils/agruparProcessosPorConsultor";
import type { ContagemPorPasta } from "../../utils/remessaNaLinha";
import ProcessoRow from "./ProcessoRow.vue";

const props = withDefaults(
  defineProps<{
    processos: Processo[];
    // Somente leitura: esconde os controles de criar/editar/excluir nas linhas.
    readonly?: boolean;
    // Lista direta, sem o agrupamento por consultor (usado pelo cargo consultor,
    // que só vê os próprios processos).
    flat?: boolean;
    // Processo a revelar/destacar (vindo de ?processo=<id>): expande o grupo do consultor dele.
    focoId?: string;
    // Estado de abertura (grupos e detalhes) controlado pela página — é ele que abre sozinho ao buscar.
    // Sem ele a lista cuida do próprio estado (tudo recolhido no começo), como sempre.
    abertura?: AberturaPorBusca;
    // Pasta → quantos processos a têm, sobre TODOS os carregados (Andamento + Entregues), nunca só os filtrados pela
    // busca. Decide se a linha mostra "Remessa N" (ver utils/remessaNaLinha.ts). Sem ele, só vale Nº Remessa > 1.
    contagemPasta?: ContagemPorPasta;
  }>(),
  { readonly: false, flat: false, focoId: "", abertura: undefined, contagemPasta: () => new Map() },
);

const emit = defineEmits<{
  edit: [processo: Processo];
  delete: [id: string];
}>();

// Todos os grupos começam colapsados — ao entrar na página o usuário vê só os
// nomes dos consultores, e expande o que quiser conferir.
const semBusca = useAberturaPorBusca({ termo: () => "", encontrados: () => [], agrupado: () => true });
const controle = computed<AberturaPorBusca>(() => props.abertura ?? semBusca);

function grupoAberto(consultor: ConsultorProcesso): boolean {
  return controle.value.grupos.has(consultor);
}

function toggleGroup(group: ProcessoGroup): void {
  controle.value.alternarGrupo(
    group.consultor,
    group.processos.map((processo) => processo.id),
  );
}

watch(
  () => props.focoId,
  (id) => {
    if (!id) return;
    const alvo = props.processos.find((p) => p.id === id);
    if (alvo) controle.value.abrirGrupo(alvo.consultor);
  },
  { immediate: true },
);

const groups = computed<ProcessoGroup[]>(() => agruparProcessosPorConsultor(props.processos));
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
        :destaque="processo.id === focoId"
        :contagem-pasta="contagemPasta"
        :expandido="controle.detalhes.has(processo.id)"
        @update:expandido="controle.definirDetalhe(processo.id, $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
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
        @click="toggleGroup(group)"
      >
        <div class="flex items-center gap-2">
          <svg
            viewBox="0 0 20 20"
            class="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform"
            :class="{ 'rotate-90': grupoAberto(group.consultor) }"
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

      <div v-if="grupoAberto(group.consultor)">
        <ProcessoRow
          v-for="processo in group.processos"
          :key="processo.id"
          :processo="processo"
          :readonly="readonly"
          :destaque="processo.id === focoId"
          :contagem-pasta="contagemPasta"
          :expandido="controle.detalhes.has(processo.id)"
          @update:expandido="controle.definirDetalhe(processo.id, $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </div>
  </div>
</template>
