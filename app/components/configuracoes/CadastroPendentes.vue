<script setup lang="ts">
import { computed } from "vue";
import type { TemperaturaCadastro } from "#shared/types/Cadastro";
import type { PreCadastroDaLista } from "#shared/types/PreCadastro";
import type { EstadoDaLinha } from "../../composables/usePreCadastros";
import CadastroPendenteLinha from "./CadastroPendenteLinha.vue";

// A seção "Pendentes de aprovação" da aba Medicamentos de Cadastros: os medicamentos que as compras pediram para o Cadastro e que o administrador
// ainda não decidiu. Fica ACIMA da lista de Medicamentos e SÓ aparece quando há o que decidir:
//  - carregando (primeira leitura): uma linha "Carregando…";
//  - erro: a mensagem e "Tentar de novo";
//  - sem pendentes: a seção NÃO é desenhada;
//  - com pendentes: uma linha por pré-cadastro (CadastroPendenteLinha.vue), do pedido mais antigo para o mais novo.
// Só apresenta: tudo o que muda dado é evento do pai (CadastrosTab.vue, via usePreCadastros). IDs fixos (hidratação).

const props = withDefaults(
  defineProps<{
    itens: PreCadastroDaLista[];
    carregando: boolean;
    /** Já houve uma leitura com sucesso (sem isso, "sem itens" ainda não quer dizer "nenhum pendente"). */
    carregou: boolean;
    erro: string | null;
    temperaturas?: TemperaturaCadastro[];
    estados: Record<string, EstadoDaLinha>;
    podeEditar?: boolean;
  }>(),
  { temperaturas: () => [], podeEditar: true },
);

const emit = defineEmits<{
  aprovar: [id: string, ajustes: { nome: string; temperatura: string }];
  vincular: [id: string, nome: string];
  rejeitar: [item: PreCadastroDaLista];
  editou: [id: string];
  recarregar: [];
}>();

const primeiraLeitura = computed(() => props.carregando && !props.carregou && props.itens.length === 0);
const visivel = computed(() => props.itens.length > 0 || props.erro !== null || primeiraLeitura.value);
const contagem = computed(() => (props.itens.length === 1 ? "1 pendente" : `${props.itens.length} pendentes`));
const vazioEstado = (id: string): EstadoDaLinha => props.estados[id] ?? { ocupado: false, conflito: null, erro: null };
</script>

<template>
  <section v-if="visivel" id="cadastro-pendentes" aria-labelledby="cadastro-pendentes-titulo" class="overflow-hidden rounded-lg border border-warning-gold/40 bg-paper-raised">
    <header class="flex items-center gap-2 px-3.5 py-2">
      <h2 id="cadastro-pendentes-titulo" class="min-w-0 text-[12px] font-semibold tracking-wide text-ink-soft uppercase">Pendentes de aprovação</h2>
      <span v-if="itens.length > 0" id="cadastro-pendentes-contagem" class="rounded-full bg-mainz-gold-soft px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap text-ink">{{ contagem }}</span>
    </header>

    <div class="border-t border-hairline">
      <p v-if="primeiraLeitura" id="cadastro-pendentes-carregando" role="status" class="px-3.5 py-4 text-center text-[13px] text-ink-soft">Carregando…</p>

      <div v-else-if="erro" id="cadastro-pendentes-erro" role="alert" class="flex flex-col gap-2 px-3.5 py-3 text-[12.5px] text-danger">
        <p>{{ erro }}</p>
        <button
          id="btn-pendentes-recarregar"
          type="button"
          :disabled="carregando"
          class="self-start rounded-md border border-hairline bg-paper px-3 py-2 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-accent-dark hover:text-accent-dark disabled:opacity-60 max-lg:min-h-11"
          @click="emit('recarregar')"
        >
          Tentar de novo
        </button>
      </div>

      <ul v-if="itens.length > 0" id="cadastro-pendentes-lista" class="flex flex-col">
        <CadastroPendenteLinha
          v-for="item in itens"
          :key="item.id"
          :item="item"
          :temperaturas="temperaturas"
          :estado="vazioEstado(item.id)"
          :pode-editar="podeEditar"
          @aprovar="emit('aprovar', item.id, $event)"
          @vincular="emit('vincular', item.id, $event)"
          @rejeitar="emit('rejeitar', item)"
          @editou="emit('editou', item.id)"
        />
      </ul>
    </div>
  </section>
</template>
