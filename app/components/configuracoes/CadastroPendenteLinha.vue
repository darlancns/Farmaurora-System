<script setup lang="ts">
import { computed, reactive } from "vue";
import { NOME_CADASTRO_MAX } from "#shared/constants/cadastros";
import type { TemperaturaCadastro } from "#shared/types/Cadastro";
import type { PreCadastroDaLista } from "#shared/types/PreCadastro";
import { nomeEmMaiusculas } from "#shared/utils/cadastroNome";
import { horaMinutoBrasilia } from "#shared/utils/compraMes";
import { dataBrasiliaDe } from "#shared/utils/dataBrasilia";
import type { EstadoDaLinha } from "../../composables/usePreCadastros";
import { montarTemperaturaOptions } from "../../utils/cadastroTemperaturaOptions";
import { SELECT_CAMPO_CLASS } from "../../utils/processoFormClasses";
import AppSelect from "../AppSelect.vue";

// UM pré-cadastro pendente: nome, temperatura, de qual compra veio (só o número, nunca o paciente), quem pediu e quando. O aprovador pode AJUSTAR o
// nome (gravado em MAIÚSCULAS) e a temperatura (só entre as ATIVAS do Cadastro de Temperaturas) antes de aprovar. Só apresenta: aprovar, vincular,
// rejeitar e "editou" são eventos do pai (CadastrosTab.vue, via usePreCadastros). IDs fixos pelo id do pré-cadastro (hidratação).
//
// Nome que já existe no Cadastro (409): a linha mostra "Já existe no Cadastro: X" e o botão "Vincular ao cadastro existente" (que NÃO cria
// linha nova); se o existente está INATIVO, só avisa (reativar é pela chave Ativo da lista de Medicamentos) e não oferece vincular.

const props = withDefaults(
  defineProps<{
    item: PreCadastroDaLista;
    /** Temperaturas do Cadastro (ativas e inativas): as opções do select são só as ativas. */
    temperaturas?: TemperaturaCadastro[];
    estado: EstadoDaLinha;
    podeEditar?: boolean;
  }>(),
  { temperaturas: () => [], podeEditar: true },
);

const emit = defineEmits<{
  aprovar: [ajustes: { nome: string; temperatura: string }];
  vincular: [nome: string];
  rejeitar: [];
  editou: [];
}>();

const form = reactive({ nome: props.item.nome, temperatura: props.item.temperatura });

const id = computed(() => `pendente-${props.item.id}`);
const temperaturaOptions = computed(() => montarTemperaturaOptions(form.temperatura, props.temperaturas));
const nomeVazio = computed(() => form.nome.trim() === "");
const semTemperatura = computed(() => form.temperatura.trim() === "");
const podeAprovar = computed(() => props.podeEditar && !props.estado.ocupado && !nomeVazio.value && !semTemperatura.value);

const compraTexto = computed(() => (props.item.compra ? `Pedido na ${props.item.compra}` : "Pedido sem compra"));
const quando = computed(() => {
  const dia = dataBrasiliaDe(props.item.solicitadoEm);
  if (dia === "") return "";
  const [ano, mes, dd] = dia.split("-");
  return `${dd}/${mes}/${ano} ${horaMinutoBrasilia(props.item.solicitadoEm)}`;
});
const pedidoPor = computed(() => [props.item.solicitadoPor ? `por ${props.item.solicitadoPor}` : "", quando.value ? `em ${quando.value}` : ""].filter((t) => t !== "").join(" "));

function aoDigitarNome(event: Event): void {
  const campo = event.target as HTMLInputElement;
  form.nome = nomeEmMaiusculas(campo.value);
  emit("editou");
}

function aoEscolherTemperatura(valor: string): void {
  form.temperatura = valor;
  emit("editou");
}

function aprovar(): void {
  if (!podeAprovar.value) return;
  emit("aprovar", { nome: form.nome, temperatura: form.temperatura });
}

const CLASSE_CAMPO =
  "w-full rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark disabled:cursor-not-allowed disabled:text-ink-soft max-lg:min-h-11 max-lg:text-[16px]";
