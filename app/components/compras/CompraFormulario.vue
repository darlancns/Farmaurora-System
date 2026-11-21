<script setup lang="ts">
import { computed, provide } from "vue";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import type { EstadoSalvamento } from "../../composables/useCompraEditor";
import { ACOES_COMPRA_KEY, ACOES_VAZIAS, type AcoesCompra } from "../../utils/comprasContexto";
import type { OpcoesFormulario } from "../../utils/comprasOpcoes";
import CompraFaixaConflito from "./CompraFaixaConflito.vue";
import CompraFormCabecalho from "./CompraFormCabecalho.vue";

// A coluna central: o cabeçalho, a faixa de conflito e UM ÚNICO BLOCO de campos (sem fieldsets nem títulos de seção): uma linha
// (CompraCampo) por tópico, NA ORDEM EXATA do resumo (as linhas de montarResumo("modelo"), sem o título). A ordem do DOM é a do Tab
// (nenhum tabindex positivo). O teste de arquitetura (comprasBlocosOrdem.spec.ts) confere `data-linha` contra o resumo.
const props = defineProps<{
  compra: Compra;
  estado: EstadoSalvamento;
  salvoEm: Date | null;
  mensagemErro?: string | null;
  /** Acabaram as tentativas automáticas de salvar: só o clique salva de novo. */
  esperandoClique?: boolean;
  /** Quem pode escrever em Compras (a permissão). Compra cancelada é somente leitura de qualquer jeito. */
  podeEditar: boolean;
  opcoes: OpcoesFormulario;
  /** O que as linhas pedem ao servidor (busca de medicamento, pré-cadastro, temperatura nova). Sem ele, não buscam nem registram. */
  acoes?: AcoesCompra;
  ocupado?: boolean;
  /** Sobe a cada "+ Nova compra": leva o foco ao campo Medicamento do Med. 1. */
  pedidoDeFocoMedicamento?: number;
}>();

// As linhas recebem as ações por provide/inject, sem repassar a prop linha a linha.
provide(ACOES_COMPRA_KEY, props.acoes ?? ACOES_VAZIAS);

const emit = defineEmits<{
  alterar: [mudancas: MudancasCompra];
  duplicar: [];
  cancelar: [];
  tentarDeNovo: [];
  carregarVersaoSalva: [];
  manterMinhas: [];
  voltar: [];
}>();

const desabilitado = computed(() => !props.podeEditar || props.compra.cancelada);
</script>

<template>
  <section id="compra-formulario" aria-label="Formulário da compra" class="flex flex-col gap-4">
    <CompraFormCabecalho
      :ano-mes="compra.anoMes"
      :sequencia="compra.sequencia"
      :cancelada="compra.cancelada"
      :pode-editar="podeEditar"
      :estado="estado"
      :salvo-em="salvoEm"
      :mensagem-erro="mensagemErro"
      :esperando-clique="esperandoClique"
      :ocupado="ocupado"
      @duplicar="emit('duplicar')"
      @cancelar="emit('cancelar')"
      @tentar-de-novo="emit('tentarDeNovo')"
      @voltar="emit('voltar')"
    />

    <CompraFaixaConflito v-if="estado === 'conflito'" :ocupado="ocupado" @carregar="emit('carregarVersaoSalva')" @manter="emit('manterMinhas')" />

    <div id="compra-campos" :aria-disabled="desabilitado ? 'true' : undefined" class="rounded-lg border border-hairline bg-paper-raised px-4 lg:px-5" />
  </section>
</template>
