<script setup lang="ts">
import { reactive } from "vue";
import type { AtualizacaoProcesso, Processo } from "#shared/types/processo";
import { capitalizeFirstLetter } from "../../utils/processoFormatters";
import { formatCurrency } from "../../utils/formatters";
import { quebrarNumeroProcesso } from "../../utils/quebrarNumeroProcesso";

const props = withDefaults(
  defineProps<{
    processo: Processo;
    readonly?: boolean;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  edit: [processo: Processo];
  // Rodapé mobile: só pede a confirmação — quem abre o ConfirmDialog e emite o
  // `delete` é o ProcessoRow, o mesmo fluxo do botão de lixeira do cabeçalho (lg+).
  "request-delete": [];
  "add-atualizacao": [id: string, atualizacao: AtualizacaoProcesso];
}>();

const novaAtualizacao = reactive({ data: "", texto: "" });

function submitAtualizacao(): void {
  const texto = novaAtualizacao.texto.trim();
  if (!texto) return;

  emit("add-atualizacao", props.processo.id, {
    data: novaAtualizacao.data.trim(),
    texto,
  });
  novaAtualizacao.data = "";
  novaAtualizacao.texto = "";
}

function onAtualizacaoTextoInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  novaAtualizacao.texto = capitalizeFirstLetter(target.value);
}

// Só apresentação (abaixo de lg): `mono` mantém a fonte monoespaçada no mobile (em lg+ todos os
// valores já são mono); `wide` ocupa a linha toda abaixo de lg (em lg+ é uma célula comum);
// `destaque` pinta a previsão de entrega de azul-marinho em negrito abaixo de lg;
// `quebrar` deixa o valor quebrar só em ponto/barra/traço abaixo de lg.
interface DetailField {
  label: string;
  value?: string;
  mono?: boolean;
  wide?: boolean;
  destaque?: boolean;
  quebrar?: boolean;
}

function fields(processo: Processo): DetailField[] {
  return [
    { label: "Pasta", value: processo.pasta },
    { label: "Despachante", value: processo.despachante },
    { label: "Fornecedor", value: processo.fornecedor },
    { label: "Modal de envio", value: processo.modalEnvio },
    { label: "Cia. aérea", value: processo.companhiaAerea },
    { label: "Nº AWB", value: processo.numeroAwb, mono: true },
    { label: "Rastreio", value: processo.codigoRastreio },
    { label: "Local de entrega", value: processo.localEntrega },
    { label: "Nº do processo", value: processo.numeroProcesso, mono: true, wide: true, quebrar: true },
  ];
}

function datasFields(processo: Processo): DetailField[] {
  return [
    { label: "Compra (PO)", value: processo.datas.dataCompraPO },
    { label: "Embarque", value: processo.datas.dataEmbarque },
    { label: "Abertura thread", value: processo.datas.aberturaThread },
    { label: "Chegada Brasil", value: processo.datas.dataChegadaBrasil },
    { label: "Registro Radar", value: processo.datas.registroRadar },
    { label: "Registro Duimp", value: processo.datas.registroDuimp },
    { label: "Registro Lpco", value: processo.datas.registroLpco },
    { label: "Previsão entrega", value: processo.datas.previsaoEntrega, destaque: true },
    { label: "Suposta estimativa", value: processo.datas.supostaEstimativa, wide: true },
  ];
}
</script>

