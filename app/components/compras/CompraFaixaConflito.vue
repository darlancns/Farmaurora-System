<script setup lang="ts">
import { computed } from "vue";
import { TEXTO_CONFLITO_PADRAO, conflitoEhDeTrava } from "../../utils/comprasEncaminhar";
import { BOTAO_PRIMARIO_CLASS, BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";

// A faixa do topo do formulário quando o servidor responde 409. O salvamento automático fica parado e NADA some até a pessoa escolher.
//  - alguém salvou antes: carregar a versão salva (descarta as mudanças locais) ou manter as dela e salvar por cima;
//  - TRAVA da ordem encaminhada (remover a ordem ou trocar o PO): a mensagem do servidor e SÓ "Carregar a versão salva" (manter as minhas
//    levaria o mesmo 409 de novo).
const props = defineProps<{
  ocupado?: boolean;
  /** O motivo do 409 (o `data.code` e a mensagem do servidor); sem ele, vale o conflito comum de versão. */
  conflito?: { codigo: string | null; mensagem: string | null } | null;
}>();
const emit = defineEmits<{ carregar: []; manter: [] }>();

const deTrava = computed(() => conflitoEhDeTrava(props.conflito?.codigo));
const mensagem = computed(() => (deTrava.value && props.conflito?.mensagem ? props.conflito.mensagem : TEXTO_CONFLITO_PADRAO));
</script>

<template>
  <div id="compra-faixa-conflito" role="alert" :data-codigo="conflito?.codigo ?? undefined" class="flex flex-col gap-3 rounded-lg border border-warning-gold/40 bg-mainz-gold-soft px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
    <p id="compra-faixa-conflito-texto" class="text-[13px] font-semibold text-ink">{{ mensagem }}</p>
    <div class="flex flex-wrap gap-2">
      <button id="btn-conflito-carregar" type="button" :class="BOTAO_SECUNDARIO_CLASS" :disabled="ocupado" @click="emit('carregar')">Carregar a versão salva</button>
      <button v-if="!deTrava" id="btn-conflito-manter" type="button" :class="BOTAO_PRIMARIO_CLASS" :disabled="ocupado" @click="emit('manter')">Manter as minhas e salvar por cima</button>
    </div>
  </div>
</template>
