// Limites e formatos da Compra (validação do salvamento: shared/utils/compraValidacao.ts; o servidor não confia no cliente).

/** Teto de caracteres dos campos de UMA LINHA (paciente, médico, local, entrega, contatos, fornecedor, medicamento, quantidade...). */
export const COMPRA_LINHA_MAX = 300;
/** Teto das observações (observacoes e termoObservacao) e do total das pendências juntas. */
export const COMPRA_TEXTO_LONGO_MAX = 2000;

export const COMPRA_MAX_ORDENS = 10;
export const COMPRA_MAX_ITENS_POR_ORDEM = 30;
/** Quantas pendências (chips e texto livre) cabem numa compra; cada uma tem até COMPRA_LINHA_MAX caracteres. */
export const COMPRA_MAX_PENDENCIAS = 50;

/** O maior valor de uma coluna numeric(14,2). */
export const COMPRA_VALOR_MAX = 999999999999.99;

/** Id de ordem ou item: pode vir do cliente (crypto.randomUUID ou um id nosso), então só se aceita um formato seguro e de tamanho limitado. */
export const COMPRA_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;
/** Id de um item do Cadastro ou do pré-cadastro (medicamento_cadastro_id, pre_cadastro_id). */
export const COMPRA_REFERENCIA_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

/** Mês da lista de compras: AAAA-MM. */
export const COMPRA_ANO_MES_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export const COMPRA_MOMENTOS_PAGAMENTO = ["vamos_pagar", "apos_awb"] as const;

// GET /api/compras/opcoes: a lista de medicamentos tem centenas de itens, então vem paginada e com busca (nunca tudo de uma vez).
export const COMPRA_MEDICAMENTOS_LIMITE_PADRAO = 50;
export const COMPRA_MEDICAMENTOS_LIMITE_MAX = 100;
/** Tamanho máximo do texto da busca (`?q=`). */
export const COMPRA_BUSCA_MAX = 80;
