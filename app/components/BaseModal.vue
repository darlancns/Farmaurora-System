<script setup lang="ts">
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
const emit = defineEmits<{ close: [] }>();

useEscapeToClose(() => emit("close"));
useLockBodyScroll();
</script>

<template>
  <div class="fixed inset-0 z-[900] flex items-center justify-center bg-ink/40 p-6" @click.self="emit('close')">
    <slot />
  </div>
</template>
