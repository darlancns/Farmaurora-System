<script setup lang="ts">
import { computed, nextTick, provide, watch } from "vue";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import type { EstadoSalvamento } from "../../composables/useCompraEditor";
import { ACOES_COMPRA_KEY, ACOES_VAZIAS, type AcoesCompra } from "../../utils/comprasContexto";
import type { OpcoesFormulario } from "../../utils/comprasOpcoes";
import CompraFaixaApagada from "./CompraFaixaApagada.vue";
import CompraFaixaConflito from "./CompraFaixaConflito.vue";
import CompraFormCabecalho from "./CompraFormCabecalho.vue";
import CompraLinhaNumero from "./CompraLinhaNumero.vue";
import CompraLinhaOrdens from "./CompraLinhaOrdens.vue";
import CompraLinhasAvisos from "./CompraLinhasAvisos.vue";
import CompraLinhasEnvio from "./CompraLinhasEnvio.vue";
import CompraLinhasLocal from "./CompraLinhasLocal.vue";
import CompraLinhasMedicamento from "./CompraLinhasMedicamento.vue";
import CompraLinhasPaciente from "./CompraLinhasPaciente.vue";
import CompraLinhasPagamento from "./CompraLinhasPagamento.vue";
import CompraLinhasResponsaveis from "./CompraLinhasResponsaveis.vue";
import CompraLinhasValores from "./CompraLinhasValores.vue";

// A coluna central: o cabeçalho, a faixa de conflito e UM ÚNICO BLOCO de campos (sem fieldsets nem títulos de seção): uma linha
// (CompraCampo) por tópico, NA ORDEM EXATA do resumo (as linhas de montarResumo("modelo"), a 1ª é o Nº da compra = o título do resumo). A ordem do DOM é a do Tab
// (nenhum tabindex positivo). O teste de arquitetura de ordem confere `data-linha` contra o resumo.
const props = defineProps<{
  compra: Compra;
  estado: EstadoSalvamento;
  mensagemErro?: string | null;
  /** Acabaram as tentativas automáticas de salvar: só o clique salva de novo. */
  esperandoClique?: boolean;
  /** O servidor recusou o Nº da compra (já existe no mês): aparece no campo, sem perder o que foi digitado. */
  erroNumero?: string | null;
  /** O número que vale no servidor (o do título): difere do digitado enquanto o número recusado está na tela. */
  sequenciaExibida?: number;
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
  apagar: [];
  fecharApagada: [];
  tentarDeNovo: [];
  carregarVersaoSalva: [];
  manterMinhas: [];
  voltar: [];
}>();

const desabilitado = computed(() => !props.podeEditar || props.compra.cancelada);

// "+ Nova compra": o foco vai para o campo Medicamento do Med. 1 (depois de a compra e o medicamento vazio estarem no DOM).
watch(
  () => props.pedidoDeFocoMedicamento,
  async () => {
    await nextTick();
    const primeiro = props.compra.itens[0];
    if (primeiro) document.getElementById(`compra-item-${primeiro.id}-medicamento`)?.focus();
  },
  { flush: "post" },
);

const alterar = (m: MudancasCompra): void => emit("alterar", m);
</script>

<template>
  <section id="compra-formulario" aria-label="Formulário da compra" :data-salvamento="estado" class="flex flex-col gap-4">
    <CompraFormCabecalho
      :ano-mes="compra.anoMes"
      :sequencia="sequenciaExibida ?? compra.sequencia"
      :cancelada="compra.cancelada"
      :pode-editar="podeEditar"
      :estado="estado"
      :mensagem-erro="mensagemErro"
      :esperando-clique="esperandoClique"
      :ocupado="ocupado"
      @duplicar="emit('duplicar')"
      @cancelar="emit('cancelar')"
      @apagar="emit('apagar')"
      @tentar-de-novo="emit('tentarDeNovo')"
      @voltar="emit('voltar')"
    />

    <CompraFaixaApagada v-if="estado === 'apagada'" @fechar="emit('fecharApagada')" />

    <CompraFaixaConflito v-if="estado === 'conflito'" :ocupado="ocupado" @carregar="emit('carregarVersaoSalva')" @manter="emit('manterMinhas')" />

    <div id="compra-campos" :aria-disabled="desabilitado ? 'true' : undefined" class="rounded-lg border border-hairline bg-paper-raised px-4 lg:px-5">
      <CompraLinhaNumero :compra="compra" :desabilitado="desabilitado" :erro-do-servidor="erroNumero" @alterar="alterar" />
      <CompraLinhasMedicamento :compra="compra" :desabilitado="desabilitado" @alterar="alterar" />
      <CompraLinhaOrdens :compra="compra" :desabilitado="desabilitado" @alterar="alterar" />
      <CompraLinhasValores :compra="compra" :desabilitado="desabilitado" :opcoes="opcoes" @alterar="alterar" />
      <CompraLinhasEnvio :compra="compra" :desabilitado="desabilitado" :opcoes="opcoes" @alterar="alterar" />
      <CompraLinhasPagamento :compra="compra" :desabilitado="desabilitado" @alterar="alterar" />
      <CompraLinhasPaciente :compra="compra" :desabilitado="desabilitado" :opcoes="opcoes" @alterar="alterar" />
      <CompraLinhasAvisos :compra="compra" :desabilitado="desabilitado" @alterar="alterar" />
      <CompraLinhasResponsaveis :compra="compra" :desabilitado="desabilitado" :opcoes="opcoes" @alterar="alterar" />
      <CompraLinhasLocal :compra="compra" :desabilitado="desabilitado" @alterar="alterar" />
    </div>
  </section>
</template>
