<script setup lang="ts">
import { ref } from "vue";
import { navigateTo, useRoute } from "#app";
import { getSupabaseClient } from "../utils/supabaseClient";
import { useAuth } from "../composables/useAuth";

type Mode = "login" | "forgot";

const route = useRoute();

const mode = ref<Mode>(route.query.forgot === "1" ? "forgot" : "login");
const resetSuccessMsg = ref<string | null>(
  route.query.redefinido === "1" ? "Senha redefinida. Faça login com a nova senha." : null,
);

const email = ref<string>("");
const password = ref<string>("");
const showPassword = ref<boolean>(false);
const errorMsg = ref<string | null>(null);
const loading = ref<boolean>(false);

async function handleSubmit(): Promise<void> {
  errorMsg.value = null;
  loading.value = true;
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });

    if (error) {
      errorMsg.value = "E-mail ou senha inválidos.";
      return;
    }

    // Recarrega o cargo (o guard de rota usa isso pra decidir a página inicial).
    await useAuth().load(true);
    await navigateTo("/");
  } catch {
    errorMsg.value = "Não foi possível entrar agora. Tente novamente em instantes.";
  } finally {
    loading.value = false;
  }
}

const forgotEmail = ref<string>("");
const forgotLoading = ref<boolean>(false);
const forgotError = ref<string | null>(null);
const forgotMsg = ref<string | null>(null);

function goToForgot(): void {
  errorMsg.value = null;
  resetSuccessMsg.value = null;
  forgotError.value = null;
  forgotMsg.value = null;
  forgotEmail.value = email.value;
  mode.value = "forgot";
}

function backToLogin(): void {
  forgotError.value = null;
  forgotMsg.value = null;
  mode.value = "login";
}

