<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type {
  AtualizarCotacaoDTO,
  BancoCambio,
  EmpresaPagamento,
  LancamentoBanco,
  LoteBanco,
  TaxaLancamentoRendimento,
} from "#shared/types/Pagamento";
import { BANCO_CAMBIO_LABEL } from "#shared/constants/pagamentos";
import { parseBrCurrency } from "../../../utils/formatters";
import { montarCotacao } from "../../../utils/pagamentoCalculations";
import { useCotacaoDrafts } from "../../../composables/useCotacaoDrafts";
import CotacaoBancoCard from "../cards/CotacaoBancoCard.vue";
import FechamentoRendimentoModal from "../modals/FechamentoRendimentoModal.vue";

const props = withDefaults(
  defineProps<{
    empresa: EmpresaPagamento;
    lotes: LoteBanco[];
    lancamentos: LancamentoBanco[];
    readonly?: boolean;
    // Funções (não eventos) porque o componente precisa AGUARDAR o resultado
    // antes de fechar o modal/reabilitar o botão — um `emit` puro não devolve
    // o resultado da Promise do handler assíncrono do pai. Cada uma já mostra
    // o toast de sucesso/erro (pagamentos.vue) e devolve `true`/`false`.
    escolherBanco: (
      loteId: string,
      banco: BancoCambio,
      opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>,
    ) => Promise<boolean>;
    escolherBancoRendimento: (
      loteId: string,
      opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>,
      taxas: TaxaLancamentoRendimento[],
    ) => Promise<boolean>;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  "salvar-taxas": [loteId: string, opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>];
}>();

// Rascunho editável por lote (com merge de 3 vias contra o snapshot anterior
// e o dado novo do servidor) — ver useCotacaoDrafts.ts. É salvo
// automaticamente (debounce ao digitar + imediato ao sair do campo) — não há
// botão "Salvar taxas".
const { drafts, draftDo, draftToOpcoes, parseTaxa } = useCotacaoDrafts({
  lotes: () => props.lotes,
});

// ── Auto-save ──────────────────────────────────────────────────────────────
const AUTOSAVE_MS = 700;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function salvarAgora(loteId: string): void {
  const t = timers.get(loteId);
  if (t) {
    clearTimeout(t);
    timers.delete(loteId);
  }
  emit("salvar-taxas", loteId, draftToOpcoes(loteId));
}

function agendarSalvar(loteId: string): void {
  const t = timers.get(loteId);
  if (t) clearTimeout(t);
  timers.set(
    loteId,
    setTimeout(() => salvarAgora(loteId), AUTOSAVE_MS)
  );
}

onBeforeUnmount(() => {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
});

// Só as cotações "vivas": lote da empresa ainda não pago. Depois que o lote é
// marcado como Pago no Banco, a cotação sai daqui (não fica salva).
const lotesAbertos = computed(() =>
  props.lotes
    .filter((l) => l.empresa === props.empresa && !l.realizado)
    .sort((a, b) => a.moeda.localeCompare(b.moeda) || a.numeroLote - b.numeroLote)
);

function lancamentosDoLote(loteId: string): LancamentoBanco[] {
  return props.lancamentos.filter((l) => l.loteId === loteId);
}

// A cotação é calculada a partir do rascunho (o que está digitado agora), não do
// que foi salvo — assim o total em R$ e a diferença atualizam na hora, sem
// precisar clicar em "Salvar taxas".
// Depois que um banco é escolhido os lançamentos deixam de ser "pendentes"; para
// a tela não zerar, exibimos a cotação sobre todos os lançamentos do lote.
function viewsDoLote(lote: LoteBanco) {
  const lancs = lancamentosDoLote(lote.id);
  const base =
    lote.bancoEscolhido !== null ? lancs.map((l) => ({ ...l, valorReais: null })) : lancs;
  return montarCotacao(draftToOpcoes(lote.id), base);
}

// Fechamento por ordem (Rendimento): o modal fica aberto com os pendentes do lote.
const modalRendimento = ref<{
  loteId: string;
  moeda: LoteBanco["moeda"];
  lancamentos: LancamentoBanco[];
  corretagem: number;
} | null>(null);
const rendimentoSalvando = ref(false);
const rendimentoErro = ref<string | null>(null);

// Banco/lote com uma escolha em voo (fora do modal — XP/Intex, e Rendimento
// direto de 1 pendente). Desabilita o botão e troca o texto pra "Salvando..."
// até a Promise resolver, evitando duplo clique e a falsa sensação de "nada
// aconteceu" enquanto a requisição está em andamento.
const salvando = ref<{ loteId: string; banco: BancoCambio } | null>(null);

function fecharModalRendimento(): void {
  modalRendimento.value = null;
  rendimentoErro.value = null;
}

// "Usar este banco" grava o rascunho e escolhe o banco numa tacada só.
// Rendimento fecha por ordem e abre o modal — MENOS quando há um só pendente:
// aí não há variação possível, aplica a taxa do card direto (igual XP/Intex).
async function escolher(loteId: string, banco: BancoCambio): Promise<void> {
  const t = timers.get(loteId);
  if (t) {
    clearTimeout(t);
    timers.delete(loteId);
  }

  if (banco === "RENDIMENTO") {
    const lote = lotesAbertos.value.find((l) => l.id === loteId);
    if (!lote) return;
    // Persiste taxa de referência/corretagem digitadas antes de abrir o modal
    // (paridade com XP/Intex, que salvam ao clicar "Usar este banco").
    emit("salvar-taxas", loteId, draftToOpcoes(loteId));
    const pendentes = lancamentosDoLote(loteId).filter((l) => l.valorReais === null);

    if (pendentes.length === 1) {
      const taxa = parseTaxa(draftDo(loteId, "RENDIMENTO").taxaStr);
      if (taxa === null) return; // botão só habilita com a taxa preenchida
      salvando.value = { loteId, banco };
      try {
        await props.escolherBancoRendimento(loteId, draftToOpcoes(loteId), [
          { lancamentoId: pendentes[0]!.id, taxa },
        ]);
      } finally {
        salvando.value = null;
      }
      return;
    }

    const corretagem = parseBrCurrency(draftDo(loteId, "RENDIMENTO").corretagemStr) || 0;
    rendimentoErro.value = null;
    modalRendimento.value = {
      loteId,
      moeda: lote.moeda,
      lancamentos: pendentes,
      corretagem,
    };
    return;
  }

  salvando.value = { loteId, banco };
  try {
    await props.escolherBanco(loteId, banco, draftToOpcoes(loteId));
  } finally {
    salvando.value = null;
  }
}

// Só fecha o modal DEPOIS que a escolha for confirmada pelo servidor (o
// `await` aqui é o ponto central do fix — antes o modal fechava assim que o
// evento era emitido, sem esperar a resposta). Em caso de erro, mantém o
// modal aberto com uma mensagem inline (o toast de erro do pai já dispara
// também) e libera o botão pra nova tentativa.
async function confirmarRendimento(taxas: TaxaLancamentoRendimento[]): Promise<void> {
  const alvo = modalRendimento.value;
  if (!alvo) return;
  rendimentoSalvando.value = true;
  rendimentoErro.value = null;
  const ok = await props.escolherBancoRendimento(alvo.loteId, draftToOpcoes(alvo.loteId), taxas);
  rendimentoSalvando.value = false;
  if (ok) {
    modalRendimento.value = null;
  } else {
    rendimentoErro.value = "Não foi possível confirmar o fechamento. Tente novamente.";
  }
}

function podeEscolher(lote: LoteBanco, banco: BancoCambio): boolean {
  if (props.readonly) return false;
  if (salvando.value?.loteId === lote.id) return false;
  const d = drafts[lote.id]?.find((x) => x.banco === banco);
  return !!d && parseTaxa(d.taxaStr) !== null;
}
</script>

<template>
  <div id="cotacao-tab" class="flex flex-col gap-4">
    <p
      v-if="!lotesAbertos.length"
      class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
    >
      Nenhum lote de {{ empresa }} em aberto. A cotação aparece quando há lançamentos no Banco.
    </p>

    <div
      v-for="lote in lotesAbertos"
      :id="`cotacao-lote-${lote.id}`"
      :key="lote.id"
      class="overflow-hidden rounded-lg border border-hairline bg-paper-raised"
    >
      <div class="flex items-center justify-between border-b border-hairline bg-paper px-3.5 py-2.5">
        <span class="font-display text-[14.5px] font-semibold text-ink">
          Lote {{ lote.numeroLote }} · Cotação {{ lote.moeda }}
        </span>
        <span
          v-if="lote.bancoEscolhido"
          class="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-800"
        >
          Banco escolhido: {{ BANCO_CAMBIO_LABEL[lote.bancoEscolhido] }}
          {{
            lote.bancoEscolhido === "RENDIMENTO" && lote.taxaEscolhida === null
              ? "· taxa por ordem"
              : `@ ${lote.taxaEscolhida?.toFixed(4)}`
          }}
        </span>
      </div>

      <div class="grid grid-cols-1 gap-3 p-3.5 md:grid-cols-3">
        <CotacaoBancoCard
          v-for="view in viewsDoLote(lote)"
          :key="view.banco"
          :lote-id="lote.id"
          :view="view"
          :draft="draftDo(lote.id, view.banco)"
          :moeda="lote.moeda"
          :readonly="readonly"
          :em-uso="lote.bancoEscolhido === view.banco"
          :pode-escolher="podeEscolher(lote, view.banco)"
          :salvando="salvando?.loteId === lote.id && salvando?.banco === view.banco"
          @escolher="(banco) => escolher(lote.id, banco)"
          @editar="agendarSalvar(lote.id)"
          @confirmar="salvarAgora(lote.id)"
        />
      </div>

      <p v-if="!readonly" class="border-t border-hairline bg-paper px-3.5 py-2 text-[11.5px] text-ink-soft">
        As taxas são salvas sozinhas conforme você digita — pode fechar a página e voltar depois.
        Clique em "Usar este banco" quando decidir.
      </p>
    </div>

    <FechamentoRendimentoModal
      v-if="modalRendimento"
      :lote-id="modalRendimento.loteId"
      :moeda="modalRendimento.moeda"
      :lancamentos="modalRendimento.lancamentos"
      :corretagem="modalRendimento.corretagem"
      :salvando="rendimentoSalvando"
      :erro="rendimentoErro"
      @confirmar="confirmarRendimento"
      @close="fecharModalRendimento"
    />
  </div>
</template>
