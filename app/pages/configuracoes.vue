<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAuth } from "../composables/useAuth";
import ContasTab from "../components/configuracoes/ContasTab.vue";

// A autorização real (redirect de não-admin) é feita por app/middleware/authz.global.ts
// via sectionForPageRoute("/configuracoes") === "config". Este bloco é só um
// reforço defensivo.
//
// O cargo só existe no client (via /api/auth/me), então o conteúdo dependente
// dele só é montado depois da hidratação — o HTML do SSR (sem conteúdo) bate
// com o primeiro render do client, evitando hydration mismatch.
const { isAdmin } = useAuth();
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const showContent = computed(() => mounted.value && isAdmin.value);

type Tab = "contas";
const activeTab = ref<Tab>("contas");

interface TabDef {
  key: Tab;
  label: string;
}
const tabs: TabDef[] = [{ key: "contas", label: "Contas" }];
</script>

<template>
  <div id="configuracoes-page" class="mx-auto max-w-[1400px]">
    <div class="mb-4 flex items-end justify-between gap-4 border-b border-hairline pb-3.5">
      <div>
        <h1 class="font-display text-[28px] font-semibold tracking-tight text-ink">Configurações</h1>
        <p class="mt-1 text-[13px] text-ink-soft">Gestão de contas e acessos da equipe.</p>
      </div>
    </div>

    <template v-if="showContent">
      <div class="mb-3.5 flex gap-1 border-b border-hairline">
        <button
          v-for="tab in tabs"
          :id="`tab-${tab.key}`"
          :key="tab.key"
          type="button"
          class="border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors"
          :class="
            activeTab === tab.key
              ? 'border-accent-dark text-accent-dark'
              : 'border-transparent text-ink-soft hover:text-ink'
          "
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <ContasTab v-if="activeTab === 'contas'" />
    </template>

    <p v-else-if="mounted && !isAdmin" class="text-[13px] text-ink-soft">Acesso restrito.</p>
  </div>
</template>