async function handleForgotSubmit(): Promise<void> {
  forgotError.value = null;
  forgotMsg.value = null;
  forgotLoading.value = true;
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.value.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    // Nunca revela se o e-mail existe ou não: só um erro de rede/servidor
    // genuíno vira uma mensagem diferente da de sucesso.
    const isNetworkOrServerError = !!error && (!error.status || error.status >= 500);
    if (isNetworkOrServerError) {
      forgotError.value = "Não foi possível enviar o link agora. Tente novamente em instantes.";
      return;
    }

    forgotMsg.value = "Se esse e-mail estiver cadastrado, você vai receber um link em instantes.";
  } catch {
    forgotError.value = "Não foi possível enviar o link agora. Tente novamente em instantes.";
  } finally {
    forgotLoading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen w-full items-center justify-center bg-paper px-4 py-8 sm:px-6">
    <div
      id="login-page"
      class="grid w-full max-w-[960px] overflow-hidden rounded-2xl border border-hairline bg-paper-raised shadow-lg sm:grid-cols-2 sm:min-h-[580px]"
    >
      <!-- Painel esquerdo: imagem (oculta em telas muito pequenas) -->
      <div
        class="hidden bg-cover bg-no-repeat sm:block"
        style="background-image: url('/images/imagem_login.png'); background-position: 85% center;"
      ></div>

      <!-- Painel direito: formulário -->
      <div class="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-12">
        <img
          src="/images/logo_azul.png"
          alt="Farmaurora"
          class="mx-auto mb-8 h-16 w-auto"
        />

        <p
          v-if="resetSuccessMsg"
          id="login-reset-success"
          class="mb-5 rounded-lg border border-farm-blue/30 bg-farm-blue-soft px-3 py-2 text-center text-[12.5px] font-medium text-farm-blue"
        >
          {{ resetSuccessMsg }}
        </p>

        <template v-if="mode === 'login'">
          <h1 class="text-center font-display text-2xl font-semibold tracking-tight text-ink">
            Bem-vindo de volta
          </h1>
          <p class="mt-1.5 mb-8 text-center text-[13px] text-ink-soft">
            Acesse seu ambiente Farmaurora.
          </p>

          <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
            <div>
              <label for="login-email" class="mb-1.5 block text-[11px] font-medium text-ink-soft">
                E-mail
              </label>
              <div class="relative">
                <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-soft">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-[18px] w-[18px]">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                </span>
                <input
                  id="login-email"
                  v-model="email"
                  type="email"
                  autocomplete="username"
                  required
                  placeholder="seu@email.com"
                  class="w-full rounded-lg border border-[#D9E0E5] bg-white py-2.5 pr-3 pl-10 text-[14px] text-ink outline-none transition-colors focus:border-accent-dark focus:ring-2 focus:ring-accent-dark/20"
                />
              </div>
            </div>

            <div>
              <label for="login-password" class="mb-1.5 block text-[11px] font-medium text-ink-soft">
                Senha
              </label>
              <div class="relative">
                <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-soft">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-[18px] w-[18px]">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </span>
                <input
                  id="login-password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  required
                  class="w-full rounded-lg border border-[#D9E0E5] bg-white py-2.5 pr-10 pl-10 text-[14px] text-ink outline-none transition-colors focus:border-accent-dark focus:ring-2 focus:ring-accent-dark/20"
                />
                <button
                  id="login-password-toggle"
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
              <div class="mt-2 text-right">
                <button
                  id="forgot-password-link"
                  type="button"
                  class="text-[12px] font-medium text-accent-dark hover:underline"
                  @click="goToForgot"
                >
                  Esqueceu a senha?
                </button>
              </div>
            </div>

            <p
              v-if="errorMsg"
              id="login-error"
              class="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] font-medium text-danger"
            >
              {{ errorMsg }}
            </p>

            <button
              id="login-submit"
              type="submit"
              :disabled="loading"
              class="mt-1 flex h-[50px] items-center justify-center gap-1.5 rounded-lg bg-accent-dark text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {{ loading ? "Entrando..." : "Acessar ambiente →" }}
            </button>
          </form>
        </template>

        <template v-else>
          <h1 class="text-center font-display text-2xl font-semibold tracking-tight text-ink">
            Recuperar senha
          </h1>
          <p class="mt-1.5 mb-8 text-center text-[13px] text-ink-soft">
            Informe seu e-mail e enviaremos um link para você criar uma nova senha.
          </p>

          <form class="flex flex-col gap-4" @submit.prevent="handleForgotSubmit">
            <div>
              <label for="forgot-email" class="mb-1.5 block text-[11px] font-medium text-ink-soft">
                E-mail
              </label>
              <div class="relative">
                <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-soft">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-[18px] w-[18px]">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                </span>
                <input
                  id="forgot-email"
                  v-model="forgotEmail"
                  type="email"
                  autocomplete="username"
                  required
                  placeholder="seu@email.com"
                  class="w-full rounded-lg border border-[#D9E0E5] bg-white py-2.5 pr-3 pl-10 text-[14px] text-ink outline-none transition-colors focus:border-accent-dark focus:ring-2 focus:ring-accent-dark/20"
                />
              </div>
            </div>

            <p
              v-if="forgotError"
              id="forgot-error"
              class="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] font-medium text-danger"
            >
              {{ forgotError }}
            </p>
            <p
              v-if="forgotMsg"
              id="forgot-success"
              class="rounded-lg border border-farm-blue/30 bg-farm-blue-soft px-3 py-2 text-[12px] font-medium text-farm-blue"
            >
              {{ forgotMsg }}
            </p>

            <button
              id="forgot-submit"
              type="submit"
              :disabled="forgotLoading"
              class="mt-1 flex h-[50px] items-center justify-center gap-1.5 rounded-lg bg-accent-dark text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {{ forgotLoading ? "Enviando..." : "Enviar link de recuperação" }}
            </button>

            <button
              id="back-to-login"
              type="button"
              class="text-center text-[12.5px] font-medium text-accent-dark hover:underline"
              @click="backToLogin"
            >
              Voltar para o login
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
