<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { useLogout } from "../composables/useLogout";
import AvatarIniciais from "./AvatarIniciais.vue";

// Menu da conta do GlobalHeader — só abaixo de lg, onde não há sidebar (e portanto
// nem o "Sair" dela). Em lg+ o root some (`lg:hidden`) e o avatar volta a ser o
// elemento não interativo de sempre, que o GlobalHeader renderiza ao lado.
//
// O painel vai pro <body> (Teleport) com position: fixed: o header mora dentro do
// <main> do DefaultLayout, que tem overflow-x-hidden/overflow-y-auto e cortaria um
// painel absoluto. z-[60] fica acima do BottomNav (z-40) e do botão flutuante (z-30).
defineProps<{
  nome: string;
  roleLabel: string;
}>();

const { loading, logout } = useLogout();

const open = ref<boolean>(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLDivElement | null>(null);
const menuStyle = ref<Record<string, string>>({ top: "0px", left: "0px" });

const MARGIN = 8;

function positionMenu(): void {
  const trigger = triggerRef.value;
  const menu = menuRef.value;
  if (!trigger || !menu) return;

  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  // Ancorado sob o avatar, com a borda direita alinhada à dele; nunca sai da tela.
  const top = triggerRect.bottom + 6;
  const maxLeft = window.innerWidth - menuRect.width - MARGIN;
  const left = Math.min(Math.max(MARGIN, triggerRect.right - menuRect.width), maxLeft);

  menuStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    // Nunca invade o BottomNav (nem a safe-area) em telas baixas (celular em paisagem).
    maxHeight: `calc(100dvh - ${top}px - var(--bottom-nav-height) - env(safe-area-inset-bottom, 0px) - ${MARGIN}px)`,
  };
}

function handleOutsidePointer(event: PointerEvent): void {
  const target = event.target as Node;
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) return;
  closeMenu();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu();
  }
}

function removeListeners(): void {
  document.removeEventListener("pointerdown", handleOutsidePointer, true);
  document.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("scroll", closeMenu, true);
  window.removeEventListener("resize", closeMenu);
}

function closeMenu(): void {
  if (!open.value) return;
  open.value = false;
  removeListeners();
  triggerRef.value?.focus();
}

async function openMenu(): Promise<void> {
  open.value = true;
  await nextTick();
  positionMenu();
  menuRef.value?.querySelector<HTMLButtonElement>("[data-account-menu-item]")?.focus();
  document.addEventListener("pointerdown", handleOutsidePointer, true);
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu);
}

function toggleMenu(): void {
  if (open.value) {
    closeMenu();
  } else {
    void openMenu();
  }
}

async function handleSair(): Promise<void> {
  open.value = false;
  removeListeners();
  await logout();
}

onBeforeUnmount(removeListeners);
</script>

<template>
  <div class="lg:hidden">
    <button
      id="btn-conta-menu"
      ref="triggerRef"
      type="button"
      aria-label="Menu da conta"
      aria-haspopup="menu"
      aria-controls="conta-menu"
      :aria-expanded="open"
      class="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark"
      @click="toggleMenu"
    >
      <AvatarIniciais :nome="nome" class="h-11 w-11 text-[15px]" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        id="conta-menu"
        ref="menuRef"
        role="menu"
        aria-label="Menu da conta"
        class="fixed z-[60] w-56 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-hairline bg-paper-raised py-1.5 shadow-lg lg:hidden"
        :style="menuStyle"
      >
        <div class="border-b border-hairline px-4 pt-1.5 pb-2.5 leading-tight">
          <p id="conta-menu-nome" class="truncate text-sm font-semibold text-ink">{{ nome }}</p>
          <p id="conta-menu-cargo" class="mt-0.5 text-[12px] text-ink-soft">{{ roleLabel }}</p>
        </div>

        <button
          id="btn-conta-sair"
          type="button"
          role="menuitem"
          data-account-menu-item
          :disabled="loading"
          class="mt-1 flex min-h-11 w-full items-center gap-3 px-4 text-left font-display text-[14px] font-medium text-ink transition-colors hover:bg-paper disabled:opacity-60"
          @click="handleSair"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            class="h-[18px] w-[18px] shrink-0 text-ink-soft"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
            />
          </svg>
          {{ loading ? "Saindo..." : "Sair" }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
