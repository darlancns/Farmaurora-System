<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { LISTA_CADASTRO_TEXTOS, LISTAS_CADASTRO } from "#shared/constants/cadastros";
import type {
  Cadastro,
  ConsultorAtualizado,
  ImpactoRenomearConsultor,
  ListaCadastro,
  NovoPorLista,
  PatchPorLista,
  ContaNaoAtualizada,
} from "#shared/types/Cadastro";
import { chaveCadastro } from "#shared/utils/cadastroNome";
import { podeVerPixCadastro } from "#shared/utils/cadastroPix";
import { useAuth } from "../../composables/useAuth";
import { useCadastros } from "../../composables/useCadastros";
import { useToast } from "../../composables/useToast";
import { filtrarPorNome } from "../../utils/cadastroColunas";
import { mensagemConfirmarRenomear, mensagemContasNaoAtualizadas } from "../../utils/cadastroConsultor";
import { getErrorMessage } from "../../utils/errorMessages";
import ConfirmDialog from "../ConfirmDialog.vue";
import CadastroDesfazer from "./CadastroDesfazer.vue";
import CadastroPainel from "./CadastroPainel.vue";
import CadastroSecao from "./CadastroSecao.vue";

// Aba "Cadastros" de /configuracoes (só administrador — ver app/utils/abasConfiguracoes.ts). Sete SEÇÕES recolhíveis
// (Fornecedores, Despachantes, Transportadoras, Cias aéreas, Consultores, Temperaturas, Medicamentos), todas FECHADAS ao abrir a aba; aberta, cada uma vira uma
// tabela compacta. Busca por nome no topo (todas as listas). Clicar numa linha abre o PAINEL LATERAL de edição; "+ Adicionar"
// abre o mesmo painel vazio. A chave "Ativo" da linha aplica na hora ("Desativado. Desfazer" / "Reativado."), sem
// confirmação. Remover = DESATIVAR (nunca apagar); o nome não muda depois de criado. Quem escreve é só o administrador
// (canWrite("config"), a mesma regra do servidor); a autorização real está na API.
//
// Chave PIX (dado financeiro): o painel só mostra o campo, e a tabela só a coluna "Cadastrada/—", para quem a API entrega
// (administrador ou quem lê Pagamentos: podeVerPixCadastro, a mesma função do servidor). A chave nunca vai para toast.

const { user, canWrite } = useAuth();
const { showToast } = useToast();
const { itens, loading, error, fetchCadastros, criar, alterar, impactoDoConsultor, renomearContasDoConsultor } = useCadastros();

const podeEditar = computed<boolean>(() => canWrite("config"));
const podeVerPix = computed<boolean>(() => podeVerPixCadastro(user.value));

onMounted(() => {
  void fetchCadastros();
});

onBeforeUnmount(() => {
  limparTemporizadorDesfazer();
});

// ── Busca e seções abertas ────────────────────────────────────────────────────────────────────────────
const busca = ref("");
const termo = computed(() => chaveCadastro(busca.value));
const buscaAtiva = computed(() => termo.value !== "");

// Abertura escolhida à mão (sem busca). Todas FECHADAS por padrão.
const abertas = reactive(new Set<ListaCadastro>());
// Com busca, as seções com resultado abrem sozinhas; quem as fechar à mão fica aqui (até a busca mudar).
const fechadasNaBusca = reactive(new Set<ListaCadastro>());

const visiveis = computed(() => {
  const mapa = {} as Record<ListaCadastro, Cadastro[]>;
  for (const lista of LISTAS_CADASTRO) mapa[lista] = filtrarPorNome(itens.value[lista], busca.value);
  return mapa;
});

function secaoAberta(lista: ListaCadastro): boolean {
  if (buscaAtiva.value) return visiveis.value[lista].length > 0 && !fechadasNaBusca.has(lista);
  return abertas.has(lista);
}

function alternarSecao(lista: ListaCadastro): void {
  if (buscaAtiva.value) {
    if (visiveis.value[lista].length === 0) return; // sem resultado, não há o que abrir
    if (fechadasNaBusca.has(lista)) fechadasNaBusca.delete(lista);
    else fechadasNaBusca.add(lista);
    return;
  }
  if (abertas.has(lista)) abertas.delete(lista);
  else abertas.add(lista);
}

function digitarBusca(): void {
  fechadasNaBusca.clear();
}

function limparBusca(): void {
  busca.value = "";
  fechadasNaBusca.clear();
  void nextTick(() => document.getElementById("cadastros-busca")?.focus());
}

