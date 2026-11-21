<script setup lang="ts">
import { computed } from "vue";
import type { Compra, DespachanteCadastroResumo } from "#shared/types/compra";
import { checklistCompra } from "#shared/utils/compraChecklist";
import { compraParaResumoEntrada, montarResumoCompra } from "#shared/utils/compraResumo";
import { useCopiarTexto } from "../../composables/useCopiarTexto";
import { useToast } from "../../composables/useToast";
import { campoDoItem } from "../../utils/comprasCampos";
import { BOTAO_PRIMARIO_CLASS, BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import CompraChecklistPainel, { type ItemComCampo } from "./CompraChecklistPainel.vue";
import CompraResumoPainel from "./CompraResumoPainel.vue";

// A coluna da direita: "Antes de encaminhar" (checklist), os botões e o resumo ao vivo. Tudo é calculado AQUI, na hora, a partir da
// compra que está na tela (sem esperar o salvamento): checklistCompra e montarResumoCompra são funções puras compartilhadas com o
// servidor. O despachante do Cadastro (telefone, e-mail e contato; NUNCA PIX) vem de GET /api/compras/opcoes, via a página.
//
// "Copiar resumo" copia EXATAMENTE a string do resumo e fica habilitado para quem só lê (copiar não altera dados). "Encaminhar para a
// DIR" fica visível e DESABILITADO até a migração da DIR (não há ação nem permissão que o habilite).
const props = defineProps<{
  compra: Compra;
  /** O despachante da compra no Cadastro (ou null). */
  despachanteCadastro: DespachanteCadastroResumo | null;
}>();

const emit = defineEmits<{ irParaCampo: [campo: string] }>();

const { copiar } = useCopiarTexto();
const { showToast } = useToast();

const checklist = computed(() => checklistCompra(props.compra));
// Cada erro ou aviso que corresponde a um campo vira botão (o mapa único está em comprasCampos.ts); item ok nunca é botão.
const itensComCampo = computed<ItemComCampo[]>(() => checklist.value.itens.map((i) => ({ ...i, campo: i.nivel === "ok" ? null : campoDoItem(i.id, props.compra) })));
const resumo = computed(() => montarResumoCompra(compraParaResumoEntrada(props.compra, props.despachanteCadastro)));

async function copiarResumo(): Promise<void> {
  const ok = await copiar(resumo.value);
  showToast(ok ? "Resumo copiado" : "Não foi possível copiar o resumo. Selecione o texto e copie manualmente.");
}
</script>

<template>
  <div id="compra-coluna-direita" class="flex flex-col gap-4 max-lg:pb-28">
    <CompraChecklistPainel :itens="itensComCampo" :pronta="checklist.pronta" @ir-para-campo="(campo: string) => emit('irParaCampo', campo)" />

    <!-- Abaixo de lg a barra dos botões fica FIXA no pé da tela (acima da barra de navegação do app, com o safe-area do iPhone), com
         "Copiar resumo" e "Encaminhar" lado a lado. Em lg+ são botões comuns, um embaixo do outro. -->
    <div
      id="compra-barra-acoes"
      class="flex flex-col gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] max-lg:z-30 max-lg:border-t max-lg:border-hairline max-lg:bg-paper-raised max-lg:px-4 max-lg:py-2.5"
    >
      <div class="flex flex-col gap-2 max-lg:flex-row">
        <button id="btn-copiar-resumo" type="button" :class="[BOTAO_PRIMARIO_CLASS, 'max-lg:min-h-11 max-lg:flex-1']" @click="copiarResumo">Copiar resumo</button>
        <button id="btn-encaminhar-dir" type="button" :class="[BOTAO_SECUNDARIO_CLASS, 'max-lg:min-h-11 max-lg:flex-1']" disabled title="Em breve: depende da migração da DIR">Encaminhar para a DIR</button>
      </div>
    </div>

    <CompraResumoPainel :texto="resumo" />
  </div>
</template>
