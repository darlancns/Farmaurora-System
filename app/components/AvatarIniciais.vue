<script setup lang="ts">
import { computed } from "vue";

// Mesma regra usada no bloco de identidade do GlobalHeader: 1ª letra da 1ª
// palavra + 1ª letra da última (ex.: "Roberto Carlos" → "RC", "Darlan"
// sozinho → "D"). Quem chama resolve o texto de fallback (ex.: parte antes
// do @ do e-mail, pra contas sem nome) antes de passar pra cá — este
// componente só extrai iniciais de uma string de nome já resolvida.
const props = withDefaults(
  defineProps<{
    nome: string;
    size?: "sm" | "md";
  }>(),
  { size: "md" },
);

const iniciais = computed<string>(() => {
  const partes = props.nome.trim().split(/\s+/);
  const primeira = partes[0]?.charAt(0) ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.charAt(0) ?? "") : "";
  return (primeira + ultima).toUpperCase();
});

const sizeClass = computed<string>(() => (props.size === "sm" ? "h-6 w-6 text-[10px]" : "h-9 w-9 text-[13px]"));
</script>

<template>
  <div
    class="flex shrink-0 items-center justify-center rounded-full bg-accent-dark font-display font-semibold text-white"
    :class="sizeClass"
  >
    {{ iniciais }}
  </div>
</template>
