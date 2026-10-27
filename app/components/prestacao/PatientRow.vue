<script setup lang="ts">
import { ref, computed } from "vue";
import type { PatientComputed } from "#shared/types/Patient";
import { normalizarPatientStatus } from "#shared/constants/prestacaoStatus";
import { formatCurrency } from "../../utils/formatters";
import ConfirmDialog from "../ConfirmDialog.vue";
import PatientStatusBadge from "./PatientStatusBadge.vue";

const props = withDefaults(
  defineProps<{
    patient: PatientComputed;
    readonly?: boolean;
    /** Word desta prestação em geração (controlado pela página: libera quando termina). */
    generating?: boolean;
    /** Troca de status em andamento (controlado pela página): o selo fica travado até terminar. */
    statusPending?: boolean;
  }>(),
  { readonly: false, generating: false, statusPending: false },
);

const emit = defineEmits<{
  delete: [id: string];
  edit: [patient: PatientComputed];
  "generate-word": [patient: PatientComputed];
  "copy-whatsapp": [patient: PatientComputed];
  "toggle-status": [patient: PatientComputed];
}>();

const showDeleteConfirm = ref(false);
const deleteConfirmMessage = computed(
  () => `Excluir a prestação de ${props.patient.paciente}? Essa ação não pode ser desfeita.`
);

function confirmDelete(): void {
  showDeleteConfirm.value = false;
  emit("delete", props.patient.id);
}
const isFarmaurora = computed(() => props.patient.empresa === "FARMAURORA");
const stripeClass = computed(() => (isFarmaurora.value ? "bg-farm-blue" : "bg-mainz-gold"));
const dateTileClass = computed(() =>
  isFarmaurora.value ? "bg-farm-blue-soft text-farm-blue" : "bg-mainz-gold-soft text-mainz-gold"
);
const badgeLabel = computed(() => props.patient.consultor ?? "");
const hasDespesaOuTransporte = computed(
  () => props.patient.despesaTotal > 0 || props.patient.transporteTotal > 0
);

// "PREJUÍZO" é só rótulo de tela: o cálculo em calculations.ts continua produzindo
// o valor numérico real (inclusive negativo) e o .docx segue usando esse número.
// Aqui, quando a nota não é cheia e o valor apurado ficou negativo (custo + despesa
// + transporte maior que o alvará), a tela mostra "PREJUÍZO" no lugar do valor.
const notaEhPrejuizo = computed(
  () => !props.patient.isNotaCheia && props.patient.valorNota < 0
);
const impostoEhPrejuizo = computed(() => props.patient.imposto < 0);
const notaDisplay = computed(() => {
  if (props.patient.isNotaCheia) return "CHEIA";
  if (notaEhPrejuizo.value) return "PREJUÍZO";
  return `R$${formatCurrency(props.patient.valorNota)}`;
});
const impostoDisplay = computed(() =>
  impostoEhPrejuizo.value ? "PREJUÍZO" : `R$${formatCurrency(props.patient.imposto)}`
);

interface ValorCell {
  key: string;
  label: string;
  display: string;
  danger: boolean;
}

// Os valores do card, na ordem de sempre. Despachante/Transporte só existem com despesa ou transporte
// (o mesmo critério de antes). Nenhum cálculo aqui: só apresentação dos números já calculados.
const valorCells = computed<ValorCell[]>(() => {
  const p = props.patient;
  const cells: ValorCell[] = [
    { key: "alvara", label: "Alvará", display: `R$${formatCurrency(p.alvara)}`, danger: false },
    { key: "custo", label: "Custo", display: `R$${formatCurrency(p.custoImportacao)}`, danger: false },
  ];
  if (hasDespesaOuTransporte.value) {
    cells.push(
      { key: "despachante", label: "Despachante", display: `R$${formatCurrency(p.despesaTotal)}`, danger: false },
      { key: "transporte", label: "Transporte", display: `R$${formatCurrency(p.transporteTotal)}`, danger: false },
    );
  }
  cells.push(
    { key: "nota", label: "Nota", display: notaDisplay.value, danger: notaEhPrejuizo.value },
    { key: "imposto", label: "Imposto", display: impostoDisplay.value, danger: impostoEhPrejuizo.value },
  );
  return cells;
});

