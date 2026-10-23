<script setup lang="ts">
import { computed, ref } from "vue";
import { dataBrasiliaDe, formatarDataBR } from "#shared/utils/dataBrasilia";
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
import ItemAcoesColuna from "../cards/ItemAcoesColuna.vue";
import type { PedidoPagamento } from "../../../composables/usePagamentoConfirmacao";
import PagamentosFiltrosSheet from "../PagamentosFiltrosSheet.vue";

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
  "pedir-pagar-grupo": [pedido: PedidoPagamento];
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

// Abaixo de lg os 3 selects moram no bottom sheet (PagamentosFiltrosSheet), aberto pelo ícone
// dentro da busca; a bolinha do ícone conta só os filtros (despachante/transportadora e status),
// não a ordenação.
const showFiltros = ref(false);
const filtrosAtivos = computed<number>(() => [filtroGrupo.value, filtroStatus.value].filter(Boolean).length);

function limparFiltros(): void {
  filtroGrupo.value = "";
  filtroStatus.value = "";
  ordemRealizados.value = "recentes";
}

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
  return formatarDataBR(g.pagoEm ? dataBrasiliaDe(g.pagoEm) : g.data);
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
          class="hidden rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90 lg:block"
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
          @pedir-pagar-grupo="emit('pedir-pagar-grupo', $event)"
          @exportar-foto="emit('exportar-foto', grupo)"
        />
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-[12px] font-semibold tracking-wide text-ink-soft uppercase">Pagamentos realizados</h2>

      <!-- Abaixo de lg: só a busca, com o ícone de filtros DENTRO dela (os selects vão pro painel).
           Em lg+ os selects voltam à linha e o ícone some, como sempre foi. -->
      <div class="mb-2.5 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <div class="relative w-full lg:w-[240px]">
          <input
            :id="`busca-grupo-realizado-${tipo}`"
            v-model="buscaRealizados"
            type="text"
            placeholder="Buscar por paciente..."
            class="min-h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 pr-[68px] text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark lg:min-h-0 lg:pr-8"
          />
          <button
            v-if="buscaRealizados"
            :id="`btn-clear-busca-grupo-realizado-${tipo}`"
            type="button"
            title="Limpar busca"
            aria-label="Limpar busca"
            class="absolute top-1/2 right-11 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-soft transition-colors hover:text-danger lg:right-2"
            @click="buscaRealizados = ''"
          >
            ✕
          </button>
          <button
            :id="`btn-filtros-grupo-realizado-${tipo}`"
            type="button"
            title="Filtros"
            aria-label="Filtros"
            aria-haspopup="dialog"
            class="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:text-accent-dark lg:hidden"
            @click="showFiltros = true"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
              />
            </svg>
            <span
              v-if="filtrosAtivos > 0"
              :id="`badge-filtros-grupo-realizado-${tipo}`"
              class="absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-farm-blue px-1 text-[10px] font-semibold text-white"
            >
              {{ filtrosAtivos }}
            </span>
          </button>
        </div>
        <div class="hidden lg:block lg:w-[210px]">
          <AppSelect :id="`filtro-grupo-realizado-${tipo}`" v-model="filtroGrupo" :options="grupoFilterOptions" />
        </div>
        <div class="hidden lg:block lg:w-[170px]">
          <AppSelect :id="`filtro-status-realizado-${tipo}`" v-model="filtroStatus" :options="statusFilterOptions" />
        </div>
        <div class="hidden lg:block lg:w-[200px]">
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
          class="@container border-b border-hairline last:border-b-0"
        >
          <!-- lg+: o layout de sempre (container query), intacto. Abaixo de lg ele fica display:none. -->
          <div class="hidden lg:block">
            <!-- Abaixo de 560px (grid de 2 colunas): linha 1 = paciente (quebra, sem truncar) + editar/excluir
                 na MESMA linha; linha 2 cinza = despachante/transportadora; linha 3 = data, valor e selo (wrap).
                 O bloco do nome vira `contents`. A partir de 560px volta ao flex de uma linha só. -->
            <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3.5 py-2.5 @[560px]:flex @[560px]:flex-row @[560px]:items-center @[560px]:gap-3">
              <div class="contents @[560px]:block @[560px]:min-w-0 @[560px]:flex-1">
                <span class="col-start-1 row-start-1 min-w-0 text-[13.5px] font-medium break-words text-ink @[560px]:block @[560px]:truncate">{{ r.item.paciente }}</span>
                <span class="col-span-2 row-start-2 text-[11.5px] break-words text-ink-soft @[560px]:block @[560px]:truncate">{{ r.grupo.nomeGrupo }}</span>
              </div>

              <div class="col-span-2 row-start-3 flex flex-wrap items-center gap-x-4 gap-y-1 @[560px]:flex-nowrap @[560px]:gap-3">
                <span
                  class="shrink-0 text-right font-mono text-[11.5px] text-ink-soft @[560px]:w-[86px]"
                  title="Data do pagamento"
                >
                  {{ dataPagamentoLabel(r.grupo) }}
                </span>
                <span class="shrink-0 text-right font-mono text-[12.5px] text-ink @[560px]:w-[120px]">
                  R$ {{ formatCurrency(r.item.valor) }}
                </span>
                <span
                  class="shrink-0 rounded-full px-2.5 py-1 text-center text-[11px] font-semibold whitespace-nowrap"
                  :class="badgeRealizado(r.item.status)"
                >
                  {{ labelRealizado(r.item.status) }}
                </span>
              </div>

              <div v-if="!readonly" class="col-start-2 row-start-1 -my-2 -mr-3.5 flex shrink-0 items-center gap-1 @[560px]:my-0 @[560px]:mr-0">
                <button
                  :id="`btn-editar-realizado-${tipo}-${r.grupo.id}-${r.index}`"
                  type="button"
                  title="Editar pagamento realizado"
                  aria-label="Editar pagamento realizado"
                  class="shrink-0 rounded-md p-3.5 text-ink-soft transition-colors hover:text-accent-dark lg:p-1.5"
                  @click="emit('editar-realizado', r.grupo)"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.862 4.487" />
                  </svg>
                </button>
                <button
                  :id="`btn-excluir-item-realizado-${tipo}-${r.grupo.id}-${r.index}`"
                  type="button"
                  title="Excluir pagamento"
                  aria-label="Excluir pagamento"
                  class="shrink-0 rounded-md p-3.5 text-ink-soft transition-colors hover:text-danger lg:p-1.5"
                  @click="emit('excluir-item', r.grupo.id, r.index)"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Abaixo de lg: paciente, despachante/transportadora, data/valor/selo à esquerda; coluna de ações
               (lápis em cima, lixeira embaixo, divisória vertical) à direita, ausente em somente leitura.
               Ids dos botões com prefixo `mobile-` (os de lg+ ficam no bloco acima). -->
          <div class="flex items-stretch lg:hidden">
            <div class="flex min-w-0 flex-1 flex-col gap-1 px-3.5 py-2.5">
              <span class="text-[13.5px] font-medium break-words text-ink">{{ r.item.paciente }}</span>
              <span class="text-[11.5px] break-words text-ink-soft">{{ r.grupo.nomeGrupo }}</span>
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span class="font-mono text-[11.5px] text-ink-soft" title="Data do pagamento">
                  {{ dataPagamentoLabel(r.grupo) }}
                </span>
                <span class="font-mono text-[12.5px] text-ink">R$ {{ formatCurrency(r.item.valor) }}</span>
                <span
                  class="shrink-0 rounded-full px-2.5 py-1 text-center text-[11px] font-semibold whitespace-nowrap"
                  :class="badgeRealizado(r.item.status)"
                >
                  {{ labelRealizado(r.item.status) }}
                </span>
              </div>
            </div>
            <ItemAcoesColuna
              v-if="!readonly"
              :editar="{ id: `mobile-btn-editar-realizado-${tipo}-${r.grupo.id}-${r.index}`, label: 'Editar pagamento realizado' }"
              :excluir="{ id: `mobile-btn-excluir-item-realizado-${tipo}-${r.grupo.id}-${r.index}`, label: 'Excluir pagamento' }"
              @editar="emit('editar-realizado', r.grupo)"
              @excluir="emit('excluir-item', r.grupo.id, r.index)"
            />
          </div>
        </div>
      </div>
    </section>

    <PagamentosFiltrosSheet
      v-if="showFiltros"
      :id="`grupo-filtros-sheet-${tipo}`"
      @close="showFiltros = false"
      @limpar="limparFiltros"
    >
      <AppSelect :id="`sheet-filtro-grupo-realizado-${tipo}`" v-model="filtroGrupo" :options="grupoFilterOptions" drop-up />
      <AppSelect :id="`sheet-filtro-status-realizado-${tipo}`" v-model="filtroStatus" :options="statusFilterOptions" drop-up />
      <AppSelect :id="`sheet-ordem-grupo-realizado-${tipo}`" v-model="ordemRealizados" :options="ordemFilterOptions" drop-up />
    </PagamentosFiltrosSheet>
  </div>
</template>
