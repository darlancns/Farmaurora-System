<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { hojeBrasilia, parseDataISO, somarDiasISO } from "#shared/utils/dataBrasilia";
import { pastaLimpa, temPasta } from "#shared/utils/rotuloPasta";
import { useProverBloqueioDatas } from "../../composables/useBloqueioDatas";
import { focaveis } from "../../utils/processoPainel";
import AppDatePicker from "../AppDatePicker.vue";
import BaseModal from "../BaseModal.vue";

// "Confirme a data de entrega": o modal pequeno que abre SEMPRE que um processo vai virar Entregue — ao arrastar o card, no
// "Mover para…" do painel (processos.vue) e ao SALVAR o formulário (ProcessoFormModal.vue). Só "Confirmar entrega" leva a
// data adiante (`confirm`, "AAAA-MM-DD"); Cancelar, Esc e clique fora fecham sem gravar nada (`close`).
//
// - Campo de data = AppDatePicker com ano automático (digita "22/10" ou "2210" e o ano se completa; "proximo": é um fato
//   passado) e `max` = hoje de Brasília. Vem preenchido com a data inicial (a de entrega já gravada, ao voltar a Entregue) ou
//   hoje. Atalhos "Hoje" e "Ontem"; o que bate com a data do campo aparece marcado (aria-pressed).
// - "Confirmar entrega" fica DESABILITADO com a data vazia, futura ou com erro no que foi digitado (useProverBloqueioDatas:
//   data inexistente/incompleta): nunca confirma com a data anterior sem avisar. Enter no campo confirma (formulário).
// - Camada z-950: acima do formulário (z-900) e abaixo do calendário (z-970). Esc fecha só o de cima (BaseModal) e, com o
//   calendário aberto, o Esc é do calendário. Foco inicial no campo de data; Tab preso dentro; ao fechar o foco volta a quem
//   o tinha antes.
// - Sem texto acima do título e sem dica abaixo do campo. Alvos de 44px abaixo de lg.
const props = withDefaults(
  defineProps<{
    paciente: string;
    pasta?: string;
    // "AAAA-MM-DD". Ausente, inválida ou futura = hoje.
    dataInicial?: string;
  }>(),
  { pasta: "", dataInicial: "" },
);

const emit = defineEmits<{
  confirm: [dataEntrega: string];
  close: [];
}>();

const ID_DATA = "entrega-data";
const hoje = hojeBrasilia();
const ontem = somarDiasISO(hoje, -1);

function inicial(): string {
  const d = props.dataInicial.trim();
  return parseDataISO(d) && d <= hoje ? d : hoje;
}

const data = ref(inicial());
const bloqueio = useProverBloqueioDatas();
const raiz = ref<HTMLElement | null>(null);
// Quem tinha o foco antes de abrir (card, botão do menu, Salvar): recebe o foco de volta ao fechar.
const focoAnterior = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

// Data cheia, existente e não futura (o campo já recusa o resto, mas a conferência vale para o valor que sai daqui).
const dataValida = computed(() => parseDataISO(data.value) !== null && data.value <= hoje);
const bloqueado = computed(() => !dataValida.value || bloqueio.haErro());

// O atalho só aparece marcado com o campo válido: com texto inválido digitado, o valor interno ainda é o anterior.
const hojeMarcado = computed(() => data.value === hoje && !bloqueio.haErro());
const ontemMarcado = computed(() => data.value === ontem && !bloqueio.haErro());

const pastaTexto = computed(() => (temPasta(props.pasta) ? `Pasta ${pastaLimpa(props.pasta)}` : ""));

function escolher(iso: string): void {
  data.value = iso;
}

// Garantia contra clique duplo / Enter + clique: depois do 1º confirmar o pedido está "usado" (síncrono, antes de qualquer
// re-renderização) e o resto é ignorado.
let encerrado = false;

function confirmar(): void {
  if (encerrado || bloqueado.value) return;
  encerrado = true;
  emit("confirm", data.value);
}

