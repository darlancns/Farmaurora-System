import type { RespostaTemperatura, RespostaTemperaturaInativa, TemperaturaCriada } from "../../shared/types/compra";
import { chaveCadastro } from "../../shared/utils/cadastroNome";
import { CadastroRegraError, criarCadastro, listarCadastro } from "./cadastrosStore";
import { ComprasRegraError } from "./comprasErro";

/**
 * Criar uma temperatura a partir da Compra (POST /api/compras/temperaturas). A criação NÃO é reescrita aqui: passa pelo store dos
 * Cadastros (`criarCadastro("temperaturas", ...)`), então valem as mesmas regras, a mesma unicidade por `nome_chave` e o mesmo
 * `atualizado_por`. A guarda tests/unit/cadastrosPixNenhumaOutraRota.spec.ts permite este arquivo e trava o que ele pode fazer:
 * só a lista "temperaturas" (que não tem PIX), só `listarCadastro` e `criarCadastro`, sem `incluirPix` e sem acesso direto ao banco.
 *
 * Nome que já existe (pela chave: sem acento, caixa nem espaços repetidos, ativo OU inativo): NUNCA cria duplicata.
 *  - existe e está ATIVA → `{ criada: false, item }` (200);
 *  - existe e está INATIVA → 409 com `data: { criada: false, inativo: true, item }`: quem reativa é o administrador, pelos Cadastros;
 *  - não existe → cria (`{ criada: true, item }`, 201). Se outra pessoa criou o mesmo nome no mesmo instante (409 do store), relê e
 *    responde como "já existia".
 */

export interface ResultadoTemperatura {
  status: 200 | 201;
  corpo: RespostaTemperatura;
}

export const MENSAGEM_TEMPERATURA_EXISTE_INATIVA = "Essa temperatura já existe, mas está inativa. Peça ao administrador para reativá-la nos Cadastros.";

const paraItem = (t: { id: string; nome: string; ativo: boolean }): TemperaturaCriada => ({ id: t.id, nome: t.nome, ativo: t.ativo });

async function acharPelaChave(nome: string): Promise<TemperaturaCriada | null> {
  const chave = chaveCadastro(nome);
  const achada = (await listarCadastro("temperaturas")).find((t) => chaveCadastro(t.nome) === chave);
  return achada ? paraItem(achada) : null;
}

function jaExistia(item: TemperaturaCriada): ResultadoTemperatura {
  if (!item.ativo) {
    const data: RespostaTemperaturaInativa = { criada: false, inativo: true, item };
    throw new ComprasRegraError(MENSAGEM_TEMPERATURA_EXISTE_INATIVA, 409, data);
  }
  return { status: 200, corpo: { criada: false, item } };
}

export async function criarTemperaturaDeCompra(nome: string, por: string): Promise<ResultadoTemperatura> {
  const existente = await acharPelaChave(nome);
  if (existente) return jaExistia(existente);

  try {
    const criada = await criarCadastro("temperaturas", { nome }, por);
    return { status: 201, corpo: { criada: true, item: paraItem(criada) } };
  } catch (e) {
    if (e instanceof CadastroRegraError && e.statusCode === 409) {
      const naCorrida = await acharPelaChave(nome);
      if (naCorrida) return jaExistia(naCorrida);
    }
    // Qualquer outra regra do store dos Cadastros sobe já como regra das Compras: a rota só conhece um tipo de erro.
    if (e instanceof CadastroRegraError) throw new ComprasRegraError(e.message, e.statusCode);
    throw e;
  }
}
