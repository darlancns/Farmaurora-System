<script setup lang="ts">
import GlobalHeader from "../components/GlobalHeader.vue";

// PLACEHOLDER da página Compras (a tela de verdade é a Etapa 6): só o título e um aviso, sem formulário e sem chamada de API.
// O acesso é decidido pela seção "compras" (shared/utils/rbac.ts): o guarda global (app/middleware/authz.global.ts) manda para a
// página inicial quem não pode ler, e o servidor protege /api/compras/** do mesmo jeito.
</script>

<template>
  <div id="compras-page" class="mx-auto max-w-pagina">
    <GlobalHeader title="Compras" />
    <p
      id="compras-em-construcao"
      class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft"
    >
      Em construção
    </p>
  </div>
</template>
