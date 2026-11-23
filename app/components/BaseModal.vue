<script setup lang="ts">
import { ref } from "vue";
import { useEscapeToClose } from "../composables/useEscapeToClose";
import { useLockBodyScroll } from "../composables/useLockBodyScroll";

// Casco comum aos modais do app (Round 4 — dedup): overlay fixo, fecha ao
// clicar fora ou apertar Esc, e agora também trava o scroll da página por
// trás enquanto está aberto (nenhum dos 9 modais originais tinha isso — é
// melhoria nova desta rodada, não preservação de comportamento).
//
// `id` (e qualquer outro atributo não declarado como prop) cai automaticamente
// na raiz via fallthrough attrs do Vue — cada modal continua passando o seu
// próprio id de overlay (ex.: `<BaseModal id="confirm-dialog-overlay" ...>`).
// `zIndex` (opcional): camada própria, para um modal que abre POR CIMA de outro (ex.: a confirmação da data de entrega sobre o
// formulário). Sem ele, z-900 como sempre. O calendário (AppDatePicker) fica em z-970, acima de qualquer modal.
const props = withDefaults(defineProps<{ zIndex?: number }>(), { zIndex: undefined });
const emit = defineEmits<{ close: [] }>();
const raiz = ref<HTMLElement | null>(null);

// Esc fecha SÓ o modal de cima: com dois abertos (um dentro do outro ou um depois do outro), o Esc é do último na ordem do
// documento. Com um modal só, nada muda.
useEscapeToClose(() => {
  const abertos = document.querySelectorAll('[data-overlay="modal"]');
  if (abertos.length > 0 && abertos[abertos.length - 1] !== raiz.value) return;
  emit("close");
});
useLockBodyScroll();
</script>

<template>
  <!-- data-overlay="modal": marca um modal aberto. O painel lateral do Follow-Up (ProcessoPainel) ignora o Esc
       enquanto existir um, para o Esc fechar só o que está por cima (o formulário ou o ConfirmDialog). -->
  <div
    ref="raiz"
    data-overlay="modal"
    class="fixed inset-0 z-[900] flex items-center justify-center bg-ink/40 p-6"
    :style="props.zIndex ? { zIndex: props.zIndex } : undefined"
    @click.self="emit('close')"
  >
    <slot />
  </div>
</template>
