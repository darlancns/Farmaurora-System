<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { AdminUserSummary, UpdateUserRoleDTO } from "#shared/types/auth";
import type { Role } from "#shared/utils/rbac";
import type { ConsultorProcesso } from "#shared/types/processo";
import type { NivelPermissao, SecaoComPermissao } from "#shared/utils/permissoesPagina";
import { ROLE_OPTIONS } from "#shared/constants/roles";
import { CONSULTORES_PROCESSO } from "#shared/constants/processos";
import AppSelect from "../AppSelect.vue";
import BaseModal from "../BaseModal.vue";
import type { AppSelectOption } from "../../types/appSelect";
import { generatePassword } from "../../utils/generatePassword";
import { useTitleCaseInput } from "../../composables/useTitleCaseInput";
import type { NovaContaDTO } from "../../composables/useContas";
import {
  padraoDoCargo,
  permissoesParaEnvio,
  usaMapaDePermissoes,
  valoresDoMapa,
  valoresTudoNenhum,
  type ValoresPermissoes,
} from "../../utils/contaPermissoesForm";
import PermissoesContaTabela from "./PermissoesContaTabela.vue";

const props = withDefaults(
  defineProps<{
    editingConta?: AdminUserSummary | null;
    // nome do consultor -> e-mail da conta que já o usa (só para aviso visual)
    consultoresEmUso?: Record<string, string>;
    // controlado pelo pai enquanto a chamada de rede está em andamento
    busy?: boolean;
  }>(),
  { editingConta: null, consultoresEmUso: () => ({}), busy: false },
);

const emit = defineEmits<{
  create: [payload: NovaContaDTO];
  update: [id: string, payload: UpdateUserRoleDTO];
  close: [];
  invalid: [message: string];
}>();

const isEdit = computed(() => props.editingConta !== null);

const form = reactive({
  email: props.editingConta?.email ?? "",
  password: "",
  nome: props.editingConta?.nome ?? "",
  role: (props.editingConta?.role ?? "consultor") as Role,
  consultorNome: (props.editingConta?.consultorNome ?? "") as ConsultorProcesso | "",
});

const consultorOptions: AppSelectOption<ConsultorProcesso | "">[] = CONSULTORES_PROCESSO.map((nome) => ({
  value: nome,
  label: nome,
}));

const showConsultor = computed(() => form.role === "consultor");

// ── Permissões por página (só sócio e operacional) ──────────────────────────────────────────────────
// Conta NOVA: a tabela abre com tudo "Nenhum" e o POST leva sempre o mapa completo.
// Conta EXISTENTE: com mapa gravado, mostra o mapa; sem mapa, mostra o padrão do cargo ("Padrão do cargo") e a tabela
// só conta como mexida se a pessoa mudar uma linha — sem mexer, o PATCH nem leva o campo (o servidor preserva, então
// abrir "Editar" numa conta sem mapa e salvar não grava mapa nela). Cargo que não usa mapa nunca envia o campo.
const mostraPermissoes = computed(() => usaMapaDePermissoes(form.role));
const contaTemMapa = props.editingConta?.permissoes != null;
const valores = reactive<ValoresPermissoes>(valoresIniciais());
const tocada = ref(false);
// Edição de conta com mapa: "Restaurar padrão do cargo" foi clicado (o PATCH leva permissoes: null).
const restaurar = ref(false);

function valoresIniciais(): ValoresPermissoes {
  const conta = props.editingConta;
  if (!conta) return valoresTudoNenhum();
  if (conta.permissoes) return valoresDoMapa(conta.permissoes);
  return usaMapaDePermissoes(conta.role) ? padraoDoCargo(conta.role) : valoresTudoNenhum();
}

function aplicarValores(novos: ValoresPermissoes): void {
  Object.assign(valores, novos);
}

// Rótulo "Padrão do cargo": edição, nada mexido, e a tabela mostra o padrão (conta sem mapa ou já restaurada).
const mostraPadrao = computed(() => isEdit.value && !tocada.value && (!contaTemMapa || restaurar.value));
const podeRestaurar = computed(() => isEdit.value && (contaTemMapa || tocada.value));

function aoAlterarPermissao(secao: SecaoComPermissao, nivel: NivelPermissao): void {
  valores[secao] = nivel;
  tocada.value = true;
  restaurar.value = false;
}

function aoRestaurarPadrao(): void {
  aplicarValores(padraoDoCargo(form.role));
  tocada.value = false;
  restaurar.value = contaTemMapa;
}

// Trocar o cargo: sócio <-> operacional mantém o que está na tabela (se ela ainda mostra o padrão do cargo, mostra o
// do cargo novo); vindo de consultor/administrador na edição, a tabela abre "não mexida" — com o mapa que a conta já
// tem, ou com o padrão do cargo novo. Para consultor/administrador a tabela some e o campo não é enviado.
watch(
  () => form.role,
  (novo, antigo) => {
    if (!usaMapaDePermissoes(novo) || !isEdit.value) return;
    const veioDeCargoSemMapa = !usaMapaDePermissoes(antigo);
    if (veioDeCargoSemMapa) {
      aplicarValores(contaTemMapa ? valoresDoMapa(props.editingConta?.permissoes) : padraoDoCargo(novo));
      tocada.value = false;
      restaurar.value = false;
    } else if (!contaTemMapa && !tocada.value) {
      aplicarValores(padraoDoCargo(novo));
    }
  },
);