function fechar(): void {
  if (encerrado) return;
  // Calendário aberto: o Esc/clique é dele (ele fecha sozinho), não deste modal.
  if (document.getElementById(`${ID_DATA}-calendario-camada`)) return;
  encerrado = true;
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Tab" || !raiz.value) return;
  const itens = focaveis(raiz.value);
  const primeiro = itens[0];
  const ultimo = itens[itens.length - 1];
  if (!primeiro || !ultimo) return;
  const ativo = document.activeElement;
  if (event.shiftKey && (ativo === primeiro || !raiz.value.contains(ativo))) {
    event.preventDefault();
    ultimo.focus();
  } else if (!event.shiftKey && (ativo === ultimo || !raiz.value.contains(ativo))) {
    event.preventDefault();
    primeiro.focus();
  }
}

onMounted(() => {
  void nextTick(() => {
    const campo = document.getElementById(ID_DATA) as HTMLInputElement | null;
    campo?.focus();
    campo?.select?.();
  });
});

onBeforeUnmount(() => {
  if (focoAnterior && focoAnterior.isConnected) focoAnterior.focus();
});

const BOTAO_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-md px-3.5 py-2 text-[14px] font-semibold transition-colors lg:min-h-0 lg:text-[13px]";
const ATALHO_BASE =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-md border px-3 py-2 text-[14px] font-semibold transition-colors lg:min-h-0 lg:flex-none lg:text-[13px]";
const ATALHO_ATIVO = "border-accent-dark bg-accent-dark/10 text-accent-dark";
const ATALHO_INATIVO = "border-hairline bg-paper text-ink-soft hover:text-ink";
</script>

<template>
  <BaseModal id="entrega-modal-overlay" :z-index="950" @close="fechar">
    <form
      id="entrega-modal"
      ref="raiz"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entrega-titulo"
      aria-describedby="entrega-descricao"
      class="w-full max-w-[380px] rounded-[10px] border border-hairline bg-paper-raised p-5"
      @submit.prevent="confirmar"
      @keydown="onKeydown"
    >
      <h2 id="entrega-titulo" class="font-display text-[16px] font-semibold text-ink">Confirme a data de entrega</h2>
      <p id="entrega-descricao" class="mt-1 min-w-0 text-[13.5px] break-words text-ink-soft">
        <span id="entrega-paciente" class="block font-medium text-ink">{{ paciente }}</span>
        <span v-if="pastaTexto" id="entrega-pasta" class="block font-mono text-[12px]">{{ pastaTexto }}</span>
      </p>

      <div class="mt-4">
        <AppDatePicker
          :id="ID_DATA"
          v-model="data"
          formato="iso"
          ano-automatico
          sentido="proximo"
          :max="hoje"
          label="Data de entrega"
          placeholder="DD/MM/AAAA"
          classe-campo="min-h-11 rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[16px] focus:bg-white focus:outline-2 focus:outline-accent-dark lg:text-[13.5px]"
        />
        <div class="mt-2 flex gap-2">
          <button
            id="btn-entrega-hoje"
            type="button"
            :aria-pressed="hojeMarcado"
            :class="[ATALHO_BASE, hojeMarcado ? ATALHO_ATIVO : ATALHO_INATIVO]"
            @click="escolher(hoje)"
          >
            Hoje
          </button>
          <button
            id="btn-entrega-ontem"
            type="button"
            :aria-pressed="ontemMarcado"
            :class="[ATALHO_BASE, ontemMarcado ? ATALHO_ATIVO : ATALHO_INATIVO]"
            @click="escolher(ontem)"
          >
            Ontem
          </button>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button
          id="btn-entrega-cancelar"
          type="button"
          :class="[BOTAO_BASE, 'border border-hairline bg-paper text-ink-soft hover:text-ink']"
          @click="fechar"
        >
          Cancelar
        </button>
        <button
          id="btn-entrega-confirmar"
          type="submit"
          :disabled="bloqueado"
          :class="[BOTAO_BASE, 'bg-accent-dark text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60']"
        >
          Confirmar entrega
        </button>
      </div>
    </form>
  </BaseModal>
</template>
