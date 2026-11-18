<script setup lang="ts">
import { computed } from "vue";
import type { Cadastro, ListaCadastro } from "#shared/types/Cadastro";
import { LISTA_CADASTRO_ROTULO, ROTULO_INATIVO_CADASTRO } from "#shared/constants/cadastros";
import { colunasDaLista, linhaSecundaria, textoContagem, textoEncontrados } from "../../utils/cadastroColunas";
import CadastroSwitch from "./CadastroSwitch.vue";

// UMA seção RECOLHÍVEL de Cadastros (Fornecedores, Despachantes, Transportadoras ou Cias aéreas). Fechada por padrão: o
// cabeçalho mostra título, contagem ("13 · 13 ativos"), "+ Adicionar" e a seta. Aberta, vira uma TABELA COMPACTA (uma
// linha por item) — ou, no celular, uma lista de itens de duas linhas, com a chave Ativo à direita. Itens inativos ficam
// ao final (a ordem vem pronta do servidor) e esmaecidos. Só apresenta: abrir o painel, adicionar e alternar o ativo
// são eventos do pai (CadastrosTab.vue). IDs fixos (hidratação).
//
// Acessibilidade: o botão do título tem aria-expanded e aria-controls (o corpo, sempre no DOM, com `hidden` quando
// fechado); cada chave Ativo tem aria-label com o nome do item; o nome de cada linha é um botão (foco do teclado e a
// volta do foco ao fechar o painel); clicar em qualquer lugar da linha também abre o painel.
//
// A coluna PIX diz só "Cadastrada" ou "—" (nunca a chave) e só aparece para quem recebe o campo (`podeVerPix`).

const props = defineProps<{
  lista: ListaCadastro;
  /** Todos os itens da lista (para a contagem). */
  itens: Cadastro[];
  /** Os itens a mostrar (todos, ou os que a busca encontrou). */
  visiveis: Cadastro[];
  aberta: boolean;
  /** Há busca em andamento: a contagem vira "N encontrados", destacada. */
  buscaAtiva: boolean;
  carregando: boolean;
  podeEditar: boolean;
  podeVerPix: boolean;
  /** Valor pedido e ainda não confirmado de cada chave Ativo (`lista:id` → ligado), para a chave responder na hora. */
  pendentes: Record<string, boolean>;
}>();

const emit = defineEmits<{
  alternar: [];
  adicionar: [];
  abrir: [item: Cadastro];
  ativo: [item: Cadastro, valor: boolean];
}>();

const rotulo = computed(() => LISTA_CADASTRO_ROTULO[props.lista]);
const colunas = computed(() => colunasDaLista(props.lista, props.podeVerPix));
// Nome + colunas da lista + Ativo.
const totalColunas = computed(() => colunas.value.length + 2);
const primeiraCarga = computed(() => props.carregando && props.itens.length === 0);
const contagem = computed(() => (props.buscaAtiva ? textoEncontrados(props.visiveis.length) : textoContagem(props.itens)));
const semItens = computed(() => !props.carregando && props.visiveis.length === 0);
const textoVazio = computed(() => (props.buscaAtiva ? "Nenhum item encontrado." : "Nenhum item cadastrado."));

const valorAtivo = (item: Cadastro): boolean => props.pendentes[`${props.lista}:${item.id}`] ?? item.ativo;
const rotuloSwitch = (item: Cadastro): string => `Ativo: ${item.nome}`;
</script>

