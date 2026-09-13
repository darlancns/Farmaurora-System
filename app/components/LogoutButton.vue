<script setup lang="ts">
import { ref } from "vue";
import { navigateTo } from "#app";
import { getSupabaseClient } from "../utils/supabaseClient";
import { useAuth } from "../composables/useAuth";

const loading = ref<boolean>(false);

async function handleLogout(): Promise<void> {
  loading.value = true;
  try {
    await getSupabaseClient().auth.signOut();
  } finally {
    useAuth().clear();
    await navigateTo("/login");
  }
}
</script>

<template>
  <button
    id="logout-button"
    type="button"
    :disabled="loading"
    class="flex items-center gap-2.5 rounded-md px-2.5 py-2 font-display text-[15.5px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
    @click="handleLogout"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      class="h-[18px] w-[18px] shrink-0"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
      />
    </svg>
    {{ loading ? "Saindo..." : "Sair" }}
  </button>
</template>
