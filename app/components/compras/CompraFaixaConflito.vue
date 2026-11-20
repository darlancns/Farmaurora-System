<script setup lang="ts">
import { BOTAO_PRIMARIO_CLASS, BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";

// A faixa do topo do formulário quando o servidor responde 409 (alguém salvou antes). O salvamento automático fica parado e NADA
// some até a pessoa escolher: carregar a versão salva (descarta as mudanças locais) ou manter as dela e salvar por cima.
defineProps<{ ocupado?: boolean }>();
const emit = defineEmits<{ carregar: []; manter: [] }>();
</script>

<template>
  <div id="compra-faixa-conflito" role="alert" class="flex flex-col gap-3 rounded-lg border border-warning-gold/40 bg-mainz-gold-soft px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
    <p class="text-[13px] font-semibold text-ink">Esta compra foi alterada por outra pessoa.</p>
    <div class="flex flex-wrap gap-2">
      <button id="btn-conflito-carregar" type="button" :class="BOTAO_SECUNDARIO_CLASS" :disabled="ocupado" @click="emit('carregar')">Carregar a versão salva</button>
      <button id="btn-conflito-manter" type="button" :class="BOTAO_PRIMARIO_CLASS" :disabled="ocupado" @click="emit('manter')">Manter as minhas e salvar por cima</button>
    </div>
  </div>
</template>
