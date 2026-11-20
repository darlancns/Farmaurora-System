import type { MedicamentoDoCadastro, StatusPreCadastro } from "./compra";

// A decisão dos pré-cadastros de medicamento (Configurações → Cadastros → Medicamentos): o que as rotas
// /api/cadastros/pre-medicamentos devolvem e o que a tela envia. O PEDIDO do pré-cadastro (a partir de uma compra) está em
// shared/types/compra.ts (PreCadastroMedicamento, RespostaPreCadastro).

/** Um pré-cadastro como a lista de Cadastros o mostra. */
export interface PreCadastroDaLista {
  id: string;
  nome: string;
  temperatura: string;
  status: StatusPreCadastro;
  /** O título da compra que pediu ("Compra 07 - Novembro/2026"), sem paciente; null quando o pedido não veio de uma compra. */
  compra: string | null;
  compraId: string | null;
  /** Quem pediu (o nome gravado na hora) e quando (ISO, UTC). */
  solicitadoPor: string;
  solicitadoEm: string;
  /** Preenchidos só depois da decisão. */
  decididoPor: string | null;
  decididoEm: string | null;
  /** O medicamento do Cadastro em que a aprovação resultou (criado ou vinculado). */
  cadastroId: string | null;
}

/** GET /api/cadastros/pre-medicamentos?status=: os pré-cadastros nesse estado (padrão pendente), mais antigos primeiro, e quantos são. */
export interface ListaPreCadastros {
  status: StatusPreCadastro;
  total: number;
  itens: PreCadastroDaLista[];
}

/** Corpo do POST .../aprovar. Tudo opcional: sem `nome` e `temperatura` valem os do pedido; `vincularExistente` não cria linha nova no Cadastro. */
export interface AprovarPreCadastroDTO {
  nome?: string;
  temperatura?: string;
  vincularExistente?: boolean;
}

/** Sucesso de aprovar, vincular ou rejeitar. */
export interface RespostaDecisaoPreCadastro {
  preCadastro: PreCadastroDaLista;
  /** Quantos itens de compra apontam para este pré-cadastro (ligados ao medicamento do Cadastro; na rejeição, só os que ficam com o texto livre). */
  itens: number;
  /** Quantas compras tiveram a versão (updated_at) subida por causa disso. */
  compras: number;
  /** Aprovar criou uma linha nova no Cadastro? false ao vincular a um medicamento que já existia (e na rejeição). */
  medicamentoCriado: boolean;
}

export const CODIGO_MEDICAMENTO_JA_CADASTRADO = "medicamento_ja_cadastrado";
export const CODIGO_MEDICAMENTO_INATIVO = "medicamento_inativo";
export const CODIGO_PRE_CADASTRO_JA_DECIDIDO = "pre_cadastro_ja_decidido";

/** O `data` do 409 de aprovar quando o nome já está no Cadastro (ativo ou inativo): o item existente. */
export interface ErroMedicamentoJaCadastrado {
  code: typeof CODIGO_MEDICAMENTO_JA_CADASTRADO | typeof CODIGO_MEDICAMENTO_INATIVO;
  existente: MedicamentoDoCadastro;
}

/** O `data` do 409 de decidir um pré-cadastro que outra pessoa já decidiu: o estado atual dele. */
export interface ErroPreCadastroJaDecidido {
  code: typeof CODIGO_PRE_CADASTRO_JA_DECIDIDO;
  status: StatusPreCadastro;
  preCadastro: PreCadastroDaLista;
}
