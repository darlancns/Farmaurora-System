<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "#app";
import { EMPRESAS_PAGAMENTO, TIPO_GRUPO_PAGAMENTO_LABEL } from "#shared/constants/pagamentos";
import type { EmpresaPagamento } from "#shared/types/Pagamento";
import type { AppSelectOption } from "../types/appSelect";
import { usePagamentos } from "../composables/usePagamentos";
import { useAuth } from "../composables/useAuth";
import { useToast } from "../composables/useToast";
import { useBancoActions } from "../composables/useBancoActions";
import { useGrupoActions } from "../composables/useGrupoActions";
import { useLoteExport } from "../composables/useLoteExport";
import { DESPACHANTE_PAGAMENTO_OPTIONS, TRANSPORTADORA_PAGAMENTO_OPTIONS } from "../utils/pagamentoOptions";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import GlobalHeader from "../components/GlobalHeader.vue";
import BancoTab from "../components/pagamentos/tabs/BancoTab.vue";
import CotacaoTab from "../components/pagamentos/tabs/CotacaoTab.vue";
import GrupoPagamentoTab from "../components/pagamentos/tabs/GrupoPagamentoTab.vue";
import NovoLancamentoBancoModal from "../components/pagamentos/modals/NovoLancamentoBancoModal.vue";
import NovoGrupoPagamentoModal from "../components/pagamentos/modals/NovoGrupoPagamentoModal.vue";
import EditarItemGrupoModal from "../components/pagamentos/modals/EditarItemGrupoModal.vue";
import EditarPagamentoRealizadoModal from "../components/pagamentos/modals/EditarPagamentoRealizadoModal.vue";
import GrupoPagamentoExportCard from "../components/pagamentos/cards/GrupoPagamentoExportCard.vue";
import LoteBancoExportCard from "../components/pagamentos/cards/LoteBancoExportCard.vue";

const {
  empresaSelecionada,
  dataSelecionada,
  lotesBanco,
  lancamentosBanco,
  gruposDespachante,
  gruposTransportadora,
  grupoPix,
  fetchAll,
} = usePagamentos();
const { canWrite } = useAuth();
// operacional e administrador escrevem em Pagamentos; socio é somente leitura.
const readonly = computed<boolean>(() => !canWrite("pagamentos"));
const { showToast } = useToast();
const route = useRoute();

const {
  showLancamentoModal,
  editingLancamento,
  deletingLancamento,
  moedaFixaLancamento,
  editingLancamentoRealizado,
  abrirNovoLote,
  abrirLancamentoEmLote,
  fecharLancamentoModal,
  handleEditarLancamento,
  handleUpdateLancamento,
  handleConfirmExcluirLancamento,
  handleNovoLancamento,
  handleSalvarTaxas,
  handleEscolherBanco,
  handleEscolherBancoRendimento,
  handleFecharLote,
  handleEditarLancamentoRealizado,
  handleSalvarLancamentoRealizado,
} = useBancoActions(readonly);

onMounted(() => {
  // O CRM opera só com Farmaurora — sem seletor na UI, empresaSelecionada
  // fica travada no default "FARMAURORA" de usePagamentos.ts. Único jeito de
  // trocar é este override por query string, sem UI nenhuma, existe só pra
  // isolar dados de teste e2e em MAINZFARMA (ver tests/e2e/pagamentos-fluxo.spec.ts,
  // que roda toda a suíte lá pra nunca escrever em cima de dados reais).
  const empresaOverride = route.query.empresa;
  if (typeof empresaOverride === "string" && EMPRESAS_PAGAMENTO.includes(empresaOverride as EmpresaPagamento)) {
    empresaSelecionada.value = empresaOverride as EmpresaPagamento;
  }
  fetchAll();
});

type Tab = "banco" | "cotacao" | "despachante" | "transportadora";
const activeTab = ref<Tab>("banco");

const {
  showGrupoModal,
  grupoModalTipo,
  editandoItem,
  excluindoItem,
  editandoGrupoRealizado,
  abrirGrupoModal,
  handleNovoGrupo,
  handleSalvarPix,
  handleCicloStatus,
  handlePagarGrupo,
  handleEditarItem,
  handleSalvarItem,
  handleExcluirItem,
  handleConfirmExcluirItem,
  handleEditarGrupoRealizado,
  handleSalvarGrupoRealizado,
} = useGrupoActions(readonly);

