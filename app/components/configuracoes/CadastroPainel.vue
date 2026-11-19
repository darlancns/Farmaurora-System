<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import {
  CHAVE_PIX_CADASTRO_MAX,
  CONTATO_CADASTRO_MAX,
  LISTA_CADASTRO_TEXTOS,
  NOME_CADASTRO_MAX,
  NOME_RESERVADO_CADASTRO,
  PAIS_CADASTRO_MAX,
  PRAZO_ALERTA_MAX_DIAS,
  PRAZO_ALERTA_MIN_DIAS,
  ROTULO_INATIVO_CADASTRO,
  TELEFONE_CADASTRO_MAX,
} from "#shared/constants/cadastros";
import type { Cadastro, ListaCadastro, NovoPorLista, PatchPorLista } from "#shared/types/Cadastro";
import { nomeReservadoCadastro } from "#shared/utils/cadastroNome";
import { listaTemPix } from "#shared/utils/cadastroPix";
import { useEscapeToClose } from "../../composables/useEscapeToClose";
import { useLockBodyScroll } from "../../composables/useLockBodyScroll";
import { BOTAO_ICONE_CLASS } from "../../utils/botaoIcone";
import {
  formDeItem,
  formVazio,
  itemComMesmoNome,
  listaTemEdicao,
  montarAlteracao,
  montarNovo,
  type FormCadastro,
} from "../../utils/cadastroForm";
import { ICONES_PROCESSO } from "../../utils/processoIcones";
import { focaveis } from "../../utils/processoPainel";

// PAINEL LATERAL de criar/editar um item de Cadastro (substitui o modal): à direita, 600px em lg+, tela cheia abaixo de lg,
// sobre um overlay bg-ink/40 — o mesmo desenho do painel dos processos (ProcessoPainel.vue; z-index 880, abaixo do
// BaseModal e do toast). IDs fixos (sem useId) por causa da hidratação.
//
//  - Novo ("+ Adicionar"): o mesmo painel, vazio. Se o nome já existe (ativo ou inativo) o botão de criar fica
//    desabilitado; quando o existente é INATIVO oferece "Reativar" (em vez de criar outro).
//  - Editar: o NOME aparece desabilitado, com a dica de que não muda (para corrigir: criar um novo e desativar este).
//  - Fornecedor: o prazo do alerta precisa ser DECIDIDO — "Número de dias" (1 a 365) OU "Sem alerta".
//  - Chave PIX (despachantes e transportadoras): dado financeiro, só para quem recebe o campo (`podeVerPix`). O input
//    vem oculto (type=password), com "Mostrar/Ocultar" e "Copiar". A chave nunca vai para log nem para mensagem.
//  - Cia aérea só tem o nome: editar mostra o nome e uma nota (desativar é pela chave Ativo da lista).
//  - Teclado: Esc fecha; Tab fica preso no painel; o foco entra no 1º campo editável. Devolver o foco à linha ao fechar
//    é do pai (CadastrosTab.vue).

const props = withDefaults(
  defineProps<{
    lista: ListaCadastro;
    /** null = novo item. */
    editando?: Cadastro | null;
    /** Itens já carregados desta lista (ativos e inativos), para avisar de nome repetido. */
    existentes: Cadastro[];
    busy?: boolean;
    /** Recebe a chave PIX (administrador ou quem lê Pagamentos): mostra o campo. */
    podeVerPix?: boolean;
  }>(),
  { editando: null, busy: false, podeVerPix: false },
);

const emit = defineEmits<{
  criar: [payload: NovoPorLista[ListaCadastro]];
  atualizar: [id: string, patch: PatchPorLista[ListaCadastro]];
  reativar: [item: Cadastro];
  close: [];
  /** Mensagem para o toast (validação, "Chave PIX copiada.", falha ao copiar). */
  aviso: [message: string];
}>();

const isEdit = computed(() => props.editando !== null);
const textos = computed(() => LISTA_CADASTRO_TEXTOS[props.lista]);
const mostrarPix = computed(() => listaTemPix(props.lista) && props.podeVerPix);
// Editar sem nada para editar (cia aérea; transportadora para quem não vê a chave): só leitura.
const somenteLeitura = computed(() => isEdit.value && !listaTemEdicao(props.lista, props.podeVerPix));

const form = reactive<FormCadastro>(props.editando ? formDeItem(props.lista, props.editando) : formVazio());
const pixVisivel = ref(false);

