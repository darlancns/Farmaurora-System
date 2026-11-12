<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "#app";
import { useAuth } from "../composables/useAuth";
import GlobalHeader from "../components/GlobalHeader.vue";
import ContasTab from "../components/configuracoes/ContasTab.vue";
import MinhaContaTab from "../components/configuracoes/MinhaContaTab.vue";
import {
  abasParaCargo,
  resolverAba,
  type AbaConfiguracoes,
  type AbaConfiguracoesDef,
} from "../utils/abasConfiguracoes";
import { QUERY_ABA } from "../utils/contaFoco";

// A página abre pra TODOS os cargos (seção "config" em shared/utils/rbac.ts); o que muda é QUAIS abas
// cada um vê (app/utils/abasConfiguracoes.ts): sócio e administrador, "Minha conta" + "Contas";
// consultor e operacional, só "Minha conta". "Minha conta" é a primeira aba e a padrão de todos. A autorização real das ações de gestão continua no
// servidor (/api/admin/**) e dentro do ContasTab — esconder a aba aqui é só a parte visível disso.
//
// O cargo só existe no client (via /api/auth/me), então o conteúdo dependente dele só é montado
// depois da hidratação — o HTML do SSR (sem conteúdo) bate com o primeiro render do client, evitando
// hydration mismatch.
const { role } = useAuth();
const route = useRoute();
const router = useRouter();

const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const showContent = computed(() => mounted.value && role.value !== null);

// ?aba= escolhe a aba, validado contra as permitidas ao cargo; inválido/não permitido → aba padrão.
const tabs = computed<AbaConfiguracoesDef[]>(() => abasParaCargo(role.value));
const activeTab = computed<AbaConfiguracoes>(() => resolverAba(role.value, route.query[QUERY_ABA]));

// Trocar de aba grava ?aba= na URL (replace: não enche o histórico) — o link do sino e o recarregar
// da página caem na mesma aba.
function selecionarAba(aba: AbaConfiguracoes): void {
  if (aba === activeTab.value) return;
  router.replace({ path: route.path, query: { ...route.query, [QUERY_ABA]: aba } });
}

// Subtítulo da aba ativa: "Gestão de contas e acessos da equipe." só na aba Contas (texto de sempre);
// em "Minha conta" — e antes de o cargo carregar, quando a aba padrão é essa — vale o da conta própria.
const subtitle = computed<string>(() =>
  showContent.value && activeTab.value === "contas"
    ? "Gestão de contas e acessos da equipe."
    : "Seus dados de acesso.",
);
</script>

<template>
  <div id="configuracoes-page" class="mx-auto max-w-pagina">
    <GlobalHeader title="Configurações" :subtitle="subtitle">
      <template v-if="showContent" #tabs>
        <!-- Abaixo de lg: -mt-3.5 desconta 14px do mb-4 do GlobalHeader (sobram 2px = a espessura do sublinhado) e a aba
             tem 44px, então o texto fica com o mesmo respiro acima (linha do cabeçalho) e abaixo (linha da barra). -->
        <div class="mb-3.5 flex gap-1 border-b border-hairline max-lg:-mt-3.5">
          <button
            v-for="tab in tabs"
            :id="`tab-${tab.key}`"
            :key="tab.key"
            type="button"
            class="border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors max-lg:min-h-11"
            :class="
              activeTab === tab.key
                ? 'border-accent-dark text-accent-dark'
                : 'border-transparent text-ink-soft hover:text-ink'
            "
            @click="selecionarAba(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>
      </template>
    </GlobalHeader>

    <ContasTab v-if="showContent && activeTab === 'contas'" />
    <MinhaContaTab v-else-if="showContent && activeTab === 'minha-conta'" />
  </div>
</template>
