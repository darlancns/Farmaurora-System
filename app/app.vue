<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "#app";

const route = useRoute();

// A tela de login e a de redefinição de senha usam um layout sem
// sidebar/nav; todo o resto usa o layout padrão. O `name` do NuxtLayout
// precisa ser dinâmico aqui porque o app.vue é quem embrulha todas as páginas.
const BLANK_LAYOUT_ROUTES = ["/login", "/redefinir-senha"];
const layoutName = computed(() =>
  BLANK_LAYOUT_ROUTES.includes(route.path) ? "blank-layout" : "default-layout",
);
</script>

<template>
  <NuxtLayout :name="layoutName">
    <NuxtPage />
  </NuxtLayout>
</template>
