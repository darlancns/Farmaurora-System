<script setup lang="ts">
import { nextTick, reactive, ref } from "vue";
import type { AtualizacaoProcesso, Processo } from "#shared/types/processo";
import { LIMITE_ATUALIZACAO_DATA, LIMITE_ATUALIZACAO_TEXTO } from "#shared/constants/processos";
import { useAtualizacoesProcesso } from "../../composables/useAtualizacoesProcesso";
import { chaveAtualizacao } from "../../utils/atualizacoesLista";
import { capitalizeFirstLetter } from "../../utils/processoFormatters";
import ConfirmDialog from "../ConfirmDialog.vue";

const props = withDefaults(
  defineProps<{
    processo: Processo;
    readonly?: boolean;
  }>(),
  { readonly: false },
);

const { salvando, erro, adicionar, editar, excluir, limparErro } = useAtualizacoesProcesso(() => props.processo.id);

// ── Adicionar ────────────────────────────────────────────────────────────────────────────────────
const novaAtualizacao = reactive({ data: "", texto: "" });

function onNovoTextoInput(event: Event): void {
  novaAtualizacao.texto = capitalizeFirstLetter((event.target as HTMLInputElement).value);
}

async function submitAtualizacao(): Promise<void> {
  const texto = novaAtualizacao.texto.trim();
  if (!texto || salvando.value) return;

  // Só limpa os campos depois de gravar: se falhar, o texto digitado fica e o erro aparece abaixo.
  const ok = await adicionar({ data: novaAtualizacao.data.trim(), texto });
  if (ok) {
    novaAtualizacao.data = "";
    novaAtualizacao.texto = "";
  }
}

// ── Editar (inline no próprio item) ──────────────────────────────────────────────────────────────
interface Edicao {
  indice: number;
  original: AtualizacaoProcesso;
  data: string;
  texto: string;
}
const edicao = ref<Edicao | null>(null);

function idItem(prefixo: string, indice: number): string {
  return `${prefixo}-${props.processo.id}-${indice}`;
}

async function focar(id: string): Promise<void> {
  await nextTick();
  document.getElementById(id)?.focus();
}

function iniciarEdicao(indice: number, atualizacao: AtualizacaoProcesso): void {
  limparErro();
  edicao.value = { indice, original: { ...atualizacao }, data: atualizacao.data, texto: atualizacao.texto };
  void focar(idItem("input-edit-atualizacao-texto", indice));
}

function cancelarEdicao(): void {
  if (!edicao.value || salvando.value) return;
  const { indice } = edicao.value;
  edicao.value = null;
  limparErro();
  void focar(idItem("btn-edit-atualizacao", indice));
}

function onEdicaoTextoInput(event: Event): void {
  if (edicao.value) edicao.value.texto = capitalizeFirstLetter((event.target as HTMLInputElement).value);
}

async function salvarEdicao(): Promise<void> {
  const atual = edicao.value;
  if (!atual || salvando.value) return;
  const texto = atual.texto.trim();
  if (!texto) return;

  // Em falha a edição continua aberta, com o texto digitado, e o erro aparece abaixo.
  const ok = await editar(atual.indice, atual.original, { data: atual.data.trim(), texto });
  if (ok) {
    edicao.value = null;
    void focar(idItem("btn-edit-atualizacao", atual.indice));
  }
}

// ── Excluir (com confirmação) ────────────────────────────────────────────────────────────────────
const exclusao = ref<{ indice: number; original: AtualizacaoProcesso } | null>(null);

const LIMITE_TEXTO_CONFIRMACAO = 400;
function textoDaConfirmacao(texto: string): string {
  return texto.length > LIMITE_TEXTO_CONFIRMACAO ? `${texto.slice(0, LIMITE_TEXTO_CONFIRMACAO)}…` : texto;
}

function pedirExclusao(indice: number, atualizacao: AtualizacaoProcesso): void {
  limparErro();
  exclusao.value = { indice, original: { ...atualizacao } };
}

async function confirmarExclusao(): Promise<void> {
  const alvo = exclusao.value;
  if (!alvo || salvando.value) return;
  const ok = await excluir(alvo.indice, alvo.original);
  exclusao.value = null;
  if (!ok) void focar(idItem("btn-delete-atualizacao", alvo.indice));
}

function fecharExclusao(): void {
  if (!salvando.value) exclusao.value = null;
}

function rotuloItem(atualizacao: AtualizacaoProcesso): string {
  return atualizacao.data ? `de ${atualizacao.data}` : "sem data";
}

const classeCampo =
  "min-h-11 w-full rounded-md border border-hairline bg-paper-raised px-2.5 py-1.5 text-[12.5px] focus:outline-2 focus:outline-accent-dark lg:min-h-auto";
const classeAcao =
  "min-h-11 shrink-0 rounded-md border border-hairline bg-paper-raised px-3 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-auto lg:px-2 lg:py-0.5";
</script>

