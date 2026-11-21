<script setup lang="ts">
import type { BlocoDoResumo } from "#shared/types/compraResumo";

// O resumo ao vivo desenhado LINHA A LINHA no modo "modelo" (montarResumo(entrada, "modelo")): todos os rótulos, na ordem do formulário; o
// valor vazio aparece como um traço tracejado discreto; a linha do Paciente (negrito no resumo) sai em destaque. Cada linha leva
// data-resumo-linha com o id estável da LinhaDoResumo. O que se COPIA é outra coisa (o modo "copia": só as linhas com valor).
defineProps<{ blocos: readonly BlocoDoResumo[] }>();

// A fonte de emoji dá ao "❗" uma largura maior que o desenho: o ":" parecia ter um espaço antes ("❗ :"). O emoji vai num span próprio, com uma
// margem negativa que cola o ":" nele. SÓ a renderização do painel: o texto da linha (e o texto copiado) não muda.
const AVISO = "❗";
const terminaEmAviso = (rotulo: string): boolean => rotulo.endsWith(AVISO);
const textoDoRotulo = (rotulo: string): string => (terminaEmAviso(rotulo) ? rotulo.slice(0, -AVISO.length) : rotulo);
</script>

<template>
  <section id="compra-resumo" aria-labelledby="compra-resumo-titulo" class="rounded-lg border border-hairline bg-paper-raised p-3.5">
    <h3 id="compra-resumo-titulo" class="text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Resumo (atualiza enquanto você digita)</h3>
    <div id="compra-resumo-texto" class="mt-2.5 flex flex-col gap-3 text-[13px] leading-relaxed text-ink select-text">
      <div v-for="bloco in blocos" :key="bloco.id" :data-resumo-bloco="bloco.id" class="flex flex-col gap-0.5">
        <template v-for="linha in bloco.linhas" :key="linha.id">
          <h4 v-if="linha.rotulo === ''" :data-resumo-linha="linha.id" class="font-display text-[15px] font-semibold text-ink">{{ linha.valor }}</h4>
          <p v-else :data-resumo-linha="linha.id" :data-vazio="linha.vazio ? 'true' : undefined" class="flex flex-wrap items-baseline gap-x-1.5">
            <span data-resumo-rotulo :class="['whitespace-nowrap', linha.vazio ? 'text-ink-soft' : 'font-medium text-ink-soft']"
              >{{ textoDoRotulo(linha.rotulo)
              }}<span v-if="terminaEmAviso(linha.rotulo)" data-emoji-aviso class="-mr-[0.3em] inline-block">❗</span
              ><template v-if="linha.vazio || linha.valor !== ''">:</template></span
            >
            {{ " " }}
            <span
              v-if="linha.vazio"
              data-resumo-vazio
              class="inline-block h-0 w-10 translate-y-[-0.2em] border-b border-dashed border-ink-soft/50"
              aria-label="vazio"
              role="img"
            />
            <span v-else-if="linha.valor !== ''" :class="linha.negrito ? 'rounded bg-farm-blue-soft px-1.5 py-0.5 font-semibold text-ink' : 'text-ink'">{{ linha.valor }}</span>
          </p>
        </template>
      </div>
    </div>
  </section>
</template>
