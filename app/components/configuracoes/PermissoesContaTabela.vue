<script setup lang="ts">
import type { NivelPermissao, SecaoComPermissao } from "#shared/utils/permissoesPagina";
import {
  AVISO_TUDO_NENHUM,
  NIVEIS_NA_TELA,
  ROTULO_NIVEL_PERMISSAO,
  ROTULO_SECAO_PERMISSAO,
  SECOES_NA_TELA,
  TEXTO_AJUDA_PERMISSOES,
  estaTudoNenhum,
  type ValoresPermissoes,
} from "../../utils/contaPermissoesForm";

// Tabela de permissões por página (conta de sócio ou operacional): uma linha por seção, com um grupo de 3 opções
// (Nenhum | Ver | Editar). Só apresentação: quem decide o que enviar é o ContaFormModal.
// Cada linha é um <fieldset role="radiogroup"> com <legend> (nome acessível do grupo) e 3 <input type="radio"> nativos
// (setas movem e marcam; só o marcado entra no Tab). As 3 opções dividem a largura da linha (grid-cols-3, min-w-0, sem
// largura fixa), então cabem em 360px sem rolagem horizontal; abaixo de lg cada opção tem 44px de altura.
const props = defineProps<{
  valores: ValoresPermissoes;
  // Edição de conta sem mapa gravado: a tabela mostra o padrão do cargo.
  padraoDoCargo?: boolean;
  // Edição: mostra "Restaurar padrão do cargo".
  podeRestaurar?: boolean;
}>();

const emit = defineEmits<{
  alterar: [secao: SecaoComPermissao, nivel: NivelPermissao];
  restaurar: [];
}>();

function aoEscolher(secao: SecaoComPermissao, nivel: NivelPermissao): void {
  if (props.valores[secao] === nivel) return;
  emit("alterar", secao, nivel);
}
</script>

<template>
  <div id="permissoes-conta" class="min-w-0">
    <div class="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <span id="permissoes-conta-titulo" class="text-[10.5px] text-ink-soft">Permissões por página</span>
      <span
        v-if="padraoDoCargo"
        id="permissoes-padrao-rotulo"
        class="rounded-full bg-farm-blue-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-dark"
      >
        Padrão do cargo
      </span>
    </div>

    <div class="flex min-w-0 flex-col gap-2.5 rounded-md border border-hairline p-3">
      <fieldset
        v-for="secao in SECOES_NA_TELA"
        :id="`perm-grupo-${secao}`"
        :key="secao"
        role="radiogroup"
        class="m-0 min-w-0 border-0 p-0"
      >
        <legend class="mb-1 p-0 text-[13px] font-medium text-ink">{{ ROTULO_SECAO_PERMISSAO[secao] }}</legend>
        <div class="grid min-w-0 grid-cols-3 gap-1.5">
          <label v-for="nivel in NIVEIS_NA_TELA" :key="nivel" class="relative block min-w-0 cursor-pointer">
            <input
              :id="`perm-${secao}-${nivel}`"
              type="radio"
              :name="`perm-${secao}`"
              :value="nivel"
              :checked="valores[secao] === nivel"
              class="peer sr-only"
              @change="aoEscolher(secao, nivel)"
            />
            <span
              class="flex min-h-11 items-center justify-center rounded-md border border-hairline bg-paper px-1 text-center text-[13px] font-semibold text-ink-soft transition-colors peer-checked:border-accent-dark peer-checked:bg-accent-dark peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-dark lg:min-h-[34px]"
            >
              {{ ROTULO_NIVEL_PERMISSAO[nivel] }}
            </span>
          </label>
        </div>
      </fieldset>
    </div>

    <p v-if="estaTudoNenhum(valores)" id="permissoes-aviso-nenhum" class="mt-1.5 text-[11.5px] font-medium text-warning-gold">
      {{ AVISO_TUDO_NENHUM }}
    </p>
    <p id="permissoes-ajuda" class="mt-1 text-[10.5px] text-ink-soft">{{ TEXTO_AJUDA_PERMISSOES }}</p>

    <button
      v-if="podeRestaurar"
      id="btn-permissoes-restaurar"
      type="button"
      class="mt-2 rounded-md border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-accent-dark transition-colors hover:bg-paper"
      @click="emit('restaurar')"
    >
      Restaurar padrão do cargo
    </button>
  </div>
</template>
