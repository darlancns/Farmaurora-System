import { defineEventHandler } from "h3";
import { obterCadastrosDePagamentos } from "../../utils/cadastroPagamentos";
import type { CadastrosPagamento } from "../../../shared/types/Pagamento";

// Fornecedores, despachantes e transportadoras do Cadastro que a página de Pagamentos usa nos selects, filtros e
// exportação: ativos E inativos (cada um com `ativo`), em ordem alfabética pt-BR com os ativos primeiro. NÃO leva chave
// PIX (ela só sai nas rotas *-pix). O middleware exige leitura da seção Pagamentos para esta rota.
export default defineEventHandler(async (): Promise<CadastrosPagamento> => {
  return await obterCadastrosDePagamentos();
});
