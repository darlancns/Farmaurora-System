import { computed, reactive, ref } from "vue";
import type { MedicamentoDoCadastro, StatusPreCadastro } from "#shared/types/compra";
import {
  CODIGO_MEDICAMENTO_INATIVO,
  CODIGO_MEDICAMENTO_JA_CADASTRADO,
  CODIGO_PRE_CADASTRO_JA_DECIDIDO,
  type ErroMedicamentoJaCadastrado,
  type ErroPreCadastroJaDecidido,
  type ListaPreCadastros,
  type PreCadastroDaLista,
  type RespostaDecisaoPreCadastro,
} from "#shared/types/PreCadastro";
import { ApiError, apiFetch, codigoDoErro } from "../utils/apiFetch";
import { getErrorMessage } from "../utils/errorMessages";

// Os pré-cadastros de medicamento PENDENTES de aprovação (Configurações → Cadastros → Medicamentos). A tela só consome este composable; as
// chamadas são GET /api/cadastros/pre-medicamentos e POST .../:id/aprovar e .../:id/rejeitar (só o administrador; a regra está no servidor).
//
// Decidir (aprovar, vincular ou rejeitar) devolve um RESULTADO em vez de lançar: a tela decide o aviso. Casos:
//  - `decidido`: o pré-cadastro sai da lista (nada é apagado no banco: ele passa a aprovado ou rejeitado);
//  - `conflito`: o nome já existe no Cadastro (409 `medicamento_ja_cadastrado`, ou `medicamento_inativo` ao vincular a um inativo): fica na linha,
//    com o item existente, e a linha oferece "Vincular ao cadastro existente" (se ativo);
//  - `ja-decidido`: outra pessoa decidiu antes (409 `pre_cadastro_ja_decidido`): a lista é relida e a tela avisa com o status atual;
//  - `erro`: qualquer outra falha (422 de validação, rede...): a mensagem fica na linha e o botão segue disponível;
//  - `ocupado`: já há uma decisão em andamento NESTA linha (o segundo clique não envia nada).

export interface ConflitoDeNome {
  /** `ja-cadastrado`: o nome já está no Cadastro e ATIVO (pode vincular); `inativo`: está no Cadastro mas inativo (não vincula). */
  tipo: "ja-cadastrado" | "inativo";
  existente: MedicamentoDoCadastro;
}

export interface EstadoDaLinha {
  ocupado: boolean;
  conflito: ConflitoDeNome | null;
  erro: string | null;
}

export type AcaoDeDecisao = "aprovado" | "vinculado" | "rejeitado";

export type ResultadoDecisao =
  | { tipo: "decidido"; acao: AcaoDeDecisao; resposta: RespostaDecisaoPreCadastro }
  | { tipo: "conflito"; conflito: ConflitoDeNome }
  | { tipo: "ja-decidido"; status: StatusPreCadastro | null; mensagem: string }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "ocupado" };

export const MENSAGEM_FALHA_LISTA = "Não foi possível carregar os pendentes de aprovação.";
export const MENSAGEM_FALHA_DECIDIR = "Não foi possível concluir. Nada foi perdido: tente de novo (repetir é seguro).";

const URL_BASE = "/api/cadastros/pre-medicamentos";
const JSON_HEADERS = { "Content-Type": "application/json" };

