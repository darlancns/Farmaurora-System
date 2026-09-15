<script setup lang="ts">
import { computed, reactive } from "vue";
import type { LembretePessoal, LembreteUpdateDTO, NewLembreteDTO } from "#shared/types/lembretePessoal";
import AppSelect from "../AppSelect.vue";
import BaseModal from "../BaseModal.vue";
import { TIPO_RECADO_OPTIONS } from "../../utils/recadoOptions";

const props = withDefaults(
  defineProps<{
    editingLembrete?: LembretePessoal | null;
    busy?: boolean;
  }>(),
  { editingLembrete: null, busy: false },
);

const emit = defineEmits<{
  create: [payload: NewLembreteDTO];
  update: [id: string, payload: LembreteUpdateDTO];
  close: [];
  invalid: [message: string];
}>();

const isEdit = computed(() => props.editingLembrete !== null);

const form = reactive({
  titulo: props.editingLembrete?.titulo ?? "",
  mensagem: props.editingLembrete?.mensagem ?? "",
  tipo: props.editingLembrete?.tipo ?? "geral",
});

function handleSubmit(): void {
  const titulo = form.titulo.trim();
  const mensagem = form.mensagem.trim();

  if (!titulo) {
    emit("invalid", "Informe o título do lembrete.");
    return;
  }
  if (!mensagem) {
    emit("invalid", "Informe a mensagem do lembrete.");
    return;
  }

  const payload: NewLembreteDTO = { titulo, mensagem, tipo: form.tipo };

  if (isEdit.value && props.editingLembrete) {
    emit("update", props.editingLembrete.id, payload);
  } else {
    emit("create", payload);
  }
}
</script>

<template>
  <BaseModal id="lembrete-form-overlay" @close="emit('close')">
    <div class="w-full max-w-[440px] rounded-[10px] border border-hairline bg-paper-raised p-5">
      <h2 class="mb-4 font-display text-[16px] font-semibold text-ink">
        {{ isEdit ? "Editar lembrete" : "Novo lembrete" }}
      </h2>

      <form id="lembrete-form" class="flex flex-col gap-3.5" @submit.prevent="handleSubmit">
        <div>
          <label for="lembrete-titulo" class="mb-1.5 block text-[10.5px] text-ink-soft">Título</label>
          <input
            id="lembrete-titulo"
            v-model="form.titulo"
            type="text"
            class="w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
        </div>

        <div>
          <label for="lembrete-mensagem" class="mb-1.5 block text-[10.5px] text-ink-soft">Mensagem</label>
          <textarea
            id="lembrete-mensagem"
            v-model="form.mensagem"
            rows="3"
            class="w-full resize-y rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark"
          />
        </div>

        <div>
          <label for="lembrete-tipo" class="mb-1.5 block text-[10.5px] text-ink-soft">Tipo</label>
          <AppSelect id="lembrete-tipo" v-model="form.tipo" :options="TIPO_RECADO_OPTIONS" />
        </div>

        <div class="mt-2 flex justify-end gap-2">
          <button
            id="btn-lembrete-cancelar"
            type="button"
            class="rounded-md border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            id="btn-lembrete-salvar"
            type="submit"
            :disabled="busy"
            class="rounded-md bg-accent-dark px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {{ isEdit ? "Salvar" : "Criar lembrete" }}
          </button>
        </div>
      </form>
    </div>
  </BaseModal>
</template>
