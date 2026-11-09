<script setup lang="ts">
import { reactive } from "vue";
import { CHECKLIST_DIR, STATUS_DIR_LABELS, STATUS_DIR_VAZIO, corDoBanco } from "#shared/constants/dir";
import type { Dir } from "#shared/types/dir";
import {
  contarChecklistMarcados,
  slugBanco,
  slugId,
  sufixoOrdemPaciente,
  type ContagemBancoDir,
  type GrupoPacienteDir,
} from "../../utils/dirFiltros";
import { DIR_FECHAMENTOS_GRID_CLASS } from "../../utils/dirLayout";
import { STATUS_DIR_BADGE_CLASS, STATUS_DIR_VAZIO_BADGE_CLASS } from "../../utils/dirOptions";
import DirBancoChip from "./DirBancoChip.vue";

// Aba "Fechamentos restantes": VISÃO dos POs marcados (e com a operação em andamento), agrupada por
// paciente. Uma linha por PO; o "(N)" aparece como está escrito no nome; nada de campo de ordem.
// Em lg+ é uma tabela agrupada (grupos recolhíveis); abaixo de lg, cartões agrupados.
const props = defineProps<{
  grupos: GrupoPacienteDir[];
  // Contagem por banco da visão (sem o próprio filtro de banco, para os chips não sumirem ao filtrar).
  contagensBanco: ContagemBancoDir[];
  // Valor atual do filtro de banco ("" = todos).
  bancoAtivo: string;
}>();

const emit = defineEmits<{
  "filtrar-banco": [valorFiltro: string];
  edit: [dir: Dir];
  // Desktop: pede confirmação (ConfirmDialog na página).
  "remover-desktop": [dir: Dir];
  // Mobile: abre o sheet "⋯" com Remover + confirmação.
  "acoes-mobile": [dir: Dir];
  incluir: [];
}>();

// Grupos começam abertos (é a lista de trabalho); o botão recolhe/expande todos.
const recolhidos = reactive(new Set<string>());

function alternarGrupo(chave: string): void {
  if (recolhidos.has(chave)) recolhidos.delete(chave);
  else recolhidos.add(chave);
}

function recolherOuExpandirTodos(): void {
  if (recolhidos.size === props.grupos.length) recolhidos.clear();
  else for (const g of props.grupos) recolhidos.add(g.chave);
}

function rotuloOrdens(n: number): string {
  return `${n} ${n === 1 ? "ordem" : "ordens"}`;
}

function marcados(dir: Dir): number {
  return contarChecklistMarcados(dir);
}

function chipClasse(dir: Dir): string {
  if (dir.exigencia) return "bg-danger/10 text-danger ring-1 ring-danger/40";
  return marcados(dir) === CHECKLIST_DIR.length ? "bg-green-100 text-green-800" : "bg-paper text-ink-soft";
}

function statusRotulo(dir: Dir): string {
  return dir.status ? STATUS_DIR_LABELS[dir.status] : STATUS_DIR_VAZIO;
}

function statusClasse(dir: Dir): string {
  return dir.status ? STATUS_DIR_BADGE_CLASS[dir.status] : STATUS_DIR_VAZIO_BADGE_CLASS;
}

// "Célula pintada" da planilha: borda esquerda de 4px na cor do banco.
function bordaBanco(dir: Dir): Record<string, string> {
  return { borderLeftColor: corDoBanco(dir.banco).ponto };
}
</script>

