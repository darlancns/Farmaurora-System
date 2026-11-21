<script setup lang="ts">
import { computed, inject, ref } from "vue";
import type { ItemCompra, OpcaoNome } from "#shared/types/compra";
import { chaveCadastro } from "#shared/utils/cadastroNome";
import type { AppSelectOption } from "../../types/appSelect";
import { ACOES_COMPRA_KEY, ACOES_VAZIAS, VALOR_OUTRA_TEMPERATURA } from "../../utils/comprasContexto";
import { BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import { INPUT_COMPACTO_CLASS, LABEL_CLASS, SELECT_CAMPO_CLASS } from "../../utils/processoFormClasses";
import AppSelect from "../AppSelect.vue";

// A TEMPERATURA de UM medicamento (AppSelect): as do Cadastro + "Outro…", que abre "Nova temperatura": duplicata (chave sem acento, caixa e
// espaços) só oferece "Usar"; senão POST /api/compras/temperaturas: 201 ou 200 seleciona; 409 (inativa) avisa e não seleciona; erro de rede:
// "Tentar de novo". Escolher a temperatura SÓ grava a temperatura: não dispara pré-cadastro (o pedido é o botão "Pedir cadastro").
const props = defineProps<{
  item: ItemCompra;
  temperaturas: OpcaoNome[];
  idControle: string;
  nomeAcessivel?: string;
  desabilitado: boolean;
}>();

const emit = defineEmits<{ atualizar: [mudancas: Partial<ItemCompra>] }>();

const acoes = inject(ACOES_COMPRA_KEY, ACOES_VAZIAS);

const options = computed<AppSelectOption<string>[]>(() => {
  const lista: AppSelectOption<string>[] = [{ value: "", label: "Selecione" }, ...props.temperaturas.map((t) => ({ value: t.nome, label: t.nome }))];
  // A temperatura do item é texto copiado: um valor que não está na lista (antigo, ou de uma temperatura desativada) continua aparecendo.
  const atual = props.item.temperatura.trim();
  if (atual !== "" && !props.temperaturas.some((t) => t.nome === props.item.temperatura)) lista.push({ value: props.item.temperatura, label: atual });
  if (!props.desabilitado) lista.push({ value: VALOR_OUTRA_TEMPERATURA, label: "Outro…" });
  return lista;
});

const outraAberta = ref(false);
const novaTemperatura = ref("");
const ocupada = ref(false);
type Mensagem = { tipo: "existe"; nome: string } | { tipo: "inativa" } | { tipo: "erro" };
const mensagem = ref<Mensagem | null>(null);

const idNova = computed(() => `${props.idControle}-nova`);

function escolher(nome: string): void {
  emit("atualizar", { temperatura: nome });
}

function aoMudar(valor: string): void {
  if (valor === VALOR_OUTRA_TEMPERATURA) {
    outraAberta.value = true;
    mensagem.value = null;
    return;
  }
  outraAberta.value = false;
  escolher(valor);
}

function fechar(): void {
  outraAberta.value = false;
  novaTemperatura.value = "";
  mensagem.value = null;
}

async function adicionar(): Promise<void> {
  const nome = novaTemperatura.value.trim().replace(/\s+/g, " ");
  if (nome === "" || ocupada.value) return;
  const igual = props.temperaturas.find((t) => chaveCadastro(t.nome) === chaveCadastro(nome));
  if (igual) {
    mensagem.value = { tipo: "existe", nome: igual.nome }; // sem criar: oferece usar a que já existe
    return;
  }
  ocupada.value = true;
  mensagem.value = null;
  try {
    const r = await acoes.registrarTemperatura(nome);
    if (r.tipo === "inativa") {
      mensagem.value = { tipo: "inativa" };
    } else {
      escolher(r.nome);
      fechar();
    }
  } catch {
    mensagem.value = { tipo: "erro" };
  } finally {
    ocupada.value = false;
  }
}

function usarExistente(nome: string): void {
  escolher(nome);
  fechar();
}
</script>

<template>
  <div>
    <div :class="SELECT_CAMPO_CLASS">
      <AppSelect :id="idControle" :model-value="item.temperatura" :options="options" :aria-label="nomeAcessivel" :disabled="desabilitado" @update:model-value="aoMudar" />
    </div>

    <div v-if="outraAberta && !desabilitado" :id="`${idControle}-outra`" class="mt-2 rounded-md border border-hairline bg-paper p-2.5">
      <label :for="idNova" :class="LABEL_CLASS">Nova temperatura</label>
      <div class="flex flex-wrap items-center gap-2">
        <input :id="idNova" v-model="novaTemperatura" type="text" maxlength="120" autocomplete="off" :class="[INPUT_COMPACTO_CLASS, 'max-w-xs flex-1']" @keydown.enter.prevent="adicionar" />
        <button :id="`${idControle}-adicionar`" type="button" :disabled="ocupada" :class="BOTAO_SECUNDARIO_CLASS" @click="adicionar">Adicionar</button>
        <button type="button" class="text-[12px] font-semibold text-ink-soft underline" @click="fechar">Cancelar</button>
      </div>
      <p v-if="mensagem?.tipo === 'existe'" :id="`${idControle}-existe`" role="alert" class="mt-1.5 text-[12px] text-ink">
        Já existe “{{ mensagem.nome }}”: usar essa?
        <button type="button" class="font-semibold underline" @click="usarExistente(mensagem.nome)">Usar</button>
      </p>
      <p v-else-if="mensagem?.tipo === 'inativa'" :id="`${idControle}-inativa`" role="alert" class="mt-1.5 text-[12px] text-danger">
        Essa temperatura existe, mas está desativada. Peça a quem administra os Cadastros.
      </p>
      <p v-else-if="mensagem?.tipo === 'erro'" :id="`${idControle}-erro`" role="alert" class="mt-1.5 text-[12px] text-danger">
        Não foi possível adicionar a temperatura.
        <button type="button" class="font-semibold underline" @click="adicionar">Tentar de novo</button>
      </p>
    </div>
  </div>
</template>
