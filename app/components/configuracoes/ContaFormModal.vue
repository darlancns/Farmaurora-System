<script setup lang="ts">
import { computed, reactive } from "vue";
import type { AdminUserSummary } from "#shared/types/auth";
import type { Role } from "#shared/utils/rbac";
import type { ConsultorNome } from "#shared/types/Patient";
import { ROLE_OPTIONS } from "#shared/constants/roles";
import { CONSULTORES } from "#shared/constants/consultores";
import AppSelect from "../AppSelect.vue";
import BaseModal from "../BaseModal.vue";
import type { AppSelectOption } from "../../types/appSelect";
import { generatePassword } from "../../utils/generatePassword";
import type { NovaContaDTO } from "../../composables/useContas";

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
  update: [id: string, payload: { role: Role; consultorNome?: ConsultorNome }];
  close: [];
  invalid: [message: string];
}>();

const isEdit = computed(() => props.editingConta !== null);

const form = reactive({
  email: props.editingConta?.email ?? "",
  password: "",
  role: (props.editingConta?.role ?? "consultor") as Role,
  consultorNome: (props.editingConta?.consultorNome ?? "") as ConsultorNome | "",
});

const consultorOptions: AppSelectOption<ConsultorNome | "">[] = CONSULTORES.map((nome) => ({
  value: nome,
  label: nome,
}));

const showConsultor = computed(() => form.role === "consultor");

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

function handleSubmit(): void {
  const email = form.email.trim();

  if (!isEdit.value) {
    if (!email || !email.includes("@")) {
      emit("invalid", "Informe um e-mail válido.");
      return;
    }
    if (form.password.length < 8) {
      emit("invalid", "A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
  }

  if (form.role === "consultor" && !form.consultorNome) {
    emit("invalid", "Selecione o nome do consultor.");
    return;
  }

  const consultorNome =
    form.role === "consultor" ? (form.consultorNome as ConsultorNome) : undefined;

  if (isEdit.value && props.editingConta) {
    emit("update", props.editingConta.id, { role: form.role, consultorNome });
  } else {
    emit("create", { email, password: form.password, role: form.role, consultorNome });
  }
}

</script>

<template>
  <BaseModal id="conta-form-overlay" @close="emit('close')">
    <div class="w-full max-w-[440px] rounded-[10px] border border-hairline bg-paper-raised p-5">
      <h2 class="mb-4 font-display text-[16px] font-semibold text-ink">
        {{ isEdit ? "Editar conta" : "Nova conta" }}
      </h2>

      <form id="conta-form" class="flex flex-col gap-3.5" @submit.prevent="handleSubmit">
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
            class="mt-1 text-[10.5px] font-medium text-mainz-gold"
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