<template>
  <div id="dir-fechamentos" class="flex flex-col gap-3">
    <!-- Faixa de chips por banco (clicáveis: filtram a lista) + ações. -->
    <div class="flex flex-wrap items-center gap-2">
      <div id="dir-fech-chips" class="flex flex-wrap items-center gap-2">
        <button
          v-for="c in contagensBanco"
          :id="`dir-fech-chip-${slugBanco(c.banco)}`"
          :key="c.valorFiltro"
          type="button"
          :aria-pressed="bancoAtivo === c.valorFiltro"
          :title="bancoAtivo === c.valorFiltro ? 'Tirar o filtro deste banco' : `Filtrar por ${c.rotulo}`"
          class="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-paper-raised py-0.5 pr-2.5 pl-0.5 text-[12px] font-semibold text-ink transition-colors hover:bg-paper max-lg:min-h-11"
          :class="bancoAtivo === c.valorFiltro ? 'border-accent-dark ring-1 ring-accent-dark' : 'border-hairline'"
          @click="emit('filtrar-banco', bancoAtivo === c.valorFiltro ? '' : c.valorFiltro)"
        >
          <DirBancoChip :banco="c.banco" />
          <span class="font-mono text-[12px]">{{ c.quantidade }}</span>
        </button>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <button
          v-if="grupos.length"
          id="btn-dir-fech-recolher"
          type="button"
          class="min-h-11 rounded-md border border-hairline bg-paper-raised px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:text-ink lg:min-h-0"
          @click="recolherOuExpandirTodos"
        >
          {{ recolhidos.size === grupos.length ? "Expandir todos" : "Recolher todos" }}
        </button>
        <!-- Desktop: o botão fica aqui; no mobile é o "+" flutuante da página (fab-incluir-fechamento). -->
        <button
          id="btn-dir-incluir-fechamento"
          type="button"
          class="hidden rounded-lg bg-accent-dark px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90 lg:block"
          @click="emit('incluir')"
        >
          + Incluir paciente
        </button>
      </div>
    </div>

    <p
      v-if="!grupos.length"
      id="dir-fech-vazio"
      class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
    >
      Nenhum PO em fechamento restante.
    </p>

    <div v-else class="overflow-hidden rounded-lg border border-hairline bg-paper-raised">
      <div class="overflow-x-auto">
        <div
          id="dir-fech-header"
          role="row"
          class="hidden border-b border-hairline bg-paper py-2 pr-3.5 pl-[18px] text-[10.5px] font-semibold tracking-wide text-ink-soft uppercase"
          :class="DIR_FECHAMENTOS_GRID_CLASS"
        >
          <span>Ordem</span>
          <span>PO</span>
          <span>Medicamento</span>
          <span>Status</span>
          <span>Banco</span>
          <span title="Itens do checklist marcados">Check</span>
          <span class="sr-only">Remover</span>
        </div>

        <div class="lg:min-w-[860px]">
          <section
            v-for="grupo in grupos"
            :id="`dir-fech-grupo-${slugId(grupo.chave, 'paciente')}`"
            :key="grupo.chave"
            class="border-b border-hairline last:border-b-0"
          >
            <button
              :id="`dir-fech-grupo-btn-${slugId(grupo.chave, 'paciente')}`"
              type="button"
              :aria-expanded="!recolhidos.has(grupo.chave)"
              class="flex min-h-11 w-full items-center justify-between gap-2 bg-paper/60 px-3.5 py-2 text-left transition-colors hover:bg-paper lg:min-h-0"
              @click="alternarGrupo(grupo.chave)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <svg
                  viewBox="0 0 20 20"
                  class="h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform"
                  :class="{ 'rotate-90': !recolhidos.has(grupo.chave) }"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  aria-hidden="true"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 5l5 5-5 5" />
                </svg>
                <span class="truncate font-display text-[14px] font-semibold text-ink">{{ grupo.nome }}</span>
              </span>
              <span class="shrink-0 rounded-full bg-paper px-2.5 py-0.5 font-mono text-[11.5px] text-ink-soft">
                {{ rotuloOrdens(grupo.registros.length) }}
              </span>
            </button>

            <div v-if="!recolhidos.has(grupo.chave)">
              <div v-for="dir in grupo.registros" :key="dir.id">
                <!-- Abaixo de lg: cartão. Ids com prefixo "dir-fech-card-" pra não duplicar os do desktop. -->
                <div
                  :id="`dir-fech-card-${dir.id}`"
                  role="button"
                  tabindex="0"
                  class="flex cursor-pointer flex-col gap-1 border-t border-l-4 border-t-hairline py-2.5 pr-1.5 pl-3 transition-colors hover:bg-paper lg:hidden"
                  :style="bordaBanco(dir)"
                  @click="emit('edit', dir)"
                  @keydown.enter.self="emit('edit', dir)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="min-w-0 truncate">
                      <span v-if="sufixoOrdemPaciente(dir.paciente)" class="mr-1.5 font-mono text-[12.5px] text-ink-soft">{{
                        sufixoOrdemPaciente(dir.paciente)
                      }}</span>
                      <span class="font-mono text-[12.5px] font-semibold text-accent-dark">{{ dir.po }}</span>
                    </p>
                    <button
                      :id="`btn-dir-fech-acoes-${dir.id}`"
                      type="button"
                      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[20px] leading-none text-ink-soft transition-colors hover:text-ink"
                      :aria-label="`Ações do ${dir.po}`"
                      aria-haspopup="dialog"
                      @click.stop="emit('acoes-mobile', dir)"
                    >
                      ⋯
                    </button>
                  </div>
                  <p class="truncate pr-2 text-[12.5px] text-ink-soft">{{ dir.medicamento || "—" }}</p>
                  <div class="flex flex-wrap items-center gap-2 pr-2">
                    <span class="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" :class="statusClasse(dir)">{{
                      statusRotulo(dir)
                    }}</span>
                    <DirBancoChip :id="`dir-fech-card-banco-${dir.id}`" :banco="dir.banco" />
                    <span
                      class="ml-auto rounded-full px-2 py-0.5 font-mono text-[11.5px]"
                      :class="chipClasse(dir)"
                      :title="`Checklist: ${marcados(dir)} de ${CHECKLIST_DIR.length} itens`"
                    >
                      {{ dir.exigencia ? "! " : "" }}{{ marcados(dir) }}/{{ CHECKLIST_DIR.length }}
                    </span>
                  </div>
                </div>

                <!-- lg+: linha da tabela (mesma grade do cabeçalho). -->
                <div
                  :id="`dir-fech-row-${dir.id}`"
                  role="row"
                  tabindex="0"
                  class="hidden cursor-pointer border-t border-l-4 border-t-hairline py-2 pr-3.5 pl-3.5 text-[12.5px] transition-colors hover:bg-paper"
                  :class="DIR_FECHAMENTOS_GRID_CLASS"
                  :style="bordaBanco(dir)"
                  @click="emit('edit', dir)"
                  @keydown.enter.self="emit('edit', dir)"
                >
                  <span class="font-mono text-[12px] text-ink-soft">{{ sufixoOrdemPaciente(dir.paciente) || "—" }}</span>
                  <span class="font-mono text-[12px] font-semibold text-accent-dark">{{ dir.po }}</span>
                  <span class="truncate text-ink" :title="dir.medicamento">{{ dir.medicamento || "—" }}</span>
                  <span class="justify-self-start rounded-full px-2 py-0.5 text-[11.5px] font-semibold" :class="statusClasse(dir)">{{
                    statusRotulo(dir)
                  }}</span>
                  <span class="min-w-0"><DirBancoChip :id="`dir-fech-banco-${dir.id}`" :banco="dir.banco" /></span>
                  <span
                    class="justify-self-start rounded-full px-2 py-0.5 font-mono text-[11.5px]"
                    :class="chipClasse(dir)"
                    :title="`Checklist: ${marcados(dir)} de ${CHECKLIST_DIR.length} itens`"
                  >
                    {{ dir.exigencia ? "! " : "" }}{{ marcados(dir) }}/{{ CHECKLIST_DIR.length }}
                  </span>
                  <button
                    :id="`btn-dir-fech-remover-${dir.id}`"
                    type="button"
                    class="justify-self-end rounded-md border border-hairline px-2.5 py-1 text-[12px] font-semibold text-danger transition-colors hover:bg-danger/5"
                    @click.stop="emit('remover-desktop', dir)"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
