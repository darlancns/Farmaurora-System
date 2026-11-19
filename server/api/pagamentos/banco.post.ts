import { defineEventHandler, readBody, createError } from "h3";
import { criarLancamentoBanco } from "../../utils/pagamentosStore";
import { isValidNovoLancamentoBanco } from "../../utils/pagamentoValidation";
import { resolverFornecedorNovo } from "../../utils/cadastroPagamentos";
import type { LancamentoBanco, LoteBanco } from "../../../shared/types/Pagamento";

export default defineEventHandler(
  async (event): Promise<{ lancamento: LancamentoBanco; lote: LoteBanco }> => {
    const body = await readBody(event);

    if (!isValidNovoLancamentoBanco(body)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Dados do lançamento inválidos ou incompletos.",
      });
    }

    // Lançamento NOVO: fornecedor = "Nome - País" de um fornecedor ATIVO do Cadastro (gravado como está no Cadastro) ou,
    // com `fornecedorOutro`, texto livre. Editar um lançamento existente (banco/[id].patch) não valida: mantém o gravado.
    const fornecedor = await resolverFornecedorNovo(body.fornecedor, body.fornecedorOutro === true);

    return await criarLancamentoBanco({ ...body, fornecedor });
  }
);