// Grade dos valores por largura do CARD (container query no wrapper — o breakpoint é do card, não da
// janela: a sidebar come ~240px). As strings completas precisam existir literalmente aqui pro Tailwind
// gerar o CSS. Estreito (<640): 2 colunas. Médio (640–1179): 4 colunas (ou, com Despachante/Transporte,
// 3 colunas × 2 linhas e 6 colunas só a partir de 900). Largo (>=1180): bloco de colunas fixas à
// direita do nome, alinhadas entre os cards.
//
// Largo, 4 valores: 4 colunas de --valor-col (Alvará, Custo, Nota, Imposto), com --valor-gap entre elas.
// Largo, 6 valores: o bloco tem a MESMA largura do de 4 e as 3 colunas de 2 valores começam nos mesmos x:
// 1ª (Alvará/Custo) no x da 1ª coluna do bloco de 4, 3ª (Nota/Imposto) no x da 4ª (Imposto) e a 2ª
// (Despachante/Transporte) no meio das duas. O passo entre colunas é --valor-col + --valor-gap; a 1ª e a 2ª
// colunas ocupam 1,5 passo (--valor-meio) e a 3ª uma coluna (--valor-col), sem gap: lefts em 0, 1,5 e 3 passos.
// Tudo derivado das duas constantes abaixo: mudar a largura da coluna move os dois desenhos juntos.
const VALOR_COL_REM = 6.75;
const VALOR_GAP_REM = 0.75; // = gap-x-3
const valoresGridStyle = {
  "--valor-col": `${VALOR_COL_REM}rem`,
  "--valor-gap": `${VALOR_GAP_REM}rem`,
  "--valor-meio": "calc((var(--valor-col) + var(--valor-gap)) * 1.5)",
};
//
// Médio (640–1179) em lg+ (viewport >= 1024), 6 valores: a MESMA organização do largo (3 colunas de 2 valores)
// e a mesma regra de posição, tendo o bloco de 4 valores (4 colunas iguais, com --valor-gap) como referência.
// Os dois blocos ocupam a mesma largura W. Com 8 trilhas iguais e o MESMO gap, o passo entre trilhas é
// (W + gap) / 8 = meia coluna do bloco de 4: a 1ª coluna (3 trilhas) começa na trilha 1 (x da coluna 1 do bloco
// de 4), a 2ª (3 trilhas) na 4 (no meio) e a 3ª (2 trilhas, a largura exata de uma coluna do bloco de 4) na 7 (x
// da coluna 4, o Imposto). A colocação é automática (coluna a coluna, 2 linhas): só as larguras (span) por célula.
// Abaixo de lg o médio é o de antes (max-lg:): o tablet não muda. As regras de cada faixa são excludentes
// (max-lg / lg + faixa do card / @[1180px]), sem depender da ordem do CSS.
const SEIS_VALORES_MEDIO_LG = [
  "lg:@[640px]:@max-[1179px]:col-span-3",
  "lg:@[640px]:@max-[1179px]:col-span-3",
  "lg:@[640px]:@max-[1179px]:col-span-3",
  "lg:@[640px]:@max-[1179px]:col-span-3",
  "lg:@[640px]:@max-[1179px]:col-span-2",
  "lg:@[640px]:@max-[1179px]:col-span-2",
];
const valoresGridClass = computed(() =>
  hasDespesaOuTransporte.value
    ? "grid-cols-2 max-lg:@[640px]:grid-flow-col max-lg:@[640px]:grid-cols-3 max-lg:@[640px]:grid-rows-2 max-lg:@[900px]:grid-flow-row max-lg:@[900px]:grid-cols-6 max-lg:@[900px]:grid-rows-1 lg:@[640px]:@max-[1179px]:grid-flow-col lg:@[640px]:@max-[1179px]:grid-cols-8 lg:@[640px]:@max-[1179px]:grid-rows-2 @[1180px]:grid-flow-col @[1180px]:grid-cols-[var(--valor-meio)_var(--valor-meio)_var(--valor-col)] @[1180px]:grid-rows-2 @[1180px]:gap-x-0"
    : "grid-cols-2 @[640px]:grid-cols-4 @[1180px]:grid-cols-[repeat(4,var(--valor-col))]"
);

