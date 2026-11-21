<script setup lang="ts">
import { computed } from "vue";
import type { ItemCompra } from "#shared/types/compra";
import CompraCampo from "./CompraCampo.vue";

// Uma linha do formulário cujo valor é POR MEDICAMENTO (Medicamento, Laboratório, Brand, Quantidade, Valor unitário, Valor real e
// Temperatura): com UM medicamento, um controle só (o rótulo da linha é o <label for> dele); com DOIS OU MAIS, um controle por
// medicamento, empilhados e rotulados "Med. 1", "Med. 2"..., cada um num grupo (aria-label "Med. N") e com o nome acessível
// "<rótulo>, Med. N" (`nomeAcessivel`). O id do controle é fixo e estável: compra-item-<id do medicamento>-<campo>.
const props = defineProps<{
  /** O id da linha no resumo (data-linha): laboratorio, brand, valor_unitario... */
  idLinha: string;
  rotulo: string;
  itens: readonly ItemCompra[];
  /** O sufixo do id do controle ("laboratorio", "valor-unitario"...). */
  campo: string;
  erro?: string | null;
}>();

defineSlots<{
  default(props: { item: ItemCompra; indice: number; idControle: string; nomeAcessivel: string | undefined; total: number }): unknown;
  rodape?(): unknown;
}>();

const varios = computed(() => props.itens.length > 1);
const idControle = (item: ItemCompra): string => `compra-item-${item.id}-${props.campo}`;
</script>

<template>
  <CompraCampo :id-linha="idLinha" :rotulo="rotulo" :para="itens.length === 1 ? idControle(itens[0]!) : undefined" :erro="erro">
    <p v-if="itens.length === 0" class="pt-2 text-[13px] text-ink-soft">Sem medicamento: adicione um na linha Medicamento.</p>
    <div v-else-if="!varios">
      <slot :item="itens[0]!" :indice="0" :id-controle="idControle(itens[0]!)" :nome-acessivel="undefined" :total="1" />
    </div>
    <div v-else class="flex flex-col gap-2.5">
      <div v-for="(item, i) in itens" :key="item.id" role="group" :aria-label="`Med. ${i + 1}`" class="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-1">
        <!-- Etiqueta COMPACTA colada ao controle (3rem, texto pequeno): não cria uma coluna larga entre o rótulo da linha e o input. -->
        <label :for="idControle(item)" data-etiqueta-med class="pt-2.5 text-[11px] leading-none font-semibold whitespace-nowrap text-ink-soft">Med. {{ i + 1 }}</label>
        <div class="min-w-0">
          <slot :item="item" :indice="i" :id-controle="idControle(item)" :nome-acessivel="`${rotulo}, Med. ${i + 1}`" :total="itens.length" />
        </div>
      </div>
    </div>
    <slot name="rodape" />
  </CompraCampo>
</template>
