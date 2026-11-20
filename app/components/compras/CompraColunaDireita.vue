<script setup lang="ts">
import { computed } from "vue";
import type { Compra, DespachanteCadastroResumo } from "#shared/types/compra";
import { checklistCompra } from "#shared/utils/compraChecklist";
import { compraParaResumoEntrada, montarResumoCompra } from "#shared/utils/compraResumo";
import type { EstadoPainelEncaminhar } from "../../composables/useEncaminharCompra";
import { useCopiarTexto } from "../../composables/useCopiarTexto";
import { useToast } from "../../composables/useToast";
import { campoDoItem } from "../../utils/comprasCampos";
import { TEXTO_ENCAMINHAR_DISPONIVEL, razaoEncaminharDesabilitado, rotuloBotaoEncaminhar } from "../../utils/comprasEncaminhar";
import { BOTAO_PRIMARIO_CLASS, BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import CompraChecklistPainel, { type ItemComCampo } from "./CompraChecklistPainel.vue";
import CompraEncaminharPainel from "./CompraEncaminharPainel.vue";
import CompraResumoPainel from "./CompraResumoPainel.vue";

// A coluna da direita: "Antes de encaminhar" (checklist), os botões e o resumo ao vivo. Tudo é calculado AQUI, na hora, a partir da
// compra que está na tela (sem esperar o salvamento): checklistCompra e montarResumoCompra são funções puras compartilhadas com o
// servidor. O despachante do Cadastro (telefone, e-mail e contato; NUNCA PIX) vem de GET /api/compras/opcoes, via a página.
//
// "Copiar resumo" copia EXATAMENTE a string do resumo e fica habilitado para quem só lê (copiar não altera dados). "Encaminhar para a
// DIR" abre o PAINEL DE ENCAMINHAMENTO no lugar do checklist e do resumo; só habilita para quem escreve em Compras E na DIR, com a compra
// aberta, não cancelada e com ao menos uma ordem sem dir_id. Desabilitado, a razão aparece em texto ao lado (aria-describedby).
const props = withDefaults(
  defineProps<{
    compra: Compra;
    /** O despachante da compra no Cadastro (ou null). */
    despachanteCadastro: DespachanteCadastroResumo | null;
    /** canWrite("compras") e canWrite("dir"): as MESMAS funções de permissão do app (nunca uma regra copiada). */
    podeEscreverCompras?: boolean;
    podeEscreverDir?: boolean;
    /** O retrato do painel de encaminhamento; aberto = a coluna mostra o painel no lugar do checklist e do resumo. */
    encaminhar?: EstadoPainelEncaminhar | null;
    /** POs que a última prévia diz que já existem na DIR (entra no checklist como erro). */
    poJaNaDir?: readonly string[];
  }>(),
  { podeEscreverCompras: false, podeEscreverDir: false, encaminhar: null, poJaNaDir: () => [] },
);

const emit = defineEmits<{
  irParaCampo: [campo: string];
  encaminhar: [];
  voltarAoResumo: [];
  enviarEncaminhar: [];
  confirmarTemperatura: [chave: string, valor: boolean];
  recarregarPrevia: [];
}>();

const { copiar } = useCopiarTexto();
const { showToast } = useToast();

const checklist = computed(() => checklistCompra(props.compra, props.poJaNaDir.length > 0 ? { poJaNaDir: [...props.poJaNaDir] } : {}));
// Cada erro ou aviso que corresponde a um campo vira botão (o mapa único está em comprasCampos.ts); item ok nunca é botão.
const itensComCampo = computed<ItemComCampo[]>(() => checklist.value.itens.map((i) => ({ ...i, campo: i.nivel === "ok" ? null : campoDoItem(i.id, props.compra) })));
const resumo = computed(() => montarResumoCompra(compraParaResumoEntrada(props.compra, props.despachanteCadastro)));

const painelAberto = computed(() => props.encaminhar?.aberto === true);
const razao = computed(() => razaoEncaminharDesabilitado(props.compra, { compras: props.podeEscreverCompras, dir: props.podeEscreverDir }));

async function copiarResumo(): Promise<void> {
  const ok = await copiar(resumo.value);
  showToast(ok ? "Resumo copiado" : "Não foi possível copiar o resumo. Selecione o texto e copie manualmente.");
}
</script>

<template>
  <div id="compra-coluna-direita" class="flex flex-col gap-4 max-lg:pb-28">
    <CompraEncaminharPainel
      v-if="painelAberto && encaminhar"
      :painel="encaminhar"
      :compra="compra"
      @voltar="emit('voltarAoResumo')"
      @enviar="emit('enviarEncaminhar')"
      @confirmar="(chave: string, valor: boolean) => emit('confirmarTemperatura', chave, valor)"
      @ir-para-campo="(campo: string) => emit('irParaCampo', campo)"
      @recarregar="emit('recarregarPrevia')"
    />

    <template v-else>
      <CompraChecklistPainel :itens="itensComCampo" :pronta="checklist.pronta" @ir-para-campo="(campo: string) => emit('irParaCampo', campo)" />

      <!-- Abaixo de lg a barra dos botões fica FIXA no pé da tela (acima da barra de navegação do app, com o safe-area do iPhone), com
           "Copiar resumo" e "Encaminhar" lado a lado. Em lg+ são botões comuns, um embaixo do outro. -->
      <div
        id="compra-barra-acoes"
        class="flex flex-col gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] max-lg:z-30 max-lg:border-t max-lg:border-hairline max-lg:bg-paper-raised max-lg:px-4 max-lg:py-2.5"
      >
        <div class="flex flex-col gap-2 max-lg:flex-row">
          <button id="btn-copiar-resumo" type="button" :class="[BOTAO_PRIMARIO_CLASS, 'max-lg:min-h-11 max-lg:flex-1']" @click="copiarResumo">Copiar resumo</button>
          <button id="btn-encaminhar-dir" type="button" :class="[BOTAO_SECUNDARIO_CLASS, 'max-lg:min-h-11 max-lg:flex-1']" :disabled="razao !== null" aria-describedby="encaminhar-dir-aviso" @click="emit('encaminhar')">Encaminhar para a DIR</button>
        </div>
        <p id="encaminhar-dir-aviso" class="text-[11.5px] text-ink-soft max-lg:text-center">{{ razao ?? TEXTO_ENCAMINHAR_DISPONIVEL }}</p>
      </div>

      <CompraResumoPainel :texto="resumo" />
    </template>

    <!-- Com o painel aberto, abaixo de lg a barra do pé vira "Voltar" e "Encaminhar N linha(s)" (em lg+ esses botões estão no próprio painel). -->
    <div
      v-if="painelAberto && encaminhar"
      id="compra-barra-encaminhar"
      class="flex flex-row gap-2 lg:hidden max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] max-lg:z-30 max-lg:border-t max-lg:border-hairline max-lg:bg-paper-raised max-lg:px-4 max-lg:py-2.5"
    >
      <button id="btn-encaminhar-voltar-celular" type="button" :class="[BOTAO_SECUNDARIO_CLASS, 'max-lg:min-h-11 max-lg:flex-1']" @click="emit('voltarAoResumo')">Voltar</button>
      <button
        v-if="encaminhar.resultado === null && encaminhar.previa"
        id="btn-encaminhar-confirmar-celular"
        type="button"
        :class="[BOTAO_PRIMARIO_CLASS, 'max-lg:min-h-11 max-lg:flex-1']"
        :disabled="!encaminhar.podeEnviar"
        aria-describedby="encaminhar-apoio"
        @click="emit('enviarEncaminhar')"
      >
        {{ encaminhar.enviando ? "Encaminhando…" : rotuloBotaoEncaminhar(encaminhar.linhasPendentes) }}
      </button>
    </div>
  </div>
</template>
