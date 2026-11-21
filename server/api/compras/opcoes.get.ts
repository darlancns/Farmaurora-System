import { defineEventHandler, getQuery, createError } from "h3";
import type { OpcoesCompra } from "../../../shared/types/compra";
import type { AuthUser } from "../../../shared/types/auth";
import { validarConsultaMedicamentos } from "../../../shared/utils/compraValidacao";
import { exigirLeituraCompras } from "../../utils/comprasAcesso";
import { listarOpcoesDeCompra } from "../../utils/comprasCatalogo";
import { responderErroDeCompra } from "../../utils/comprasStore";

// As opções do formulário de Compras: só itens ATIVOS e só os campos necessários (fornecedores, despachantes,
// consultores, temperaturas; envio, cia por modal e empresa são constantes, não vêm daqui) e UMA página de medicamentos (`?q=` busca, `?limite=` 1 a 100 — padrão 50 —, `?pagina=`).
// NUNCA traz chave PIX. É o caminho oficial da Compra para ler os Cadastros: vale `compras = ver` (o sócio inclusive), sem depender
// de GET /api/cadastros/* (que é da seção Configurações).
export default defineEventHandler(async (event): Promise<OpcoesCompra> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirLeituraCompras(user);

  const consulta = validarConsultaMedicamentos(getQuery(event));
  if (!consulta.ok) throw createError({ statusCode: 400, statusMessage: consulta.erro });

  try {
    return await listarOpcoesDeCompra(consulta.valor);
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