// Linha sem status (dado antigo ou estado local anterior à migration) conta como "em andamento".
const status = computed(() => normalizarPatientStatus(props.patient.status));

function handleGenerateWord(): void {
  if (props.generating) return;
  emit("generate-word", props.patient);
}
</script>

<template>
  <!-- O wrapper é o @container (o breakpoint do desenho é a largura do card, não a da janela); os
       @[Npx]: ficam só nos filhos — nunca no mesmo elemento do @container. -->
  <div class="@container shrink-0">
    <div :id="`patient-row-${patient.id}`" class="relative overflow-hidden rounded-lg border border-hairline bg-paper-raised">
      <div class="absolute inset-y-0 left-0 w-1" :class="stripeClass" />

      <!-- Três desenhos pela largura do card:
           estreito (<640, celular): cabeçalho data | status, nome, valores (2 colunas) e as ações embaixo;
           médio (640–1179, tablet e desktop apertado): data | nome | status | ações na 1ª linha, valores na 2ª;
           largo (>=1180): linha única — data | nome | valores | status | ações. -->
      <div
        class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 py-3 pr-3.5 pl-4 @[640px]:grid-cols-[auto_minmax(0,1fr)_auto_auto] @[1180px]:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]"
      >
        <div
          :id="`patient-data-${patient.id}`"
          class="col-start-1 row-start-1 flex items-center self-stretch @[640px]:w-[8.25rem] @[640px]:border-r @[640px]:border-hairline @[640px]:pr-3"
        >
          <div class="flex items-center gap-2">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" :class="dateTileClass" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </span>
            <span class="flex flex-col gap-0.5 leading-tight">
              <span class="font-mono text-[12.5px] whitespace-nowrap text-ink">{{ patient.data }}</span>
              <span v-if="badgeLabel" class="text-[11px] whitespace-nowrap text-ink-soft">{{ badgeLabel }}</span>
            </span>
          </div>
        </div>

        <div
          :id="`patient-nome-${patient.id}`"
          class="col-span-2 col-start-1 row-start-2 min-w-0 border-t border-hairline pt-2.5 @[640px]:col-span-1 @[640px]:col-start-2 @[640px]:row-start-1 @[640px]:border-t-0 @[640px]:pt-0"
        >
          <span class="block text-[15px] font-semibold break-words text-ink">{{ patient.paciente }}</span>
          <span class="block text-[13px] break-words text-ink-soft">{{ patient.descricaoResumo }}</span>
        </div>

        <div
          :id="`patient-valores-${patient.id}`"
          class="col-span-2 col-start-1 row-start-3 border-t border-hairline pt-2.5 text-[12.5px] @[640px]:row-start-2 @[640px]:col-span-4 @[1180px]:col-span-1 @[1180px]:col-start-3 @[1180px]:row-start-1 @[1180px]:border-t-0 @[1180px]:pt-0"
        >
          <div class="grid gap-x-[var(--valor-gap)] gap-y-2" :style="valoresGridStyle" :class="valoresGridClass">
            <div
              v-for="(cell, index) in valorCells"
              :id="`patient-valor-${cell.key}-${patient.id}`"
              :key="cell.key"
              class="flex min-w-0 flex-col gap-0.5"
              :class="hasDespesaOuTransporte ? SEIS_VALORES_MEDIO_LG[index] : undefined"
            >
              <span class="text-[11.5px] leading-tight text-ink-soft">{{ cell.label }}</span>
              <span
                class="font-mono text-[12.5px] leading-tight whitespace-nowrap"
                :class="cell.danger ? 'font-semibold text-danger' : 'text-ink'"
              >{{ cell.display }}</span>
            </div>
          </div>
        </div>

        <div class="col-start-2 row-start-1 justify-self-end @[640px]:col-start-3 @[1180px]:col-start-4">
          <PatientStatusBadge
            :id="`patient-status-${patient.id}`"
            :status="status"
            :interactive="!readonly"
            :pending="statusPending"
            @toggle="emit('toggle-status', patient)"
          />
        </div>

        <!-- Estreito (<640): os botões dividem a largura toda do card por igual (flex-1, 8px entre eles, 40px de
             altura — exceção consciente ao 44px, a largura de ~68px compensa). Médio e largo ficam como antes. -->
        <div class="col-span-2 col-start-1 row-start-4 flex w-full shrink-0 justify-self-end gap-2 @[640px]:col-span-1 @[640px]:w-auto @[640px]:gap-1.5 @[640px]:col-start-4 @[640px]:row-start-1 @[1180px]:col-start-5">
          <button
            :id="`btn-generate-word-${patient.id}`"
            type="button"
            title="Gerar Word"
            aria-label="Gerar Word"
            :disabled="generating"
            class="flex h-11 w-11 items-center @max-[639px]:h-10 @max-[639px]:flex-1 justify-center rounded-md bg-[#2B579A] text-white transition-opacity hover:opacity-90 disabled:opacity-55 md:h-[33px] md:w-[33px]"
            @click="handleGenerateWord"
          >
            <svg viewBox="0 0 384 512" class="h-[15px] w-[15px]" fill="currentColor" aria-hidden="true">
              <path d="M369.9 97.9L286 14C277 5 264.8-.1 252.1-.1H48C21.5 0 0 21.5 0 48v416c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48V131.9c0-12.7-5.1-25-14.1-34zM332.1 128H256V51.9l76.1 76.1zM48 464V48h160v104c0 13.3 10.7 24 24 24h104v288H48z" />
            </svg>
          </button>
          <button
            :id="`btn-copy-whatsapp-${patient.id}`"
            type="button"
            title="Copiar mensagem do WhatsApp"
            aria-label="Copiar mensagem do WhatsApp"
            class="flex h-11 w-11 items-center @max-[639px]:h-10 @max-[639px]:flex-1 justify-center rounded-md bg-[#25D366] text-white transition-opacity hover:opacity-90 md:h-[33px] md:w-[33px]"
            @click="emit('copy-whatsapp', patient)"
          >
            <svg viewBox="0 0 448 512" class="h-[15px] w-[15px]" fill="currentColor" aria-hidden="true">
              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
            </svg>
          </button>
          <button
            v-if="!readonly"
            :id="`btn-edit-patient-${patient.id}`"
            type="button"
            title="Editar"
            aria-label="Editar"
            class="flex h-11 w-11 items-center @max-[639px]:h-10 @max-[639px]:flex-1 justify-center rounded-md border border-hairline bg-paper text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark md:h-[33px] md:w-[33px]"
            @click="emit('edit', patient)"
          >
            <svg viewBox="0 0 24 24" class="h-[15px] w-[15px]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.862 4.487" />
            </svg>
          </button>
          <button
            v-if="!readonly"
            :id="`btn-delete-patient-${patient.id}`"
            type="button"
            title="Excluir"
            aria-label="Excluir"
            class="flex h-11 w-11 items-center @max-[639px]:h-10 @max-[639px]:flex-1 justify-center rounded-md border border-hairline bg-paper text-ink-soft transition-colors hover:border-danger hover:text-danger md:h-[33px] md:w-[33px]"
            @click="showDeleteConfirm = true"
          >
            <svg viewBox="0 0 24 24" class="h-[15px] w-[15px]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    v-if="showDeleteConfirm"
    title="Excluir prestação"
    :message="deleteConfirmMessage"
    confirm-label="Sim, excluir"
    cancel-label="Cancelar"
    danger
    @confirm="confirmDelete"
    @close="showDeleteConfirm = false"
  />
</template>
