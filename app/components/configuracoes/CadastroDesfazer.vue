<script setup lang="ts">
// Aviso "Desativado. Desfazer" da aba Cadastros. Fica só aqui (o toast global não tem botão de ação): mesma aparência do
// ToastNotice (barra escura, embaixo, no centro, acima do painel lateral) e o mesmo z-index. Quem decide por quanto
// tempo aparece, e o que o "Desfazer" faz, é o pai (CadastrosTab.vue). Abaixo de lg sobe um pouco para não ficar sob a
// barra de navegação inferior.

defineProps<{
  /** Texto do aviso, ex.: "Desativado." */
  mensagem: string;
  /** Nome do item: vai no aria-label do botão (leitor de tela). */
  nomeItem: string;
}>();

const emit = defineEmits<{ desfazer: [] }>();
</script>

<template>
  <div
    id="cadastro-desfazer"
    role="status"
    aria-live="polite"
    class="fixed bottom-6 left-1/2 z-[999] flex w-max max-w-[min(90vw,560px)] -translate-x-1/2 items-center gap-3 rounded-lg bg-ink py-1.5 pr-2 pl-4 text-[13px] text-white max-lg:bottom-20"
  >
    <span>{{ mensagem }}</span>
    <button
      id="btn-cadastro-desfazer"
      type="button"
      :aria-label="`Desfazer: reativar ${nomeItem}`"
      class="cursor-pointer rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-white underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-white max-lg:min-h-11"
      @click="emit('desfazer')"
    >
      Desfazer
    </button>
  </div>
</template>
