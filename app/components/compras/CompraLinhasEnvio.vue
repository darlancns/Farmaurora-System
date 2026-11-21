<script setup lang="ts">
import { computed } from "vue";
import { MODAL_COURIER_SIMPLES } from "#shared/constants/processos";
import type { EmpresaProcesso, ModalEnvio } from "#shared/types/processo";
import type { Compra, MudancasCompra } from "#shared/types/compra";
import { chaveCadastro } from "#shared/utils/cadastroNome";
import { ciaAposTrocaDeEnvio } from "#shared/utils/compraForm";
import type { AppSelectOption } from "../../types/appSelect";
import type { OpcoesFormulario } from "../../utils/comprasOpcoes";
import { LABEL_CLASS, SELECT_CAMPO_CLASS } from "../../utils/processoFormClasses";
import { EMPRESA_OPTIONS, MODAL_ENVIO_OPTIONS, montarCiaAereaOptions } from "../../utils/processoOptions";
import AppSelect from "../AppSelect.vue";
import CompraCampo from "./CompraCampo.vue";

// As linhas 11 a 13 do formulário (a ordem do resumo): Envio (+ Cia aérea ao lado), Fornecedor e CNPJ (a empresa). Envio e Cia usam as MESMAS
// opções do Follow-Up (MODAL_ENVIO_OPTIONS, montarCiaAereaOptions); a Cia é OPCIONAL e depende do modal: ao trocar o envio, a cia que não vale
// para o novo modal é limpa (ciaAposTrocaDeEnvio). Courier Simples: continua valendo a regra do resumo ("Despachante: N/A").
const props = defineProps<{ compra: Compra; desabilitado: boolean; opcoes: OpcoesFormulario }>();
const emit = defineEmits<{ alterar: [mudancas: MudancasCompra] }>();

const ciaOptions = computed(() => montarCiaAereaOptions(props.compra.envio, props.compra.cia));
const semModal = computed(() => props.compra.envio.trim() === "");

function aoTrocarEnvio(envio: ModalEnvio | ""): void {
  emit("alterar", { envio, cia: ciaAposTrocaDeEnvio(envio, props.compra.cia) });
}

// Um fornecedor antigo (que não está mais entre os ativos) continua aparecendo selecionado até a pessoa trocar.
const fornecedorOptions = computed<AppSelectOption<string>[]>(() => {
  const nomes = props.opcoes.fornecedores.map((f) => f.nome);
  const lista: AppSelectOption<string>[] = [{ value: "", label: "Selecione" }, ...nomes.map((n) => ({ value: n, label: n }))];
  const atual = props.compra.fornecedor.trim();
  if (atual !== "" && !nomes.some((n) => chaveCadastro(n) === chaveCadastro(atual))) lista.push({ value: props.compra.fornecedor, label: atual });
  return lista;
});

const ehCourierSimples = computed(() => props.compra.envio === MODAL_COURIER_SIMPLES);
</script>

<template>
  <CompraCampo id-linha="envio" rotulo="Envio">
    <div class="grid gap-3 sm:grid-cols-2">
      <div :class="SELECT_CAMPO_CLASS">
        <label for="compra-envio" :class="LABEL_CLASS">Modal</label>
        <AppSelect id="compra-envio" :model-value="compra.envio" :options="MODAL_ENVIO_OPTIONS" :disabled="desabilitado" @update:model-value="aoTrocarEnvio" />
      </div>
      <div :class="SELECT_CAMPO_CLASS">
        <label for="compra-cia" :class="LABEL_CLASS">Cia aérea (opcional)</label>
        <AppSelect id="compra-cia" :model-value="compra.cia" :options="ciaOptions" :disabled="desabilitado || semModal" @update:model-value="(cia: string) => emit('alterar', { cia })" />
      </div>
    </div>
    <p v-if="ehCourierSimples" id="compra-envio-courier-simples" class="mt-1.5 text-[12px] text-ink-soft">Courier Simples não tem despachante (o resumo diz “Despachante: N/A”).</p>
  </CompraCampo>

  <CompraCampo id-linha="fornecedor" rotulo="Fornecedor" para="compra-fornecedor">
    <div :class="[SELECT_CAMPO_CLASS, 'max-w-md']">
      <AppSelect id="compra-fornecedor" :model-value="compra.fornecedor" :options="fornecedorOptions" :disabled="desabilitado" @update:model-value="(v: string) => emit('alterar', { fornecedor: v })" />
    </div>
  </CompraCampo>

  <CompraCampo id-linha="cnpj" rotulo="CNPJ" para="compra-empresa">
    <div :class="[SELECT_CAMPO_CLASS, 'max-w-xs']">
      <AppSelect id="compra-empresa" :model-value="compra.empresa" :options="EMPRESA_OPTIONS" :disabled="desabilitado" @update:model-value="(v: EmpresaProcesso) => emit('alterar', { empresa: v })" />
    </div>
  </CompraCampo>
</template>
