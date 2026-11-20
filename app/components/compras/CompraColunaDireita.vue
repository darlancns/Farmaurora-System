<script setup lang="ts">
import { computed } from "vue";
import type { Compra, DespachanteCadastroResumo } from "#shared/types/compra";
import { checklistCompra } from "#shared/utils/compraChecklist";
import { compraParaResumoEntrada, montarResumoCompra } from "#shared/utils/compraResumo";
import { useCopiarTexto } from "../../composables/useCopiarTexto";
import { useToast } from "../../composables/useToast";
import { BOTAO_PRIMARIO_CLASS, BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import CompraChecklistPainel from "./CompraChecklistPainel.vue";
import CompraResumoPainel from "./CompraResumoPainel.vue";

// A coluna da direita: "Antes de encaminhar" (checklist), os botões e o resumo ao vivo. Tudo é calculado AQUI, na hora, a partir da
// compra que está na tela (sem esperar o salvamento): checklistCompra e montarResumoCompra são funções puras compartilhadas com o
// servidor. O despachante do Cadastro (telefone, e-mail e contato; NUNCA PIX) vem de GET /api/compras/opcoes, via a página.
//
// "Copiar resumo" copia EXATAMENTE a string do resumo e fica habilitado para quem só lê (copiar não altera dados). "Encaminhar para a
// DIR" é da etapa 7: aparece desabilitado.
const props = defineProps<{
  compra: Compra;
  /** O despachante da compra no Cadastro (ou null). */
  despachanteCadastro: DespachanteCadastroResumo | null;
}>();

const { copiar } = useCopiarTexto();
const { showToast } = useToast();

const checklist = computed(() => checklistCompra(props.compra));
const resumo = computed(() => montarResumoCompra(compraParaResumoEntrada(props.compra, props.despachanteCadastro)));

async function copiarResumo(): Promise<void> {
  const ok = await copiar(resumo.value);
  showToast(ok ? "Resumo copiado" : "Não foi possível copiar o resumo. Selecione o texto e copie manualmente.");
}
</script>

<template>
  <div id="compra-coluna-direita" class="flex flex-col gap-4">
    <CompraChecklistPainel :itens="checklist.itens" :pronta="checklist.pronta" />

    <div class="flex flex-col gap-2">
      <button id="btn-copiar-resumo" type="button" :class="BOTAO_PRIMARIO_CLASS" @click="copiarResumo">Copiar resumo</button>
      <button id="btn-encaminhar-dir" type="button" :class="BOTAO_SECUNDARIO_CLASS" disabled aria-describedby="encaminhar-dir-aviso">Encaminhar para a DIR</button>
      <p id="encaminhar-dir-aviso" class="text-[11.5px] text-ink-soft">Disponível na próxima etapa</p>
    </div>

    <CompraResumoPainel :texto="resumo" />
  </div>
</template>
