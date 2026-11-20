<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { useRoute, useRouter } from "#app";
import CompraColunaDireita from "../components/compras/CompraColunaDireita.vue";
import CompraFormulario from "../components/compras/CompraFormulario.vue";
import ComprasListaPainel from "../components/compras/ComprasListaPainel.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import GlobalHeader from "../components/GlobalHeader.vue";
import { useAuth } from "../composables/useAuth";
import { useCompraOpcoes } from "../composables/useCompraOpcoes";
import { useComprasPagina } from "../composables/useComprasPagina";
import { useToast } from "../composables/useToast";
import { mesmaQuery } from "../utils/comprasUrl";

// A página Compras em três colunas: a lista do mês (esquerda), o formulário (centro) e o checklist com o resumo ao vivo (direita).
// Esta etapa só tem o bloco "Paciente e processo" no formulário; os outros entram na 6b. A lógica (trocar de compra com o salvamento
// descarregado, URL, nova/duplicar/cancelar) está em useComprasPagina; aqui só se liga tudo e se desenha.
//
// ACESSO: ler Compras é decidido pela seção "compras" (guarda global + servidor). Quem só LÊ (sócio, ou mapa "ver") vê tudo, sem
// botões de escrita e com os campos desabilitados; a decisão é `canWrite("compras")`, a mesma função do servidor.
const route = useRoute();
const router = useRouter();
const { canWrite } = useAuth();
const { showToast } = useToast();

const podeEditar = computed<boolean>(() => canWrite("compras"));
const opcoes = useCompraOpcoes();

const pagina = useComprasPagina({
  query: route.query,
  podeEditar: () => podeEditar.value,
  avisar: (mensagem) => showToast(mensagem),
  gravarUrl: (query) => {
    if (!mesmaQuery(route.query, query)) void router.replace({ query });
  },
  focarPaciente: () => document.getElementById("compra-paciente")?.focus(),
});

const { lista, editor } = pagina;

// O despachante da compra no Cadastro (telefone, e-mail e contato; nunca PIX): o resumo o usa.
const despachanteCadastro = computed(() => (editor.compra.value ? opcoes.despachantePeloNome(editor.compra.value.despachante) : null));

// Sair da página: descarrega o salvamento pendente; se não der, a navegação fica (e a pessoa é avisada).
onBeforeRouteLeave(async () => (await pagina.antesDeSair()) !== false);

// Fechar ou recarregar a aba com algo ainda não salvo: o navegador pergunta (e o salvamento é disparado já). Quem só lê não tem isso.
function antesDeFecharAAba(event: BeforeUnloadEvent): void {
  if (!podeEditar.value || !editor.temPendencia.value) return;
  void editor.flush();
  event.preventDefault();
  event.returnValue = "";
}

onMounted(async () => {
  window.addEventListener("beforeunload", antesDeFecharAAba);
  await opcoes.carregar();
  await pagina.iniciar();
});
onBeforeUnmount(() => window.removeEventListener("beforeunload", antesDeFecharAAba));
</script>

<template>
  <!-- Desktop (lg+): a página NÃO rola por inteiro; cada coluna rola sozinha dentro da altura da janela menos o cabeçalho (o
       h-full do layout + o lg:-mb-10 que cancela o pb-10 do <main>, como em Prestações). Abaixo de lg as colunas empilham na ordem lista,
       formulário, resumo e a página rola como sempre (o celular de verdade é a etapa 6c). Teto fluido (2200px). -->
  <div id="compras-page" class="mx-auto max-w-fluida pb-20 lg:flex lg:h-full lg:flex-col lg:pb-0">
    <GlobalHeader title="Compras" />

    <div class="grid gap-4 lg:-mb-10 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)_460px]">
      <aside id="compras-coluna-esquerda" class="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1 lg:pb-10">
        <ComprasListaPainel
          :rotulo-mes="lista.rotuloMes.value"
          :total-do-mes="lista.totalDoMes.value"
          :compras="lista.compras.value"
          :totais="lista.totais.value"
          :total="lista.total.value"
          :tem-mais="lista.temMais.value"
          :status="lista.status.value"
          :mostrar-canceladas="lista.mostrarCanceladas.value"
          :selecionada-id="pagina.selecionadaId.value"
          :carregando="lista.carregando.value"
          :carregando-mais="lista.carregandoMais.value"
          :erro="lista.erro.value"
          :pode-editar="podeEditar"
          @anterior="pagina.mesAnterior()"
          @proximo="pagina.mesSeguinte()"
          @status="(s) => pagina.definirStatus(s)"
          @mostrar-canceladas="(v) => pagina.definirMostrarCanceladas(v)"
          @selecionar="(id) => pagina.selecionar(id)"
          @nova="pagina.criarNova()"
          @mostrar-mais="lista.mostrarMais()"
          @recarregar="lista.carregar()"
        />
      </aside>

      <section id="compras-coluna-central" class="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pb-10">
        <p v-if="opcoes.erro.value" id="compras-opcoes-erro" role="alert" class="mb-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          Não foi possível carregar as opções.
          <button type="button" class="font-semibold underline" @click="opcoes.carregar(true)">Tentar de novo</button>
        </p>

        <CompraFormulario
          v-if="editor.compra.value"
          :compra="editor.compra.value"
          :estado="editor.estado.value"
          :salvo-em="editor.salvoEm.value"
          :mensagem-erro="editor.mensagemErro.value"
          :pode-editar="podeEditar"
          :opcoes="opcoes.paraFormulario.value"
          :ocupado="pagina.ocupado.value"
          @alterar="(m) => editor.alterar(m)"
          @duplicar="pagina.duplicar()"
          @cancelar="pagina.pedirCancelar()"
          @tentar-de-novo="editor.tentarDeNovo()"
          @carregar-versao-salva="editor.carregarVersaoSalva()"
          @manter-minhas="editor.manterMinhas()"
        />
        <p v-else id="compras-sem-selecao" class="rounded-lg border border-hairline bg-paper-raised px-4 py-6 text-center text-[13px] text-ink-soft">
          Escolha uma compra ou crie uma nova.
        </p>
      </section>

      <aside id="compras-coluna-direita" class="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pb-10">
        <CompraColunaDireita v-if="editor.compra.value" :compra="editor.compra.value" :despachante-cadastro="despachanteCadastro" />
      </aside>
    </div>

    <ConfirmDialog
      v-if="pagina.confirmandoCancelar.value"
      title="Cancelar compra"
      :message="`Cancelar a ${pagina.tituloParaDialogo()}? Ela continua na lista como cancelada e não poderá mais ser editada.`"
      confirm-label="Cancelar compra"
      cancel-label="Voltar"
      danger
      reforcado
      :loading="pagina.ocupado.value"
      @confirm="pagina.confirmarCancelar()"
      @close="pagina.confirmandoCancelar.value = false"
    />
  </div>
</template>
