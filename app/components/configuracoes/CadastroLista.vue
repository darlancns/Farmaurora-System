<script setup lang="ts">
import { computed } from "vue";
import type { Cadastro, ListaCadastro } from "#shared/types/Cadastro";
import { ROTULO_INATIVO_CADASTRO } from "#shared/constants/cadastros";
import { colunasDaLista } from "../../utils/cadastroColunas";
import { listaTemEdicao } from "../../utils/cadastroForm";
import ActionsMenu, { type ActionsMenuItem } from "../ActionsMenu.vue";

// Lista de UM tipo de Cadastro (dentro do bloco/card da lista, em CadastrosTab.vue): tabela no desktop e cards no mobile (molde do ContasTab.vue — dois renders alternados
// só por CSS, com ids diferentes em cada um). Só apresenta: abrir modal, desativar e reativar são eventos do pai.
// Itens inativos aparecem depois dos ativos, esmaecidos e com "(inativo)" ao lado do nome.

const props = defineProps<{
  lista: ListaCadastro;
  itens: Cadastro[];
  carregando: boolean;
  podeEditar: boolean;
}>();

const emit = defineEmits<{
  editar: [item: Cadastro];
  desativar: [item: Cadastro];
  reativar: [item: Cadastro];
}>();

const colunas = computed(() => colunasDaLista(props.lista));
// Nome + colunas da lista + Situação + Ações.
const totalColunas = computed(() => colunas.value.length + 3);
const vazio = computed(() => !props.carregando && props.itens.length === 0);

function itensDoMenu(item: Cadastro): ActionsMenuItem[] {
  const menu: ActionsMenuItem[] = [];
  if (listaTemEdicao(props.lista)) {
    menu.push({ id: `btn-editar-cadastro-${props.lista}-${item.id}`, label: "Editar", onClick: () => emit("editar", item) });
  }
  menu.push(
    item.ativo
      ? { id: `btn-desativar-cadastro-${props.lista}-${item.id}`, label: "Desativar", onClick: () => emit("desativar", item) }
      : { id: `btn-reativar-cadastro-${props.lista}-${item.id}`, label: "Reativar", onClick: () => emit("reativar", item) },
  );
  return menu;
}
</script>

<template>
  <!--
    @container: a partir de 700px de largura do próprio painel a tabela aparece; abaixo, a lista de cards (cabe em
    360px sem rolagem horizontal). Mesmo esquema do ContasTab.vue.
  -->
  <div :id="`cadastro-lista-${lista}`" class="@container overflow-hidden border-t border-hairline">
    <table class="hidden w-full text-left text-[13px] @[700px]:table">
      <thead class="border-b border-hairline bg-paper text-[11px] tracking-wide text-ink-soft uppercase">
        <tr>
          <th class="px-3.5 py-2.5 font-semibold">Nome</th>
          <th v-for="coluna in colunas" :key="coluna.chave" class="px-3.5 py-2.5 font-semibold">{{ coluna.titulo }}</th>
          <th class="px-3.5 py-2.5 font-semibold">Situação</th>
          <th class="px-3.5 py-2.5 text-right font-semibold">Ações</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="carregando && !itens.length">
          <td :colspan="totalColunas" class="px-3.5 py-6 text-center text-ink-soft">Carregando…</td>
        </tr>
        <tr v-else-if="vazio">
          <td :colspan="totalColunas" class="px-3.5 py-6 text-center text-ink-soft">Nenhum item cadastrado.</td>
        </tr>
        <tr
          v-for="item in itens"
          :id="`cadastro-row-${lista}-${item.id}`"
          :key="item.id"
          class="border-b border-hairline last:border-b-0"
          :class="item.ativo ? '' : 'text-ink-soft'"
        >
          <td class="px-3.5 py-2.5 font-medium" :class="item.ativo ? 'text-ink' : ''">
            {{ item.nome }}
            <span v-if="!item.ativo" class="ml-1 text-[11.5px] font-normal">{{ ROTULO_INATIVO_CADASTRO }}</span>
          </td>
          <td v-for="coluna in colunas" :key="coluna.chave" class="px-3.5 py-2.5">{{ coluna.texto(item) }}</td>
          <td class="px-3.5 py-2.5">
            <span
              class="rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
              :class="item.ativo ? 'bg-farm-blue-soft text-accent-dark' : 'bg-paper text-ink-soft'"
            >
              {{ item.ativo ? "Ativo" : "Inativo" }}
            </span>
          </td>
          <td class="px-3.5 py-2.5 text-right">
            <ActionsMenu
              v-if="podeEditar"
              :trigger-id="`btn-acoes-cadastro-${lista}-${item.id}`"
              :items="itensDoMenu(item)"
              :aria-label="`Ações para ${item.nome}`"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <div class="flex flex-col @[700px]:hidden">
      <p v-if="carregando && !itens.length" class="px-3.5 py-6 text-center text-[13px] text-ink-soft">Carregando…</p>
      <p v-else-if="vazio" class="px-3.5 py-6 text-center text-[13px] text-ink-soft">Nenhum item cadastrado.</p>

      <div
        v-for="item in itens"
        :id="`cadastro-card-${lista}-${item.id}`"
        :key="item.id"
        class="flex flex-col gap-1.5 border-b border-hairline px-3.5 py-3 last:border-b-0"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[13.5px] font-medium break-words" :class="item.ativo ? 'text-ink' : 'text-ink-soft'">
              {{ item.nome }}
              <span v-if="!item.ativo" class="ml-1 text-[11.5px] font-normal">{{ ROTULO_INATIVO_CADASTRO }}</span>
            </p>
            <span
              class="mt-1 inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
              :class="item.ativo ? 'bg-farm-blue-soft text-accent-dark' : 'bg-paper text-ink-soft'"
            >
              {{ item.ativo ? "Ativo" : "Inativo" }}
            </span>
          </div>
          <ActionsMenu
            v-if="podeEditar"
            :trigger-id="`btn-acoes-cadastro-card-${lista}-${item.id}`"
            :items="itensDoMenu(item)"
            :aria-label="`Ações para ${item.nome}`"
            class="shrink-0"
          />
        </div>

        <dl v-if="colunas.length" class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
          <template v-for="coluna in colunas" :key="coluna.chave">
            <dt class="text-ink-soft">{{ coluna.titulo }}</dt>
            <dd class="min-w-0 break-words text-ink">{{ coluna.texto(item) }}</dd>
          </template>
        </dl>
      </div>
    </div>
  </div>
</template>
