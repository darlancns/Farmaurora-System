<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import { TEXTO_PRE_CADASTRO_REJEITADO } from "#shared/constants/compra";
import { NOME_CADASTRO_MAX } from "#shared/constants/cadastros";
import type { ItemCompra } from "#shared/types/compra";
import {
  digitarMedicamento,
  escolherMedicamentoDoCadastro,
  estaForaDoCadastro,
  estaVinculado,
  limparMedicamento,
  montarPedidoPreCadastro,
  nomeInicialParaOCadastro,
  PRE_CADASTRO_SEM_TEMPERATURA,
} from "#shared/utils/compraMedicamento";
import { ACOES_COMPRA_KEY, ACOES_VAZIAS } from "../../utils/comprasContexto";
import { BOTAO_SECUNDARIO_CLASS } from "../../utils/comprasEstilos";
import { BOTAO_REMOVER_CLASS, INPUT_CLASS } from "../../utils/processoFormClasses";
import AppSearchSelect, { type OpcaoBusca } from "../AppSearchSelect.vue";

// UM medicamento: um input só (o nome já com a apresentação: "KEYTRUDA 100mg - 2 vials per box"). Escolher uma sugestão do Cadastro põe o
// nome do Cadastro no campo, com o cursor no FIM para complementar, liga o medicamento (medicamentoCadastroId) e traz a temperatura.
//
// VÍNCULO (Opção A, funções puras de shared/utils/compraMedicamento.ts): continua enquanto o texto COMEÇA com o nome do Cadastro (com limite
// de palavra). Se o começo mudar: o vínculo some, a temperatura que veio do Cadastro é zerada e, logo abaixo deste medicamento, aparece
// "Fora do Cadastro. Nome para o cadastro: [texto editável, até 120] [Pedir cadastro]".
//
// PRÉ-CADASTRO só por pedido EXPLÍCITO (o botão): exige a temperatura escolhida, usa POST /api/compras/pre-cadastro-medicamentos e mostra o
// estado (pendente de aprovação, ou rejeitado). NUNCA dispara sozinho, nem ao escolher a temperatura.
const props = defineProps<{
  item: ItemCompra;
  /** O id do input (fixo: compra-item-<id>-medicamento). */
  idControle: string;
  /** "Medicamento, Med. 2" quando há mais de um; sem isso, o <label for> da linha dá o nome. */
  nomeAcessivel?: string;
  /** Com mais de um medicamento aparece o ✕ de remover (nunca deixa a compra sem nenhum). */
  podeRemover: boolean;
  desabilitado: boolean;
  rotuloMed: string;
}>();

const emit = defineEmits<{
  atualizar: [mudancas: Partial<ItemCompra>];
  remover: [];
}>();

const acoes = inject(ACOES_COMPRA_KEY, ACOES_VAZIAS);

const idNome = computed(() => `compra-item-${props.item.id}-nome-cadastro`);
const idPedir = computed(() => `compra-item-${props.item.id}-pedir-cadastro`);
const idDica = computed(() => `compra-item-${props.item.id}-pedir-dica`);

const foraDoCadastro = computed(() => estaForaDoCadastro(props.item));
const rejeitado = computed(() => props.item.preCadastroId !== null && props.item.preCadastroStatus === "rejeitado");
const pendente = computed(() => props.item.preCadastroId !== null && !rejeitado.value);
const podePedir = computed(() => foraDoCadastro.value && props.item.preCadastroId === null && !props.desabilitado);
const semTemperatura = computed(() => props.item.temperatura.trim() === "");

// O "nome para o cadastro" nasce do texto atual e o acompanha até a pessoa editar o campo; depois disso é dela.
const nomeCadastro = ref(nomeInicialParaOCadastro(props.item.medicamento));
const nomeEditado = ref(false);
watch(
  () => props.item.medicamento,
  (texto) => {
    if (!nomeEditado.value) nomeCadastro.value = nomeInicialParaOCadastro(texto);
  },
);
watch(foraDoCadastro, (agora) => {
  if (!agora) nomeEditado.value = false;
});

const ocupado = ref(false);
const falha = ref<string | null>(null);
let pedido = 0; // cada pedido leva um número: a resposta de um pedido superado é descartada

function aoDigitar(texto: string): void {
  falha.value = null;
  pedido += 1;
  emit("atualizar", digitarMedicamento(props.item, texto));
}

function focarNoFim(): void {
  void nextTick(() => {
    const campo = document.getElementById(props.idControle) as HTMLInputElement | null;
    if (!campo) return;
    campo.focus();
    const fim = campo.value.length;
    try {
      campo.setSelectionRange(fim, fim);
    } catch {
      // campo sem seleção: nada a ajustar
    }
  });
}

function aoEscolher(opcao: OpcaoBusca): void {
  pedido += 1;
  falha.value = null;
  const temperatura = (opcao.extra as { temperatura?: string } | undefined)?.temperatura ?? "";
  emit("atualizar", escolherMedicamentoDoCadastro({ id: opcao.valor, nome: opcao.rotulo, temperatura }));
  focarNoFim();
}