// Aviso (não bloqueia): nomes já vinculados a outra conta.
const nomesEmUso = computed<string[]>(() =>
  Object.entries(props.consultoresEmUso)
    .filter(([, email]) => email !== props.editingConta?.email)
    .map(([nome, email]) => `${nome} (${email})`),
);
const nomeSelecionadoEmUso = computed<string | null>(() => {
  if (!form.consultorNome) return null;
  const email = props.consultoresEmUso[form.consultorNome];
  return email && email !== props.editingConta?.email ? email : null;
});

function preencherSenhaAleatoria(): void {
  form.password = generatePassword();
}

// Nome é nome próprio — capitaliza como nos outros formulários (Paciente).
const onNomeInput = useTitleCaseInput((value) => {
  form.nome = value;
});

function handleSubmit(): void {
  const email = form.email.trim();
  const nome = form.nome.trim();

  if (!isEdit.value) {
    if (!email || !email.includes("@")) {
      emit("invalid", "Informe um e-mail válido.");
      return;
    }
    if (form.password.length < 8) {
      emit("invalid", "A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (!nome) {
      emit("invalid", "Informe o nome da conta.");
      return;
    }
  }

  if (form.role === "consultor" && !form.consultorNome) {
    emit("invalid", "Selecione o nome do consultor.");
    return;
  }

  const consultorNome =
    form.role === "consultor" ? (form.consultorNome as ConsultorProcesso) : undefined;

  const envio = permissoesParaEnvio({
    modo: isEdit.value ? "edicao" : "criacao",
    role: form.role,
    valores,
    tocada: tocada.value,
    restaurar: restaurar.value,
  });

  if (isEdit.value && props.editingConta) {
    emit("update", props.editingConta.id, {
      role: form.role,
      consultorNome,
      nome,
      ...(envio.incluir ? { permissoes: envio.valor } : {}),
    });
  } else {
    emit("create", {
      email,
      password: form.password,
      role: form.role,
      consultorNome,
      nome,
      ...(envio.incluir && envio.valor ? { permissoes: envio.valor } : {}),
    });
  }
}

</script>

<template>
  <BaseModal id="conta-form-overlay" @close="emit('close')">
    <!-- max-h + overflow-y: com a tabela de permissões o formulário pode passar da altura da tela (celular). -->
    <div
      id="conta-form-modal"
      class="max-h-[calc(100dvh-3rem)] w-full max-w-[440px] overflow-y-auto rounded-[10px] border border-hairline bg-paper-raised p-5"
    >
      <h2 class="mb-4 font-display text-[16px] font-semibold text-ink">
        {{ isEdit ? "Editar conta" : "Nova conta" }}
      </h2>

      <form id="conta-form" class="flex flex-col gap-3.5" @submit.prevent="handleSubmit">
        <div>
          <label for="conta-nome" class="mb-1.5 block text-[10.5px] text-ink-soft">Nome</label>
          <input
            id="conta-nome"
            :value="form.nome"
            type="text"
            autocomplete="off"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            @input="onNomeInput"
          />
        </div>

        <div v-if="!isEdit">
          <label for="conta-email" class="mb-1.5 block text-[10.5px] text-ink-soft">E-mail</label>
          <input
            id="conta-email"
            v-model="form.email"
            type="email"
            autocomplete="off"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
        </div>

        <div v-if="!isEdit">
          <label for="conta-senha" class="mb-1.5 block text-[10.5px] text-ink-soft">Senha</label>
          <div class="flex gap-2">
            <input
              id="conta-senha"
              data-sem-maiuscula
              v-model="form.password"
              type="text"
              autocomplete="off"
              class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 font-mono text-[13px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
            />
            <button
              id="btn-gerar-senha"
              type="button"
              class="shrink-0 rounded-md border border-hairline px-2.5 py-2 text-[12px] font-semibold text-accent-dark transition-colors hover:bg-paper"
              @click="preencherSenhaAleatoria"
            >
              Gerar
            </button>
          </div>
          <p class="mt-1 text-[10.5px] text-ink-soft">
            Anote a senha agora — ela é definida direto no Supabase e não é recuperável depois.
          </p>
        </div>

        <div>
          <label for="conta-role" class="mb-1.5 block text-[10.5px] text-ink-soft">Cargo</label>
          <AppSelect id="conta-role" v-model="form.role" :options="ROLE_OPTIONS" />
        </div>

        <PermissoesContaTabela
          v-if="mostraPermissoes"
          :valores="valores"
          :padrao-do-cargo="mostraPadrao"
          :pode-restaurar="podeRestaurar"
          @alterar="aoAlterarPermissao"
          @restaurar="aoRestaurarPadrao"
        />

        <div v-if="showConsultor">
          <label for="conta-consultor" class="mb-1.5 block text-[10.5px] text-ink-soft">
            Nome do consultor
          </label>
          <AppSelect
            id="conta-consultor"
            v-model="form.consultorNome"
            :options="consultorOptions"
            placeholder="Selecione o consultor"
          />
          <p
            v-if="nomeSelecionadoEmUso"
            id="aviso-consultor-em-uso"
            class="mt-1 text-[10.5px] font-medium text-warning-gold"
          >
            ⚠ Este nome já está vinculado a {{ nomeSelecionadoEmUso }}. Pode salvar mesmo assim.
          </p>
          <p v-else-if="nomesEmUso.length" class="mt-1 text-[10.5px] text-ink-soft">
            Já em uso: {{ nomesEmUso.join(", ") }}
          </p>
        </div>

        <div class="mt-2 flex justify-end gap-2">
          <button
            id="btn-conta-cancelar"
            type="button"
            class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            id="btn-conta-salvar"
            type="submit"
            :disabled="busy"
            class="rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {{ isEdit ? "Salvar" : "Criar conta" }}
          </button>
        </div>
      </form>
    </div>
  </BaseModal>
</template>
