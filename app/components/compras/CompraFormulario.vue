<script setup lang="ts">
import { computed, type Component } from "vue";
import { BLOCOS_DA_COMPRA, type BlocoDaCompra } from "#shared/constants/compraResumo";
import type { CamposCompraEditaveis, Compra, OpcaoNome } from "#shared/types/compra";
import { contarPendencias, statusDaCompra } from "#shared/utils/compraChecklist";
import type { EstadoSalvamento } from "../../composables/useCompraEditor";
import CompraBlocoPaciente from "./CompraBlocoPaciente.vue";
import CompraFaixaConflito from "./CompraFaixaConflito.vue";
import CompraFormCabecalho from "./CompraFormCabecalho.vue";

// A coluna central: cabeçalho, as faixas (conflito e cancelada) e os BLOCOS do formulário.
//
// OS BLOCOS saem na ordem de BLOCOS_DA_COMPRA (a mesma ordem do resumo): cada bloco é um componente, registrado em BLOCOS pelo id
// dele. Nesta etapa só existe o bloco do paciente; a etapa 6b registra os demais (ordens, pagamento, despachante, avisos...) aqui,
// sem mexer na ordem nem neste componente. Id sem componente simplesmente não aparece.
const BLOCOS: Partial<Record<BlocoDaCompra, Component>> = {
  paciente: CompraBlocoPaciente,
};

const props = defineProps<{
  compra: Compra;
  estado: EstadoSalvamento;
  salvoEm: Date | null;
  mensagemErro?: string | null;
  /** Quem pode escrever em Compras (a permissão). Compra cancelada é somente leitura de qualquer jeito. */
  podeEditar: boolean;
  consultores: OpcaoNome[];
  ocupado?: boolean;
}>();

const emit = defineEmits<{
  alterar: [mudancas: Partial<CamposCompraEditaveis>];
  duplicar: [];
  cancelar: [];
  tentarDeNovo: [];
  carregarVersaoSalva: [];
  manterMinhas: [];
}>();

const blocosDesenhados = computed(() => BLOCOS_DA_COMPRA.filter((id) => BLOCOS[id] !== undefined));
const desabilitado = computed(() => !props.podeEditar || props.compra.cancelada);
// O estado e as pendências do cabeçalho acompanham o que está na tela (a mesma checagem do painel da direita), sem esperar o salvamento.
const status = computed(() => statusDaCompra(props.compra));
const pendencias = computed(() => contarPendencias(props.compra));
</script>

<template>
  <section id="compra-formulario" aria-label="Formulário da compra" class="flex flex-col gap-4">
    <CompraFormCabecalho
      :ano-mes="compra.anoMes"
      :sequencia="compra.sequencia"
      :status="status"
      :pendencias="pendencias"
      :cancelada="compra.cancelada"
      :pode-editar="podeEditar"
      :estado="estado"
      :salvo-em="salvoEm"
      :mensagem-erro="mensagemErro"
      :ocupado="ocupado"
      @duplicar="emit('duplicar')"
      @cancelar="emit('cancelar')"
      @tentar-de-novo="emit('tentarDeNovo')"
    />

    <CompraFaixaConflito v-if="estado === 'conflito'" :ocupado="ocupado" @carregar="emit('carregarVersaoSalva')" @manter="emit('manterMinhas')" />

    <p v-if="compra.cancelada" id="compra-faixa-cancelada" role="status" class="rounded-lg border border-hairline bg-paper px-4 py-2.5 text-[13px] font-semibold text-ink-soft">
      Compra cancelada
    </p>

    <template v-for="id in blocosDesenhados" :key="id">
      <component :is="BLOCOS[id]" :compra="compra" :desabilitado="desabilitado" :consultores="consultores" @alterar="(m: Partial<CamposCompraEditaveis>) => emit('alterar', m)" />
    </template>

    <!-- 6b: demais blocos (ordens e medicamentos, pagamento, despachante, avisos, local e entrega, contatos...). Cada um é um componente
         registrado em BLOCOS, na ordem de BLOCOS_DA_COMPRA. -->
    <div id="compra-demais-blocos" data-etapa="6b" aria-hidden="true" />
  </section>
</template>