const CLASSE_ROTULO = "mb-1.5 block text-[10.5px] text-ink-soft";
const CLASSE_BOTAO_PRIMARIO =
  "rounded-md bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11";
const CLASSE_BOTAO_SECUNDARIO =
  "rounded-md border border-hairline bg-paper px-3.5 py-2 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11";
const CLASSE_BOTAO_VINCULAR =
  "self-start rounded-md border border-accent-dark px-3 py-2 text-[12.5px] font-semibold text-accent-dark transition-colors hover:bg-accent-dark hover:text-white disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11";
</script>

<template>
  <li :id="id" :data-pre-cadastro="item.id" class="flex flex-col gap-3 border-b border-hairline px-3.5 py-3 last:border-b-0">
    <p :id="`${id}-meta`" class="text-[12px] text-ink-soft">
      <span :id="`${id}-compra`" class="font-medium text-ink">{{ compraTexto }}</span>
      <span v-if="pedidoPor"> · {{ pedidoPor }}</span>
    </p>

    <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div>
        <label :for="`${id}-nome`" :class="CLASSE_ROTULO">Nome</label>
        <input
          :id="`${id}-nome`"
          type="text"
          autocomplete="off"
          autocapitalize="characters"
          :maxlength="NOME_CADASTRO_MAX"
          :value="form.nome"
          :disabled="!podeEditar || estado.ocupado"
          :aria-describedby="estado.conflito ? `${id}-conflito` : undefined"
          :aria-invalid="nomeVazio || estado.conflito !== null ? 'true' : undefined"
          :class="CLASSE_CAMPO"
          @input="aoDigitarNome"
        />
      </div>
      <div :class="SELECT_CAMPO_CLASS">
        <label :for="`${id}-temperatura`" :class="CLASSE_ROTULO">Temperatura</label>
        <AppSelect :id="`${id}-temperatura`" :model-value="form.temperatura" :options="temperaturaOptions" :disabled="!podeEditar || estado.ocupado" @update:model-value="aoEscolherTemperatura" />
      </div>
    </div>

    <p v-if="semTemperatura" :id="`${id}-sem-temperatura`" class="text-[11.5px] font-medium text-warning-gold">Escolha a temperatura para aprovar.</p>

    <!-- Nome que já existe no Cadastro: o existente e o que dá para fazer -->
    <div v-if="estado.conflito" :id="`${id}-conflito`" role="alert" :data-conflito="estado.conflito.tipo" class="flex flex-col gap-2 rounded-md border border-warning-gold/40 bg-mainz-gold-soft px-3 py-2 text-[12.5px] text-ink">
      <template v-if="estado.conflito.tipo === 'ja-cadastrado'">
        <p :id="`${id}-conflito-texto`" class="font-medium">Já existe no Cadastro: {{ estado.conflito.existente.nome }}<template v-if="estado.conflito.existente.temperatura"> ({{ estado.conflito.existente.temperatura }})</template></p>
        <button :id="`btn-pendente-vincular-${item.id}`" type="button" :disabled="!podeEditar || estado.ocupado" :class="CLASSE_BOTAO_VINCULAR" @click="emit('vincular', form.nome)">
          Vincular ao cadastro existente
        </button>
      </template>
      <p v-else :id="`${id}-conflito-texto`" class="font-medium">
        Já existe no Cadastro, mas está inativo: {{ estado.conflito.existente.nome }}. Reative-o na lista de Medicamentos para poder vincular, ou aprove com outro nome.
      </p>
    </div>

    <p v-if="estado.erro" :id="`${id}-erro`" role="alert" class="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">{{ estado.erro }}</p>

    <div class="flex flex-wrap items-center gap-2">
      <button :id="`btn-pendente-aprovar-${item.id}`" type="button" :disabled="!podeAprovar" :class="CLASSE_BOTAO_PRIMARIO" @click="aprovar">
        {{ estado.ocupado ? "Aguarde…" : "Aprovar" }}
      </button>
      <button :id="`btn-pendente-rejeitar-${item.id}`" type="button" :disabled="!podeEditar || estado.ocupado" :class="CLASSE_BOTAO_SECUNDARIO" @click="emit('rejeitar')">Rejeitar</button>
    </div>
  </li>
</template>