function aoLimpar(): void {
  pedido += 1;
  falha.value = null;
  emit("atualizar", limparMedicamento(props.item));
}

async function pedirCadastro(): Promise<void> {
  if (ocupado.value) return;
  const r = montarPedidoPreCadastro(nomeCadastro.value, props.item.temperatura);
  if (!r.ok) {
    falha.value = r.erro;
    return;
  }
  const meu = ++pedido;
  const texto = props.item.medicamento;
  ocupado.value = true;
  falha.value = null;
  try {
    const res = await acoes.pedirPreCadastro(nomeCadastro.value, props.item.temperatura);
    // Mudou o texto (ou escolheu um do Cadastro) no meio do caminho: esta resposta não vale mais.
    if (meu !== pedido || props.item.medicamento !== texto || props.item.medicamentoCadastroId !== null) return;
    if (res.tipo === "pre-cadastro") {
      emit("atualizar", { preCadastroId: res.id, preCadastroStatus: "pendente" });
    } else {
      emit("atualizar", escolherMedicamentoDoCadastro(res.medicamento));
      acoes.avisar("Já existe no Cadastro: usei o cadastrado");
    }
  } catch (e) {
    if (meu === pedido) falha.value = e instanceof Error && e.message !== "" ? e.message : "Não foi possível pedir o cadastro.";
  } finally {
    ocupado.value = false;
  }
}
</script>

<template>
  <div :id="`compra-item-${item.id}`" data-item-medicamento>
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <AppSearchSelect
          :id="idControle"
          :model-value="item.medicamento"
          :buscar="acoes.buscarMedicamentos"
          :aria-label="nomeAcessivel"
          placeholder="ex.: KEYTRUDA 100mg - 2 vials per box"
          :disabled="desabilitado"
          @digitar="aoDigitar"
          @escolher="aoEscolher"
          @limpar="aoLimpar"
        />
        <p v-if="estaVinculado(item)" :id="`compra-item-${item.id}-do-cadastro`" class="mt-1 text-[11.5px] font-medium text-accent-dark">Do Cadastro</p>
      </div>
      <button
        v-if="podeRemover && !desabilitado"
        :id="`compra-item-${item.id}-remover`"
        type="button"
        :aria-label="`Remover ${rotuloMed}`"
        title="Remover medicamento"
        :class="BOTAO_REMOVER_CLASS"
        @click="emit('remover')"
      >
        ✕
      </button>
    </div>

    <p v-if="rejeitado" :id="`compra-item-${item.id}-pre-cadastro-rejeitado`" class="mt-1.5 text-[12px] font-medium text-warning-gold">{{ TEXTO_PRE_CADASTRO_REJEITADO }}</p>
    <p v-else-if="pendente" :id="`compra-item-${item.id}-pre-cadastro-pendente`" role="status" class="mt-1.5 text-[12px] text-ink-soft">
      Fora do Cadastro. Pedido de cadastro enviado: aguardando aprovação.
    </p>

    <div v-if="podePedir" :id="`compra-item-${item.id}-fora-do-cadastro`" role="group" :aria-label="`Fora do Cadastro: ${rotuloMed}`" class="mt-2 rounded-md border border-hairline bg-paper p-2.5">
      <p class="text-[12px] text-ink-soft">
        <span class="font-semibold text-ink">Fora do Cadastro.</span>
        <label :for="idNome" class="ml-1">Nome para o cadastro:</label>
      </p>
      <div class="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          :id="idNome"
          v-model="nomeCadastro"
          data-sem-maiuscula
          type="text"
          :maxlength="NOME_CADASTRO_MAX"
          autocomplete="off"
          :aria-describedby="semTemperatura ? idDica : undefined"
          :class="[INPUT_CLASS, 'min-w-0 flex-1 basis-56']"
          @input="nomeEditado = true"
        />
        <button
          :id="idPedir"
          type="button"
          :disabled="semTemperatura || ocupado"
          :title="semTemperatura ? PRE_CADASTRO_SEM_TEMPERATURA : 'Pedir o cadastro deste medicamento'"
          :aria-describedby="semTemperatura ? idDica : undefined"
          :class="BOTAO_SECUNDARIO_CLASS"
          @click="pedirCadastro"
        >
          Pedir cadastro
        </button>
      </div>
      <p v-if="semTemperatura" :id="idDica" class="mt-1.5 text-[12px] text-ink-soft">{{ PRE_CADASTRO_SEM_TEMPERATURA }}</p>
      <p v-if="falha" :id="`compra-item-${item.id}-pedir-erro`" role="alert" class="mt-1.5 text-[12px] font-medium text-danger">
        {{ falha }}
        <button v-if="!ocupado && !semTemperatura" type="button" class="font-semibold underline" @click="pedirCadastro">Tentar de novo</button>
      </p>
    </div>
  </div>
</template>
