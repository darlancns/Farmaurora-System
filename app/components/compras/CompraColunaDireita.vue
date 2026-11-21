<script setup lang="ts">
import { computed } from "vue";
import type { Compra, DespachanteCadastroResumo } from "#shared/types/compra";
import { compraParaResumoEntrada, montarResumo, resumoParaTexto } from "#shared/utils/compraResumo";
import { useCopiarTexto } from "../../composables/useCopiarTexto";
import { useToast } from "../../composables/useToast";
import { BOTAO_PRIMARIO_CLASS, BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import CompraResumoPainel from "./CompraResumoPainel.vue";

// A coluna da direita: SÓ o resumo. No topo, dois botões lado a lado: "Copiar resumo" e "Encaminhar para a DIR" (visível e DESABILITADO até a
// migração da DIR). Abaixo, o resumo ao vivo no modo "modelo" (todos os rótulos; vazio = traço), refeito a cada digitação a partir da compra
// que está na tela (sem esperar o salvamento): montarResumo é uma função pura compartilhada. O despachante do Cadastro (telefone, e-mail e
// contato; NUNCA PIX) vem de GET /api/compras/opcoes, via a página.
//
// "Copiar resumo" copia o texto do modo "copia" (resumoParaTexto(montarResumo(e, "copia")): só as linhas com valor, "pendente ⏳" no local e na
// entrega) e fica habilitado para quem só lê (copiar não altera dados).
const props = defineProps<{
  compra: Compra;
  /** O despachante da compra no Cadastro (ou null). */
  despachanteCadastro: DespachanteCadastroResumo | null;
}>();

const { copiar } = useCopiarTexto();
const { showToast } = useToast();

const entrada = computed(() => compraParaResumoEntrada(props.compra, props.despachanteCadastro));
const modelo = computed(() => montarResumo(entrada.value, "modelo"));

async function copiarResumo(): Promise<void> {
  const ok = await copiar(resumoParaTexto(montarResumo(entrada.value, "copia")));
  showToast(ok ? "Resumo copiado" : "Não foi possível copiar o resumo. Selecione o texto e copie manualmente.");
}
</script>

<template>
  <div id="compra-coluna-direita" class="flex flex-col gap-4 max-lg:pb-28">
    <!-- Abaixo de lg a barra dos botões fica FIXA no pé da tela (acima da barra de navegação do app, com o safe-area do iPhone), com
         "Copiar resumo" e "Encaminhar" lado a lado. Em lg+ também ficam lado a lado, no topo da coluna. -->
    <div
      id="compra-barra-acoes"
      class="flex gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] max-lg:z-30 max-lg:border-t max-lg:border-hairline max-lg:bg-paper-raised max-lg:px-4 max-lg:py-2.5"
    >
      <button id="btn-copiar-resumo" type="button" :class="[BOTAO_PRIMARIO_CLASS, 'flex-1']" @click="copiarResumo">Copiar resumo</button>
      <button id="btn-encaminhar-dir" type="button" :class="[BOTAO_SECUNDARIO_CLASS, 'flex-1']" disabled title="Em breve: depende da migração da DIR">Encaminhar para a DIR</button>
    </div>

    <CompraResumoPainel :blocos="modelo" />
  </div>
</template>
