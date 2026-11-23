<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { COMPRA_NUMERO_MAX } from "#shared/constants/compra";
import { NUMERO_DA_COMPRA_ERRO } from "#shared/utils/compraValidacao";
import { BOTAO_PRIMARIO_CLASS, BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import { INPUT_CLASS } from "../../utils/processoFormClasses";
import BaseModal from "../BaseModal.vue";

// A caixinha de "+ Nova compra" e de "Duplicar compra": pede o Nº da compra, que o time combina (Bruno e Rebeca) e pode sair fora de ordem, então NADA é
// gerado sozinho. Mostra o mês em que a compra vai nascer ("Novembro/2026") e já traz a SUGESTÃO (o maior número do mês + 1, ou 1 com o mês vazio), editável.
//
// O botão "Criar compra" NUNCA fica desabilitado por causa do número: se ele for inválido (vazio, 0, decimal, acima de 9999) ou repetido, o erro aparece no
// próprio campo e a caixinha continua aberta com o que foi digitado. (Durante a criação ele ignora novos cliques, para não criar duas vezes.)
// Enter cria; Esc (ou "Cancelar", ou o clique fora) cancela. Ao abrir, o foco vai para o campo e o número fica selecionado (digitar já troca a sugestão).
const props = defineProps<{
  /** "nova" (+ Nova compra) ou "duplicar" (Duplicar compra): só muda o título. */
  tipo: "nova" | "duplicar";
  /** O mês em que a compra vai nascer, por extenso ("Novembro/2026"). */
  rotuloMes: string;
  /** A sugestão: o maior número do mês + 1 (null = ainda buscando, ou não foi possível buscar). */
  sugestao: number | null;
  /** O maior número do mês (0 = mês vazio; null = ainda não se sabe). Só para a frase de apoio. */
  maior: number | null;
  /** O erro do servidor (número repetido, mês recusado...): aparece no campo. */
  erro: string | null;
  /** A criação está em andamento: novos cliques são ignorados. */
  ocupado: boolean;
}>();

const emit = defineEmits<{ confirmar: [numero: number]; cancelar: [] }>();

const texto = ref("");
const tocado = ref(false);
const erroLocal = ref<string | null>(null);
const campoRef = ref<HTMLInputElement | null>(null);

// A sugestão pode chegar DEPOIS de a caixinha abrir (a lista do mês é lida na hora): preenche o campo só se a pessoa ainda não digitou.
watch(
  () => props.sugestao,
  (s) => {
    if (!tocado.value && s !== null) {
      texto.value = String(s);
      void nextTick(() => campoRef.value?.select());
    }
  },
  { immediate: true },
);

onMounted(() => {
  campoRef.value?.focus();
  campoRef.value?.select();
});

const titulo = computed(() => (props.tipo === "duplicar" ? "Duplicar compra" : "Nova compra"));
const apoio = computed(() => {
  if (props.maior === null) return props.sugestao === null ? "Buscando a sugestão…" : "Pode trocar.";
  return props.maior === 0 ? "Sugestão: a primeira do mês. Pode trocar." : `Sugestão: a próxima depois da ${props.maior}. Pode trocar.`;
});
const erroMostrado = computed(() => erroLocal.value ?? props.erro);

function aoDigitar(event: Event): void {
  const campo = event.target as HTMLInputElement;
  tocado.value = true;
  erroLocal.value = null;
  // Só dígitos (um número inteiro): letras, sinais e vírgula nem entram.
  const limpo = campo.value.replace(/\D/g, "");
  if (limpo !== campo.value) campo.value = limpo;
  texto.value = limpo;
}

function criar(): void {
  if (props.ocupado) return;
  const n = /^\d+$/.test(texto.value) ? Number(texto.value) : Number.NaN;
  if (!Number.isInteger(n) || n < 1 || n > COMPRA_NUMERO_MAX) {
    erroLocal.value = NUMERO_DA_COMPRA_ERRO;
    campoRef.value?.focus();
    return;
  }
  emit("confirmar", n);
}

function cancelar(): void {
  if (props.ocupado) return;
  emit("cancelar");
}
</script>

<template>
  <BaseModal id="compra-dialogo-overlay" @close="cancelar">
    <form
      id="compra-dialogo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compra-dialogo-titulo"
      aria-describedby="compra-dialogo-texto"
      :aria-busy="ocupado ? 'true' : undefined"
      class="w-full max-w-[400px] rounded-[10px] border border-hairline bg-paper-raised p-5"
      novalidate
      @submit.prevent="criar"
    >
      <h2 id="compra-dialogo-titulo" class="mb-1.5 font-display text-[16px] font-semibold text-ink">{{ titulo }}</h2>
      <p id="compra-dialogo-texto" class="text-[13.5px] text-ink-soft">{{ rotuloMes }}. Digite o número combinado com o time.</p>

      <label for="compra-dialogo-numero" class="mt-4 mb-1.5 block text-[13px] font-semibold text-ink">Nº da compra</label>
      <input
        id="compra-dialogo-numero"
        ref="campoRef"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        maxlength="4"
        data-sem-maiuscula
        :value="texto"
        :aria-invalid="erroMostrado ? 'true' : undefined"
        :aria-describedby="erroMostrado ? 'compra-dialogo-erro compra-dialogo-apoio' : 'compra-dialogo-apoio'"
        :class="[INPUT_CLASS, 'max-w-[9rem]']"
        @input="aoDigitar"
      />
      <p id="compra-dialogo-apoio" class="mt-1.5 text-[12px] text-ink-soft">{{ apoio }}</p>
      <p v-if="erroMostrado" id="compra-dialogo-erro" role="alert" class="mt-1.5 text-[12.5px] font-medium text-danger">{{ erroMostrado }}</p>

      <div class="mt-5 flex justify-end gap-2">
        <button id="btn-compra-dialogo-cancelar" type="button" :class="BOTAO_SECUNDARIO_CLASS" @click="cancelar">Cancelar</button>
        <button id="btn-compra-dialogo-criar" type="submit" :class="BOTAO_PRIMARIO_CLASS">Criar compra</button>
      </div>
    </form>
  </BaseModal>
</template>
