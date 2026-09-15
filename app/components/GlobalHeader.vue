<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ROLE_LABEL } from "#shared/constants/roles";
import { useAuth } from "../composables/useAuth";
import AvatarIniciais from "./AvatarIniciais.vue";
import NotificacaoBell from "./NotificacaoBell.vue";

defineProps<{
  title: string;
  subtitle?: string;
}>();

const { user } = useAuth();

// Mesmo padrão de SidebarNav.vue/configuracoes.vue: o usuário só existe no
// client (via /api/auth/me, resolvido pelo middleware global antes da página
// montar), então o bloco de identidade só aparece depois da hidratação — o
// HTML do SSR (sem identidade) bate com o primeiro render do client.
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const showIdentity = computed(() => mounted.value && user.value !== null);

// Sem `nome` (conta antiga, criada antes do campo existir) → parte antes do
// @ do e-mail, sem capitalizar.
const nomeExibido = computed<string>(() => {
  if (!user.value) return "";
  return user.value.nome ?? user.value.email.split("@")[0] ?? "";
});

const roleLabel = computed<string>(() => (user.value ? ROLE_LABEL[user.value.role] : ""));
</script>

<template>
  <div class="mb-4 flex items-center justify-between gap-4 border-b border-hairline pb-3.5">
    <div>
      <h1 class="font-display text-[28px] font-semibold tracking-tight text-ink">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-[13px] text-ink-soft">{{ subtitle }}</p>
    </div>

    <div class="flex shrink-0 items-center gap-4">
      <div class="flex shrink-0 items-center gap-2.5">
        <NotificacaoBell />
        <slot name="actions" />
      </div>

      <div
        v-if="showIdentity"
        id="header-identity"
        class="flex shrink-0 items-center gap-2.5 border-l border-hairline pl-4"
      >
        <AvatarIniciais :nome="nomeExibido" />
        <div class="leading-tight">
          <p class="text-sm font-semibold text-ink">{{ nomeExibido }}</p>
          <p class="text-[12px] text-ink-soft">{{ roleLabel }}</p>
        </div>
      </div>
    </div>
  </div>

  <slot name="filters" />
  <slot name="tabs" />
</template>
