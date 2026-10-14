<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAuth } from "../composables/useAuth";
import GlobalHeader from "../components/GlobalHeader.vue";
import ContasTab from "../components/configuracoes/ContasTab.vue";

// A autorização real (redirect de quem não pode nem ler) é feita por
// app/middleware/authz.global.ts via sectionForPageRoute("/configuracoes") ===
// "config". Este bloco é só um reforço defensivo. socio lê (vê a lista de
// contas); só administrador escreve — a aba ContasTab decide, por conta
// própria, quais controles de escrita mostrar (ver canWrite("admin") lá).
//
// O cargo só existe no client (via /api/auth/me), então o conteúdo dependente
// dele só é montado depois da hidratação — o HTML do SSR (sem conteúdo) bate
// com o primeiro render do client, evitando hydration mismatch.
const { canRead } = useAuth();
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const podeVer = computed(() => canRead("config"));
const showContent = computed(() => mounted.value && podeVer.value);

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
    <GlobalHeader title="Configurações" subtitle="Gestão de contas e acessos da equipe.">
      <template v-if="showContent" #tabs>
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
      </template>
    </GlobalHeader>

    <ContasTab v-if="showContent && activeTab === 'contas'" />
    <p v-else-if="mounted && !podeVer" class="text-[13px] text-ink-soft">Acesso restrito.</p>
  </div>
</template>
