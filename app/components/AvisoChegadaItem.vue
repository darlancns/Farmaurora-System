<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { hojeBrasilia, somarDiasISO } from "#shared/utils/dataBrasilia";
import type { AvisoChegadaSino } from "../utils/avisosChegada";
import { useChegadaAvisos } from "../composables/useChegadaAvisos";
import { getErrorMessage } from "../utils/errorMessages";
import AppDatePicker from "./AppDatePicker.vue";

/**
 * Um item do aviso "chegou?" no sino (alerta derivado de Processo[]).
 * - Operacional responsável: título "Chegou?", 2 linhas de texto e os botões [Sim, chegou] [Ainda não]. "Ainda não"
 *   abre o calendário próprio (mínimo AMANHÃ, Brasília) e depois pede a confirmação ("Nova data: 12/11").
 * - Administrador: só as 2 linhas e o olhinho "Marcar como visto" (ele NÃO atualiza o processo por aqui;
 *   a regra "administrador só visualiza" será estendida depois às outras notificações do Follow-Up).
 * Erros (403, 409, 400...) aparecem como mensagem curta no próprio item; o sino não fecha. Quando dá certo, o
 * aviso deixa de existir (o estado do processo/da dispensa muda) e o item some da lista.
 * IDs fixos por processo (aviso-chegada-<id>, btn-chegada-sim-<id> ...).
 */

const props = defineProps<{ aviso: AvisoChegadaSino }>();
const emit = defineEmits<{ abrir: [] }>();

const { confirmarChegada, adiarChegada, marcarVisto } = useChegadaAvisos();

type Etapa = "pergunta" | "data" | "confirmar";

const etapa = ref<Etapa>("pergunta");
const novaData = ref("");
const minimoNovaData = ref("");
const enviando = ref(false);
const erro = ref<string | null>(null);
// Depois de um 409 o processo já mudou: os botões não valem mais (o item sai quando o processo recarregar).
const resolvidoPorOutro = ref(false);

const id = computed(() => props.aviso.processoId);
const ehOperacional = computed(() => props.aviso.papel === "operacional");

const CLASSE_BOTAO =
  "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-50";
const CLASSE_PRIMARIO = `${CLASSE_BOTAO} bg-accent-dark text-white hover:opacity-90`;
const CLASSE_SECUNDARIO = `${CLASSE_BOTAO} border border-hairline bg-paper-raised text-ink hover:bg-paper`;

function mensagemDe(e: unknown, padrao: string): string {
  return getErrorMessage(e, padrao);
}

// Executa a ação mostrando "enviando"; em falha deixa a mensagem no item (e marca o 409).
async function executar(acao: () => Promise<void>, padrao: string): Promise<boolean> {
  if (enviando.value) return false;
  enviando.value = true;
  erro.value = null;
  try {
    await acao();
    return true;
  } catch (e) {
    erro.value = mensagemDe(e, padrao);
    if ((e as { status?: number } | null)?.status === 409) resolvidoPorOutro.value = true;
    return false;
  } finally {
    enviando.value = false;
  }
}

function simChegou(): Promise<boolean> {
  return executar(() => confirmarChegada(id.value), "Erro ao confirmar a chegada.");
}

async function aindaNao(): Promise<void> {
  erro.value = null;
  minimoNovaData.value = somarDiasISO(hojeBrasilia(), 1);
  novaData.value = "";
  etapa.value = "data";
  // Abre o calendário na hora (o campo é o próprio botão do AppDatePicker).
  await nextTick();
  document.getElementById(`chegada-data-${id.value}`)?.click();
}

// Escolheu a data no calendário: pede a confirmação (nada é gravado antes dela).
watch(novaData, (valor) => {
  if (valor && etapa.value === "data") etapa.value = "confirmar";
});

function voltar(): void {
  etapa.value = "pergunta";
  novaData.value = "";
  erro.value = null;
}

function confirmarNovaData(): Promise<boolean> {
  return executar(() => adiarChegada(id.value, novaData.value), "Erro ao adiar a chegada.");
}

function visto(): Promise<boolean> {
  return executar(
    () => marcarVisto({ processoId: id.value, dataPrevista: props.aviso.dataPrevista }),
    "Erro ao marcar o aviso como visto.",
  );
}
</script>

