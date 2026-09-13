<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { navigateTo } from "#app";
import { getSupabaseClient } from "../utils/supabaseClient";
import { formatPasswordError } from "#shared/utils/authErrors";

type Status = "checking" | "valid" | "invalid";

const MIN_PASSWORD_LENGTH = 8;

const status = ref<Status>("checking");
const newPassword = ref<string>("");
const confirmPassword = ref<string>("");
const showPassword = ref<boolean>(false);
const errorMsg = ref<string | null>(null);
const loading = ref<boolean>(false);

const canSubmit = computed<boolean>(
  () =>
    newPassword.value.length >= MIN_PASSWORD_LENGTH &&
    newPassword.value === confirmPassword.value,
);

let timeoutId: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

onMounted(async () => {
  const supabase = getSupabaseClient();

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    status.value = "valid";
    return;
  }

  // O redirect do Supabase chega com o token no hash da URL; o client leva um
  // instante pra processar e disparar PASSWORD_RECOVERY. Se isso não
  // acontecer em alguns segundos, o link é inválido/expirado.
  const { data: listener } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      status.value = "valid";
      if (timeoutId) clearTimeout(timeoutId);
    }
  });
  unsubscribe = () => listener.subscription.unsubscribe();

  timeoutId = setTimeout(() => {
    if (status.value === "checking") status.value = "invalid";
  }, 4000);
});

onUnmounted(() => {
  if (timeoutId) clearTimeout(timeoutId);
  unsubscribe?.();
});

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value) return;
  errorMsg.value = null;
  loading.value = true;
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword.value });

    if (error) {
      errorMsg.value = formatPasswordError(error, "Não foi possível redefinir a senha. Tente novamente.");
      return;
    }

    await supabase.auth.signOut();
    await navigateTo("/login?redefinido=1");
  } catch {
    errorMsg.value = "Não foi possível redefinir a senha agora. Tente novamente em instantes.";
  } finally {
    loading.value = false;
  }
}

function requestNewLink(): void {
  navigateTo("/login?forgot=1");
}
</script>

<template>
  <div class="flex min-h-screen w-full items-center justify-center bg-paper px-4 py-8 sm:px-6">
    <div
      id="redefinir-senha-page"
      class="grid w-full max-w-[960px] overflow-hidden rounded-2xl border border-hairline bg-paper-raised shadow-lg sm:grid-cols-2 sm:min-h-[580px]"
    >
      <!-- Painel esquerdo: imagem (oculta em telas muito pequenas) -->
      <div
        class="hidden bg-cover bg-no-repeat sm:block"
        style="background-image: url('/images/imagem_login.png'); background-position: 85% center;"
      ></div>

      <!-- Painel direito -->
      <div class="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-12">
        <img
          src="/images/logo_azul.png"
          alt="Farmaurora"
          class="mx-auto mb-8 h-16 w-auto"
        />

        <template v-if="status === 'checking'">
          <p id="redefinir-checking" class="text-center text-[13px] text-ink-soft">
            Verificando o link de recuperação...
          </p>
        </template>

        <template v-else-if="status === 'invalid'">
          <h1 class="text-center font-display text-2xl font-semibold tracking-tight text-ink">
            Link inválido ou expirado.
          </h1>
          <p class="mt-1.5 mb-8 text-center text-[13px] text-ink-soft">
            Solicite um novo link de recuperação de senha.
          </p>
          <button
            id="request-new-link"
            type="button"
            class="h-[50px] rounded-lg bg-accent-dark text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-dark/90"
            @click="requestNewLink"
          >
            Solicitar novo link
          </button>
        </template>

        <template v-else>
          <h1 class="text-center font-display text-2xl font-semibold tracking-tight text-ink">
            Definir nova senha
          </h1>
          <p class="mt-1.5 mb-8 text-center text-[13px] text-ink-soft">
            Escolha uma nova senha para acessar seu ambiente Farmaurora.
          </p>

          <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
            <div>
              <label for="new-password" class="mb-1.5 block text-[11px] font-medium text-ink-soft">
                Nova senha
              </label>
              <div class="relative">
                <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-soft">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-[18px] w-[18px]">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </span>
                <input
                  id="new-password"
                  v-model="newPassword"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  required
                  :minlength="MIN_PASSWORD_LENGTH"
                  class="w-full rounded-lg border border-[#D9E0E5] bg-white py-2.5 pr-10 pl-10 text-[14px] text-ink outline-none transition-colors focus:border-accent-dark focus:ring-2 focus:ring-accent-dark/20"
                />
                <button
                  id="new-password-toggle"
                  type="button"
                  tabindex="-1"
                  class="absolute inset-y-0 right-3 flex items-center text-ink-soft hover:text-ink"
                  :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
                  @click="showPassword = !showPassword"
                >
                  <svg v-if="!showPassword" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-[18px] w-[18px]">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-[18px] w-[18px]">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label for="confirm-password" class="mb-1.5 block text-[11px] font-medium text-ink-soft">
                Confirmar nova senha
              </label>
              <div class="relative">
                <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-soft">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-[18px] w-[18px]">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </span>
                <input
                  id="confirm-password"
                  v-model="confirmPassword"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  required
                  :minlength="MIN_PASSWORD_LENGTH"
                  class="w-full rounded-lg border border-[#D9E0E5] bg-white py-2.5 pr-3 pl-10 text-[14px] text-ink outline-none transition-colors focus:border-accent-dark focus:ring-2 focus:ring-accent-dark/20"
                />
              </div>
              <p
                v-if="confirmPassword && newPassword !== confirmPassword"
                class="mt-1.5 text-[11px] text-danger"
              >
                As senhas não coincidem.
              </p>
              <p
                v-else-if="newPassword && newPassword.length < MIN_PASSWORD_LENGTH"
                class="mt-1.5 text-[11px] text-ink-soft"
              >
                Mínimo de {{ MIN_PASSWORD_LENGTH }} caracteres.
              </p>
            </div>

            <p
              v-if="errorMsg"
              id="redefinir-error"
              class="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] font-medium text-danger"
            >
              {{ errorMsg }}
            </p>

            <button
              id="redefinir-submit"
              type="submit"
              :disabled="loading || !canSubmit"
              class="mt-1 flex h-[50px] items-center justify-center gap-1.5 rounded-lg bg-accent-dark text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {{ loading ? "Salvando..." : "Redefinir senha" }}
            </button>
          </form>
        </template>

        <p class="mt-8 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-soft">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-[13px] w-[13px] shrink-0 text-accent-dark">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          Ambiente exclusivo para colaboradores autorizados.
        </p>
      </div>
    </div>
  </div>
</template>
