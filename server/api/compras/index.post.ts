import { createError, defineEventHandler, readBody, setResponseStatus } from "h3";
import type { Compra } from "../../../shared/types/compra";
import type { AuthUser } from "../../../shared/types/auth";
import { anoMesAtualBrasilia } from "../../../shared/utils/compraMes";
import { validarNovaCompra } from "../../../shared/utils/compraValidacao";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../utils/dirAuditoria";
import { exigirEscritaCompras } from "../../utils/comprasAcesso";
import { criarCompra } from "../../utils/comprasStore";
import { responderErroDeCompra } from "../../utils/comprasErro";

// Cria uma compra VAZIA com o Nº da compra DIGITADO no corpo (`{ sequencia, anoMes? }`; sequencia inteiro de 1 a 9999; anoMes é o mês da lista que a pessoa
// via, "AAAA-MM", de 2020-01 até o mês que vem; sem ele, o mês corrente de Brasília): o número é combinado pelo time e pode sair
// fora de ordem, então o servidor NUNCA o gera. O `responsavel` começa com o nome de quem criou e `criado_por` é o usuário. Só quem ESCREVE
// em Compras (administrador e operacional; o sócio só lê). 201 com a compra; 400 número inválido; 409 (`data.code` = NUMERO_JA_EXISTE) se o
// número já existe no mês, inclusive em compra cancelada.
export default defineEventHandler(async (event): Promise<Compra> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirEscritaCompras(user);

  const corpo = validarNovaCompra(await readBody(event), anoMesAtualBrasilia());
  if (!corpo.ok) throw createError({ statusCode: 400, statusMessage: corpo.erro });

  try {
    const compra = await criarCompra(nomeParaAuditoria(user), { sequencia: corpo.valor.sequencia, anoMes: corpo.valor.anoMes });
    setResponseStatus(event, 201);
    return compra;
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
