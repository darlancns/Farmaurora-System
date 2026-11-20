import { defineEventHandler, readBody, createError, setResponseStatus } from "h3";
import type { RespostaTemperatura } from "../../../shared/types/compra";
import type { AuthUser } from "../../../shared/types/auth";
import { validarNovaTemperaturaCompra } from "../../../shared/utils/compraValidacao";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../utils/dirAuditoria";
import { exigirEscritaCompras } from "../../utils/comprasAcesso";
import { criarTemperaturaDeCompra } from "../../utils/comprasTemperatura";
import { responderErroDeCompra } from "../../utils/comprasStore";

// Cria uma temperatura a partir da Compra: `{ nome }`. Só quem ESCREVE em Compras. Passa pelo store dos Cadastros (mesmas regras).
// 201 `{ criada: true, item }` quando cria; 200 `{ criada: false, item }` quando o nome já existe e está ativo (nunca duplica);
// 409 quando já existe mas está INATIVA (`data.item` e `data.inativo`: o administrador decide pelos Cadastros); 400 nome inválido
// (vazio, longo demais, "Outro" reservado, campo desconhecido).
export default defineEventHandler(async (event): Promise<RespostaTemperatura> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirEscritaCompras(user);

  const dados = validarNovaTemperaturaCompra(await readBody(event));
  if (!dados.ok) throw createError({ statusCode: 400, statusMessage: dados.erro });

  try {
    const r = await criarTemperaturaDeCompra(dados.valor.nome, nomeParaAuditoria(user));
    setResponseStatus(event, r.status);
    return r.corpo;
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
