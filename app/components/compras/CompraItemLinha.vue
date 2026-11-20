<script setup lang="ts">
import { computed, inject, ref } from "vue";
import type { ItemCompra, OpcaoNome } from "#shared/types/compra";
import { chaveCadastro } from "#shared/utils/cadastroNome";
import type { AppSelectOption } from "../../types/appSelect";
import { ACOES_COMPRA_KEY, ACOES_VAZIAS, VALOR_OUTRA_TEMPERATURA } from "../../utils/comprasContexto";
import { BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import { BOTAO_REMOVER_CLASS, INPUT_COMPACTO_CLASS, LABEL_CLASS, SELECT_CAMPO_CLASS } from "../../utils/processoFormClasses";
import AppSearchSelect, { type OpcaoBusca } from "../AppSearchSelect.vue";
import AppSelect from "../AppSelect.vue";
import CampoDinheiro from "./CampoDinheiro.vue";

// UMA linha de medicamento da ordem: Qtd | Medicamento | Apresentação | Valor unit. (US$) | Valor real (US$) | Temperatura | ✕.
// Abaixo, "Detalhes" recolhido (abre sozinho se Referência ou Laboratório estiverem preenchidos). O ✕ não existe no primeiro item
// (um item não pode ser removido se for o único). Os ids dos campos usam o id do item (estável: o `v-for` do pai usa :key = id).
//
// MEDICAMENTO (AppSearchSelect): escolher um do Cadastro grava nome, id do Cadastro e a Temperatura dele (a pessoa pode trocar).
// Texto sem correspondência vira "Usar “X” (fora do Cadastro)": medicamento = X em maiúsculas, sem id do Cadastro, e o pedido de
// pré-cadastro (POST) sai assim que a Temperatura está escolhida (o servidor exige a temperatura). 201/200 guardam o pre_cadastro_id;
// 409 troca pelo medicamento do Cadastro que já existe. Falha de rede: o texto fica e aparece "Tentar de novo" (o autosave segue).
//
// TEMPERATURA (AppSelect): as do Cadastro + "Outro…", que abre "Nova temperatura": duplicata (chave sem acento, caixa e espaços)
// só oferece "Usar"; senão POST: 201 ou 200 seleciona; 409 (inativa) avisa e não seleciona; erro de rede: "Tentar de novo".
const props = defineProps<{
  item: ItemCompra;
  /** O ✕ aparece (todos menos o primeiro). */
  podeRemover: boolean;
  desabilitado: boolean;
  temperaturas: OpcaoNome[];
}>();

const emit = defineEmits<{
  atualizar: [mudancas: Partial<ItemCompra>];
  remover: [];
}>();

const acoes = inject(ACOES_COMPRA_KEY, ACOES_VAZIAS);
const idCampo = (nome: string): string => `item-${props.item.id}-${nome}`;

const foraDoCadastro = computed(() => props.item.medicamento.trim() !== "" && props.item.medicamentoCadastroId === null);

// ── Medicamento ──
const falhaPreCadastro = ref(false);
let pedido = 0; // cada escolha leva um número: a resposta de um pedido superado é descartada

function escolherDoCadastro(opcao: OpcaoBusca): void {
  pedido += 1;
  falhaPreCadastro.value = false;
  const temperatura = (opcao.extra as { temperatura?: string } | undefined)?.temperatura ?? "";
  emit("atualizar", {
    medicamento: opcao.rotulo,
    medicamentoCadastroId: opcao.valor,
    preCadastroId: null,
    ...(temperatura.trim() !== "" ? { temperatura } : {}),
  });
}

async function registrarPreCadastro(nome: string, temperatura: string): Promise<void> {
  if (temperatura.trim() === "") return; // ainda falta a temperatura: o pedido sai quando ela for escolhida
  const meu = ++pedido;
  falhaPreCadastro.value = false;
  try {
    const r = await acoes.pedirPreCadastro(nome, temperatura);
    // Mudou de medicamento no meio do caminho: esta resposta não vale mais.
    if (meu !== pedido || props.item.medicamento !== nome || props.item.medicamentoCadastroId !== null) return;
    if (r.tipo === "pre-cadastro") {
      emit("atualizar", { preCadastroId: r.id });
    } else {
      emit("atualizar", {
        medicamento: r.medicamento.nome,
        medicamentoCadastroId: r.medicamento.id,
        preCadastroId: null,
        ...(r.medicamento.temperatura.trim() !== "" ? { temperatura: r.medicamento.temperatura } : {}),
      });
      acoes.avisar("Já existe no Cadastro: usei o cadastrado");
    }
  } catch {
    if (meu === pedido) falhaPreCadastro.value = true;
  }
}

function usarForaDoCadastro(texto: string): void {
  const nome = texto.trim().replace(/\s+/g, " ").toUpperCase();
  if (nome === "") return;
  const vinhaDoCadastro = props.item.medicamentoCadastroId !== null;
  // A temperatura de um medicamento do Cadastro não vale para um medicamento novo: a pessoa escolhe.
  const temperatura = vinhaDoCadastro ? "" : props.item.temperatura;
  emit("atualizar", { medicamento: nome, medicamentoCadastroId: null, preCadastroId: null, ...(vinhaDoCadastro ? { temperatura: "" } : {}) });
  void registrarPreCadastro(nome, temperatura);
}

function limparMedicamento(): void {
  pedido += 1;
  falhaPreCadastro.value = false;
  emit("atualizar", { medicamento: "", medicamentoCadastroId: null, preCadastroId: null });
}

function tentarPreCadastroDeNovo(): void {
  void registrarPreCadastro(props.item.medicamento, props.item.temperatura);
}

// ── Temperatura ──
const temperaturaOptions = computed<AppSelectOption<string>[]>(() => {
  const lista: AppSelectOption<string>[] = [{ value: "", label: "Selecione" }, ...props.temperaturas.map((t) => ({ value: t.nome, label: t.nome }))];
  // A temperatura do item é texto copiado: um valor que não está na lista (antigo, ou de uma temperatura desativada) continua aparecendo.
  const atual = props.item.temperatura.trim();
  if (atual !== "" && !props.temperaturas.some((t) => t.nome === props.item.temperatura)) lista.push({ value: props.item.temperatura, label: atual });
  if (!props.desabilitado) lista.push({ value: VALOR_OUTRA_TEMPERATURA, label: "Outro…" });
  return lista;
});

const outraAberta = ref(false);
const novaTemperatura = ref("");
const ocupadaTemperatura = ref(false);
type MensagemTemperatura = { tipo: "existe"; nome: string } | { tipo: "inativa" } | { tipo: "erro" };
const mensagemTemperatura = ref<MensagemTemperatura | null>(null);

/** Uma temperatura foi escolhida (da lista, ou criada em "Outro…"): grava e, se o medicamento é de fora do Cadastro, pede o pré-cadastro. */
function escolherTemperatura(nome: string): void {
  emit("atualizar", { temperatura: nome });
  if (foraDoCadastro.value && props.item.preCadastroId === null) void registrarPreCadastro(props.item.medicamento, nome);
}

function aoMudarTemperatura(valor: string): void {
  if (valor === VALOR_OUTRA_TEMPERATURA) {
    outraAberta.value = true;
    mensagemTemperatura.value = null;
    return;
  }
  outraAberta.value = false;
  escolherTemperatura(valor);
}

function fecharOutra(): void {
  outraAberta.value = false;
  novaTemperatura.value = "";
  mensagemTemperatura.value = null;
}

async function adicionarTemperatura(): Promise<void> {
  const nome = novaTemperatura.value.trim().replace(/\s+/g, " ");
  if (nome === "" || ocupadaTemperatura.value) return;
  const igual = props.temperaturas.find((t) => chaveCadastro(t.nome) === chaveCadastro(nome));
  if (igual) {
    mensagemTemperatura.value = { tipo: "existe", nome: igual.nome }; // sem criar: oferece usar a que já existe
    return;
  }
  ocupadaTemperatura.value = true;
  mensagemTemperatura.value = null;
  try {
    const r = await acoes.registrarTemperatura(nome);
    if (r.tipo === "inativa") {
      mensagemTemperatura.value = { tipo: "inativa" };
    } else {
      escolherTemperatura(r.nome);
      fecharOutra();
    }
  } catch {
    mensagemTemperatura.value = { tipo: "erro" };
  } finally {
    ocupadaTemperatura.value = false;
  }
}

function usarExistente(nome: string): void {
  escolherTemperatura(nome);
  fecharOutra();
}

// "Detalhes" abre sozinho se algum estiver preenchido; depois disso quem manda é a pessoa.
const detalhesAbertos = ref(props.item.referencia.trim() !== "" || props.item.laboratorio.trim() !== "");
function aoAlternarDetalhes(event: Event): void {
  detalhesAbertos.value = (event.target as HTMLDetailsElement).open;
}
</script>

<template>
  <!-- Abaixo de lg a linha é um CARTÃO empilhado (Medicamento; Qtd + Temperatura; Valor unit. + Valor real; Apresentação) e o ✕ vai no canto
         de cima, com área de toque de 44px (o cartão ganha uma faixa no topo para ele). Em lg+ é uma linha de 7 colunas. A ordem visual do celular
         vem de `max-lg:order-*` (o DOM segue a ordem das colunas do desktop, que é a do Tab). -->
  <div :id="`item-${item.id}`" data-item-linha class="relative rounded-md border border-hairline/70 bg-paper/40 p-2.5" :class="{ 'max-lg:pt-12': podeRemover && !desabilitado }">
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(6rem,0.7fr)_minmax(11rem,2.2fr)_minmax(8rem,1.2fr)_minmax(6rem,0.8fr)_minmax(6rem,0.8fr)_minmax(9rem,1.3fr)_2.75rem] lg:items-start">
      <div class="max-lg:order-2">
        <label :for="idCampo('quantidade')" :class="LABEL_CLASS">Qtd</label>
        <input
          :id="idCampo('quantidade')"
          type="text"
          maxlength="300"
          placeholder="ex.: 12 ampolas"
          :class="INPUT_COMPACTO_CLASS"
          :value="item.quantidade"
          :disabled="desabilitado"
          autocomplete="off"
          @input="emit('atualizar', { quantidade: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div class="col-span-2 max-lg:order-1 lg:col-span-1">
        <label :for="idCampo('medicamento')" :class="LABEL_CLASS">Medicamento</label>
        <AppSearchSelect
          :id="idCampo('medicamento')"
          :model-value="item.medicamento"
          :buscar="acoes.buscarMedicamentos"
          permitir-novo
          :rotulo-novo="(t: string) => `Usar “${t}” (fora do Cadastro)`"
          :disabled="desabilitado"
          @escolher="escolherDoCadastro"
          @novo="usarForaDoCadastro"
          @limpar="limparMedicamento"
        />
        <p v-if="foraDoCadastro" :id="idCampo('fora-do-cadastro')" class="mt-1 text-[11px] text-ink-soft">
          Fora do Cadastro: entra no pré-cadastro para aprovação.<template v-if="item.temperatura.trim() === ''"> Escolha a temperatura.</template>
        </p>
        <p v-if="falhaPreCadastro" :id="idCampo('falha-pre-cadastro')" role="alert" class="mt-1 text-[11.5px] text-danger">
          Não foi possível registrar no pré-cadastro.
          <button v-if="!desabilitado" type="button" class="font-semibold underline" @click="tentarPreCadastroDeNovo">Tentar de novo</button>
        </p>
      </div>

      <div class="col-span-2 max-lg:order-6 lg:col-span-1">
        <label :for="idCampo('apresentacao')" :class="LABEL_CLASS">Apresentação</label>
        <input
          :id="idCampo('apresentacao')"
          type="text"
          maxlength="300"
          :class="INPUT_COMPACTO_CLASS"
          :value="item.apresentacao"
          :disabled="desabilitado"
          autocomplete="off"
          @input="emit('atualizar', { apresentacao: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div class="max-lg:order-4">
        <label :for="idCampo('valor-unitario')" :class="LABEL_CLASS">Valor unit. (US$)</label>
        <CampoDinheiro :id="idCampo('valor-unitario')" :model-value="item.valorUnitario" :disabled="desabilitado" @update:model-value="(v: number | null) => emit('atualizar', { valorUnitario: v })" />
      </div>

      <div class="max-lg:order-5">
        <label :for="idCampo('valor-real')" :class="LABEL_CLASS">Valor real (US$)</label>
        <CampoDinheiro :id="idCampo('valor-real')" :model-value="item.valorReal" :disabled="desabilitado" @update:model-value="(v: number | null) => emit('atualizar', { valorReal: v })" />
      </div>

      <div :class="[SELECT_CAMPO_CLASS, 'max-lg:order-3 lg:col-span-1']">
        <label :for="idCampo('temperatura')" :class="LABEL_CLASS">Temperatura</label>
        <AppSelect :id="idCampo('temperatura')" :model-value="item.temperatura" :options="temperaturaOptions" :disabled="desabilitado" @update:model-value="aoMudarTemperatura" />
      </div>

      <div class="max-lg:absolute max-lg:top-0 max-lg:right-0 max-lg:order-7 flex items-end justify-end lg:justify-center lg:pt-5">
        <button
          v-if="podeRemover && !desabilitado"
          :id="idCampo('remover')"
          type="button"
          aria-label="Remover medicamento"
          title="Remover medicamento"
          :class="BOTAO_REMOVER_CLASS"
          @click="emit('remover')"
        >
          ✕
        </button>
      </div>
    </div>

    <div v-if="outraAberta && !desabilitado" :id="idCampo('outra-temperatura')" class="mt-2 rounded-md border border-hairline bg-paper-raised p-2.5">
      <label :for="idCampo('nova-temperatura')" :class="LABEL_CLASS">Nova temperatura</label>
      <div class="flex flex-wrap items-center gap-2">
        <input
          :id="idCampo('nova-temperatura')"
          v-model="novaTemperatura"
          type="text"
          maxlength="120"
          :class="[INPUT_COMPACTO_CLASS, 'max-w-xs flex-1']"
          autocomplete="off"
          @keydown.enter.prevent="adicionarTemperatura"
        />
        <button :id="idCampo('adicionar-temperatura')" type="button" :disabled="ocupadaTemperatura" :class="BOTAO_SECUNDARIO_CLASS" @click="adicionarTemperatura">Adicionar</button>
        <button type="button" class="text-[12px] font-semibold text-ink-soft underline" @click="fecharOutra">Cancelar</button>
      </div>
      <p v-if="mensagemTemperatura?.tipo === 'existe'" :id="idCampo('temperatura-existe')" role="alert" class="mt-1.5 text-[12px] text-ink">
        Já existe “{{ mensagemTemperatura.nome }}”: usar essa?
        <button type="button" class="font-semibold underline" @click="usarExistente(mensagemTemperatura.nome)">Usar</button>
      </p>
      <p v-else-if="mensagemTemperatura?.tipo === 'inativa'" :id="idCampo('temperatura-inativa')" role="alert" class="mt-1.5 text-[12px] text-danger">
        Essa temperatura existe, mas está desativada. Peça a quem administra os Cadastros.
      </p>
      <p v-else-if="mensagemTemperatura?.tipo === 'erro'" :id="idCampo('temperatura-erro')" role="alert" class="mt-1.5 text-[12px] text-danger">
        Não foi possível adicionar a temperatura.
        <button type="button" class="font-semibold underline" @click="adicionarTemperatura">Tentar de novo</button>
      </p>
    </div>

    <details class="mt-2" :open="detalhesAbertos" @toggle="aoAlternarDetalhes">
      <summary class="cursor-pointer text-[12px] font-semibold text-ink-soft hover:text-accent-dark">Detalhes</summary>
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label :for="idCampo('referencia')" :class="LABEL_CLASS">Referência/Bioequivalente</label>
          <input
            :id="idCampo('referencia')"
            type="text"
            maxlength="300"
            :class="INPUT_COMPACTO_CLASS"
            :value="item.referencia"
            :disabled="desabilitado"
            autocomplete="off"
            @input="emit('atualizar', { referencia: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <div>
          <label :for="idCampo('laboratorio')" :class="LABEL_CLASS">Laboratório</label>
          <input
            :id="idCampo('laboratorio')"
            type="text"
            maxlength="300"
            :class="INPUT_COMPACTO_CLASS"
            :value="item.laboratorio"
            :disabled="desabilitado"
            autocomplete="off"
            @input="emit('atualizar', { laboratorio: ($event.target as HTMLInputElement).value })"
          />
        </div>
      </div>
    </details>
  </div>
</template>
