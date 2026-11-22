import { defineEventHandler, setResponseStatus } from "h3";
import type { Compra } from "../../../shared/types/compra";
import type { AuthUser } from "../../../shared/types/auth";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../utils/dirAuditoria";
import { exigirEscritaCompras } from "../../utils/comprasAcesso";
import { criarCompra, responderErroDeCompra } from "../../utils/comprasStore";

// Cria uma compra VAZIA com o próximo número do mês de Brasília. Sem corpo: o `responsavel` começa com o nome de quem criou
// e `criado_por` é o usuário. Só quem ESCREVE em Compras (administrador e operacional; o sócio só lê). 201 com a compra.
export default defineEventHandler(async (event): Promise<Compra> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirEscritaCompras(user);

  try {
    const compra = await criarCompra(nomeParaAuditoria(user));
    setResponseStatus(event, 201);
    return compra;
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
