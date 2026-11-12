<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId } from "vue";
import type { Component } from "vue";

export interface ActionsMenuItem {
  id?: string;
  label: string;
  icon?: Component;
  danger?: boolean;
  onClick: () => void;
}

const props = defineProps<{
  items: ActionsMenuItem[];
  triggerId?: string;
  menuId?: string;
  ariaLabel?: string;
  // Opcionais (sem eles, o menu é exatamente o de sempre):
  // - triggerClass: troca as classes do botão (ex.: botão com texto "Mover para…" no painel do Kanban);
  // - menuZClass: camada da lista aberta (padrão z-50). Dentro do painel lateral do Kanban (z-880) a lista precisa
  //   ficar acima dele, senão abre por trás do overlay;
  // - disabled: botão desabilitado (ex.: processo sendo movido).
  // O conteúdo do botão pode vir no slot `trigger` (padrão: os três pontinhos).
  triggerClass?: string;
  menuZClass?: string;
  disabled?: boolean;
  // - itensToque: itens com 44px de altura e fonte de 14px abaixo de lg (alvo de toque confortável). Padrão false =
  //   os itens de sempre (py-1.5, 12.5px), como na tela de Contas. Ligado pelo "Mover para…" do painel do Kanban.
  itensToque?: boolean;
}>();

const CLASSE_TRIGGER_PADRAO =
  "flex h-11 w-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper hover:text-ink md:h-7 md:w-7";

const generatedId = useId();
const resolvedTriggerId = computed(() => props.triggerId ?? `actions-menu-trigger-${generatedId}`);
const resolvedMenuId = computed(() => props.menuId ?? `actions-menu-${generatedId}`);

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLDivElement | null>(null);
const menuStyle = ref({ top: "0px", left: "0px" });

function getItemButtons(): HTMLButtonElement[] {
  return Array.from(menuRef.value?.querySelectorAll<HTMLButtonElement>("[data-actions-menu-item]") ?? []);
}

function focusItemAt(index: number): void {
  const buttons = getItemButtons();
  if (buttons.length === 0) return;
  const clamped = (index + buttons.length) % buttons.length;
  buttons[clamped]?.focus();
}

function positionMenu(): void {
  const trigger = triggerRef.value;
  const menu = menuRef.value;
  if (!trigger || !menu) return;

  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 8;

  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const openUp = spaceBelow < menuRect.height + margin && triggerRect.top > menuRect.height + margin;
  const top = openUp ? triggerRect.top - menuRect.height - 4 : triggerRect.bottom + 4;

  const maxLeft = window.innerWidth - menuRect.width - margin;
  const left = Math.min(Math.max(margin, triggerRect.right - menuRect.width), maxLeft);

  menuStyle.value = { top: `${Math.max(margin, top)}px`, left: `${left}px` };
}

function handleOutsideClick(event: MouseEvent): void {
  const target = event.target as Node;
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) return;
  closeMenu();
}

function handleMenuKeydown(event: KeyboardEvent): void {
  const buttons = getItemButtons();
  if (buttons.length === 0) return;
  const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);

  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusItemAt(currentIndex + 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    focusItemAt(currentIndex - 1);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeMenu();
  } else if (event.key === "Tab") {
    closeMenu();
  }
}

function closeMenu(): void {
  if (!open.value) return;
  open.value = false;
  document.removeEventListener("mousedown", handleOutsideClick, true);
  window.removeEventListener("scroll", closeMenu, true);
  window.removeEventListener("resize", closeMenu);
  triggerRef.value?.focus();
}

async function openMenu(): Promise<void> {
  open.value = true;
  await nextTick();
  positionMenu();
  focusItemAt(0);
  document.addEventListener("mousedown", handleOutsideClick, true);
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

function selectItem(item: ActionsMenuItem): void {
  closeMenu();
  item.onClick();
}

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleOutsideClick, true);
  window.removeEventListener("scroll", closeMenu, true);
  window.removeEventListener("resize", closeMenu);
});
</script>

<template>
  <div class="inline-block">
    <button
      :id="resolvedTriggerId"
      ref="triggerRef"
      type="button"
      :aria-label="ariaLabel ?? 'Mais ações'"
      aria-haspopup="true"
      :aria-expanded="open"
      :aria-controls="open ? resolvedMenuId : undefined"
      :disabled="disabled"
      :class="triggerClass ?? CLASSE_TRIGGER_PADRAO"
      class="disabled:cursor-not-allowed disabled:opacity-50"
      @click="toggleMenu"
    >
      <slot name="trigger">
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </slot>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        :id="resolvedMenuId"
        ref="menuRef"
        role="menu"
        :aria-labelledby="resolvedTriggerId"
        class="fixed w-44 rounded-md border border-hairline bg-paper-raised py-1.5 shadow-lg"
        :class="menuZClass ?? 'z-50'"
        :style="menuStyle"
        @keydown="handleMenuKeydown"
      >
        <button
          v-for="(item, index) in items"
          :id="item.id"
          :key="item.id ?? index"
          type="button"
          data-actions-menu-item
          role="menuitem"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors"
          :class="[
            item.danger ? 'text-danger hover:bg-danger/10' : 'text-ink-soft hover:bg-paper hover:text-ink',
            itensToque ? 'max-lg:min-h-11 max-lg:text-[14px]' : '',
          ]"
          @click="selectItem(item)"
        >
          <component :is="item.icon" v-if="item.icon" class="h-3.5 w-3.5 shrink-0" />
          {{ item.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
