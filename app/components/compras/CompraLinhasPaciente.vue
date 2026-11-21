<script setup lang="ts">
import { computed } from "vue";
import { MODAL_COURIER_SIMPLES } from "#shared/constants/processos";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import { chaveCadastro } from "#shared/utils/cadastroNome";
import type { AppSelectOption } from "../../types/appSelect";
import type { OpcoesFormulario } from "../../utils/comprasOpcoes";
import { INPUT_CLASS, SELECT_CAMPO_CLASS } from "../../utils/processoFormClasses";
import AppSelect from "../AppSelect.vue";
import CompraCampo from "./CompraCampo.vue";
import { ROTULOS_DO_FORMULARIO } from "../../utils/comprasRotulos";

// As linhas 16 e 17 do formulário (a ordem do resumo): Paciente (texto livre; o plugin "primeira-maiúscula" cuida da 1ª letra) e Despachante
// (despachantes ativos do Cadastro). Courier Simples (o ENVIO) não tem despachante: a linha continua no lugar, mas em vez do select aparece a
// nota "Dispensado" (o resumo diz "Despachante: N/A"). Abaixo do select, contato, telefone e e-mail do Cadastro (só leitura; NUNCA PIX).
const props = defineProps<{ compra: Compra; desabilitado: boolean; opcoes: OpcoesFormulario }>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const dispensado = computed(() => props.compra.envio === MODAL_COURIER_SIMPLES);

const options = computed<AppSelectOption<string>[]>(() => {
  const nomes = props.opcoes.despachantes.map((d) => d.nome);
  const lista: AppSelectOption<string>[] = [{ value: "", label: "Selecione" }, ...nomes.map((n) => ({ value: n, label: n }))];
  // Um valor antigo (que não está mais entre os ativos) continua aparecendo selecionado até a pessoa trocar.
  const atual = props.compra.despachante.trim();
  if (atual !== "" && !nomes.some((n) => chaveCadastro(n) === chaveCadastro(atual))) lista.push({ value: props.compra.despachante, label: atual });
  return lista;
});

// Os mesmos dados que o resumo usa (compraParaResumoEntrada): o despachante do Cadastro com o MESMO nome da compra.
const apoio = computed<string | null>(() => {
  const chave = chaveCadastro(props.compra.despachante);
  const d = chave === "" ? null : (props.opcoes.despachantes.find((x) => chaveCadastro(x.nome) === chave) ?? null);
  if (!d) return null;
  const partes = [
    { rotulo: "Contato", valor: d.contatoNome },
    { rotulo: "Telefone", valor: d.telefone },
    { rotulo: "E-mail", valor: d.email },
  ]
    .filter((l) => l.valor.trim() !== "")
    .map((l) => `${l.rotulo}: ${l.valor}`);
  return partes.length > 0 ? partes.join(" · ") : null;
});
</script>

<template>
  <CompraCampo id-linha="paciente" :rotulo="ROTULOS_DO_FORMULARIO.paciente" para="compra-paciente">
    <input
      id="compra-paciente"
      type="text"
      maxlength="300"
      :class="INPUT_CLASS"
      :value="compra.paciente"
      :disabled="desabilitado"
      autocomplete="off"
      @input="emit('alterar', { paciente: ($event.target as HTMLInputElement).value })"
    />
  </CompraCampo>

  <CompraCampo id-linha="despachante" :rotulo="ROTULOS_DO_FORMULARIO.despachante" :para="dispensado ? undefined : 'compra-despachante'" :apoio="dispensado ? null : apoio">
    <p v-if="dispensado" id="compra-despachante-dispensado" class="pt-2 text-[13px] text-ink-soft">Dispensado: Courier Simples não tem despachante</p>
    <div v-else :class="[SELECT_CAMPO_CLASS]">
      <AppSelect id="compra-despachante" :model-value="compra.despachante" :options="options" :disabled="desabilitado" @update:model-value="(v: string) => emit('alterar', { despachante: v })" />
    </div>
  </CompraCampo>
</template>
