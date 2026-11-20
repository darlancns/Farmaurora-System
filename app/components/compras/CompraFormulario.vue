<script setup lang="ts">
import { computed, provide } from "vue";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import { contarPendencias, statusDaCompra } from "#shared/utils/compraChecklist";
import type { EstadoSalvamento } from "../../composables/useCompraEditor";
import type { OpcoesFormulario } from "../../utils/comprasBlocos";
import { ACOES_COMPRA_KEY, ACOES_VAZIAS, type AcoesCompra } from "../../utils/comprasContexto";
import { FIELDSET_CLASS, LEGEND_CLASS } from "../../utils/processoFormClasses";
import { BLOCOS, GRUPOS } from "./blocosRegistro";
import CompraFaixaConflito from "./CompraFaixaConflito.vue";
import CompraFormCabecalho from "./CompraFormCabecalho.vue";

// A coluna central: cabeçalho, as faixas (conflito e cancelada) e os BLOCOS do formulário, na ordem de BLOCOS_DA_COMPRA (a do resumo).
//
// Cada bloco é um componente com `data-bloco="<id>"` no elemento raiz (registro em blocosRegistro.ts). Blocos consecutivos pequenos
// dividem o mesmo fieldset (GRUPOS), sem mudar a ordem dos campos: a ordem do DOM é a do Tab (nenhum tabindex positivo).
const props = defineProps<{
  compra: Compra;
  estado: EstadoSalvamento;
  salvoEm: Date | null;
  mensagemErro?: string | null;
  /** Quem pode escrever em Compras (a permissão). Compra cancelada é somente leitura de qualquer jeito. */
  podeEditar: boolean;
  opcoes: OpcoesFormulario;
  /** O que as linhas pedem ao servidor (busca de medicamento, pré-cadastro, temperatura nova). Sem ele, não buscam nem registram. */
  acoes?: AcoesCompra;
  ocupado?: boolean;
}>();

// As linhas (três níveis abaixo) recebem as ações por provide/inject, sem repassar a prop de bloco em bloco.
provide(ACOES_COMPRA_KEY, props.acoes ?? ACOES_VAZIAS);

const emit = defineEmits<{
  alterar: [mudancas: MudancasCompra];
  duplicar: [];
  cancelar: [];
  tentarDeNovo: [];
  carregarVersaoSalva: [];
  manterMinhas: [];
}>();

// Só os grupos que têm algum bloco com componente (e, neles, só os blocos com componente).
const grupos = computed(() =>
  GRUPOS.map((g) => ({ ...g, blocos: g.blocos.filter((id) => BLOCOS[id] !== undefined) })).filter((g) => g.blocos.length > 0),
);
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

    <fieldset
      v-for="grupo in grupos"
      :id="`compra-grupo-${grupo.id}`"
      :key="grupo.id"
      :class="FIELDSET_CLASS"
      :disabled="desabilitado"
      :aria-disabled="desabilitado ? 'true' : undefined"
    >
      <legend :class="LEGEND_CLASS">{{ grupo.legenda }}</legend>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <component :is="BLOCOS[id]" v-for="id in grupo.blocos" :key="id" :compra="compra" :desabilitado="desabilitado" :opcoes="opcoes" @alterar="(m: MudancasCompra) => emit('alterar', m)" />
      </div>
    </fieldset>
  </section>
</template>
