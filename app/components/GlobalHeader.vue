<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ROLE_LABEL } from "#shared/constants/roles";
import { useAuth } from "../composables/useAuth";
import AccountMenu from "./AccountMenu.vue";
import AvatarIniciais from "./AvatarIniciais.vue";
import NotificacaoBell from "./NotificacaoBell.vue";

defineProps<{
  title: string;
  subtitle?: string;
  // Título mais curto só abaixo de lg (o `title` completo continua em lg+ e como nome acessível).
  // Sem ele o <h1> é exatamente o de sempre.
  shortTitle?: string;
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
  <!--
    Abaixo de lg: grid de 2 colunas — título à esquerda e sino + avatar à
    direita na MESMA linha, subtítulo na largura toda embaixo (o wrapper
    título/subtítulo vira `contents` pra seus filhos entrarem direto no
    grid). Em lg+ volta ao flex original (as classes de grid são ignoradas
    por um container flex).
  -->
  <div
    class="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-hairline pb-3.5 lg:flex lg:justify-between lg:gap-4"
  >
    <div class="contents lg:block">
      <h1
        :aria-label="shortTitle ? title : undefined"
        class="col-start-1 row-start-1 font-display text-[28px] font-semibold tracking-tight whitespace-nowrap text-ink lg:whitespace-normal"
      >
        <template v-if="shortTitle">
          <span class="lg:hidden">{{ shortTitle }}</span>
          <span class="hidden lg:inline">{{ title }}</span>
        </template>
        <template v-else>{{ title }}</template>
      </h1>
      <p v-if="subtitle" class="col-span-2 row-start-2 text-[13px] text-ink-soft lg:mt-1">{{ subtitle }}</p>
    </div>

    <div class="col-start-2 row-start-1 flex shrink-0 items-center gap-2.5 lg:gap-4">
      <div class="flex shrink-0 items-center gap-2.5">
        <NotificacaoBell />
        <slot name="actions" />
      </div>

      <div
        v-if="showIdentity"
        id="header-identity"
        class="flex shrink-0 items-center gap-2.5 lg:border-l lg:border-hairline lg:pl-4"
      >
        <!-- Abaixo de lg o avatar é o botão do menu da conta (tem o "Sair", que a sidebar não tem
             aqui); em lg+ é o avatar de sempre, não interativo — o wrapper `contents` não gera caixa. -->
        <AccountMenu :nome="nomeExibido" :role-label="roleLabel" />
        <div class="hidden lg:contents">
          <AvatarIniciais :nome="nomeExibido" class="h-11 w-11 text-[15px] lg:h-9 lg:w-9 lg:text-[13px]" />
        </div>
        <div class="hidden leading-tight lg:block">
          <p class="text-sm font-semibold text-ink">{{ nomeExibido }}</p>
          <p class="text-[12px] text-ink-soft">{{ roleLabel }}</p>
        </div>
      </div>
    </div>
  </div>

  <slot name="filters" />
  <slot name="tabs" />
</template>
