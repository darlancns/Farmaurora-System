<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { TIPO_GRUPO_PAGAMENTO_LABEL } from "#shared/constants/pagamentos";
import type { AppSelectOption } from "../types/appSelect";
import { usePagamentos } from "../composables/usePagamentos";
import { useAuth } from "../composables/useAuth";
import { useToast } from "../composables/useToast";
import { useBancoActions } from "../composables/useBancoActions";
import { useGrupoActions } from "../composables/useGrupoActions";
import { useLoteExport } from "../composables/useLoteExport";
import { usePagamentoConfirmacao } from "../composables/usePagamentoConfirmacao";
import { ROTULO_CONFIRMAR_PAGO } from "../utils/pagamentoConfirmacao";
import { DESPACHANTE_PAGAMENTO_OPTIONS, TRANSPORTADORA_PAGAMENTO_OPTIONS } from "../utils/pagamentoOptions";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import FloatingAddButton from "../components/FloatingAddButton.vue";
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
  lotesBanco,
  lancamentosBanco,
  gruposDespachante,
  gruposTransportadora,
  grupoPix,
  fetchAll,
} = usePagamentos();
const { canWrite } = useAuth();
// socio, operacional e administrador escrevem em Pagamentos.
const readonly = computed<boolean>(() => !canWrite("pagamentos"));
const { showToast } = useToast();

const {
  showLancamentoModal,
  editingLancamento,
  deletingLancamento,
  editingLancamentoRealizado,
  abrirNovoPagamento,
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

// O CRM opera só com Farmaurora: empresaSelecionada fica no default "FARMAURORA" de usePagamentos.ts.
onMounted(() => {
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

// "Pago" (lote do Banco e grupos): uma janela de confirmação só, aberta por qualquer botão "Pago" (desktop e
// mobile são o mesmo botão). Confirmar chama os MESMOS handlers de sempre (handleFecharLote / handlePagarGrupo).
const {
  pendente: pagamentoPendente,
  confirmando: pagando,
  pedir: pedirPagamento,
  cancelar: cancelarPagamento,
  confirmar: confirmarPagamento,
} = usePagamentoConfirmacao({
  executar: (p) => (p.alvo === "LOTE" ? handleFecharLote(p.id) : handlePagarGrupo(p.alvo, p.id)),
  continuaAberto: (p) => {
    if (p.alvo === "LOTE") return lotesBanco.value.some((l) => l.id === p.id && !l.realizado);
    const grupos = p.alvo === "DESPACHANTE" ? gruposDespachante.value : gruposTransportadora.value;
    return grupos.some((g) => g.id === p.id && !g.realizado);
  },
});

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
  { key: "cotacao", label: "Câmbio" },
  { key: "despachante", label: "Despachante" },
  { key: "transportadora", label: "Transporte" },
];

// Abaixo de lg os botões "+ Novo pagamento" / "+ Adicionar pagamento" das seções saem da tela e
// entram num único "+" flutuante; a ação depende da aba ativa e chama os MESMOS handlers
// dos botões de sempre. Câmbio não tem ação de adicionar, e somente-leitura não vê o botão.
const showFab = computed<boolean>(() => !readonly.value && activeTab.value !== "cotacao");
const fabLabel = computed<string>(() => (activeTab.value === "banco" ? "Novo pagamento" : "Adicionar pagamento"));

function handleFab(): void {
  if (activeTab.value === "banco") abrirNovoPagamento();
  else if (activeTab.value === "despachante") abrirGrupoModal("DESPACHANTE");
  else if (activeTab.value === "transportadora") abrirGrupoModal("TRANSPORTADORA");
}
</script>

<template>
  <!--
    pb-20 abaixo de lg: folga pro "+" flutuante nunca cobrir o último card ou o total do lote.
    Classe ESTÁTICA de propósito (condicionar por cargo/aba daria atributo divergente entre SSR
    e client): cargos somente-leitura e a aba Câmbio ficam com 80px de folga a mais, sem efeito visível.
  -->
  <div id="pagamentos-page" class="mx-auto max-w-[1400px] pb-20 lg:pb-0">
    <GlobalHeader title="Pagamentos" subtitle="Banco, cotação de câmbio, despachante e transportadora.">
      <template #tabs>
        <!-- Abaixo de lg: as 4 abas centralizadas, sem corte nem scroll, com toque >= 44px. O -mt-[13px] compensa o mb-4 do
             cabeçalho (16px - 13px = 3px de folga até o botão): o texto, centrado no botão de 44px, fica com o mesmo
             respiro acima (linha do cabeçalho) e abaixo (linha da barra), medido com a fonte Inter. Em lg+ como sempre. -->
        <div class="-mt-[13px] mb-3.5 flex justify-center gap-0 border-b border-hairline lg:mt-0 lg:justify-start lg:gap-1">
          <button
            v-for="tab in tabs"
            :id="`tab-${tab.key}`"
            :key="tab.key"
            type="button"
            class="min-h-11 border-b-2 px-2 text-[13px] font-semibold whitespace-nowrap transition-colors lg:min-h-0 lg:px-3.5 lg:py-2 lg:text-[13.5px]"
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
      @novo-pagamento="abrirNovoPagamento"
      @editar-lancamento="handleEditarLancamento"
      @excluir-lancamento="deletingLancamento = $event"
      @pedir-fechar-lote="(pedido) => pedirPagamento('LOTE', pedido)"
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
      @pedir-pagar-grupo="(pedido) => pedirPagamento('DESPACHANTE', pedido)"
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
      @pedir-pagar-grupo="(pedido) => pedirPagamento('TRANSPORTADORA', pedido)"
      @exportar-foto="handleExportarGrupo"
      @editar-realizado="(grupo) => handleEditarGrupoRealizado('TRANSPORTADORA', grupo)"
    />

    <FloatingAddButton v-if="showFab" id="fab-pagamentos" :label="fabLabel" @click="handleFab" />

    <NovoLancamentoBancoModal
      v-if="showLancamentoModal && !readonly"
      :empresa="empresaSelecionada"
      :editing="editingLancamento"
      :lotes="lotesBanco"
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

    <ConfirmDialog
      v-if="pagamentoPendente && !readonly"
      reforcado
      :title="pagamentoPendente.titulo"
      :message="pagamentoPendente.mensagem"
      :confirm-label="ROTULO_CONFIRMAR_PAGO"
      cancel-label="Cancelar"
      :loading="pagando"
      @confirm="confirmarPagamento"
      @close="cancelarPagamento"
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