const resumoBusca = computed(() => {
  if (!buscaAtiva.value) return "";
  const comResultado = LISTAS_CADASTRO.filter((l) => visiveis.value[l].length > 0);
  const total = comResultado.reduce((soma, l) => soma + visiveis.value[l].length, 0);
  if (total === 0) return "Nenhum item encontrado.";
  const listas = comResultado.length === 1 ? "1 lista" : `${comResultado.length} listas`;
  return `${total} ${total === 1 ? "encontrado" : "encontrados"} em ${listas}.`;
});

// ── Painel lateral criar/editar (um só, para qualquer seção) ─────────────────────────────────────────
const painelLista = ref<ListaCadastro | null>(null);
const itemEditando = ref<Cadastro | null>(null);
const busy = ref(false);
// Quem abriu o painel, para devolver o foco ao fechar (a linha do item, ou o "+ Adicionar" da seção).
let origemFoco: { lista: ListaCadastro; id: string | null } | null = null;

function abrirNovo(lista: ListaCadastro): void {
  itemEditando.value = null;
  origemFoco = { lista, id: null };
  painelLista.value = lista;
}

function abrirItem(lista: ListaCadastro, item: Cadastro): void {
  itemEditando.value = item;
  origemFoco = { lista, id: item.id };
  painelLista.value = lista;
}

// Devolve o foco à linha (o botão do nome, o visível entre a tabela e a lista do celular) ou ao "+ Adicionar".
function devolverFoco(): void {
  const alvo = origemFoco;
  origemFoco = null;
  if (!alvo) return;
  const candidatos =
    alvo.id === null
      ? [`btn-adicionar-cadastro-${alvo.lista}`]
      : [`cadastro-abrir-${alvo.lista}-${alvo.id}`, `cadastro-abrir-card-${alvo.lista}-${alvo.id}`];
  const existentes = candidatos.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
  const visivel = existentes.find((el) => el.getClientRects().length > 0) ?? existentes[0];
  visivel?.focus();
}

function fecharPainel(): void {
  painelLista.value = null;
  itemEditando.value = null;
  busy.value = false;
  // Depois de o painel sair do DOM (o foco preso dele já foi embora).
  void nextTick(() => setTimeout(devolverFoco, 0));
}

async function executar(acao: () => Promise<void>, sucesso: string, falha: string): Promise<boolean> {
  busy.value = true;
  try {
    await acao();
    showToast(sucesso);
    return true;
  } catch (e) {
    showToast(getErrorMessage(e, falha));
    return false;
  } finally {
    busy.value = false;
  }
}

async function handleCriar(payload: NovoPorLista[ListaCadastro]): Promise<void> {
  const lista = painelLista.value;
  if (!lista) return;
  const ok = await executar(
    async () => {
      await criar(lista, payload);
    },
    LISTA_CADASTRO_TEXTOS[lista].criado,
    "Erro ao criar o item.",
  );
  if (ok) {
    // O item novo aparece: abre a seção (e, se havia busca, ela deixa de esconder a seção).
    abertas.add(lista);
    fechadasNaBusca.delete(lista);
    fecharPainel();
  }
}

async function handleAtualizar(id: string, patch: PatchPorLista[ListaCadastro]): Promise<void> {
  const lista = painelLista.value;
  if (!lista) return;
  // Renomear um consultor vale para todo o sistema: confirma ANTES, com as contagens (só leitura).
  if (lista === "consultores" && "nome" in patch && itemEditando.value) {
    await pedirConfirmacaoRenomear(itemEditando.value, patch);
    return;
  }
  const ok = await executar(
    async () => {
      await alterar(lista, id, patch);
    },
    "Alterações salvas.",
    "Erro ao salvar as alterações.",
  );
  if (ok) fecharPainel();
}

// ── Renomear consultor: confirmação com contagens e contas de login que não foram atualizadas ───────────────────────
interface ConfirmacaoRenomear {
  item: Cadastro;
  patch: PatchPorLista["consultores"];
  mensagem: string;
}
const confirmacaoRenomear = ref<ConfirmacaoRenomear | null>(null);

async function pedirConfirmacaoRenomear(item: Cadastro, patch: PatchPorLista[ListaCadastro]): Promise<void> {
  const nomeNovo = (patch as { nome?: string }).nome ?? "";
  busy.value = true;
  try {
    const impacto: ImpactoRenomearConsultor = await impactoDoConsultor(item.id);
    confirmacaoRenomear.value = { item, patch: patch as PatchPorLista["consultores"], mensagem: mensagemConfirmarRenomear(item.nome, nomeNovo, impacto) };
  } catch (e) {
    showToast(getErrorMessage(e, "Não foi possível conferir o que o renomear vai atualizar."));
  } finally {
    busy.value = false;
  }
}

