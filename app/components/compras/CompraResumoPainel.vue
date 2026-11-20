<script setup lang="ts">
// O resumo ao vivo (o texto do WhatsApp): <pre> em fonte mono, com as quebras de linha preservadas e selecionável. O texto é a string
// do montarResumoCompra, sem tocar. Linhas vazias somem (é regra do resumo).
defineProps<{ texto: string }>();
</script>

<template>
  <section id="compra-resumo" aria-labelledby="compra-resumo-titulo" class="rounded-lg border border-hairline bg-paper-raised p-3.5">
    <h3 id="compra-resumo-titulo" class="text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Resumo (atualiza enquanto você digita)</h3>
    <p class="mt-0.5 mb-2 text-[11.5px] text-ink-soft">Linhas vazias somem</p>
    <pre id="compra-resumo-texto" class="font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-ink select-text">{{ texto }}</pre>
  </section>
</template>
