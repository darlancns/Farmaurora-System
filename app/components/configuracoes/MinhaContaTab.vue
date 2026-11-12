<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { MIN_PASSWORD_LENGTH, NOME_MAX_LENGTH } from "#shared/constants/conta";
import { normalizarEmail } from "#shared/utils/contaCampos";
import { useAuth } from "../../composables/useAuth";
import { useMinhaConta } from "../../composables/useMinhaConta";
import { useTitleCaseInput } from "../../composables/useTitleCaseInput";
import { useToast } from "../../composables/useToast";
import { validarEmailDaConta, validarNomeDaConta, validarSenhaDaConta } from "../../utils/minhaContaForm";
import ConfirmDialog from "../ConfirmDialog.vue";
import CampoSenha from "./CampoSenha.vue";

// Aba "Minha conta": cada pessoa edita o PRÓPRIO nome, e-mail e senha (qualquer cargo). As ações e os
// estados de carregando/erro vêm de useMinhaConta; aqui só formulário, validação rápida no cliente (a
// do servidor continua valendo) e limpeza dos campos sensíveis. Nada disso vai pra estado global.
const { user } = useAuth();
const { showToast } = useToast();
const { podeEditarNome, estadoNome, estadoEmail, estadoSenha, alterarNome, alterarEmail, alterarSenha } =
  useMinhaConta();

const emailAtual = computed<string>(() => user.value?.email ?? "");

// ---- Nome -----------------------------------------------------------------
const nome = ref<string>(user.value?.nome ?? "");
const erroNomeLocal = ref<string | null>(null);
const erroNome = computed<string | null>(() => erroNomeLocal.value ?? estadoNome.erro.value);

// Nome é nome próprio — capitaliza como nos outros formulários (mesmo padrão do ContaFormModal).
const onNomeInput = useTitleCaseInput((valor) => {
  nome.value = valor;
});

async function salvarNome(): Promise<void> {
  erroNomeLocal.value = validarNomeDaConta(nome.value, user.value?.nome ?? "");
  if (erroNomeLocal.value) return;
  if (await alterarNome(nome.value.trim())) {
    nome.value = user.value?.nome ?? nome.value.trim();
    showToast("Nome alterado");
  }
}

// ---- E-mail ---------------------------------------------------------------
const emailNovo = ref<string>("");
const emailConfirmacao = ref<string>("");
const senhaDoEmail = ref<string>("");
const erroEmailLocal = ref<string | null>(null);
const erroEmail = computed<string | null>(() => erroEmailLocal.value ?? estadoEmail.erro.value);
const confirmandoEmail = ref<boolean>(false);
const emailParaConfirmar = computed<string>(() => normalizarEmail(emailNovo.value));

// 1º passo: valida e abre o aviso. Só o "Confirmar" do aviso chama o servidor.
function pedirConfirmacaoDoEmail(): void {
  estadoEmail.erro.value = null;
  erroEmailLocal.value = validarEmailDaConta({
    email: emailNovo.value,
    confirmacao: emailConfirmacao.value,
    senhaAtual: senhaDoEmail.value,
    emailAtual: emailAtual.value,
  });
  if (!erroEmailLocal.value) confirmandoEmail.value = true;
}

async function enviarEmail(): Promise<void> {
  const ok = await alterarEmail(emailNovo.value, emailConfirmacao.value, senhaDoEmail.value);
  confirmandoEmail.value = false;
  senhaDoEmail.value = ""; // a senha nunca fica na tela, deu certo ou não
  if (ok) {
    emailNovo.value = "";
    emailConfirmacao.value = "";
    showToast("E-mail alterado");
  }
  // Em erro o e-mail digitado fica (a pessoa corrige) e a mensagem do servidor aparece no bloco.
}

// ---- Senha ----------------------------------------------------------------
const senhaAtual = ref<string>("");
const novaSenha = ref<string>("");
const confirmacaoSenha = ref<string>("");
const erroSenhaLocal = ref<string | null>(null);
const erroSenha = computed<string | null>(() => erroSenhaLocal.value ?? estadoSenha.erro.value);

function limparCamposDeSenha(): void {
  senhaAtual.value = "";
  novaSenha.value = "";
  confirmacaoSenha.value = "";
}

