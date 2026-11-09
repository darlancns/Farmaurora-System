<script setup lang="ts">
import { computed, reactive } from "vue";
import {
  CONTATO_CADASTRO_MAX,
  LISTA_CADASTRO_ITEM,
  NOME_CADASTRO_MAX,
  NOME_RESERVADO_CADASTRO,
  PAIS_CADASTRO_MAX,
  PRAZO_ALERTA_MAX_DIAS,
  PRAZO_ALERTA_MIN_DIAS,
  ROTULO_INATIVO_CADASTRO,
  TELEFONE_CADASTRO_MAX,
} from "#shared/constants/cadastros";
import type { Cadastro, ListaCadastro, NovoPorLista, PatchPorLista } from "#shared/types/Cadastro";
import { nomeReservadoCadastro, rotuloCadastro } from "#shared/utils/cadastroNome";
import {
  formDeItem,
  formVazio,
  itemComMesmoNome,
  montarAlteracao,
  montarNovo,
  type FormCadastro,
} from "../../utils/cadastroForm";
import BaseModal from "../BaseModal.vue";

// Modal de criar/editar um item de Cadastro. IDs fixos (sem useId) por causa da hidratação.
//  - Criar: o nome é digitado; se já existe (ativo ou inativo) o botão de criar fica desabilitado, e quando o existente
//    é INATIVO a tela oferece "Reativar" (em vez de criar outro).
//  - Editar: o NOME aparece só como leitura (não muda depois de criado: para corrigir, cria-se um novo e desativa-se o
//    antigo). Os demais campos são editáveis.
//  - Fornecedor: o prazo do alerta precisa ser DECIDIDO — "Número de dias" (1 a 365) OU "Sem alerta" — sem nada
//    pré-selecionado ao criar.

const props = withDefaults(
  defineProps<{
    lista: ListaCadastro;
    /** null = novo item. */
    editando?: Cadastro | null;
    /** Itens já carregados desta lista (ativos e inativos), para avisar de nome repetido. */
    existentes: Cadastro[];
    busy?: boolean;
  }>(),
  { editando: null, busy: false },
);

const emit = defineEmits<{
  criar: [payload: NovoPorLista[ListaCadastro]];
  atualizar: [id: string, patch: PatchPorLista[ListaCadastro]];
  reativar: [item: Cadastro];
  close: [];
  invalid: [message: string];
}>();

const isEdit = computed(() => props.editando !== null);
const nomeDoItem = computed(() => LISTA_CADASTRO_ITEM[props.lista]);

const form = reactive<FormCadastro>(props.editando ? formDeItem(props.lista, props.editando) : formVazio());

// Nome já usado por outro item (só na criação).
const duplicado = computed<Cadastro | null>(() => (isEdit.value ? null : itemComMesmoNome(props.existentes, form.nome)));
const nomeReservado = computed<boolean>(() => !isEdit.value && form.nome.trim() !== "" && nomeReservadoCadastro(form.nome));
const bloqueado = computed<boolean>(() => props.busy || duplicado.value !== null || nomeReservado.value);

function handleSubmit(): void {
  if (bloqueado.value) return;

  if (isEdit.value && props.editando) {
    const patch = montarAlteracao(props.lista, form);
    if (!patch.ok) {
      emit("invalid", patch.erro);
      return;
    }
    emit("atualizar", props.editando.id, patch.valor);
    return;
  }

  const novo = montarNovo(props.lista, form);
  if (!novo.ok) {
    emit("invalid", novo.erro);
    return;
  }
  emit("criar", novo.valor);
}

const CLASSE_CAMPO =
  "w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark max-lg:min-h-11 max-lg:text-[16px]";
const CLASSE_ROTULO = "mb-1.5 block text-[10.5px] text-ink-soft";
const CLASSE_OPCAO =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-hairline bg-paper px-3 text-[13.5px] text-ink lg:min-h-[38px]";
</script>

