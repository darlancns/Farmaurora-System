<script setup lang="ts">
import { computed } from "vue";
import { COMPRA_MAX_ITENS_POR_ORDEM } from "#shared/constants/compra";
import { MODAIS_ENVIO } from "#shared/constants/processos";
import type { ItemCompra, OrdemCompra } from "#shared/types/compra";
import { chaveCadastro } from "#shared/utils/cadastroNome";
import { diaDoEncaminhamento } from "#shared/utils/compraChecklist";
import { itemVazio } from "#shared/utils/compraForm";
import type { AppSelectOption } from "../../types/appSelect";
import type { OpcoesFormulario } from "../../utils/comprasBlocos";
import { BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import { INPUT_MONO_CLASS, LABEL_CLASS, SELECT_CAMPO_CLASS } from "../../utils/processoFormClasses";
import AppSelect from "../AppSelect.vue";
import CampoDinheiro from "./CampoDinheiro.vue";
import CompraItemLinha from "./CompraItemLinha.vue";

// O cartão de UMA ordem ("Ordem N"): Fornecedor, Envio, Cia. aérea, PO, Frete, Frete real e os medicamentos (CompraItemLinha). Cada
// ordem vira uma linha da DIR com o seu PO. `v-for` das linhas com :key = id do item: remover o do meio nunca troca o valor digitado
// em outra linha. Quem guarda o estado é o pai (BlocoOrdens): aqui só se avisa a ordem nova inteira (`atualizar`).
const props = defineProps<{
  ordem: OrdemCompra;
  /** A posição na tela (1..N) para o cabeçalho. */
  numero: number;
  /** O botão "Remover ordem" existe (só a partir da 2ª). */
  podeRemover: boolean;
  desabilitado: boolean;
  opcoes: OpcoesFormulario;
}>();

const emit = defineEmits<{
  atualizar: [ordem: OrdemCompra];
  remover: [];
}>();

const idCampo = (nome: string): string => `ordem-${props.ordem.id}-${nome}`;
const encaminhada = computed(() => props.ordem.dirId !== null && props.ordem.dirId.trim() !== "");
const dia = computed(() => diaDoEncaminhamento(props.ordem.encaminhadaEm));
const noLimite = computed(() => props.ordem.itens.length >= COMPRA_MAX_ITENS_POR_ORDEM);

/** Select com "Selecione" + os itens; um valor que não está na lista (antigo, ou desativado depois) continua aparecendo. */
function opcoesDe(nomes: readonly string[], atual: string, comChave = false): AppSelectOption<string>[] {
  const lista: AppSelectOption<string>[] = [{ value: "", label: "Selecione" }, ...nomes.map((n) => ({ value: n, label: n }))];
  const a = atual.trim();
  const existe = comChave ? nomes.some((n) => chaveCadastro(n) === chaveCadastro(a)) : nomes.includes(atual);
  if (a !== "" && !existe) lista.push({ value: atual, label: a });
  return lista;
}
const fornecedorOptions = computed(() =>
  opcoesDe(
    props.opcoes.fornecedores.map((f) => f.nome),
    props.ordem.fornecedor,
    true,
  ),
);
const envioOptions = computed(() => opcoesDe(MODAIS_ENVIO, props.ordem.envio));
const ciaOptions = computed(() =>
  opcoesDe(
    props.opcoes.ciasAereas.map((c) => c.nome),
    props.ordem.cia,
    true,
  ),
);

function mudar(mudancas: Partial<OrdemCompra>): void {
  emit("atualizar", { ...props.ordem, ...mudancas });
}

function atualizarItem(id: string, mudancas: Partial<ItemCompra>): void {
  mudar({ itens: props.ordem.itens.map((i) => (i.id === id ? { ...i, ...mudancas } : i)) });
}

function removerItem(id: string): void {
  mudar({ itens: props.ordem.itens.filter((i) => i.id !== id).map((i, j) => ({ ...i, posicao: j + 1 })) });
}

function adicionarItem(): void {
  if (noLimite.value) return;
  mudar({ itens: [...props.ordem.itens, itemVazio(props.ordem.itens.length + 1)] });
}

// O PO vai em maiúsculas e sem espaços enquanto se digita (o formato inválido só aparece no checklist).
function aoDigitarPo(event: Event): void {
  mudar({ po: (event.target as HTMLInputElement).value.toUpperCase().replace(/\s+/g, "") });
}
</script>

<template>
  <section :id="`ordem-${ordem.id}`" data-ordem-cartao :aria-label="`Ordem ${numero}`" class="rounded-lg border border-hairline bg-paper-raised p-3.5">
    <header class="mb-3 flex flex-wrap items-center gap-2">
      <h3 class="text-[13px] font-semibold text-ink">Ordem {{ numero }}</h3>
      <span v-if="encaminhada" :id="idCampo('encaminhada')" class="rounded-full bg-farm-blue-soft px-2 py-0.5 text-[11px] font-semibold text-farm-blue">
        {{ dia ? `Encaminhada em ${dia}` : "Encaminhada" }}
      </span>
      <span class="ml-auto" />
      <button
        v-if="podeRemover"
        :id="idCampo('remover')"
        type="button"
        :disabled="desabilitado || encaminhada"
        :title="encaminhada ? 'Já encaminhada para a DIR' : undefined"
        :class="BOTAO_SECUNDARIO_CLASS"
        @click="emit('remover')"
      >
        Remover ordem
      </button>
    </header>

    <!-- Celular: 1 coluna, e Frete + Frete real lado a lado (cabem em 2); sm: 2 colunas; xl: 4. -->
    <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <div :class="[SELECT_CAMPO_CLASS, 'col-span-2 sm:col-span-1']">
        <label :for="idCampo('fornecedor')" :class="LABEL_CLASS">Fornecedor</label>
        <AppSelect :id="idCampo('fornecedor')" :model-value="ordem.fornecedor" :options="fornecedorOptions" :disabled="desabilitado" @update:model-value="(v: string) => mudar({ fornecedor: v })" />
      </div>
      <div :class="[SELECT_CAMPO_CLASS, 'col-span-2 sm:col-span-1']">
        <label :for="idCampo('envio')" :class="LABEL_CLASS">Envio</label>
        <AppSelect :id="idCampo('envio')" :model-value="ordem.envio" :options="envioOptions" :disabled="desabilitado" @update:model-value="(v: string) => mudar({ envio: v })" />
      </div>
      <div :class="[SELECT_CAMPO_CLASS, 'col-span-2 sm:col-span-1']">
        <label :for="idCampo('cia')" :class="LABEL_CLASS">Cia. aérea</label>
        <AppSelect :id="idCampo('cia')" :model-value="ordem.cia" :options="ciaOptions" :disabled="desabilitado" @update:model-value="(v: string) => mudar({ cia: v })" />
      </div>
      <div class="col-span-2 sm:col-span-1">
        <label :for="idCampo('po')" :class="LABEL_CLASS">PO</label>
        <input
          :id="idCampo('po')"
          type="text"
          maxlength="12"
          placeholder="PO26-11-0000"
          :class="INPUT_MONO_CLASS"
          :value="ordem.po"
          :disabled="desabilitado"
          autocomplete="off"
          @input="aoDigitarPo"
        />
        <p class="mt-1 text-[11px] text-ink-soft">Pode ficar para depois.</p>
      </div>
      <div>
        <label :for="idCampo('frete')" :class="LABEL_CLASS">Frete (US$)</label>
        <CampoDinheiro :id="idCampo('frete')" :model-value="ordem.frete" :disabled="desabilitado" @update:model-value="(v: number | null) => mudar({ frete: v })" />
      </div>
      <div>
        <label :for="idCampo('frete-real')" :class="LABEL_CLASS">Frete real (US$)</label>
        <CampoDinheiro :id="idCampo('frete-real')" :model-value="ordem.freteReal" :disabled="desabilitado" @update:model-value="(v: number | null) => mudar({ freteReal: v })" />
      </div>
    </div>

    <div class="mt-4 flex flex-col gap-2">
      <h4 class="text-[11px] font-semibold tracking-wide text-ink-soft uppercase">Medicamentos</h4>
      <CompraItemLinha
        v-for="(item, indice) in ordem.itens"
        :key="item.id"
        :item="item"
        :pode-remover="indice > 0"
        :desabilitado="desabilitado"
        :temperaturas="opcoes.temperaturas"
        @atualizar="(m: Partial<ItemCompra>) => atualizarItem(item.id, m)"
        @remover="removerItem(item.id)"
      />
      <div v-if="!desabilitado" class="flex items-center gap-2">
        <button :id="idCampo('adicionar-item')" type="button" :disabled="noLimite" :title="noLimite ? 'Limite de 30 medicamentos por ordem' : undefined" :class="BOTAO_SECUNDARIO_CLASS" @click="adicionarItem">
          + Adicionar medicamento
        </button>
        <span v-if="noLimite" class="text-[11.5px] text-ink-soft">Limite de {{ COMPRA_MAX_ITENS_POR_ORDEM }} medicamentos por ordem.</span>
      </div>
    </div>
  </section>
</template>
