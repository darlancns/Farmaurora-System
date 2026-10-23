import { ref, type Ref } from "vue";
import { navigateTo } from "#app";
import { getSupabaseClient } from "../utils/supabaseClient";
import { useAuth } from "./useAuth";

export interface UseLogoutReturn {
  loading: Ref<boolean>;
  logout: () => Promise<void>;
}

/**
 * Sair da conta: encerra a sessão no Supabase, limpa o estado de auth e vai
 * pro /login (mesmo se o signOut falhar — o `finally` garante que a pessoa
 * não fica presa numa tela logada). Sem confirmação, como sempre foi.
 *
 * Fonte única do "Sair": LogoutButton.vue (sidebar, lg+) e AccountMenu.vue
 * (menu do avatar, abaixo de lg) consomem daqui. Cada chamada ao composable
 * tem o seu próprio `loading`.
 */
export function useLogout(): UseLogoutReturn {
  const loading = ref<boolean>(false);

  async function logout(): Promise<void> {
    loading.value = true;
    try {
      await getSupabaseClient().auth.signOut();
    } finally {
      useAuth().clear();
      await navigateTo("/login");
    }
  }

  return { loading, logout };
}
