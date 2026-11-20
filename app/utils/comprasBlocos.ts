import type { Compra, MudancasCompra, OpcaoDespachante, OpcaoFornecedor, OpcaoNome } from "#shared/types/compra";

// O contrato dos BLOCOS do formulário da Compra (app/components/compras/blocos/*): todos recebem a compra, se estão desabilitados e as
// opções dos Cadastros, e avisam as mudanças por `alterar` (quem guarda e salva é o useCompraEditor). Classes comuns dos campos.

export interface OpcoesFormulario {
  /** Consultores ativos (o Vendedor). */
  consultores: OpcaoNome[];
  despachantes: OpcaoDespachante[];
  fornecedores: OpcaoFornecedor[];
  ciasAereas: OpcaoNome[];
  temperaturas: OpcaoNome[];
}

export const OPCOES_VAZIAS: OpcoesFormulario = { consultores: [], despachantes: [], fornecedores: [], ciasAereas: [], temperaturas: [] };

export interface PropsBloco {
  compra: Compra;
  /** Compra cancelada ou conta que só lê: nenhum campo editável. */
  desabilitado: boolean;
  opcoes: OpcoesFormulario;
}

export type AlterarCompra = (mudancas: MudancasCompra) => void;

export const CHECKBOX_CLASS = "h-[18px] w-[18px] shrink-0 accent-accent-dark disabled:cursor-not-allowed";
export const ROTULO_CHECKBOX_CLASS = "flex min-h-11 items-center gap-2 text-[14px] text-ink lg:min-h-0 lg:text-[13px]";
export const TEXTAREA_CLASS_EXTRA = "resize-y";
