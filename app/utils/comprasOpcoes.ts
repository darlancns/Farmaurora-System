import { ciasAereasDoModal } from "#shared/constants/processos";
import type { OpcaoDespachante, OpcaoFornecedor, OpcaoNome, OpcoesCompra } from "#shared/types/compra";

// As opções dos Cadastros que o formulário da Compra usa (as listas de GET /api/compras/opcoes), numa forma simples e SEM a lista de
// cias aéreas: a cia depende do ENVIO (modal) e vem das constantes do Follow-Up (`CIAS_AEREAS_POR_MODAL`), não do servidor.

export interface OpcoesFormulario {
  /** Consultores ativos (o Consultor da compra). */
  consultores: OpcaoNome[];
  despachantes: OpcaoDespachante[];
  fornecedores: OpcaoFornecedor[];
  temperaturas: OpcaoNome[];
}

export const OPCOES_VAZIAS: OpcoesFormulario = { consultores: [], despachantes: [], fornecedores: [], temperaturas: [] };

/** As listas do servidor → o que o formulário lê (vazias enquanto as opções não carregaram). */
export function opcoesParaFormulario(opcoes: OpcoesCompra | null): OpcoesFormulario {
  if (opcoes === null) return OPCOES_VAZIAS;
  return {
    consultores: opcoes.consultores,
    despachantes: opcoes.despachantes,
    fornecedores: opcoes.fornecedores,
    temperaturas: opcoes.temperaturas,
  };
}

/** As cias do modal de envio (as mesmas do Follow-Up, em ordem alfabética); sem modal ou modal desconhecido, nenhuma. */
export function ciasDoEnvio(envio: string): OpcaoNome[] {
  return ciasAereasDoModal(envio).map((nome) => ({ nome }));
}