<template>
  <div :id="`processo-detail-${processo.id}`" class="flex flex-col gap-3 border-t border-hairline bg-paper px-4 py-3.5">
    <div class="flex items-center justify-between">
      <p class="text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Detalhe do processo</p>
      <!-- Abaixo de lg a edição vai pro rodapé do detalhe (mesmo handler). -->
      <button
        v-if="!readonly"
        :id="`btn-edit-processo-${processo.id}`"
        type="button"
        class="hidden rounded-md border border-hairline bg-paper-raised px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark lg:block"
        @click="emit('edit', processo)"
      >
        Editar processo
      </button>
    </div>

    <div v-if="processo.medicamentos.length" class="text-[12.5px] text-ink">
      <span class="text-ink-soft">Medicamentos: </span>
      <span
        >{{
          processo.medicamentos
            .map((m) => [m.nome, m.dosagem, m.quantidade].filter(Boolean).join(" "))
            .join(" e ")
        }}</span
      >
    </div>

    <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px] sm:grid-cols-3 lg:grid-cols-4 lg:gap-y-2">
      <div
        v-for="field in fields(processo)"
        :key="field.label"
        class="flex flex-col gap-0.5"
        :class="{ 'col-span-full lg:col-span-1': field.wide }"
      >
        <span class="text-ink-soft">{{ field.label }}</span>
        <template v-if="field.quebrar && field.value">
          <span class="font-mono text-ink lg:hidden">
            <template v-for="(trecho, index) in quebrarNumeroProcesso(field.value)" :key="index"
              >{{ trecho }}<wbr
            /></template>
          </span>
          <span class="hidden font-mono text-ink lg:inline">{{ field.value }}</span>
        </template>
        <span
          v-else
          class="break-words text-ink lg:font-mono lg:break-normal"
          :class="{ 'font-mono': field.mono }"
          >{{ field.value || "—" }}</span
        >
      </div>
      <div v-if="processo.transportadoraNacional" class="col-span-full flex flex-col gap-0.5 lg:col-span-1">
        <span class="text-ink-soft">Transportadora</span>
        <span class="break-words text-ink lg:font-mono lg:break-normal">
          {{ processo.transportadoraNacional.nome }}
          <span v-if="processo.transportadoraNacional.valor !== undefined" class="block font-semibold lg:inline lg:font-normal"
            ><span class="hidden lg:inline">— </span>R$ {{ formatCurrency(processo.transportadoraNacional.valor) }}</span
          >
        </span>
      </div>
    </div>

    <div class="border-t border-hairline pt-2.5">
      <p class="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Datas</p>
      <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px] sm:grid-cols-4 lg:gap-y-2">
        <div
          v-for="field in datasFields(processo)"
          :key="field.label"
          class="flex flex-col gap-0.5"
          :class="{ 'col-span-full lg:col-span-1': field.wide }"
        >
          <span class="text-ink-soft">{{ field.label }}</span>
          <span
            class="break-words lg:font-mono lg:break-normal"
            :class="field.destaque ? 'font-semibold text-accent-dark lg:font-normal lg:text-ink' : 'text-ink'"
            >{{ field.value || "—" }}</span
          >
        </div>
      </div>
    </div>

    <div v-if="processo.pendencias.length" class="border-t border-hairline pt-2.5">
      <p class="mb-1.5 text-[11px] font-semibold tracking-wide text-danger uppercase">Pendências</p>
      <ul class="flex flex-col gap-1 text-[12.5px] text-ink">
        <li v-for="(pendencia, index) in processo.pendencias" :key="index" class="flex items-center gap-1.5">
          <span class="text-danger">•</span>
          {{ pendencia }}
        </li>
      </ul>
    </div>

    <div class="border-t border-hairline pt-2.5">
      <p class="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Atualizações</p>

      <ol v-if="processo.atualizacoes.length" class="flex flex-col gap-1.5 text-[12.5px]">
        <li
          v-for="(atualizacao, index) in processo.atualizacoes"
          :key="index"
          class="flex gap-2 border-l-2 border-hairline pl-2.5"
        >
          <span class="shrink-0 font-mono text-ink-soft">{{ atualizacao.data || "—" }}</span>
          <span class="min-w-0 break-words text-ink lg:min-w-[auto] lg:break-normal">{{ atualizacao.texto }}</span>
        </li>
      </ol>
      <p v-else class="text-[12px] text-ink-soft">Nenhuma atualização registrada ainda.</p>

      <form
        v-if="!readonly"
        :id="`form-nova-atualizacao-${processo.id}`"
        class="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center"
        @submit.prevent="submitAtualizacao"
      >
        <input
          v-model="novaAtualizacao.data"
          type="text"
          placeholder="Data (ex: 31/08)"
          class="min-h-11 w-full shrink-0 rounded-md border border-hairline bg-paper-raised px-2.5 py-1.5 font-mono text-[12.5px] focus:outline-2 focus:outline-accent-dark lg:min-h-auto lg:w-[140px]"
        />
        <input
          :value="novaAtualizacao.texto"
          type="text"
          placeholder="Nova atualização..."
          class="min-h-11 w-full rounded-md border border-hairline bg-paper-raised px-2.5 py-1.5 text-[12.5px] focus:outline-2 focus:outline-accent-dark lg:min-h-auto"
          @input="onAtualizacaoTextoInput"
        />
        <button
          type="submit"
          class="min-h-11 shrink-0 rounded-md bg-accent-dark px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90 lg:min-h-auto"
        >
          Adicionar
        </button>
      </form>
    </div>

    <!-- Rodapé de ações — só abaixo de lg e só pra quem pode editar/excluir (mesma condição
         do botão "Editar processo" e da lixeira do cabeçalho, que ficam ocultos abaixo de lg). -->
    <div
      v-if="!readonly"
      :id="`processo-acoes-${processo.id}`"
      class="flex items-center gap-3 border-t border-hairline pt-3 lg:hidden"
    >
      <button
        :id="`btn-edit-processo-footer-${processo.id}`"
        type="button"
        class="min-h-11 flex-1 rounded-lg border border-accent-dark px-4 text-[13.5px] font-semibold text-accent-dark transition-colors hover:bg-accent-dark/5"
        @click="emit('edit', processo)"
      >
        Editar
      </button>
      <button
        :id="`btn-delete-processo-footer-${processo.id}`"
        type="button"
        title="Excluir"
        aria-label="Excluir"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:text-danger"
        @click="emit('request-delete')"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </div>
  </div>
</template>