<template>
  <div
    :id="`aviso-chegada-${aviso.processoId}`"
    class="border-b border-hairline px-3.5 py-2.5 transition-colors last:border-b-0 hover:bg-paper"
  >
    <div class="flex items-start justify-between gap-2">
      <button
        :id="`btn-abrir-chegada-${aviso.processoId}`"
        type="button"
        title="Ir para o processo"
        class="min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-accent-dark"
        @click="emit('abrir')"
      >
        <span
          v-if="aviso.titulo"
          :id="`chegada-titulo-${aviso.processoId}`"
          class="block text-[14px] font-semibold text-accent-dark"
        >
          {{ aviso.titulo }}
        </span>
        <span :id="`chegada-processo-${aviso.processoId}`" class="block text-[13px] font-medium break-words text-ink">
          {{ aviso.linhaProcesso }}
        </span>
        <span
          :id="`chegada-data-linha-${aviso.processoId}`"
          class="block text-[11.5px] break-words"
          :class="aviso.diasAtraso > 0 ? 'text-danger' : 'text-ink-soft'"
        >
          {{ aviso.linhaData }}
        </span>
      </button>

      <!-- Administrador: só visualiza. O olhinho dispensa o aviso (gravado para ele, por processo + data prevista). -->
      <button
        v-if="!ehOperacional"
        :id="`btn-chegada-visto-${aviso.processoId}`"
        type="button"
        title="Marcar como visto"
        aria-label="Marcar como visto"
        :disabled="enviando"
        class="shrink-0 rounded-md p-3.5 text-ink-soft transition-colors hover:text-accent-dark disabled:opacity-50 md:p-1.5"
        @click.stop="visto"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
          />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>

    <!-- Operacional responsável: pergunta -> (Ainda não) calendário -> confirmação -->
    <template v-if="ehOperacional">
      <div v-if="etapa === 'pergunta'" class="mt-2 flex gap-2">
        <button
          :id="`btn-chegada-sim-${aviso.processoId}`"
          type="button"
          :disabled="enviando || resolvidoPorOutro"
          :class="CLASSE_PRIMARIO"
          @click="simChegou"
        >
          Sim, chegou
        </button>
        <button
          :id="`btn-chegada-nao-${aviso.processoId}`"
          type="button"
          :disabled="enviando || resolvidoPorOutro"
          :class="CLASSE_SECUNDARIO"
          @click="aindaNao"
        >
          Ainda não
        </button>
      </div>

      <div v-else-if="etapa === 'data'" class="mt-2 flex flex-col gap-2">
        <AppDatePicker
          :id="`chegada-data-${aviso.processoId}`"
          v-model="novaData"
          :min="minimoNovaData"
          label="Nova data de chegada"
          placeholder="Escolher nova data"
          classe-campo="min-h-11 rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
        />
        <button
          :id="`btn-chegada-cancelar-data-${aviso.processoId}`"
          type="button"
          :class="CLASSE_SECUNDARIO"
          @click="voltar"
        >
          Cancelar
        </button>
      </div>

      <div v-else class="mt-2">
        <p :id="`chegada-nova-data-${aviso.processoId}`" class="text-[13px] font-medium break-words text-ink">
          Nova data: {{ novaData }}
        </p>
        <div class="mt-2 flex gap-2">
          <button
            :id="`btn-chegada-confirmar-${aviso.processoId}`"
            type="button"
            :disabled="enviando || resolvidoPorOutro"
            :class="CLASSE_PRIMARIO"
            @click="confirmarNovaData"
          >
            Confirmar
          </button>
          <button
            :id="`btn-chegada-cancelar-${aviso.processoId}`"
            type="button"
            :disabled="enviando"
            :class="CLASSE_SECUNDARIO"
            @click="voltar"
          >
            Cancelar
          </button>
        </div>
      </div>
    </template>

    <p
      v-if="erro"
      :id="`chegada-erro-${aviso.processoId}`"
      role="alert"
      class="mt-1.5 text-[12px] break-words text-danger"
    >
      {{ erro }}
    </p>
  </div>
</template>