<template>
  <div class="border-t border-hairline pt-2.5">
    <p class="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Atualizações</p>

    <ol v-if="processo.atualizacoes.length" class="flex flex-col gap-1.5 text-[12.5px]">
      <li
        v-for="(atualizacao, index) in processo.atualizacoes"
        :id="idItem('atualizacao', index)"
        :key="chaveAtualizacao(atualizacao, index)"
        class="border-l-2 border-hairline pl-2.5"
      >
        <form
          v-if="edicao && edicao.indice === index"
          :id="idItem('form-edit-atualizacao', index)"
          class="flex flex-col gap-2 lg:flex-row lg:items-center"
          @submit.prevent="salvarEdicao"
          @keydown.esc.stop.prevent="cancelarEdicao"
        >
          <input
            :id="idItem('input-edit-atualizacao-data', index)"
            v-model="edicao.data"
            data-sem-maiuscula
            type="text"
            :maxlength="LIMITE_ATUALIZACAO_DATA"
            placeholder="Data (ex: 31/08)"
            aria-label="Data da atualização"
            :class="[classeCampo, 'shrink-0 font-mono lg:w-[140px]']"
          />
          <input
            :id="idItem('input-edit-atualizacao-texto', index)"
            :value="edicao.texto"
            type="text"
            :maxlength="LIMITE_ATUALIZACAO_TEXTO"
            placeholder="Texto da atualização"
            aria-label="Texto da atualização"
            :class="classeCampo"
            @input="onEdicaoTextoInput"
          />
          <div class="flex shrink-0 items-center gap-2">
            <button
              :id="idItem('btn-save-atualizacao', index)"
              type="submit"
              :disabled="salvando"
              :aria-busy="salvando"
              class="min-h-11 flex-1 rounded-md bg-accent-dark px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-auto lg:flex-none"
            >
              Salvar
            </button>
            <button
              :id="idItem('btn-cancel-atualizacao', index)"
              type="button"
              :disabled="salvando"
              :class="[classeAcao, 'flex-1 lg:flex-none']"
              @click="cancelarEdicao"
            >
              Cancelar
            </button>
          </div>
        </form>

        <div v-else class="flex flex-col gap-1 lg:flex-row lg:items-start lg:gap-2">
          <div class="flex min-w-0 flex-1 gap-2">
            <span class="shrink-0 font-mono text-ink-soft">{{ atualizacao.data || "—" }}</span>
            <span class="min-w-0 break-words text-ink lg:min-w-[auto] lg:break-normal">{{ atualizacao.texto }}</span>
          </div>
          <div v-if="!readonly" class="flex shrink-0 items-center gap-1.5">
            <button
              :id="idItem('btn-edit-atualizacao', index)"
              type="button"
              :aria-label="`Editar atualização ${rotuloItem(atualizacao)}`"
              :disabled="salvando || edicao !== null"
              :class="classeAcao"
              @click="iniciarEdicao(index, atualizacao)"
            >
              Editar
            </button>
            <button
              :id="idItem('btn-delete-atualizacao', index)"
              type="button"
              :aria-label="`Excluir atualização ${rotuloItem(atualizacao)}`"
              :disabled="salvando || edicao !== null"
              :class="[classeAcao, 'hover:border-danger hover:text-danger']"
              @click="pedirExclusao(index, atualizacao)"
            >
              Excluir
            </button>
          </div>
        </div>
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
        data-sem-maiuscula
        type="text"
        :maxlength="LIMITE_ATUALIZACAO_DATA"
        placeholder="Data (ex: 31/08)"
        aria-label="Data da nova atualização"
        class="min-h-11 w-full shrink-0 rounded-md border border-hairline bg-paper-raised px-2.5 py-1.5 font-mono text-[12.5px] focus:outline-2 focus:outline-accent-dark lg:min-h-auto lg:w-[140px]"
      />
      <input
        :value="novaAtualizacao.texto"
        type="text"
        :maxlength="LIMITE_ATUALIZACAO_TEXTO"
        placeholder="Nova atualização..."
        aria-label="Texto da nova atualização"
        class="min-h-11 w-full rounded-md border border-hairline bg-paper-raised px-2.5 py-1.5 text-[12.5px] focus:outline-2 focus:outline-accent-dark lg:min-h-auto"
        @input="onNovoTextoInput"
      />
      <button
        type="submit"
        :disabled="salvando"
        :aria-busy="salvando"
        class="min-h-11 shrink-0 rounded-md bg-accent-dark px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-auto"
      >
        Adicionar
      </button>
    </form>

    <p
      v-if="erro"
      :id="`atualizacoes-erro-${processo.id}`"
      role="alert"
      class="mt-2 text-[12px] font-medium text-danger"
    >
      {{ erro }}
    </p>

    <!-- Teleport pro <body>: as linhas são `@container` (contenção de layout) e um modal `fixed` dentro
         delas ficaria preso à linha em vez de cobrir a tela. -->
    <Teleport to="body">
      <ConfirmDialog
        v-if="exclusao"
        title="Excluir atualização"
        :message="`Excluir esta atualização? “${textoDaConfirmacao(exclusao.original.texto)}”`"
        confirm-label="Sim, excluir"
        cancel-label="Cancelar"
        danger
        reforcado
        :loading="salvando"
        @confirm="confirmarExclusao"
        @close="fecharExclusao"
      />
    </Teleport>
  </div>
</template>
