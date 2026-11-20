<script setup lang="ts">
import { computed } from "vue";
import type { Compra, LinhaDaPrevia } from "#shared/types/compra";
import { diaDoEncaminhamento } from "#shared/utils/compraChecklist";
import type { EstadoPainelEncaminhar } from "../../composables/useEncaminharCompra";
import { MENSAGEM_JA_ENCAMINHADA, chaveConfirmacao, itensDaConferencia, rotuloBotaoEncaminhar, rotuloLinhas, textoCriadas, textoSerao } from "../../utils/comprasEncaminhar";
import { BOTAO_PRIMARIO_CLASS, BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import CompraChecklistPainel from "./CompraChecklistPainel.vue";

// O PAINEL "Encaminhar para a DIR" (a coluna direita troca o resumo por ele; o formulário ao lado segue editável). Só DESENHA: o estado vem de
// useEncaminharCompra (`painel`) e as ações voltam por eventos. Mostra: a conferência (erros da prévia clicáveis, avisos e itens ok), UMA
// linha por ordem ("Linha N da DIR": o que a DIR vai receber), a caixa obrigatória da temperatura mista, o botão e o resultado.
const props = defineProps<{
  painel: EstadoPainelEncaminhar;
  compra: Compra;
}>();

const emit = defineEmits<{
  voltar: [];
  enviar: [];
  confirmar: [chave: string, valor: boolean];
  irParaCampo: [campo: string];
  recarregar: [];
}>();

const itens = computed(() => itensDaConferencia(props.painel.previa, props.compra));
const pronta = computed(() => !itens.value.some((i) => i.nivel === "erro"));
const criadas = computed(() => (props.painel.resultado?.tipo === "criadas" ? props.painel.resultado.criadas : []));

const diaDaOrdem = (linha: LinhaDaPrevia): string => diaDoEncaminhamento(props.compra.ordens.find((o) => o.id === linha.ordemId)?.encaminhadaEm ?? null);
const confirmada = (linha: LinhaDaPrevia): boolean => props.painel.confirmadas.includes(chaveConfirmacao(linha));

/** O rótulo e o valor de cada linha da lista. Cia aérea, despachante e observação só aparecem quando há valor; o resto sempre (vazio vira "—"). */
function camposDaLinha(linha: LinhaDaPrevia): Array<{ rotulo: string; valor: string }> {
  const d = linha.dir;
  const sempre = (rotulo: string, valor: string): { rotulo: string; valor: string } => ({ rotulo, valor: valor.trim() === "" ? "—" : valor });
  const seHouver = (rotulo: string, valor: string): Array<{ rotulo: string; valor: string }> => (valor.trim() === "" ? [] : [{ rotulo, valor }]);
  return [
    sempre("PO", d.po),
    sempre("Paciente", d.paciente),
    sempre("Medicamento", d.medicamento),
    sempre("Fornecedor", d.fornecedor),
    sempre("Envio", d.envio),
    ...seHouver("Cia aérea", d.companhiaAerea),
    ...seHouver("Despachante", d.despachante),
    sempre("Vendedor", d.vendedor),
    sempre("Responsável", d.responsavel),
    ...seHouver("Observação", d.observacao),
    sempre("Status", d.status ?? ""),
  ];
}

const CHIP_CLASS = "rounded-full bg-farm-blue-soft px-2 py-0.5 text-[11px] font-semibold text-farm-blue";
</script>

<template>
  <section id="compra-encaminhar" aria-labelledby="compra-encaminhar-titulo" class="flex flex-col gap-4">
    <header class="flex flex-col gap-1.5">
      <button id="btn-encaminhar-voltar" type="button" class="-ml-1 flex min-h-11 w-fit items-center rounded-md px-1 text-[13px] font-semibold text-accent-dark hover:bg-paper lg:min-h-0" @click="emit('voltar')">
        ‹ Voltar ao resumo
      </button>
      <h3 id="compra-encaminhar-titulo" class="font-display text-[17px] font-semibold text-ink">Encaminhar para a DIR</h3>
      <p v-if="!painel.resultado" id="encaminhar-intro" class="text-[12.5px] text-ink-soft">{{ textoSerao(painel.linhasPendentes) }}</p>
    </header>

    <!-- O resultado: nada mais a conferir. -->
    <div v-if="painel.resultado" id="encaminhar-resultado" role="status" class="flex flex-col gap-3 rounded-lg border border-green-300 bg-green-50 p-3.5">
      <template v-if="painel.resultado.tipo === 'criadas'">
        <p id="encaminhar-resultado-titulo" class="text-[13px] font-semibold text-green-900">{{ textoCriadas(criadas.length) }}</p>
        <ul id="encaminhar-resultado-pos" class="flex flex-col gap-1 font-mono text-[12.5px] text-ink">
          <li v-for="c in criadas" :key="c.ordemId" :data-po="c.po">{{ c.po }}</li>
        </ul>
      </template>
      <p v-else id="encaminhar-ja-encaminhada" class="text-[13px] font-semibold text-ink">{{ MENSAGEM_JA_ENCAMINHADA }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <button id="btn-encaminhar-voltar-resultado" type="button" :class="BOTAO_SECUNDARIO_CLASS" @click="emit('voltar')">Voltar ao resumo</button>
        <NuxtLink id="link-abrir-dir" to="/dir" :class="[BOTAO_PRIMARIO_CLASS, 'inline-flex items-center']">Abrir a DIR</NuxtLink>
      </div>
    </div>

    <template v-else>
      <p v-if="painel.carregando" id="encaminhar-carregando" role="status" class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[12.5px] text-ink-soft">Carregando…</p>

      <div v-else-if="painel.erroPrevia && !painel.previa" id="encaminhar-erro-previa" role="alert" class="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3.5 text-[12.5px] text-danger">
        <p>{{ painel.erroPrevia }}</p>
        <button id="btn-encaminhar-previa-tentar" type="button" :class="[BOTAO_SECUNDARIO_CLASS, 'w-fit']" @click="emit('recarregar')">Tentar de novo</button>
      </div>

      <template v-else-if="painel.previa">
        <p v-if="painel.erroPrevia" id="encaminhar-erro-previa-atualizar" role="alert" class="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger">
          {{ painel.erroPrevia }}
          <button id="btn-encaminhar-previa-atualizar" type="button" class="font-semibold underline" @click="emit('recarregar')">Tentar de novo</button>
        </p>
        <p v-else-if="painel.atualizando" id="encaminhar-atualizando" role="status" aria-live="polite" class="text-[11.5px] text-ink-soft">Atualizando a conferência…</p>

        <CompraChecklistPainel titulo="Conferência" :itens="itens" :pronta="pronta" @ir-para-campo="(campo: string) => emit('irParaCampo', campo)" />

        <ul id="encaminhar-linhas" class="flex flex-col gap-3" :aria-label="`${rotuloLinhas(painel.previa.linhas.length)} da DIR`">
          <li v-for="linha in painel.previa.linhas" :key="linha.ordemId" :data-linha="linha.ordemId" :data-encaminhada="linha.jaEncaminhada ? 'true' : 'false'">
            <article :class="['rounded-lg border border-hairline p-3.5', linha.jaEncaminhada ? 'bg-hairline/40 text-ink-soft' : 'bg-paper-raised text-ink']">
              <header class="flex flex-wrap items-center gap-2">
                <h4 class="text-[13px] font-semibold">Linha {{ linha.ordemPosicao }} da DIR</h4>
                <span v-if="linha.jaEncaminhada" :id="`encaminhar-encaminhada-${linha.ordemId}`" class="rounded-full bg-hairline px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                  {{ diaDaOrdem(linha) ? `Encaminhada em ${diaDaOrdem(linha)}` : "Encaminhada" }}
                </span>
                <span v-else-if="linha.dir.temperatura" :id="`encaminhar-temperatura-${linha.ordemId}`" :class="CHIP_CLASS">{{ linha.dir.temperatura }}</span>
              </header>

              <dl v-if="!linha.jaEncaminhada" class="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-[12px]">
                <template v-for="campo in camposDaLinha(linha)" :key="campo.rotulo">
                  <dt class="text-ink-soft">{{ campo.rotulo }}</dt>
                  <dd class="break-words" :data-valor="campo.rotulo">{{ campo.valor }}</dd>
                </template>
              </dl>

              <label v-if="!linha.jaEncaminhada && linha.temperaturaMista" :for="`encaminhar-confirma-${linha.ordemId}`" class="mt-3 flex min-h-11 items-start gap-2 rounded-md border border-warning-gold/40 bg-mainz-gold-soft px-2.5 py-2 text-[12.5px] text-ink lg:min-h-0">
                <input
                  :id="`encaminhar-confirma-${linha.ordemId}`"
                  type="checkbox"
                  class="mt-0.5 size-4 shrink-0"
                  :checked="confirmada(linha)"
                  :disabled="painel.enviando"
                  @change="emit('confirmar', chaveConfirmacao(linha), ($event.target as HTMLInputElement).checked)"
                />
                <span>Confirmo a temperatura desta linha: {{ linha.dir.temperatura }}</span>
              </label>
            </article>
          </li>
        </ul>

        <p v-if="painel.erroEnvio" id="encaminhar-erro-envio" role="alert" :data-codigo="painel.erroEnvio.codigo ?? 'falha'" class="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          {{ painel.erroEnvio.mensagem }}
        </p>

        <div class="flex flex-col gap-2">
          <!-- Abaixo de lg o botão fica na barra fixa do pé da tela (com "Voltar"); aqui só o texto de apoio. -->
          <div class="max-lg:hidden">
            <button id="btn-encaminhar-confirmar" type="button" :class="BOTAO_PRIMARIO_CLASS" :disabled="!painel.podeEnviar" aria-describedby="encaminhar-apoio" @click="emit('enviar')">
              {{ painel.enviando ? "Encaminhando…" : rotuloBotaoEncaminhar(painel.linhasPendentes) }}
            </button>
          </div>
          <p id="encaminhar-apoio" class="text-[11.5px] text-ink-soft">
            {{ painel.enviando ? "Enviando para a DIR…" : (painel.motivoBloqueio ?? "Tudo certo: as linhas serão criadas na DIR com status on_going. Repetir é seguro.") }}
          </p>
        </div>
      </template>
    </template>
  </section>
</template>