async function salvarSenha(): Promise<void> {
  estadoSenha.erro.value = null;
  erroSenhaLocal.value = validarSenhaDaConta({
    senhaAtual: senhaAtual.value,
    novaSenha: novaSenha.value,
    confirmacao: confirmacaoSenha.value,
  });
  if (erroSenhaLocal.value) return;

  const ok = await alterarSenha(senhaAtual.value, novaSenha.value);
  limparCamposDeSenha(); // sucesso ou erro: nenhuma senha fica nos campos
  if (ok) showToast("Senha alterada");
}

// Sai da aba (ou da página): nada sensível sobra em memória do componente.
onBeforeUnmount(() => {
  limparCamposDeSenha();
  senhaDoEmail.value = "";
  emailNovo.value = "";
  emailConfirmacao.value = "";
});

// Abaixo de lg o `main` já reserva o espaço da BottomNav fixa (main.css); `max-lg:pb-4` no contêiner dá um
// respiro extra entre o último cartão e a barra. Inputs a 16px no mobile: o iOS não dá zoom ao focar.
// Layout (só lg+; abaixo de lg nada mudou): coluna única até 720px entre lg e xl; a partir de xl o conteúdo
// ocupa o contêiner padrão das páginas (mx-auto max-w-pagina em configuracoes.vue), com o Nome em largura
// total e E-mail e Senha lado a lado, cartões da mesma altura e botão no rodapé de cada um.
const CLASSE_INPUT =
  "w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark disabled:opacity-60 max-lg:min-h-11 max-lg:text-[16px]";
const CLASSE_LABEL = "mb-1.5 block text-[10.5px] text-ink-soft";
const CLASSE_CARTAO = "rounded-lg border border-hairline bg-paper-raised p-4 lg:p-5";
const CLASSE_TITULO = "text-[12px] font-semibold tracking-wide text-ink-soft uppercase";
const CLASSE_ERRO = "rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] break-words text-danger";
const CLASSE_BOTAO =
  "rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60 max-lg:min-h-11";
</script>

