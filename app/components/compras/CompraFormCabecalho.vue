<script setup lang="ts">
import { computed } from "vue";
import type { StatusDaCompra } from "#shared/constants/compra";
import { horaMinutoBrasilia, tituloDaCompra } from "#shared/utils/compraMes";
import type { EstadoSalvamento } from "../../composables/useCompraEditor";
import { BOTAO_SECUNDARIO_CLASS, textoPendencias } from "../../utils/comprasEstilos";
import CompraStatusChip from "./CompraStatusChip.vue";

// O cabeçalho do formulário: "Compra 13 - Novembro/2026" (o mesmo texto do título do resumo), o selo do estado, "N pendências"
// e, à direita, o texto do salvamento e os botões Duplicar e Cancelar (só quem edita; a compra cancelada não duplica nem cancela).
const props = defineProps<{
  anoMes: string;
  sequencia: number;
  status: StatusDaCompra;
  pendencias: number;
  cancelada: boolean;
  podeEditar: boolean;
  estado: EstadoSalvamento;
  salvoEm: Date | null;
  /** Mensagem do servidor quando ele recusou o salvamento (opcional, vai de dica no botão de erro). */
  mensagemErro?: string | null;
  ocupado?: boolean;
}>();

const emit = defineEmits<{ duplicar: []; cancelar: []; tentarDeNovo: [] }>();

const titulo = computed(() => tituloDaCompra(props.anoMes, props.sequencia));
const textoPend = computed(() => textoPendencias(props.pendencias));
const mostrarAcoes = computed(() => props.podeEditar && !props.cancelada);

const textoSalvamento = computed<string>(() => {
  switch (props.estado) {
    case "pendente":
    case "salvando":
      return "Salvando…";
    case "salvo":
      return props.salvoEm ? `Salvo automaticamente às ${horaMinutoBrasilia(props.salvoEm)}` : "Salvo automaticamente";
    case "conflito":
      return "Não salvo";
    default:
      return "";
  }
});
</script>

<template>
  <header id="compra-cabecalho" class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <h2 id="compra-titulo" class="font-display text-[20px] font-semibold text-ink">{{ titulo }}</h2>
      <CompraStatusChip :status="status" />
      <span v-if="textoPend" id="compra-pendencias" class="text-[12px] font-semibold text-danger">{{ textoPend }}</span>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        v-if="estado === 'erro'"
        id="compra-salvamento-erro"
        type="button"
        role="status"
        :title="mensagemErro ?? undefined"
        class="text-[12px] font-semibold text-danger underline"
        @click="emit('tentarDeNovo')"
      >
        Não foi possível salvar. Tentar de novo
      </button>
      <span v-else-if="textoSalvamento" id="compra-salvamento" role="status" class="text-[12px] text-ink-soft">{{ textoSalvamento }}</span>

      <template v-if="mostrarAcoes">
        <button id="btn-duplicar-compra" type="button" :class="BOTAO_SECUNDARIO_CLASS" :disabled="ocupado" @click="emit('duplicar')">Duplicar compra</button>
        <button id="btn-cancelar-compra" type="button" :class="BOTAO_SECUNDARIO_CLASS" :disabled="ocupado" @click="emit('cancelar')">Cancelar compra</button>
      </template>
    </div>
  </header>
</template>
