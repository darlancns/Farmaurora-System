import { defineEventHandler, readBody, createError, setResponseStatus } from "h3";
import type { RespostaPreCadastro } from "../../../shared/types/compra";
import type { AuthUser } from "../../../shared/types/auth";
import { validarPreCadastroCompra } from "../../../shared/utils/compraValidacao";
import { nomeParaAuditoriaDir as nomeParaAuditoria } from "../../utils/dirAuditoria";
import { exigirEscritaCompras } from "../../utils/comprasAcesso";
import { responderErroDeCompra } from "../../utils/comprasStore";
import { pedirPreCadastro } from "../../utils/preCadastroStore";

// Pede o pré-cadastro de um medicamento que ainda não está no Cadastro: `{ nome, temperatura, compraId? }`. Só quem ESCREVE em
// Compras. O nome vira MAIÚSCULAS. 201 `{ criado: true, preCadastro }` (pendente novo); 200 `{ criado: false, preCadastro }` quando
// já há um pendente com o mesmo nome (não duplica); 409 quando o medicamento JÁ está no Cadastro (`data.medicamento`: use esse);
// 404 se a `compraId` não existe; 400 dados inválidos. A aprovação e a rejeição NÃO são daqui.
export default defineEventHandler(async (event): Promise<RespostaPreCadastro> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirEscritaCompras(user);

  const dados = validarPreCadastroCompra(await readBody(event));
  if (!dados.ok) throw createError({ statusCode: 400, statusMessage: dados.erro });

  try {
    const r = await pedirPreCadastro(dados.valor, nomeParaAuditoria(user));
    setResponseStatus(event, r.status);
    return r.corpo;
  } catch (e) {
    return responderErroDeCompra(e);
  }
});
