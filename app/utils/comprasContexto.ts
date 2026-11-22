import type { InjectionKey } from "vue";
import type { OpcaoBusca } from "../components/AppSearchSelect.vue";

// As AÇÕES que as linhas do formulário precisam do servidor (medicamento com busca, pré-cadastro e temperatura nova). O formulário
// as recebe da página e as oferece aos filhos por `provide`/`inject` (o campo de medicamento fica vários níveis abaixo da casca do formulário).

/** O resultado de pedir uma temperatura nova. `inativa` = já existe mas está desativada (nada é selecionado). */
export type ResultadoTemperatura = { tipo: "criada" | "existente"; nome: string } | { tipo: "inativa" };

/** O resultado de pedir o pré-cadastro: guardou (201 ou 200), ou o medicamento JÁ está no Cadastro (409) e a tela passa a usá-lo. */
export type ResultadoPreCadastro =
  | { tipo: "pre-cadastro"; id: string }
  | { tipo: "cadastrado"; medicamento: { id: string; nome: string; temperatura: string } };

export interface AcoesCompra {
  /** Busca medicamentos ATIVOS do Cadastro (GET /api/compras/opcoes?q=...). `valor` é o id do Cadastro; `extra.temperatura` a do Cadastro. */
  buscarMedicamentos: (q: string, sinal: AbortSignal) => Promise<OpcaoBusca[]>;
  /** POST /api/compras/temperaturas { nome }. Erro de rede ou do servidor SOBE (a linha mostra "tentar de novo"). */
  registrarTemperatura: (nome: string) => Promise<ResultadoTemperatura>;
  /** POST /api/compras/pre-cadastro-medicamentos { nome, temperatura, compraId }, com a compra aberta. SÓ por pedido explícito (botão): o nome sai em MAIÚSCULAS e a temperatura é obrigatória. */
  pedirPreCadastro: (nome: string, temperatura: string) => Promise<ResultadoPreCadastro>;
  /** Aviso curto (toast). */
  avisar: (mensagem: string) => void;
}

/** Sem a página por perto (testes de componente isolado): não busca nada e não registra nada. */
export const ACOES_VAZIAS: AcoesCompra = {
  buscarMedicamentos: async () => [],
  registrarTemperatura: async () => {
    throw new Error("Sem conexão com o servidor.");
  },
  pedirPreCadastro: async () => {
    throw new Error("Sem conexão com o servidor.");
  },
  avisar: () => undefined,
};

export const ACOES_COMPRA_KEY: InjectionKey<AcoesCompra> = Symbol("acoes-compra");

/** O valor do select de temperatura que abre o campo "Nova temperatura" ("Outro…"). Nunca é gravado. */
export const VALOR_OUTRA_TEMPERATURA = "__outra_temperatura__";
