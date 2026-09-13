<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useEscapeToClose } from "../composables/useEscapeToClose";

// Casco comum aos modais do app (Round 4 — dedup): overlay fixo, fecha ao
// clicar fora ou apertar Esc, e agora também trava o scroll da página por
// trás enquanto está aberto (nenhum dos 9 modais originais tinha isso — é
// melhoria nova desta rodada, não preservação de comportamento).
//
// `id` (e qualquer outro atributo não declarado como prop) cai automaticamente
// na raiz via fallthrough attrs do Vue — cada modal continua passando o seu
// próprio id de overlay (ex.: `<BaseModal id="confirm-dialog-overlay" ...>`).
const emit = defineEmits<{ close: [] }>();

useEscapeToClose(() => emit("close"));

let overflowAnterior = "";
onMounted(() => {
  overflowAnterior = document.body.style.overflow;
  document.body.style.overflow = "hidden";
});
onBeforeUnmount(() => {
  document.body.style.overflow = overflowAnterior;
});
</script>

<template>
  <div class="fixed inset-0 z-[900] flex items-center justify-center bg-ink/40 p-6" @click.self="emit('close')">
    <slot />
  </div>
</template>