function dadosDe(e: unknown): Record<string, unknown> {
  const data = e instanceof ApiError ? e.data : null;
  return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

export function usePreCadastros() {
  const itens = ref<PreCadastroDaLista[]>([]);
  const carregando = ref(false);
  const carregou = ref(false);
  const erro = ref<string | null>(null);
  const linhas = reactive<Record<string, EstadoDaLinha>>({});
  // Número da leitura: uma resposta que chega depois de outra mais nova (ex.: a releitura de um 409) é descartada.
  let leitura = 0;

  /** Quantos pendentes: o contador do título da seção de Medicamentos. */
  const total = computed<number>(() => itens.value.length);

  function estadoDa(id: string): EstadoDaLinha {
    if (!linhas[id]) linhas[id] = { ocupado: false, conflito: null, erro: null };
    return linhas[id]!;
  }

  async function carregar(): Promise<void> {
    const minha = ++leitura;
    carregando.value = true;
    erro.value = null;
    try {
      const lista = await apiFetch<ListaPreCadastros>(`${URL_BASE}?status=pendente`, undefined, MENSAGEM_FALHA_LISTA);
      if (minha !== leitura) return;
      // Uma resposta fora do formato (nunca vem do servidor) vale lista vazia, não quebra a aba.
      itens.value = Array.isArray(lista?.itens) ? lista.itens : [];
      for (const id of Object.keys(linhas)) if (!itens.value.some((i) => i.id === id)) delete linhas[id];
      carregou.value = true;
    } catch (e) {
      if (minha !== leitura) return;
      erro.value = getErrorMessage(e, MENSAGEM_FALHA_LISTA);
    } finally {
      if (minha === leitura) carregando.value = false;
    }
  }

  function tirarDaLista(id: string): void {
    itens.value = itens.value.filter((i) => i.id !== id);
    delete linhas[id];
  }

  function limparConflito(id: string): void {
    const linha = linhas[id];
    if (linha) {
      linha.conflito = null;
      linha.erro = null;
    }
  }

  async function decidir(id: string, acao: AcaoDeDecisao, chamada: () => Promise<RespostaDecisaoPreCadastro>): Promise<ResultadoDecisao> {
    const linha = estadoDa(id);
    if (linha.ocupado) return { tipo: "ocupado" };
    linha.ocupado = true;
    linha.erro = null;
    try {
      const resposta = await chamada();
      tirarDaLista(id);
      return { tipo: "decidido", acao, resposta };
    } catch (e) {
      const codigo = codigoDoErro(e);
      if (codigo === CODIGO_MEDICAMENTO_JA_CADASTRADO || codigo === CODIGO_MEDICAMENTO_INATIVO) {
        const existente = (dadosDe(e) as Partial<ErroMedicamentoJaCadastrado>).existente;
        if (existente) {
          const conflito: ConflitoDeNome = { tipo: existente.ativo === true && codigo === CODIGO_MEDICAMENTO_JA_CADASTRADO ? "ja-cadastrado" : "inativo", existente };
          linha.conflito = conflito;
          return { tipo: "conflito", conflito };
        }
      }
      if (codigo === CODIGO_PRE_CADASTRO_JA_DECIDIDO) {
        const status = (dadosDe(e) as Partial<ErroPreCadastroJaDecidido>).status ?? null;
        const mensagem = e instanceof Error ? e.message : "Este pré-cadastro já foi decidido por outra pessoa.";
        // Segue na lista só até a releitura confirmar; se ela falhar, sai daqui mesmo (já foi decidido: não há o que fazer nele).
        tirarDaLista(id);
        await carregar();
        return { tipo: "ja-decidido", status, mensagem };
      }
      // 4xx: a mensagem do servidor (ex.: a de validação); 5xx: o texto padrão (nada vaza); rede: "Erro de conexão com o servidor".
      const mensagem = e instanceof ApiError ? (e.status < 500 ? e.message : MENSAGEM_FALHA_DECIDIR) : getErrorMessage(e, MENSAGEM_FALHA_DECIDIR);
      linha.erro = mensagem;
      return { tipo: "erro", mensagem };
    } finally {
      // A linha pode ter saído da lista (decidida): só solta o `ocupado` se ainda existe.
      if (linhas[id]) linhas[id]!.ocupado = false;
    }
  }

  /** Aprova: cria o medicamento no Cadastro com o nome e a temperatura (que o aprovador pode ter ajustado) e liga os itens das compras. */
  function aprovar(id: string, ajustes: { nome: string; temperatura: string }): Promise<ResultadoDecisao> {
    return decidir(id, "aprovado", () =>
      apiFetch<RespostaDecisaoPreCadastro>(`${URL_BASE}/${encodeURIComponent(id)}/aprovar`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(ajustes) }, MENSAGEM_FALHA_DECIDIR),
    );
  }

  /** Vincula ao medicamento que JÁ está no Cadastro com esse nome: não cria linha nova, só liga os itens e marca aprovado. */
  function vincular(id: string, nome: string): Promise<ResultadoDecisao> {
    return decidir(id, "vinculado", () =>
      apiFetch<RespostaDecisaoPreCadastro>(`${URL_BASE}/${encodeURIComponent(id)}/aprovar`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ nome, vincularExistente: true }) }, MENSAGEM_FALHA_DECIDIR),
    );
  }

  /** Rejeita (nunca apaga): os itens das compras seguem com o nome digitado e passam a mostrar o aviso de rejeitado. */
  function rejeitar(id: string): Promise<ResultadoDecisao> {
    return decidir(id, "rejeitado", () =>
      apiFetch<RespostaDecisaoPreCadastro>(`${URL_BASE}/${encodeURIComponent(id)}/rejeitar`, { method: "POST" }, MENSAGEM_FALHA_DECIDIR),
    );
  }

  return { itens, total, carregando, carregou, erro, linhas, estadoDa, carregar, aprovar, vincular, rejeitar, limparConflito };
}
