<script setup lang="ts">
import { computed, ref } from "vue";
import { COMPRA_MAX_ORDENS } from "#shared/constants/compra";
import type { MudancasCompra, OrdemCompra } from "#shared/types/compra";
import { ordemTemConteudo, ordemVazia, renumerar } from "#shared/utils/compraForm";
import type { PropsBloco } from "../../../utils/comprasBlocos";
import { BOTAO_SECUNDARIO_CLASS } from "../../../utils/comprasEstilos";
import ConfirmDialog from "../../ConfirmDialog.vue";
import CompraOrdemCartao from "../CompraOrdemCartao.vue";

// Bloco `medicamentos_e_ordens`: uma "Ordem N" por cartão, cada uma com os seus medicamentos. A posição (1..N) é recalculada pela
// ordem na tela (renumerar). Limites do servidor: 10 ordens por compra (e 30 itens por ordem, no cartão). "Remover ordem" só a partir
// da 2ª, bloqueado na ordem já encaminhada para a DIR e com confirmação quando a ordem tem qualquer coisa preenchida.
const props = defineProps<PropsBloco>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const noLimite = computed(() => props.compra.ordens.length >= COMPRA_MAX_ORDENS);
const removendo = ref<string | null>(null);
const ordemRemovendo = computed(() => props.compra.ordens.find((o) => o.id === removendo.value) ?? null);

function trocar(ordens: OrdemCompra[]): void {
  emit("alterar", { ordens: renumerar(ordens) });
}

function atualizarOrdem(nova: OrdemCompra): void {
  trocar(props.compra.ordens.map((o) => (o.id === nova.id ? nova : o)));
}

function adicionarOrdem(): void {
  if (noLimite.value) return;
  trocar([...props.compra.ordens, ordemVazia(props.compra.ordens.length + 1)]);
}

function pedirRemocao(ordem: OrdemCompra): void {
  if (ordem.dirId !== null && ordem.dirId.trim() !== "") return; // já encaminhada: não se remove
  if (!ordemTemConteudo(ordem)) {
    remover(ordem.id);
    return;
  }
  removendo.value = ordem.id;
}

function remover(id: string): void {
  trocar(props.compra.ordens.filter((o) => o.id !== id));
  removendo.value = null;
}
</script>

<template>
  <div data-bloco="medicamentos_e_ordens" class="flex flex-col gap-3 sm:col-span-2 xl:col-span-4">
    <p class="text-[12px] text-ink-soft">Cada ordem vira uma linha da DIR com o seu PO.</p>

    <CompraOrdemCartao
      v-for="(ordem, indice) in compra.ordens"
      :key="ordem.id"
      :ordem="ordem"
      :numero="indice + 1"
      :pode-remover="indice > 0 && !desabilitado"
      :desabilitado="desabilitado"
      :opcoes="opcoes"
      @atualizar="atualizarOrdem"
      @remover="pedirRemocao(ordem)"
    />

    <div v-if="!desabilitado" class="flex flex-wrap items-center gap-2">
      <button id="compra-adicionar-ordem" type="button" :disabled="noLimite" :title="noLimite ? 'Limite de 10 ordens por compra' : undefined" :class="BOTAO_SECUNDARIO_CLASS" @click="adicionarOrdem">
        + Adicionar ordem (outro fornecedor)
      </button>
      <span v-if="noLimite" class="text-[11.5px] text-ink-soft">Limite de {{ COMPRA_MAX_ORDENS }} ordens por compra.</span>
    </div>

    <ConfirmDialog
      v-if="ordemRemovendo"
      title="Remover ordem"
      message="Essa ordem tem dados preenchidos. Remover mesmo assim? Os medicamentos dela também saem."
      confirm-label="Remover ordem"
      cancel-label="Voltar"
      danger
      reforcado
      @confirm="remover(ordemRemovendo.id)"
      @close="removendo = null"
    />
  </div>
</template>