<template>
  <BaseModal id="cadastro-form-overlay" @close="emit('close')">
    <div
      class="max-h-[calc(100dvh-3rem)] w-full max-w-[440px] overflow-y-auto rounded-[10px] border border-hairline bg-paper-raised p-5"
    >
      <h2 id="cadastro-form-titulo" class="mb-4 font-display text-[16px] font-semibold text-ink">
        {{ isEdit ? `Editar ${nomeDoItem}` : `Novo ${nomeDoItem}` }}
      </h2>

      <form id="cadastro-form" class="flex flex-col gap-3.5" novalidate @submit.prevent="handleSubmit">
        <!-- Nome: digitável ao criar; SÓ leitura ao editar -->
        <div v-if="isEdit">
          <span class="mb-1.5 block text-[10.5px] text-ink-soft">Nome</span>
          <p id="cadastro-form-nome-leitura" class="rounded-md bg-paper px-2.5 py-2 text-[13.5px] font-medium break-words text-ink">
            {{ editando ? rotuloCadastro(editando) : "" }}
          </p>
          <p class="mt-1 text-[10.5px] text-ink-soft">
            O nome não pode ser alterado. Para corrigir, crie um novo e desative este.
          </p>
        </div>
        <div v-else>
          <label for="cadastro-form-nome" :class="CLASSE_ROTULO">Nome</label>
          <input
            id="cadastro-form-nome"
            v-model="form.nome"
            type="text"
            autocomplete="off"
            :maxlength="NOME_CADASTRO_MAX"
            :class="CLASSE_CAMPO"
          />
          <p v-if="nomeReservado" id="cadastro-form-aviso-reservado" class="mt-1 text-[11.5px] font-medium text-danger">
            "{{ NOME_RESERVADO_CADASTRO }}" é um nome reservado (é a opção de digitar um valor fora da lista).
          </p>
          <div v-else-if="duplicado" id="cadastro-form-aviso-duplicado" class="mt-1.5 flex flex-col gap-1.5 text-[11.5px]">
            <p v-if="duplicado.ativo" class="font-medium text-danger">Já existe "{{ duplicado.nome }}" nesta lista.</p>
            <template v-else>
              <p class="font-medium text-warning-gold">
                Já existe "{{ duplicado.nome }}" {{ ROTULO_INATIVO_CADASTRO }}. Reative-o em vez de criar outro.
              </p>
              <button
                id="btn-cadastro-reativar-duplicado"
                type="button"
                :disabled="busy"
                class="self-start rounded-md border border-accent-dark px-3 py-2 text-[12.5px] font-semibold text-accent-dark transition-colors hover:bg-accent-dark hover:text-white disabled:opacity-60 max-lg:min-h-11"
                @click="emit('reativar', duplicado)"
              >
                Reativar
              </button>
            </template>
          </div>
        </div>

        <!-- Fornecedor: país (opcional) e alerta de prazo (decidido de propósito) -->
        <template v-if="lista === 'fornecedores'">
          <div>
            <label for="cadastro-form-pais" :class="CLASSE_ROTULO">País (opcional)</label>
            <input
              id="cadastro-form-pais"
              v-model="form.pais"
              type="text"
              autocomplete="off"
              :maxlength="PAIS_CADASTRO_MAX"
              :class="CLASSE_CAMPO"
            />
          </div>

          <fieldset id="cadastro-form-alerta" class="flex flex-col gap-2">
            <legend :class="CLASSE_ROTULO">Alerta de prazo</legend>
            <label for="cadastro-form-alerta-dias" :class="CLASSE_OPCAO">
              <input id="cadastro-form-alerta-dias" v-model="form.alertaOpcao" type="radio" name="cadastro-alerta" value="dias" />
              Número de dias
            </label>
            <div v-if="form.alertaOpcao === 'dias'" class="pl-1">
              <label for="cadastro-form-prazo" :class="CLASSE_ROTULO">
                Dias corridos após a compra ({{ PRAZO_ALERTA_MIN_DIAS }} a {{ PRAZO_ALERTA_MAX_DIAS }})
              </label>
              <input
                id="cadastro-form-prazo"
                v-model="form.prazoTexto"
                type="number"
                inputmode="numeric"
                :min="PRAZO_ALERTA_MIN_DIAS"
                :max="PRAZO_ALERTA_MAX_DIAS"
                step="1"
                autocomplete="off"
                :class="CLASSE_CAMPO"
              />
            </div>
            <label for="cadastro-form-alerta-sem" :class="CLASSE_OPCAO">
              <input id="cadastro-form-alerta-sem" v-model="form.alertaOpcao" type="radio" name="cadastro-alerta" value="sem" />
              Sem alerta
            </label>
            <p v-if="form.alertaOpcao === ''" id="cadastro-form-alerta-dica" class="text-[10.5px] text-ink-soft">
              Escolha uma das opções: o prazo não tem valor padrão.
            </p>
          </fieldset>
        </template>

        <!-- Despachante (empresa): contato, telefone e e-mail opcionais -->
        <template v-else-if="lista === 'despachantes'">
          <div>
            <label for="cadastro-form-contato" :class="CLASSE_ROTULO">Nome do contato (opcional)</label>
            <input
              id="cadastro-form-contato"
              v-model="form.contatoNome"
              type="text"
              autocomplete="off"
              :maxlength="CONTATO_CADASTRO_MAX"
              :class="CLASSE_CAMPO"
            />
          </div>
          <div>
            <label for="cadastro-form-telefone" :class="CLASSE_ROTULO">Telefone (opcional)</label>
            <input
              id="cadastro-form-telefone"
              v-model="form.telefone"
              type="tel"
              inputmode="tel"
              autocomplete="off"
              :maxlength="TELEFONE_CADASTRO_MAX"
              :class="CLASSE_CAMPO"
            />
          </div>
          <div>
            <label for="cadastro-form-email" :class="CLASSE_ROTULO">E-mail (opcional)</label>
            <input
              id="cadastro-form-email"
              v-model="form.email"
              type="email"
              inputmode="email"
              autocomplete="off"
              :class="CLASSE_CAMPO"
            />
          </div>
        </template>

        <div class="mt-2 flex justify-end gap-2">
          <button
            id="btn-cadastro-cancelar"
            type="button"
            class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink max-lg:min-h-11"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            id="btn-cadastro-salvar"
            type="submit"
            :disabled="bloqueado"
            class="rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60 max-lg:min-h-11"
          >
            {{ isEdit ? "Salvar" : "Criar" }}
          </button>
        </div>
      </form>
    </div>
  </BaseModal>
</template>
