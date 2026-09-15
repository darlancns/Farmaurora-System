<script setup lang="ts">
import { computed, reactive } from "vue";
import type { NewRecadoDTO, Recado, RecadoUpdateDTO } from "#shared/types/recado";
import type { Role } from "#shared/utils/rbac";
import { ROLE_OPTIONS } from "#shared/constants/roles";
import AppSelect from "../AppSelect.vue";
import BaseModal from "../BaseModal.vue";
import type { AppSelectOption } from "../../types/appSelect";
import { DESTINATARIO_TIPO_OPTIONS, TIPO_RECADO_OPTIONS } from "../../utils/recadoOptions";
import { useContasSelecao } from "../../composables/useContasSelecao";

const props = withDefaults(
  defineProps<{
    editingRecado?: Recado | null;
    busy?: boolean;
  }>(),
  { editingRecado: null, busy: false },
);

const emit = defineEmits<{
  create: [payload: NewRecadoDTO];
  update: [id: string, payload: RecadoUpdateDTO];
  close: [];
  invalid: [message: string];
}>();

const isEdit = computed(() => props.editingRecado !== null);

const form = reactive({
  titulo: props.editingRecado?.titulo ?? "",
  mensagem: props.editingRecado?.mensagem ?? "",
  tipo: props.editingRecado?.tipo ?? "geral",
  destinatarioTipo: props.editingRecado?.destinatarioTipo ?? "publico",
  destinatarioCargo: (props.editingRecado?.destinatarioCargo ?? "") as Role | "",
  destinatarioPessoaId: props.editingRecado?.destinatarioPessoaId ?? "",
});

// Já buscado pela página (recados.vue) ao montar — só lê o estado
// compartilhado, não busca de novo (ver useContasSelecao.ts, Fase B).
const { contas } = useContasSelecao();

// GET /api/contas não expõe e-mail (só id/nome/cargo — decisão da Fase A,
// pra não vazar e-mail de todo mundo pra qualquer cargo), então o fallback
// não pode ser "nome ?? email" como em outros seletores do CRM — contas
// antigas sem nome preenchido aparecem como "(sem nome)".
const pessoaOptions = computed<AppSelectOption<string>[]>(() =>
  contas.value.map((conta) => ({ value: conta.id, label: conta.nome ?? "(sem nome)" })),
);

const showCargo = computed(() => form.destinatarioTipo === "cargo");
const showPessoa = computed(() => form.destinatarioTipo === "pessoa");

function handleSubmit(): void {
  const titulo = form.titulo.trim();
  const mensagem = form.mensagem.trim();

  if (!titulo) {
    emit("invalid", "Informe o título do recado.");
    return;
  }
  if (!mensagem) {
    emit("invalid", "Informe a mensagem do recado.");
    return;
  }
  if (showCargo.value && !form.destinatarioCargo) {
    emit("invalid", "Selecione o cargo destinatário.");
    return;
  }
  if (showPessoa.value && !form.destinatarioPessoaId) {
    emit("invalid", "Selecione a pessoa destinatária.");
    return;
  }

  const payload: NewRecadoDTO = {
    titulo,
    mensagem,
    tipo: form.tipo,
    destinatarioTipo: form.destinatarioTipo,
    destinatarioCargo: showCargo.value ? (form.destinatarioCargo as Role) : undefined,
    destinatarioPessoaId: showPessoa.value ? form.destinatarioPessoaId : undefined,
  };

  if (isEdit.value && props.editingRecado) {
    emit("update", props.editingRecado.id, payload);
  } else {
    emit("create", payload);
  }
}
</script>

<template>
  <BaseModal id="recado-form-overlay" @close="emit('close')">
    <div class="w-full max-w-[440px] rounded-[10px] border border-hairline bg-paper-raised p-5">
      <h2 class="mb-4 font-display text-[16px] font-semibold text-ink">
        {{ isEdit ? "Editar recado" : "Novo recado" }}
      </h2>

      <form id="recado-form" class="flex flex-col gap-3.5" @submit.prevent="handleSubmit">
        <div>
          <label for="recado-titulo" class="mb-1.5 block text-[10.5px] text-ink-soft">Título</label>
          <input
            id="recado-titulo"
            v-model="form.titulo"
            type="text"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
        </div>

        <div>
          <label for="recado-mensagem" class="mb-1.5 block text-[10.5px] text-ink-soft">Mensagem</label>
          <textarea
            id="recado-mensagem"
            v-model="form.mensagem"
            rows="3"
            class="w-full resize-y rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
        </div>

        <div>
          <label for="recado-tipo" class="mb-1.5 block text-[10.5px] text-ink-soft">Tipo</label>
          <AppSelect id="recado-tipo" v-model="form.tipo" :options="TIPO_RECADO_OPTIONS" />
        </div>

        <div>
          <label for="recado-destinatario-tipo" class="mb-1.5 block text-[10.5px] text-ink-soft">Destinatário</label>
          <AppSelect id="recado-destinatario-tipo" v-model="form.destinatarioTipo" :options="DESTINATARIO_TIPO_OPTIONS" />
        </div>

        <div v-if="showCargo">
          <label for="recado-destinatario-cargo" class="mb-1.5 block text-[10.5px] text-ink-soft">Cargo</label>
          <AppSelect
            id="recado-destinatario-cargo"
            v-model="form.destinatarioCargo"
            :options="ROLE_OPTIONS"
            placeholder="Selecione o cargo"
          />
        </div>

        <div v-if="showPessoa">
          <label for="recado-destinatario-pessoa" class="mb-1.5 block text-[10.5px] text-ink-soft">Pessoa</label>
          <AppSelect
            id="recado-destinatario-pessoa"
            v-model="form.destinatarioPessoaId"
            :options="pessoaOptions"
            placeholder="Selecione a pessoa"
          />
        </div>

        <div class="mt-2 flex justify-end gap-2">
          <button
            id="btn-recado-cancelar"
            type="button"
            class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            id="btn-recado-salvar"
            type="submit"
            :disabled="busy"
            class="rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {{ isEdit ? "Salvar" : "Criar recado" }}
          </button>
        </div>
      </form>
    </div>
  </BaseModal>
</template>