<template>
  <div id="minha-conta-tab" class="flex flex-col gap-4 max-lg:pb-4 lg:max-w-[720px] xl:grid xl:max-w-none xl:grid-cols-2">
    <!-- Nome -->
    <section id="minha-conta-bloco-nome" :class="[CLASSE_CARTAO, 'xl:col-span-2']">
      <!-- lg+: campo e botão na MESMA linha (grade de 2 colunas; o `div` do campo vira `contents` pra o botão
           esticar até a altura do input). A ordem do DOM (e da tabulação) não muda. -->
      <form class="flex flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-0" @submit.prevent="salvarNome">
        <h2 :class="[CLASSE_TITULO, 'lg:col-span-2']">Nome</h2>
        <div class="lg:contents">
          <label for="minha-conta-nome" :class="[CLASSE_LABEL, 'lg:col-start-1 lg:row-start-2 lg:mt-3.5']">Nome</label>
          <input
            id="minha-conta-nome"
            :value="nome"
            type="text"
            autocomplete="name"
            :maxlength="NOME_MAX_LENGTH"
            :disabled="!podeEditarNome || estadoNome.carregando.value"
            :class="[CLASSE_INPUT, 'lg:col-start-1 lg:row-start-3']"
            @input="onNomeInput"
          />
          <p
            v-if="!podeEditarNome"
            id="minha-conta-nome-bloqueado"
            class="mt-1.5 text-[12px] text-ink-soft lg:col-start-1 lg:row-start-4"
          >
            Peça ao administrador para alterar seu nome.
          </p>
        </div>
        <p
          v-if="erroNome"
          id="minha-conta-erro-nome"
          role="alert"
          :class="[CLASSE_ERRO, 'lg:col-span-2 lg:row-start-5 lg:mt-3.5']"
        >
          {{ erroNome }}
        </p>
        <div v-if="podeEditarNome" class="flex justify-end lg:col-start-2 lg:row-start-3 lg:ml-3 lg:self-stretch">
          <button id="btn-salvar-nome" type="submit" :disabled="estadoNome.carregando.value" :class="CLASSE_BOTAO">
            {{ estadoNome.carregando.value ? "Salvando..." : "Salvar nome" }}
          </button>
        </div>
      </form>
    </section>

    <!-- E-mail -->
    <section id="minha-conta-bloco-email" :class="[CLASSE_CARTAO, 'xl:flex xl:flex-col']">
      <form class="flex flex-col gap-3.5 xl:flex-1" @submit.prevent="pedirConfirmacaoDoEmail">
        <h2 :class="CLASSE_TITULO">E-mail</h2>
        <div>
          <p :class="CLASSE_LABEL">E-mail atual</p>
          <p id="minha-conta-email-atual" class="text-[13.5px] break-all text-ink">{{ emailAtual }}</p>
        </div>
        <div>
          <label for="minha-conta-email-novo" :class="CLASSE_LABEL">Novo e-mail</label>
          <input
            id="minha-conta-email-novo"
            v-model="emailNovo"
            type="email"
            autocomplete="email"
            :disabled="estadoEmail.carregando.value"
            :class="CLASSE_INPUT"
          />
        </div>
        <div>
          <label for="minha-conta-email-confirmacao" :class="CLASSE_LABEL">Confirmar novo e-mail</label>
          <input
            id="minha-conta-email-confirmacao"
            v-model="emailConfirmacao"
            type="email"
            autocomplete="email"
            :disabled="estadoEmail.carregando.value"
            :class="CLASSE_INPUT"
          />
        </div>
        <CampoSenha
          id="minha-conta-email-senha"
          v-model="senhaDoEmail"
          label="Senha atual"
          autocomplete="current-password"
          :disabled="estadoEmail.carregando.value"
        />
        <p v-if="erroEmail" id="minha-conta-erro-email" role="alert" :class="CLASSE_ERRO">{{ erroEmail }}</p>
        <div class="flex justify-end xl:mt-auto">
          <button id="btn-salvar-email" type="submit" :disabled="estadoEmail.carregando.value" :class="CLASSE_BOTAO">
            {{ estadoEmail.carregando.value ? "Salvando..." : "Alterar e-mail" }}
          </button>
        </div>
      </form>
    </section>

    <!-- Senha -->
    <section id="minha-conta-bloco-senha" :class="[CLASSE_CARTAO, 'xl:flex xl:flex-col']">
      <form class="flex flex-col gap-3.5 xl:flex-1" @submit.prevent="salvarSenha">
        <h2 :class="CLASSE_TITULO">Senha</h2>
        <p class="text-[12px] text-ink-soft">
          Trocar a senha é opcional. Use pelo menos {{ MIN_PASSWORD_LENGTH }} caracteres.
        </p>
        <!-- Ajuda o gerenciador de senhas a saber de qual conta é a senha; fora da tela e do foco. -->
        <input
          type="text"
          autocomplete="username"
          :value="emailAtual"
          readonly
          tabindex="-1"
          aria-hidden="true"
          class="sr-only"
        />
        <CampoSenha
          id="minha-conta-senha-atual"
          v-model="senhaAtual"
          label="Senha atual"
          autocomplete="current-password"
          :disabled="estadoSenha.carregando.value"
        />
        <CampoSenha
          id="minha-conta-senha-nova"
          v-model="novaSenha"
          label="Nova senha"
          autocomplete="new-password"
          :disabled="estadoSenha.carregando.value"
        />
        <CampoSenha
          id="minha-conta-senha-confirmacao"
          v-model="confirmacaoSenha"
          label="Confirmar nova senha"
          autocomplete="new-password"
          :disabled="estadoSenha.carregando.value"
        />
        <p v-if="erroSenha" id="minha-conta-erro-senha" role="alert" :class="CLASSE_ERRO">{{ erroSenha }}</p>
        <div class="flex justify-end xl:mt-auto">
          <button id="btn-redefinir-senha" type="submit" :disabled="estadoSenha.carregando.value" :class="CLASSE_BOTAO">
            {{ estadoSenha.carregando.value ? "Salvando..." : "Redefinir senha" }}
          </button>
        </div>
      </form>
    </section>

    <ConfirmDialog
      v-if="confirmandoEmail"
      title="Confirmar novo e-mail"
      :message="`Confirma que o e-mail ${emailParaConfirmar} está correto? Se estiver errado, você pode perder o acesso à conta.`"
      confirm-label="Confirmar"
      cancel-label="Voltar"
      reforcado
      :loading="estadoEmail.carregando.value"
      @confirm="enviarEmail"
      @close="confirmandoEmail = false"
    />
  </div>
</template>