// Contas de login que ficaram com o nome antigo (a tela lista quais e deixa tentar de novo).
interface FalhaContas {
  itemId: string;
  nomeAntigo: string;
  mensagem: string;
  falhas: ContaNaoAtualizada[];
}
const falhaContas = ref<FalhaContas | null>(null);
const tentandoContas = ref(false);

async function confirmarRenomear(): Promise<void> {
  const confirmacao = confirmacaoRenomear.value;
  if (!confirmacao || busy.value) return;
  let resultado: ConsultorAtualizado | null = null;
  busy.value = true;
  try {
    resultado = (await alterar("consultores", confirmacao.item.id, confirmacao.patch)) as ConsultorAtualizado;
    showToast("Consultor renomeado.");
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao renomear o consultor."));
  } finally {
    busy.value = false;
    confirmacaoRenomear.value = null;
  }
  if (!resultado) return;
  const contas = resultado.renomeacao?.contas;
  if (contas && contas.falhas.length > 0) {
    falhaContas.value = {
      itemId: resultado.id,
      nomeAntigo: resultado.renomeacao!.nomeAntigo,
      mensagem: mensagemContasNaoAtualizadas(contas),
      falhas: contas.falhas,
    };
  }
  abertas.add("consultores");
  fecharPainel();
}

async function tentarContasDeNovo(): Promise<void> {
  const falha = falhaContas.value;
  if (!falha || tentandoContas.value) return;
  tentandoContas.value = true;
  try {
    const contas = await renomearContasDoConsultor(falha.itemId, falha.nomeAntigo);
    if (contas.falhas.length === 0) {
      falhaContas.value = null;
      showToast("Contas de login atualizadas.");
    } else {
      falhaContas.value = { ...falha, mensagem: mensagemContasNaoAtualizadas(contas), falhas: contas.falhas };
    }
  } catch (e) {
    showToast(getErrorMessage(e, "Não foi possível atualizar as contas de login."));
  } finally {
    tentandoContas.value = false;
  }
}

// Reativar a partir do aviso de nome repetido no painel.
async function reativarDoPainel(item: Cadastro): Promise<void> {
  const lista = painelLista.value;
  if (!lista) return;
  const ok = await executar(
    async () => {
      await alterar(lista, item.id, { ativo: true });
    },
    `"${item.nome}" reativado.`,
    "Erro ao reativar o item.",
  );
  if (ok) {
    abertas.add(lista);
    fecharPainel();
  }
}

// ── Chave Ativo da linha: aplica na hora, sem janela de confirmação ──────────────────────────────────
// `pendentes`: o valor pedido e ainda não confirmado, para a chave responder ao clique na hora; se a gravação falhar,
// a entrada some e a chave volta ao valor real do item.
const pendentes = reactive<Record<string, boolean>>({});

interface AvisoDesfazer {
  lista: ListaCadastro;
  id: string;
  nome: string;
}
const desfazer = ref<AvisoDesfazer | null>(null);
let temporizadorDesfazer: ReturnType<typeof setTimeout> | null = null;
const DESFAZER_MS = 7000;

function limparTemporizadorDesfazer(): void {
  if (temporizadorDesfazer !== null) clearTimeout(temporizadorDesfazer);
  temporizadorDesfazer = null;
}

function mostrarDesfazer(aviso: AvisoDesfazer): void {
  limparTemporizadorDesfazer();
  desfazer.value = aviso;
  temporizadorDesfazer = setTimeout(() => {
    desfazer.value = null;
    temporizadorDesfazer = null;
  }, DESFAZER_MS);
}

function esconderDesfazer(): void {
  limparTemporizadorDesfazer();
  desfazer.value = null;
}

async function alternarAtivo(lista: ListaCadastro, item: Cadastro, valor: boolean): Promise<void> {
  if (!podeEditar.value) return;
  const chave = `${lista}:${item.id}`;
  if (chave in pendentes) return; // já tem um pedido em andamento neste item
  pendentes[chave] = valor;
  try {
    await alterar(lista, item.id, { ativo: valor });
    if (valor) {
      if (desfazer.value?.lista === lista && desfazer.value.id === item.id) esconderDesfazer();
      showToast("Reativado.");
    } else {
      mostrarDesfazer({ lista, id: item.id, nome: item.nome });
    }
  } catch (e) {
    showToast(getErrorMessage(e, valor ? "Erro ao reativar o item." : "Erro ao desativar o item."));
  } finally {
    delete pendentes[chave];
  }
}

