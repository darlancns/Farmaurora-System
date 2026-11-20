<script setup lang="ts">
import { computed } from "vue";
import type { MudancasCompra } from "#shared/types/compra";
import { chaveCadastro } from "#shared/utils/cadastroNome";
import { courierSimplesDasOrdens } from "#shared/utils/compraForm";
import type { AppSelectOption } from "../../../types/appSelect";
import type { PropsBloco } from "../../../utils/comprasBlocos";
import { LABEL_CLASS, SELECT_CAMPO_CLASS } from "../../../utils/processoFormClasses";
import AppSelect from "../../AppSelect.vue";

// Bloco `despachante`: o Despachante (despachantes ativos do Cadastro). Quando TODAS as ordens são Courier Simples o campo some e
// aparece a nota "Dispensado: todas as ordens são Courier Simples" (o courier_simples da compra é DERIVADO disso pelo editor: não é
// campo editável). Abaixo do select, contato, telefone e e-mail do Cadastro (só leitura, os mesmos dados que o resumo usa; NUNCA PIX).
const props = defineProps<PropsBloco>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const dispensado = computed(() => courierSimplesDasOrdens(props.compra.ordens));

const options = computed<AppSelectOption<string>[]>(() => {
  const nomes = props.opcoes.despachantes.map((d) => d.nome);
  const lista: AppSelectOption<string>[] = [{ value: "", label: "Selecione" }, ...nomes.map((n) => ({ value: n, label: n }))];
  // Um valor antigo (que não está mais entre os ativos) continua aparecendo selecionado até a pessoa trocar.
  const atual = props.compra.despachante.trim();
  if (atual !== "" && !nomes.some((n) => chaveCadastro(n) === chaveCadastro(atual))) lista.push({ value: props.compra.despachante, label: atual });
  return lista;
});

// Os mesmos dados que o resumo usa (compraParaResumoEntrada): o despachante do Cadastro com o MESMO nome da compra.
const cadastro = computed(() => {
  const chave = chaveCadastro(props.compra.despachante);
  return chave === "" ? null : (props.opcoes.despachantes.find((d) => chaveCadastro(d.nome) === chave) ?? null);
});
const apoio = computed(() => {
  const d = cadastro.value;
  if (!d) return [];
  return [
    { rotulo: "Contato", valor: d.contatoNome },
    { rotulo: "Telefone", valor: d.telefone },
    { rotulo: "E-mail", valor: d.email },
  ].filter((l) => l.valor.trim() !== "");
});
</script>

<template>
  <div data-bloco="despachante" class="contents">
    <p v-if="dispensado" id="compra-despachante-dispensado" class="rounded-md border border-hairline bg-paper px-3 py-2 text-[13px] text-ink-soft sm:col-span-2 xl:col-span-4">
      Dispensado: todas as ordens são Courier Simples
    </p>
    <div v-else :class="[SELECT_CAMPO_CLASS, 'sm:col-span-2']">
      <label for="compra-despachante" :class="LABEL_CLASS">Despachante</label>
      <AppSelect id="compra-despachante" data-campo="despachante" :model-value="compra.despachante" :options="options" :disabled="desabilitado" @update:model-value="(v: string) => emit('alterar', { despachante: v })" />
      <p v-if="apoio.length > 0" id="compra-despachante-contato" class="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-ink-soft">
        <span v-for="linha in apoio" :key="linha.rotulo">{{ linha.rotulo }}: {{ linha.valor }}</span>
      </p>
    </div>
  </div>
</template>