// Nome já usado por outro item (só na criação).
const duplicado = computed<Cadastro | null>(() => (isEdit.value ? null : itemComMesmoNome(props.existentes, form.nome)));
const nomeReservado = computed<boolean>(() => !isEdit.value && form.nome.trim() !== "" && nomeReservadoCadastro(form.nome));
const bloqueado = computed<boolean>(() => props.busy || duplicado.value !== null || nomeReservado.value);

function handleSubmit(): void {
  if (bloqueado.value || somenteLeitura.value) return;

  if (isEdit.value && props.editando) {
    const patch = montarAlteracao(props.lista, form, props.editando, props.podeVerPix);
    if (!patch.ok) {
      emit("aviso", patch.erro);
      return;
    }
    emit("atualizar", props.editando.id, patch.valor);
    return;
  }

  const novo = montarNovo(props.lista, form, props.podeVerPix);
  if (!novo.ok) {
    emit("aviso", novo.erro);
    return;
  }
  emit("criar", novo.valor);
}

async function copiarPix(): Promise<void> {
  const valor = form.chavePix.trim();
  if (valor === "") return;
  try {
    if (!navigator.clipboard) throw new Error("sem área de transferência");
    await navigator.clipboard.writeText(valor);
    emit("aviso", "Chave PIX copiada.");
  } catch {
    // Nunca se registra nem se mostra o valor: só o aviso.
    emit("aviso", "Não foi possível copiar. Selecione a chave e copie manualmente.");
  }
}

// ── Fechar (X, Esc, overlay) e foco ──────────────────────────────────────────────────────────────────
useEscapeToClose((event) => {
  if (event.defaultPrevented) return;
  emit("close");
});
useLockBodyScroll();

const painelRef = ref<HTMLElement | null>(null);

onMounted(() => {
  // Foco no 1º campo editável (nome ao criar); sem nenhum, no botão de fechar.
  void nextTick(() => {
    const primeiro = painelRef.value?.querySelector<HTMLElement>("#cadastro-painel-corpo input:not([disabled]), #cadastro-painel-corpo select:not([disabled])");
    (primeiro ?? document.getElementById("btn-painel-cadastro-fechar"))?.focus();
  });
});

// Foco preso: Tab no último focável volta ao primeiro, Shift+Tab no primeiro vai ao último.
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Tab" || !painelRef.value) return;
  const lista = focaveis(painelRef.value);
  const primeiro = lista[0];
  const ultimo = lista[lista.length - 1];
  if (!primeiro || !ultimo) {
    event.preventDefault();
    return;
  }
  const ativo = document.activeElement;
  if (event.shiftKey && (ativo === primeiro || !painelRef.value.contains(ativo))) {
    event.preventDefault();
    ultimo.focus();
  } else if (!event.shiftKey && (ativo === ultimo || !painelRef.value.contains(ativo))) {
    event.preventDefault();
    primeiro.focus();
  }
}

const CLASSE_CAMPO =
  "w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark disabled:cursor-not-allowed disabled:text-ink-soft max-lg:min-h-11 max-lg:text-[16px]";
const CLASSE_ROTULO = "mb-1.5 block text-[10.5px] text-ink-soft";
const CLASSE_OPCAO =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-hairline bg-paper px-3 text-[13.5px] text-ink lg:min-h-[38px]";
const CLASSE_BOTAO_PIX =
  "shrink-0 rounded-md border border-hairline bg-paper px-3 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11 lg:py-2";
</script>

