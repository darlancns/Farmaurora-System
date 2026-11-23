// Limites e formatos da Compra (validação do salvamento: shared/utils/compraValidacao.ts; o servidor não confia no cliente).

/** Teto de caracteres dos campos de UMA LINHA (paciente, médico, local, entrega, contatos, fornecedor, quantidade...). */
export const COMPRA_LINHA_MAX = 300;
/** Teto das observações (observacoes e termoObservacao) e do total das pendências juntas. */
export const COMPRA_TEXTO_LONGO_MAX = 2000;

/** O medicamento é UM texto só (nome já com a apresentação), gravado como digitado. */
export const COMPRA_MEDICAMENTO_MAX = 300;
/** "Ordens" é só um número digitado, de 1 a este teto. */
export const COMPRA_MAX_ORDENS = 10;
/** Quantos medicamentos cabem numa compra. */
export const COMPRA_MAX_ITENS = 30;
/** Quantas pendências (chips e texto livre) cabem numa compra; cada uma tem até COMPRA_LINHA_MAX caracteres. */
export const COMPRA_MAX_PENDENCIAS = 50;

/** O maior valor de uma coluna numeric(14,2). */
export const COMPRA_VALOR_MAX = 999999999999.99;

/** Id de item: pode vir do cliente (crypto.randomUUID ou um id nosso), então só se aceita um formato seguro e de tamanho limitado. */
export const COMPRA_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;
/** Id de um item do Cadastro ou do pré-cadastro (medicamento_cadastro_id, pre_cadastro_id). */
export const COMPRA_REFERENCIA_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

/** O aviso do medicamento cujo pré-cadastro o administrador REJEITOU: a linha do medicamento mostra este texto; aviso, não erro. */
export const TEXTO_PRE_CADASTRO_REJEITADO = "Pré-cadastro rejeitado: escolha outro medicamento do Cadastro ou mantenha o texto livre";

/** O Nº da compra (combinado e digitado pelo time, nunca gerado): um inteiro de 1 a este teto, único dentro do mês. */
export const COMPRA_NUMERO_MAX = 9999;
/** O `data.code` do 409 "esse número já existe naquele mês" (a tela o distingue do 409 de versão, que traz a compra atual em `data.atual`). */
export const CODIGO_NUMERO_JA_EXISTE = "NUMERO_JA_EXISTE";

/** Mês da lista de compras: AAAA-MM. */
/** O mês mais antigo em que uma compra pode nascer (um mês absurdo, como 1900-01, é recusado). O mais novo é o mês que vem (ver `validarNovaCompra`). */
export const COMPRA_ANO_MES_MINIMO = "2020-01";

export const COMPRA_ANO_MES_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export const COMPRA_MOMENTOS_PAGAMENTO = ["vamos_pagar", "apos_awb"] as const;

// GET /api/compras/opcoes: a lista de medicamentos tem centenas de itens, então vem paginada e com busca (nunca tudo de uma vez).
export const COMPRA_MEDICAMENTOS_LIMITE_PADRAO = 50;
export const COMPRA_MEDICAMENTOS_LIMITE_MAX = 100;
/** Tamanho máximo do texto da busca (`?q=`). */
export const COMPRA_BUSCA_MAX = 80;

// A lista do mês (GET /api/compras): a paginação "mostrar mais". O estado da compra é só derivado: ativa ou cancelada.

/** Compras por página da lista ("mostrar mais" soma outra página de 50). */
export const COMPRA_LISTA_POR_PAGINA = 50;

/**
 * As pendências que viram chip na linha Pendente do formulário (clique para marcar). O que se grava em `pendencias[]` é o RÓTULO do chip
 * marcado (por isso o texto daqui é parte do dado: mudar um rótulo faz as compras antigas passarem a mostrar o texto no campo livre).
 */
export const PENDENCIAS_PADRAO = [
  "Documentos assinados",
  "Comprovante de endereço",
  "Comprovante atualizado",
  "Decisão judicial nova",
  "Termo de recebimento",
  "Transcrição médica",
  "Receita médica",
] as const;
