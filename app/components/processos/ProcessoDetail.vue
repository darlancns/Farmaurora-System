<script setup lang="ts">
import { reactive } from "vue";
import type { AtualizacaoProcesso, Processo } from "#shared/types/processo";
import { capitalizeFirstLetter } from "../../utils/processoFormatters";
import { formatCurrency } from "../../utils/formatters";

const props = withDefaults(
  defineProps<{
    processo: Processo;
    readonly?: boolean;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  edit: [processo: Processo];
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

interface DetailField {
  label: string;
  value?: string;
}

function fields(processo: Processo): DetailField[] {
  return [
    { label: "Pasta", value: processo.pasta },
    { label: "Despachante", value: processo.despachante },
    { label: "Fornecedor", value: processo.fornecedor },
    { label: "Modal de envio", value: processo.modalEnvio },
    { label: "Cia. aérea", value: processo.companhiaAerea },
    { label: "Nº AWB", value: processo.numeroAwb },
    { label: "Rastreio", value: processo.codigoRastreio },
    { label: "Local de entrega", value: processo.localEntrega },
    { label: "Nº do processo", value: processo.numeroProcesso },
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
    { label: "Previsão entrega", value: processo.datas.previsaoEntrega },
    { label: "Suposta estimativa", value: processo.datas.supostaEstimativa },
  ];
}
</script>

<template>
  <div :id="`processo-detail-${processo.id}`" class="flex flex-col gap-3 border-t border-hairline bg-paper px-4 py-3.5">
    <div class="flex items-center justify-between">
      <p class="text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Detalhe do processo</p>
      <button
        v-if="!readonly"
        :id="`btn-edit-processo-${processo.id}`"
        type="button"
        class="rounded-md border border-hairline bg-paper-raised px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark"
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

    <div class="grid grid-cols-4 gap-x-4 gap-y-2 text-[12.5px]">
      <div v-for="field in fields(processo)" :key="field.label" class="flex flex-col gap-0.5">
        <span class="text-ink-soft">{{ field.label }}</span>
        <span class="font-mono text-ink">{{ field.value || "—" }}</span>
      </div>
      <div v-if="processo.transportadoraNacional" class="flex flex-col gap-0.5">
        <span class="text-ink-soft">Transportadora</span>
        <span class="font-mono text-ink">
          {{ processo.transportadoraNacional.nome }}
          <template v-if="processo.transportadoraNacional.valor !== undefined">
            — R$ {{ formatCurrency(processo.transportadoraNacional.valor) }}
          </template>
        </span>
      </div>
    </div>

    <div class="border-t border-hairline pt-2.5">
      <p class="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Datas</p>
      <div class="grid grid-cols-4 gap-x-4 gap-y-2 text-[12.5px]">
        <div v-for="field in datasFields(processo)" :key="field.label" class="flex flex-col gap-0.5">
          <span class="text-ink-soft">{{ field.label }}</span>
          <span class="font-mono text-ink">{{ field.value || "—" }}</span>
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
          <span class="text-ink">{{ atualizacao.texto }}</span>
        </li>
      </ol>
      <p v-else class="text-[12px] text-ink-soft">Nenhuma atualização registrada ainda.</p>

      <form
        v-if="!readonly"
        :id="`form-nova-atualizacao-${processo.id}`"
        class="mt-2 flex items-center gap-2"
        @submit.prevent="submitAtualizacao"
      >
        <input
          v-model="novaAtualizacao.data"
          type="text"
          placeholder="Data (ex: 31/08)"
          class="w-[140px] shrink-0 rounded-md border border-hairline bg-paper-raised px-2.5 py-1.5 font-mono text-[12.5px] focus:outline-2 focus:outline-accent-dark"
        />
        <input
          :value="novaAtualizacao.texto"
          type="text"
          placeholder="Nova atualização..."
          class="w-full rounded-md border border-hairline bg-paper-raised px-2.5 py-1.5 text-[12.5px] focus:outline-2 focus:outline-accent-dark"
          @input="onAtualizacaoTextoInput"
        />
        <button
          type="submit"
          class="shrink-0 rounded-md bg-accent-dark px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90"
        >
          Adicionar
        </button>
      </form>
    </div>
  </div>
</template>