<template>
  <div id="cadastro-painel-overlay" class="fixed inset-0 z-[880] flex justify-end bg-ink/40" @click.self="emit('close')">
    <aside
      id="cadastro-painel"
      ref="painelRef"
      data-testid="cadastro-painel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cadastro-painel-titulo"
      class="flex h-dvh w-full max-w-[100vw] flex-col bg-paper-raised lg:w-[600px] lg:rounded-l-xl lg:border-l lg:border-hairline"
      @keydown="onKeydown"
    >
      <header class="flex items-start justify-between gap-3 border-b border-hairline px-4 py-4 sm:px-6">
        <h2 id="cadastro-painel-titulo" class="min-w-0 font-display text-[20px] leading-[1.2] font-semibold break-words text-ink">
          {{ isEdit ? textos.tituloEditar : textos.tituloNovo }}
        </h2>
        <button
          id="btn-painel-cadastro-fechar"
          type="button"
          title="Fechar"
          aria-label="Fechar painel"
          :class="BOTAO_ICONE_CLASS"
          class="hover:border-danger hover:text-danger"
          @click="emit('close')"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path v-for="(d, i) in ICONES_PROCESSO.fechar" :key="i" :d="d" />
          </svg>
        </button>
      </header>

      <form id="cadastro-form" class="flex min-h-0 flex-1 flex-col" novalidate @submit.prevent="handleSubmit">
        <div id="cadastro-painel-corpo" class="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          <!-- Nome: digitável ao criar; DESABILITADO ao editar, com a dica de que não muda -->
          <div>
            <label for="cadastro-form-nome" :class="CLASSE_ROTULO">Nome</label>
            <input
              id="cadastro-form-nome"
              v-model="form.nome"
              type="text"
              autocomplete="off"
              :maxlength="NOME_CADASTRO_MAX"
              :disabled="isEdit"
              :aria-describedby="isEdit ? 'cadastro-form-nome-dica' : undefined"
              :class="CLASSE_CAMPO"
            />
            <p v-if="isEdit" id="cadastro-form-nome-dica" class="mt-1 text-[10.5px] text-ink-soft">
              O nome não pode ser alterado. Para corrigir, crie um novo e desative este.
              <span v-if="editando && !editando.ativo">{{ ROTULO_INATIVO_CADASTRO }}</span>
            </p>
            <p v-else-if="nomeReservado" id="cadastro-form-aviso-reservado" class="mt-1 text-[11.5px] font-medium text-danger">
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

          <!-- Chave PIX (despachantes e transportadoras): dado financeiro, só para quem recebe o campo -->
          <div v-if="mostrarPix" id="cadastro-form-pix-bloco">
            <label for="cadastro-form-pix" :class="CLASSE_ROTULO">Chave PIX (opcional)</label>
            <div class="flex items-stretch gap-2">
              <input
                id="cadastro-form-pix"
                v-model="form.chavePix"
                :type="pixVisivel ? 'text' : 'password'"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                data-sem-maiuscula
                data-1p-ignore
                data-lpignore="true"
                :maxlength="CHAVE_PIX_CADASTRO_MAX"
                aria-describedby="cadastro-form-pix-dica"
                :class="CLASSE_CAMPO"
                class="min-w-0 flex-1"
              />
              <button
                id="btn-cadastro-pix-mostrar"
                type="button"
                :aria-pressed="pixVisivel"
                aria-controls="cadastro-form-pix"
                :class="CLASSE_BOTAO_PIX"
                @click="pixVisivel = !pixVisivel"
              >
                {{ pixVisivel ? "Ocultar" : "Mostrar" }}
              </button>
              <button
                id="btn-cadastro-pix-copiar"
                type="button"
                :disabled="form.chavePix.trim() === ''"
                :class="CLASSE_BOTAO_PIX"
                @click="copiarPix"
              >
                Copiar
              </button>
            </div>
            <p id="cadastro-form-pix-dica" class="mt-1 text-[10.5px] text-ink-soft">
              Dado financeiro: só o administrador grava; quem acessa Pagamentos também a vê. Deixe vazio para limpar.
            </p>
          </div>

          <p v-if="lista === 'cias-aereas' && isEdit" id="cadastro-form-so-nome" class="text-[12.5px] text-ink-soft">
            Cia aérea só tem o nome. Para desativar ou reativar, use a chave Ativo na lista.
          </p>
          <p v-else-if="lista === 'consultores' && isEdit" id="cadastro-form-so-nome" class="text-[12.5px] text-ink-soft">
            Consultor só tem o nome. Para desativar ou reativar, use a chave Ativo na lista.
          </p>
          <p v-else-if="lista === 'transportadoras' && isEdit && !mostrarPix" id="cadastro-form-so-nome" class="text-[12.5px] text-ink-soft">
            Transportadora só tem o nome e a chave PIX. Para desativar ou reativar, use a chave Ativo na lista.
          </p>
        </div>

        <footer class="flex justify-end gap-2 border-t border-hairline px-4 py-3 sm:px-6">
          <button
            id="btn-cadastro-cancelar"
            type="button"
            class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink max-lg:min-h-11"
            @click="emit('close')"
          >
            {{ somenteLeitura ? "Fechar" : "Cancelar" }}
          </button>
          <button
            v-if="!somenteLeitura"
            id="btn-cadastro-salvar"
            type="submit"
            :disabled="bloqueado"
            class="rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60 max-lg:min-h-11"
          >
            {{ isEdit ? "Salvar" : "Criar" }}
          </button>
        </footer>
      </form>
    </aside>
  </div>
</template>
