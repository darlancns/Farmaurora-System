<script setup lang="ts">
import { BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";

// A faixa do topo do formulário quando OUTRA pessoa apagou a compra que está aberta (o salvamento automático levou 404). Nada é salvo (a compra não existe
// mais), mas o que foi digitado continua na tela, para quem quiser copiar. "Voltar para a lista" fecha o formulário.
const emit = defineEmits<{ fechar: [] }>();
</script>

<template>
  <div id="compra-faixa-apagada" role="alert" class="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
    <div class="min-w-0">
      <p class="text-[13px] font-semibold text-ink">Esta compra foi apagada por outra pessoa.</p>
      <p class="mt-0.5 text-[12.5px] text-ink-soft">O que você digitou continua aqui, mas não será salvo.</p>
    </div>
    <button id="btn-apagada-fechar" type="button" :class="[BOTAO_SECUNDARIO_CLASS, 'whitespace-nowrap']" @click="emit('fechar')">Voltar para a lista</button>
  </div>
</template>
