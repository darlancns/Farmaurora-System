<script setup lang="ts">
import { computed, ref } from "vue";
import type { ItemChecklist } from "#shared/utils/compraChecklist";

/** Um item do checklist com o campo do formulário que o resolve (data-campo), ou null quando não há campo. */
export type ItemComCampo = ItemChecklist & { campo: string | null };

// "Antes de encaminhar": a checagem da compra (checklistCompra). Os erros primeiro (✕ vermelho), depois os avisos (! âmbar) e os
// itens "ok" recolhidos num contador que expande. Cada item de ordem leva a etiqueta "Ordem N". Erro ou aviso que corresponde a um campo
// é um BOTÃO: clicar rola até o campo e leva o foco a ele (`irParaCampo`); item "ok" nunca é botão. Só desenha: quem calcula é a coluna
// da direita, ao vivo, a cada digitação.
const props = defineProps<{
  itens: ItemComCampo[];
  pronta: boolean;
}>();

const emit = defineEmits<{ irParaCampo: [campo: string] }>();

const okAberto = ref(false);

const erros = computed(() => props.itens.filter((i) => i.nivel === "erro"));
const avisos = computed(() => props.itens.filter((i) => i.nivel === "aviso"));
const oks = computed(() => props.itens.filter((i) => i.nivel === "ok"));
const rotuloOk = computed(() => (oks.value.length === 1 ? "1 item ok" : `${oks.value.length} itens ok`));
</script>

<template>
  <section id="compra-checklist" aria-labelledby="compra-checklist-titulo" class="rounded-lg border border-hairline bg-paper-raised p-3.5">
    <h3 id="compra-checklist-titulo" class="mb-2 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Antes de encaminhar</h3>

    <p v-if="pronta" id="compra-checklist-pronta" class="mb-2 text-[12.5px] font-semibold text-green-800">Nada pendente: pronta para encaminhar.</p>

    <ul v-if="erros.length > 0" id="compra-checklist-erros" class="mb-2 flex flex-col gap-1.5">
      <li v-for="item in erros" :key="item.id" :data-item="item.id" class="flex items-start gap-2 text-[12.5px] text-ink">
        <span class="mt-px w-3.5 shrink-0 text-center font-bold text-danger" aria-hidden="true">✕</span>
        <span class="min-w-0">
          <span class="sr-only">Pendência: </span>
          <button v-if="item.campo" type="button" :data-ir-campo="item.campo" class="min-h-11 text-left underline-offset-2 hover:text-accent-dark hover:underline focus-visible:outline-2 focus-visible:outline-accent-dark lg:min-h-0" @click="emit('irParaCampo', item.campo)">{{ item.texto }}</button>
          <template v-else>{{ item.texto }}</template>
          <span v-if="item.ordemPosicao !== undefined" class="ml-1 rounded bg-hairline/50 px-1.5 py-px text-[10.5px] font-semibold text-ink-soft">Ordem {{ item.ordemPosicao }}</span>
        </span>
      </li>
    </ul>

    <ul v-if="avisos.length > 0" id="compra-checklist-avisos" class="mb-2 flex flex-col gap-1.5">
      <li v-for="item in avisos" :key="item.id" :data-item="item.id" class="flex items-start gap-2 text-[12.5px] text-ink-soft">
        <span class="mt-px w-3.5 shrink-0 text-center font-bold text-warning-gold" aria-hidden="true">!</span>
        <span class="min-w-0">
          <span class="sr-only">Aviso: </span>
          <button v-if="item.campo" type="button" :data-ir-campo="item.campo" class="min-h-11 text-left underline-offset-2 hover:text-accent-dark hover:underline focus-visible:outline-2 focus-visible:outline-accent-dark lg:min-h-0" @click="emit('irParaCampo', item.campo)">{{ item.texto }}</button>
          <template v-else>{{ item.texto }}</template>
          <span v-if="item.ordemPosicao !== undefined" class="ml-1 rounded bg-hairline/50 px-1.5 py-px text-[10.5px] font-semibold text-ink-soft">Ordem {{ item.ordemPosicao }}</span>
        </span>
      </li>
    </ul>

    <div v-if="oks.length > 0">
      <button
        id="compra-checklist-ok-toggle"
        type="button"
        :aria-expanded="okAberto"
        aria-controls="compra-checklist-oks"
        class="text-[12px] font-semibold text-ink-soft underline-offset-2 hover:text-accent-dark hover:underline"
        @click="okAberto = !okAberto"
      >
        {{ rotuloOk }}
      </button>
      <ul v-if="okAberto" id="compra-checklist-oks" class="mt-1.5 flex flex-col gap-1">
        <li v-for="item in oks" :key="item.id" :data-item="item.id" class="flex items-start gap-2 text-[12px] text-ink-soft">
          <span class="w-3.5 shrink-0 text-center text-green-700" aria-hidden="true">✓</span>
          <span class="min-w-0">{{ item.texto }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