async function desfazerDesativacao(): Promise<void> {
  const aviso = desfazer.value;
  if (!aviso) return;
  esconderDesfazer();
  try {
    await alterar(aviso.lista, aviso.id, { ativo: true });
    showToast("Reativado.");
  } catch (e) {
    showToast(getErrorMessage(e, "Erro ao reativar o item."));
  }
}
</script>

<template>
  <div id="cadastros-tab" class="flex flex-col gap-3">
    <p v-if="error" id="cadastros-erro" class="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
      {{ error }}
    </p>

    <!-- Renomear consultor: contas de login que ficaram com o nome antigo (lista quais; "Tentar de novo" é idempotente) -->
    <div
      v-if="falhaContas"
      id="cadastros-contas-falha"
      role="alert"
      class="flex flex-col gap-2 rounded-md border border-warning-gold/40 bg-warning-gold/5 px-3 py-2 text-[12.5px] text-ink"
    >
      <p id="cadastros-contas-falha-texto">{{ falhaContas.mensagem }}</p>
      <ul class="list-disc pl-5">
        <li v-for="conta in falhaContas.falhas" :key="conta.id">{{ conta.email || conta.id }}</li>
      </ul>
      <div class="flex gap-2">
        <button
          id="btn-cadastros-contas-tentar-de-novo"
          type="button"
          :disabled="tentandoContas"
          class="rounded-md bg-accent-dark px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60 max-lg:min-h-11"
          @click="tentarContasDeNovo"
        >
          Tentar de novo
        </button>
        <button
          id="btn-cadastros-contas-falha-fechar"
          type="button"
          class="rounded-md border border-hairline bg-paper px-3 py-2 text-[12.5px] font-semibold text-ink-soft max-lg:min-h-11"
          @click="falhaContas = null"
        >
          Fechar
        </button>
      </div>
    </div>

    <!-- Busca por nome em todas as listas: abre as seções com resultado e destaca a contagem encontrada -->
    <div class="flex flex-col gap-1">
      <label for="cadastros-busca" class="sr-only">Buscar por nome em todas as listas</label>
      <div class="relative">
        <input
          id="cadastros-busca"
          v-model="busca"
          type="search"
          autocomplete="off"
          spellcheck="false"
          data-sem-maiuscula
          placeholder="Buscar por nome em todas as listas"
          class="w-full rounded-lg border border-hairline bg-paper-raised py-2 pr-11 pl-3 text-[13.5px] focus:outline-2 focus:outline-accent-dark max-lg:min-h-11 max-lg:text-[16px]"
          @input="digitarBusca"
        />
        <button
          v-if="busca !== ''"
          id="btn-cadastros-busca-limpar"
          type="button"
          aria-label="Limpar busca"
          class="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-ink-soft hover:text-ink"
          @click="limparBusca"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <p id="cadastros-busca-resumo" role="status" aria-live="polite" class="min-h-4 px-1 text-[12px] text-ink-soft">
        {{ resumoBusca }}
      </p>
    </div>

    <!-- Uma seção recolhível por lista; todas fechadas ao abrir a aba -->
    <CadastroSecao
      v-for="lista in LISTAS_CADASTRO"
      :key="lista"
      :lista="lista"
      :itens="itens[lista]"
      :visiveis="visiveis[lista]"
      :aberta="secaoAberta(lista)"
      :busca-ativa="buscaAtiva"
      :carregando="loading"
      :pode-editar="podeEditar"
      :pode-ver-pix="podeVerPix"
      :pendentes="pendentes"
      @alternar="alternarSecao(lista)"
      @adicionar="abrirNovo(lista)"
      @abrir="abrirItem(lista, $event)"
      @ativo="(item, valor) => alternarAtivo(lista, item, valor)"
    />

    <CadastroPainel
      v-if="painelLista"
      :lista="painelLista"
      :editando="itemEditando"
      :existentes="itens[painelLista]"
      :busy="busy"
      :pode-ver-pix="podeVerPix"
      :temperaturas="itens.temperaturas"
      @criar="handleCriar"
      @atualizar="handleAtualizar"
      @reativar="reativarDoPainel"
      @close="fecharPainel"
      @aviso="showToast"
    />

    <ConfirmDialog
      v-if="confirmacaoRenomear"
      title="Renomear consultor"
      :message="confirmacaoRenomear.mensagem"
      confirm-label="Renomear"
      reforcado
      :loading="busy"
      @confirm="confirmarRenomear"
      @close="confirmacaoRenomear = null"
    />

    <CadastroDesfazer v-if="desfazer" mensagem="Desativado." :nome-item="desfazer.nome" @desfazer="desfazerDesativacao" />
  </div>
</template>
