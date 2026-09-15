<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  EmpresaPagamento,
  GrupoPagamento,
  ItemGrupoPagamento,
  StatusItemGrupo,
  TipoGrupoPagamento,
} from "#shared/types/Pagamento";
import {
  STATUS_ITEM_GRUPO_LABEL,
  STATUS_ITEM_GRUPO_ORDER,
  TIPO_GRUPO_PAGAMENTO_LABEL,
} from "#shared/constants/pagamentos";
import { formatCurrency } from "../../../utils/formatters";
import { normalizeText } from "../../../utils/search";
import { STATUS_ITEM_GRUPO_META } from "../../../utils/pagamentoStatus";
import AppSelect from "../../AppSelect.vue";
import type { AppSelectOption } from "../../../types/appSelect";
import GrupoPagamentoCard from "../cards/GrupoPagamentoCard.vue";

const props = withDefaults(
  defineProps<{
    tipo: TipoGrupoPagamento;
    empresa: EmpresaPagamento;
    grupos: GrupoPagamento[];
    readonly?: boolean;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  "novo-pagamento": [];
  "ciclo-status": [grupoId: string, index: number, status: StatusItemGrupo];
  "editar-item": [grupoId: string, index: number];
  "excluir-item": [grupoId: string, index: number];
  "pagar-grupo": [grupoId: string];
  "exportar-foto": [grupo: GrupoPagamento];
  "editar-realizado": [grupo: GrupoPagamento];
}>();

const label = computed(() => TIPO_GRUPO_PAGAMENTO_LABEL[props.tipo].toLowerCase());
const todosGrupoLabel = computed(() =>
  props.tipo === "DESPACHANTE" ? "Todos os despachantes" : "Todas as transportadoras"
);

const daEmpresa = computed(() => props.grupos.filter((g) => g.empresa === props.empresa));

const abertos = computed(() => daEmpresa.value.filter((g) => !g.realizado));

// ── Pagamentos realizados: lista plana por paciente + busca/filtros ────────
type OrdemRealizados = "recentes" | "antigos";

interface ItemRealizado {
  item: ItemGrupoPagamento;
  grupo: GrupoPagamento;
  index: number; // posição do item dentro do grupo (pra editar/excluir)
}

function chaveDataPagamento(g: GrupoPagamento): string {
  return g.pagoEm ?? `${g.data}T00:00:00`;
}

const buscaRealizados = ref("");
const filtroGrupo = ref("");
const filtroStatus = ref<StatusItemGrupo | "">("");
const ordemRealizados = ref<OrdemRealizados>("recentes");

const itensRealizados = computed<ItemRealizado[]>(() => {
  const dir = ordemRealizados.value === "recentes" ? 1 : -1;
  const lista: ItemRealizado[] = [];
  for (const grupo of daEmpresa.value.filter((g) => g.realizado)) {
    grupo.itens.forEach((item, index) => lista.push({ item, grupo, index }));
  }
  return lista.sort((a, b) => {
    const porData = chaveDataPagamento(b.grupo).localeCompare(chaveDataPagamento(a.grupo)) * dir;
    if (porData !== 0) return porData;
    return a.item.paciente.localeCompare(b.item.paciente, "pt-BR");
  });
});

const grupoFilterOptions = computed<AppSelectOption<string>[]>(() => {
  const nomes = [...new Set(itensRealizados.value.map((r) => r.grupo.nomeGrupo))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
  return [
    { value: "", label: todosGrupoLabel.value },
    ...nomes.map((n) => ({ value: n, label: n })),
  ];
});

// Na seção "realizados" um item em "Complemento" já foi pago como complemento:
// aparece como "Pago / Complemento" e com o badge verde (igual ao "Pago").
function labelRealizado(s: StatusItemGrupo): string {
  return s === "COMPLEMENTO" ? "Pago / Complemento" : STATUS_ITEM_GRUPO_LABEL[s];
}
function badgeRealizado(s: StatusItemGrupo): string {
  return STATUS_ITEM_GRUPO_META[s === "COMPLEMENTO" ? "PAGO" : s].badgeClass;
}

// Filtro de status: só os status que de fato aparecem na lista de realizados.
const statusFilterOptions = computed<AppSelectOption<StatusItemGrupo | "">[]>(() => {
  const presentes = new Set(itensRealizados.value.map((r) => r.item.status));
  return [
    { value: "", label: "Todos os status" },
    ...STATUS_ITEM_GRUPO_ORDER.filter((s) => presentes.has(s)).map((s) => ({
      value: s,
      label: labelRealizado(s),
    })),
  ];
});

const ordemFilterOptions: AppSelectOption<OrdemRealizados>[] = [
  { value: "recentes", label: "Mais recentes primeiro" },
  { value: "antigos", label: "Mais antigos primeiro" },
];

const itensRealizadosFiltrados = computed<ItemRealizado[]>(() => {
  const q = normalizeText(buscaRealizados.value);
  return itensRealizados.value.filter((r) => {
    if (filtroGrupo.value && r.grupo.nomeGrupo !== filtroGrupo.value) return false;
    if (filtroStatus.value && r.item.status !== filtroStatus.value) return false;
    if (q && !normalizeText(r.item.paciente).includes(q)) return false;
    return true;
  });
});

function dataPagamentoLabel(g: GrupoPagamento): string {
  return new Date(chaveDataPagamento(g)).toLocaleDateString("pt-BR");
}
</script>

<template>
  <div :id="`grupo-tab-${tipo}`" class="flex flex-col gap-5">
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-[12px] font-semibold tracking-wide text-ink-soft uppercase">
          Pagamentos diários (em aberto)
        </h2>
        <button
          v-if="!readonly"
          :id="`btn-novo-pagamento-${tipo}`"
          type="button"
          class="rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90"
          @click="emit('novo-pagamento')"
        >
          + Adicionar pagamento
        </button>
      </div>

      <p
        v-if="!abertos.length"
        class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
      >
        Nenhum pagamento de {{ label }} em aberto para {{ empresa }}.
      </p>

      <div class="flex flex-col gap-3">
        <GrupoPagamentoCard
          v-for="grupo in abertos"
          :key="grupo.id"
          :grupo="grupo"
          :readonly="readonly"
          @ciclo-status="(index, status) => emit('ciclo-status', grupo.id, index, status)"
          @editar-item="(index) => emit('editar-item', grupo.id, index)"
          @excluir-item="(index) => emit('excluir-item', grupo.id, index)"
          @pagar-grupo="emit('pagar-grupo', grupo.id)"
          @exportar-foto="emit('exportar-foto', grupo)"
        />
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-[12px] font-semibold tracking-wide text-ink-soft uppercase">Pagamentos realizados</h2>

      <div class="mb-2.5 flex flex-wrap items-center gap-2.5">
        <div class="relative w-[240px]">
          <input
            :id="`busca-grupo-realizado-${tipo}`"
            v-model="buscaRealizados"
            type="text"
            placeholder="Buscar por paciente..."
            class="w-full rounded-md border border-hairline bg-paper px-3 py-2 pr-8 text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
          <button
            v-if="buscaRealizados"
            :id="`btn-clear-busca-grupo-realizado-${tipo}`"
            type="button"
            title="Limpar busca"
            aria-label="Limpar busca"
            class="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-soft transition-colors hover:text-danger"
            @click="buscaRealizados = ''"
          >
            ✕
          </button>
        </div>
        <div class="w-[210px]">
          <AppSelect :id="`filtro-grupo-realizado-${tipo}`" v-model="filtroGrupo" :options="grupoFilterOptions" />
        </div>
        <div class="w-[170px]">
          <AppSelect :id="`filtro-status-realizado-${tipo}`" v-model="filtroStatus" :options="statusFilterOptions" />
        </div>
        <div class="w-[200px]">
          <AppSelect :id="`ordem-grupo-realizado-${tipo}`" v-model="ordemRealizados" :options="ordemFilterOptions" />
        </div>
      </div>

      <p
        v-if="!itensRealizados.length"
        class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
      >
        Nenhum pagamento de {{ label }} pago ainda.
      </p>
      <p
        v-else-if="!itensRealizadosFiltrados.length"
        class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
      >
        Nenhum pagamento encontrado com esses filtros.
      </p>
      <div
        v-else
        :id="`grupo-realizados-lista-${tipo}`"
        class="overflow-hidden rounded-lg border border-hairline bg-paper-raised"
      >
        <div
          v-for="(r, i) in itensRealizadosFiltrados"
          :key="`${r.grupo.id}-${i}`"
          class="flex items-center gap-3 border-b border-hairline px-3.5 py-2.5 last:border-b-0"
        >
          <div class="min-w-0 flex-1">
            <span class="block truncate text-[13.5px] font-medium text-ink">{{ r.item.paciente }}</span>
            <span class="block truncate text-[11.5px] text-ink-soft">{{ r.grupo.nomeGrupo }}</span>
          </div>
          <span
            class="w-[86px] shrink-0 text-right font-mono text-[11.5px] text-ink-soft"
            title="Data do pagamento"
          >
            {{ dataPagamentoLabel(r.grupo) }}
          </span>
          <span class="w-[120px] shrink-0 text-right font-mono text-[12.5px] text-ink">
            R$ {{ formatCurrency(r.item.valor) }}
          </span>
          <span
            class="shrink-0 rounded-full px-2.5 py-1 text-center text-[11px] font-semibold whitespace-nowrap"
            :class="badgeRealizado(r.item.status)"
          >
            {{ labelRealizado(r.item.status) }}
          </span>
          <button
            v-if="!readonly"
            :id="`btn-editar-realizado-${tipo}-${r.grupo.id}-${r.index}`"
            type="button"
            title="Editar pagamento realizado"
            aria-label="Editar pagamento realizado"
            class="shrink-0 rounded-md p-1.5 text-ink-soft transition-colors hover:text-accent-dark"
            @click="emit('editar-realizado', r.grupo)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.862 4.487" />
            </svg>
          </button>
          <button
            v-if="!readonly"
            :id="`btn-excluir-item-realizado-${tipo}-${r.grupo.id}-${r.index}`"
            type="button"
            title="Excluir pagamento"
            aria-label="Excluir pagamento"
            class="shrink-0 rounded-md p-1.5 text-ink-soft transition-colors hover:text-danger"
            @click="emit('excluir-item', r.grupo.id, r.index)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
