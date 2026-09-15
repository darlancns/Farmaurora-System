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
}>();

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
      class="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper hover:text-ink"
      @click="toggleMenu"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="12" cy="19" r="1.5" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        :id="resolvedMenuId"
        ref="menuRef"
        role="menu"
        class="fixed z-50 w-44 rounded-md border border-hairline bg-paper-raised py-1.5 shadow-lg"
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
          :class="item.danger ? 'text-danger hover:bg-danger/10' : 'text-ink-soft hover:bg-paper hover:text-ink'"
          @click="selectItem(item)"
        >
          <component :is="item.icon" v-if="item.icon" class="h-3.5 w-3.5 shrink-0" />
          {{ item.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