// Igual a `grupoOptions` em NovoGrupoPagamentoModal.vue: nomeGrupo é escolhido
// de uma lista fechada (não texto livre), pra não quebrar o vínculo com a
// chave PIX salva por nome.
const grupoRealizadoNomeOptions = computed<AppSelectOption<string>[] | undefined>(() => {
  if (!editandoGrupoRealizado.value) return undefined;
  return (
    editandoGrupoRealizado.value.tipo === "DESPACHANTE"
      ? DESPACHANTE_PAGAMENTO_OPTIONS
      : TRANSPORTADORA_PAGAMENTO_OPTIONS
  ) as AppSelectOption<string>[];
});

const {
  exportGrupo,
  exportLote,
  dataExibicaoGrupo,
  dataExibicaoLote,
  grupoExportRef,
  loteExportRef,
  handleExportarGrupo,
  handleExportarLote,
} = useLoteExport({ lotesBanco, lancamentosBanco });

interface TabDef {
  key: Tab;
  label: string;
}
const tabs: TabDef[] = [
  { key: "banco", label: "Banco" },
  { key: "cotacao", label: "Cotação Câmbio" },
  { key: "despachante", label: "Despachante" },
  { key: "transportadora", label: "Transporte" },
];
</script>

<template>
  <div id="pagamentos-page" class="mx-auto max-w-[1400px]">
    <GlobalHeader title="Pagamentos" subtitle="Banco, cotação de câmbio, despachante e transportadora.">
      <template #tabs>
        <div class="mb-3.5 flex gap-1 border-b border-hairline">
          <button
            v-for="tab in tabs"
            :id="`tab-${tab.key}`"
            :key="tab.key"
            type="button"
            class="border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors"
            :class="activeTab === tab.key ? 'border-accent-dark text-accent-dark' : 'border-transparent text-ink-soft hover:text-ink'"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
      </template>
    </GlobalHeader>

    <BancoTab
      v-if="activeTab === 'banco'"
      :empresa="empresaSelecionada"
      :lotes="lotesBanco"
      :lancamentos="lancamentosBanco"
      :readonly="readonly"
      @novo-lote="abrirNovoLote"
      @novo-lancamento-lote="abrirLancamentoEmLote"
      @editar-lancamento="handleEditarLancamento"
      @excluir-lancamento="deletingLancamento = $event"
      @fechar-lote="handleFecharLote"
      @exportar-lote="handleExportarLote"
      @editar-lancamento-realizado="handleEditarLancamentoRealizado"
    />

    <CotacaoTab
      v-else-if="activeTab === 'cotacao'"
      :empresa="empresaSelecionada"
      :lotes="lotesBanco"
      :lancamentos="lancamentosBanco"
      :readonly="readonly"
      :escolher-banco="handleEscolherBanco"
      :escolher-banco-rendimento="handleEscolherBancoRendimento"
      @salvar-taxas="handleSalvarTaxas"
    />

    <GrupoPagamentoTab
      v-else-if="activeTab === 'despachante'"
      tipo="DESPACHANTE"
      :empresa="empresaSelecionada"
      :grupos="gruposDespachante"
      :readonly="readonly"
      @novo-pagamento="abrirGrupoModal('DESPACHANTE')"
      @ciclo-status="(grupoId, index, status) => handleCicloStatus('DESPACHANTE', grupoId, index, status)"
      @editar-item="(grupoId, index) => handleEditarItem('DESPACHANTE', grupoId, index)"
      @excluir-item="(grupoId, index) => handleExcluirItem('DESPACHANTE', grupoId, index)"
      @pagar-grupo="(grupoId) => handlePagarGrupo('DESPACHANTE', grupoId)"
      @exportar-foto="handleExportarGrupo"
      @editar-realizado="(grupo) => handleEditarGrupoRealizado('DESPACHANTE', grupo)"
    />

    <GrupoPagamentoTab
      v-else
      tipo="TRANSPORTADORA"
      :empresa="empresaSelecionada"
      :grupos="gruposTransportadora"
      :readonly="readonly"
      @novo-pagamento="abrirGrupoModal('TRANSPORTADORA')"
      @ciclo-status="(grupoId, index, status) => handleCicloStatus('TRANSPORTADORA', grupoId, index, status)"
      @editar-item="(grupoId, index) => handleEditarItem('TRANSPORTADORA', grupoId, index)"
      @excluir-item="(grupoId, index) => handleExcluirItem('TRANSPORTADORA', grupoId, index)"
      @pagar-grupo="(grupoId) => handlePagarGrupo('TRANSPORTADORA', grupoId)"
      @exportar-foto="handleExportarGrupo"
      @editar-realizado="(grupo) => handleEditarGrupoRealizado('TRANSPORTADORA', grupo)"
    />

    <NovoLancamentoBancoModal
      v-if="showLancamentoModal && !readonly"
      :empresa="empresaSelecionada"
      :editing="editingLancamento"
      :moeda-fixa="moedaFixaLancamento"
      @submit="handleNovoLancamento"
      @update="handleUpdateLancamento"
      @close="fecharLancamentoModal"
      @invalid="showToast"
    />

    <ConfirmDialog
      v-if="deletingLancamento && !readonly"
      title="Excluir lançamento"
      :message="`Excluir o lançamento de ${deletingLancamento.cliente} (${deletingLancamento.fornecedor} · Invoice ${deletingLancamento.invoice})? Essa ação não pode ser desfeita.`"
      confirm-label="Sim, excluir"
      cancel-label="Cancelar"
      danger
      @confirm="handleConfirmExcluirLancamento"
      @close="deletingLancamento = null"
    />

    <EditarPagamentoRealizadoModal
      v-if="editingLancamentoRealizado && !readonly"
      nome-label="Cliente"
      :nome="editingLancamentoRealizado.cliente"
      :pago-em="editingLancamentoRealizado.pagoEm"
      @submit="handleSalvarLancamentoRealizado"
      @close="editingLancamentoRealizado = null"
      @invalid="showToast"
    />

    <NovoGrupoPagamentoModal
      v-if="showGrupoModal && !readonly"
      :tipo="grupoModalTipo"
      :empresa="empresaSelecionada"
      :data="dataSelecionada"
      :pix-map="grupoPix[grupoModalTipo]"
      @submit="handleNovoGrupo"
      @salvar-pix="handleSalvarPix"
      @close="showGrupoModal = false"
      @invalid="showToast"
    />

    <EditarItemGrupoModal
      v-if="editandoItem && !readonly"
      :paciente="editandoItem.paciente"
      :valor="editandoItem.valor"
      @submit="handleSalvarItem"
      @close="editandoItem = null"
      @invalid="showToast"
    />

    <ConfirmDialog
      v-if="excluindoItem && !readonly"
      title="Excluir pagamento"
      :message="`Excluir o pagamento de ${excluindoItem.paciente}? Essa ação não pode ser desfeita.`"
      confirm-label="Sim, excluir"
      cancel-label="Cancelar"
      danger
      @confirm="handleConfirmExcluirItem"
      @close="excluindoItem = null"
    />

    <EditarPagamentoRealizadoModal
      v-if="editandoGrupoRealizado && !readonly"
      :nome-label="TIPO_GRUPO_PAGAMENTO_LABEL[editandoGrupoRealizado.tipo]"
      :nome="editandoGrupoRealizado.nomeGrupo"
      :nome-options="grupoRealizadoNomeOptions"
      :pago-em="editandoGrupoRealizado.pagoEm"
      @submit="handleSalvarGrupoRealizado"
      @close="editandoGrupoRealizado = null"
      @invalid="showToast"
    />

    <!-- Cartões de exportação — fora da tela, só pra virarem imagem -->
    <div aria-hidden="true" class="pointer-events-none fixed top-0 left-[-9999px]">
      <GrupoPagamentoExportCard
        v-if="exportGrupo"
        ref="grupoExportRef"
        :grupo="exportGrupo"
        :data-exibicao="dataExibicaoGrupo"
      />
      <LoteBancoExportCard
        v-if="exportLote"
        ref="loteExportRef"
        :lote="exportLote.lote"
        :lancamentos="exportLote.lancamentos"
        :data-exibicao="dataExibicaoLote"
      />
    </div>
  </div>
</template>