<template>
  <section :id="`cadastro-secao-${lista}`" class="overflow-hidden rounded-lg border border-hairline bg-paper-raised">
    <!-- Cabeçalho (padrão de acordeão: h2 > button). O botão do título abre/fecha e a contagem é a descrição dele
         (aria-describedby); a contagem, o espaço vazio e a seta à direita também alternam com o mouse (a seta é só atalho:
         aria-hidden, fora da ordem do Tab). "+ Adicionar" é irmão (um botão não fica dentro de outro). -->
    <header class="flex items-center gap-2 px-3.5 py-2">
      <h2 :id="`cadastro-titulo-${lista}`" class="min-w-0 text-[12px] font-semibold tracking-wide text-ink-soft uppercase">
        <button
          :id="`btn-secao-${lista}`"
          type="button"
          class="min-h-11 cursor-pointer rounded-md text-left tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-dark"
          :aria-expanded="aberta"
          :aria-controls="`cadastro-corpo-${lista}`"
          :aria-describedby="`cadastro-contagem-${lista}`"
          @click="emit('alternar')"
        >
          {{ rotulo }}
        </button>
      </h2>
      <span
        :id="`cadastro-contagem-${lista}`"
        class="cursor-pointer rounded-full px-2 py-0.5 text-[11.5px] whitespace-nowrap"
        :class="buscaAtiva && visiveis.length > 0 ? 'bg-farm-blue-soft font-semibold text-accent-dark' : 'text-ink-soft'"
        @click="emit('alternar')"
      >
        {{ primeiraCarga ? "Carregando…" : contagem }}
      </span>
      <div class="min-h-11 flex-1 cursor-pointer" aria-hidden="true" @click="emit('alternar')" />
      <button
        v-if="podeEditar"
        :id="`btn-adicionar-cadastro-${lista}`"
        type="button"
        class="shrink-0 rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90 max-lg:min-h-11"
        :aria-label="`Adicionar em ${rotulo}`"
        @click="emit('adicionar')"
      >
        + Adicionar
      </button>
      <button
        type="button"
        tabindex="-1"
        aria-hidden="true"
        class="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center text-ink-soft lg:h-9"
        @click="emit('alternar')"
      >
        <svg
          viewBox="0 0 24 24"
          class="h-4 w-4 transition-transform"
          :class="aberta ? 'rotate-180' : ''"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </header>

    <!-- Corpo: sempre no DOM (aria-controls aponta para ele); `hidden` quando fechado. @container: a partir de 700px de
         largura da própria seção aparece a tabela; abaixo, a lista de itens de duas linhas (cabe em 360px). -->
    <div :id="`cadastro-corpo-${lista}`" :hidden="!aberta" class="@container border-t border-hairline">
      <table :id="`cadastro-lista-${lista}`" class="hidden w-full text-left text-[13px] @[700px]:table">
        <thead class="border-b border-hairline bg-paper text-[11px] tracking-wide text-ink-soft uppercase">
          <tr>
            <th class="px-3.5 py-2 font-semibold">Nome</th>
            <th v-for="coluna in colunas" :key="coluna.chave" class="px-3.5 py-2 font-semibold">{{ coluna.titulo }}</th>
            <th class="w-20 px-3.5 py-2 text-right font-semibold">Ativo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="primeiraCarga">
            <td :colspan="totalColunas" class="px-3.5 py-5 text-center text-ink-soft">Carregando…</td>
          </tr>
          <tr v-else-if="semItens">
            <td :colspan="totalColunas" class="px-3.5 py-5 text-center text-ink-soft">{{ textoVazio }}</td>
          </tr>
          <tr
            v-for="item in visiveis"
            :id="`cadastro-row-${lista}-${item.id}`"
            :key="item.id"
            class="border-b border-hairline last:border-b-0"
            :class="podeEditar ? 'cursor-pointer hover:bg-paper' : ''"
            @click="podeEditar && emit('abrir', item)"
          >
            <td class="px-3.5 py-1.5" :class="item.ativo ? '' : 'opacity-60'">
              <button
                v-if="podeEditar"
                :id="`cadastro-abrir-${lista}-${item.id}`"
                type="button"
                class="cursor-pointer rounded-sm text-left font-medium break-words text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark"
              >
                {{ item.nome }}
              </button>
              <span v-else class="font-medium text-ink">{{ item.nome }}</span>
              <span v-if="!item.ativo" class="ml-1 text-[11.5px] font-normal text-ink-soft">{{ ROTULO_INATIVO_CADASTRO }}</span>
            </td>
            <td v-for="coluna in colunas" :key="coluna.chave" class="px-3.5 py-1.5" :class="item.ativo ? '' : 'opacity-60'">
              {{ coluna.texto(item) }}
            </td>
            <td class="px-3.5 py-0.5 text-right">
              <CadastroSwitch
                v-if="podeEditar"
                :id="`cadastro-switch-${lista}-${item.id}`"
                :model-value="valorAtivo(item)"
                :label="rotuloSwitch(item)"
                @alternar="emit('ativo', item, $event)"
              />
              <span v-else class="text-[11.5px] text-ink-soft">{{ item.ativo ? "Ativo" : "Inativo" }}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <ul class="flex flex-col @[700px]:hidden">
        <li v-if="primeiraCarga" class="px-3.5 py-5 text-center text-[13px] text-ink-soft">Carregando…</li>
        <li v-else-if="semItens" class="px-3.5 py-5 text-center text-[13px] text-ink-soft">{{ textoVazio }}</li>
        <li
          v-for="item in visiveis"
          :id="`cadastro-card-${lista}-${item.id}`"
          :key="item.id"
          class="flex items-center justify-between gap-2 border-b border-hairline px-3.5 py-1.5 last:border-b-0"
          :class="podeEditar ? 'cursor-pointer active:bg-paper' : ''"
          @click="podeEditar && emit('abrir', item)"
        >
          <div class="min-w-0 py-1" :class="item.ativo ? '' : 'opacity-60'">
            <button
              v-if="podeEditar"
              :id="`cadastro-abrir-card-${lista}-${item.id}`"
              type="button"
              class="block max-w-full cursor-pointer rounded-sm text-left text-[13.5px] font-medium break-words text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark"
            >
              {{ item.nome }}
            </button>
            <p v-else class="text-[13.5px] font-medium break-words text-ink">{{ item.nome }}</p>
            <p v-if="!item.ativo || linhaSecundaria(lista, item, podeVerPix)" class="text-[12px] break-words text-ink-soft">
              {{ linhaSecundaria(lista, item, podeVerPix) }}
              <span v-if="!item.ativo">{{ ROTULO_INATIVO_CADASTRO }}</span>
            </p>
          </div>
          <CadastroSwitch
            v-if="podeEditar"
            :id="`cadastro-switch-card-${lista}-${item.id}`"
            :model-value="valorAtivo(item)"
            :label="rotuloSwitch(item)"
            @alternar="emit('ativo', item, $event)"
          />
          <span v-else class="shrink-0 text-[11.5px] text-ink-soft">{{ item.ativo ? "Ativo" : "Inativo" }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
