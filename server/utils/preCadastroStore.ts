import type { MedicamentoDoCadastro, PreCadastroMedicamento, RespostaMedicamentoJaCadastrado, RespostaPreCadastro, StatusPreCadastro } from "../../shared/types/compra";
import type { PreCadastroMedicamentoDTO } from "../../shared/utils/compraValidacao";
import { chaveCadastro } from "../../shared/utils/cadastroNome";
import { buscarMedicamentoPorNome } from "./comprasCatalogo";
import { ComprasRegraError } from "./comprasStore";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";

/**
 * Pré-cadastro de medicamento (tabela `pre_cadastro_medicamentos`): o medicamento que ainda não está no Cadastro, pedido a partir de
 * uma compra, para o administrador aprovar depois (a APROVAÇÃO e a REJEIÇÃO são de outra etapa: aqui só se pede).
 *
 * Regras:
 *  - o nome vem em MAIÚSCULAS (a validação o normaliza, como o nome de um medicamento do Cadastro) e a `nome_chave` é a chaveCadastro dele;
 *  - se o medicamento JÁ está no Cadastro (ativo ou inativo, pela chave): 409 com o item do Cadastro em `data.medicamento` (a tela passa
 *    a usá-lo; se estiver inativo o administrador decide pelos Cadastros);
 *  - se já há um PENDENTE com a mesma chave: 200 com o pendente (não duplica; o índice único parcial do banco também garante);
 *  - senão cria `pendente` com `solicitado_por` = usuário (201). Um pré-cadastro REJEITADO não impede um novo pedido;
 *  - `compraId` é opcional; se vier, a compra precisa existir (404) — é só o vínculo de origem.
 * A temperatura é só o texto que a pessoa informou: NÃO é conferida com o Cadastro de Temperaturas aqui (pode ser uma temperatura que
 * ela acabou de criar); quem confere é a aprovação, ao criar o medicamento.
 */

const TABELA = "pre_cadastro_medicamentos";
const COLUNAS = "id, nome, nome_chave, temperatura, status, compra_id, cadastro_id, solicitado_por";
const CODIGO_UNICO_VIOLADO = "23505";

export const MENSAGEM_MEDICAMENTO_JA_CADASTRADO = "Esse medicamento já está no Cadastro. Use o do Cadastro.";
export const MENSAGEM_COMPRA_DO_PRE_CADASTRO_INEXISTENTE = "Compra não encontrada.";

interface PreCadastroRow {
  id: string;
  nome: string;
  nome_chave: string;
  temperatura: string | null;
  status: string;
  compra_id: string | null;
  cadastro_id: string | null;
  solicitado_por: string | null;
}

export function montarPreCadastro(row: PreCadastroRow): PreCadastroMedicamento {
  return {
    id: row.id,
    nome: row.nome,
    temperatura: row.temperatura ?? "",
    status: row.status as StatusPreCadastro,
    compraId: row.compra_id ?? null,
    cadastroId: row.cadastro_id ?? null,
    solicitadoPor: row.solicitado_por ?? "",
  };
}

export interface ResultadoPreCadastro {
  status: 200 | 201;
  corpo: RespostaPreCadastro;
}

type Db = ReturnType<typeof createSupabaseAdminClient>;

async function pendentePelaChave(db: Db, chave: string): Promise<PreCadastroRow | null> {
  const { data, error } = await db.from(TABELA).select(COLUNAS).eq("nome_chave", chave).eq("status", "pendente");
  if (error) throw erro("buscar o pré-cadastro pendente", error);
  return ((data ?? []) as unknown as PreCadastroRow[])[0] ?? null;
}

export async function pedirPreCadastro(dto: PreCadastroMedicamentoDTO, por: string): Promise<ResultadoPreCadastro> {
  const db = createSupabaseAdminClient();
  const chave = chaveCadastro(dto.nome);

  const noCadastro = await buscarMedicamentoPorNome(chave);
  if (noCadastro) {
    const medicamento: MedicamentoDoCadastro = noCadastro;
    const data: RespostaMedicamentoJaCadastrado = { criado: false, medicamento };
    throw new ComprasRegraError(MENSAGEM_MEDICAMENTO_JA_CADASTRADO, 409, data);
  }

  if (dto.compraId !== null) {
    const { data, error } = await db.from("compras").select("id").eq("id", dto.compraId);
    if (error) throw erro("conferir a compra do pré-cadastro", error);
    if (((data ?? []) as unknown[]).length === 0) throw new ComprasRegraError(MENSAGEM_COMPRA_DO_PRE_CADASTRO_INEXISTENTE, 404);
  }

  const pendente = await pendentePelaChave(db, chave);
  if (pendente) return { status: 200, corpo: { criado: false, preCadastro: montarPreCadastro(pendente) } };

  const row: PreCadastroRow = {
    id: randomId("pre_"),
    nome: dto.nome,
    nome_chave: chave,
    temperatura: dto.temperatura,
    status: "pendente",
    compra_id: dto.compraId,
    cadastro_id: null,
    solicitado_por: por,
  };
  const { error } = await db.from(TABELA).insert(row);
  if (error) {
    // Corrida: outra pessoa pediu o mesmo nome entre a leitura e o insert (índice único parcial em nome_chave onde pendente).
    if (error.code === CODIGO_UNICO_VIOLADO) {
      const naCorrida = await pendentePelaChave(db, chave);
      if (naCorrida) return { status: 200, corpo: { criado: false, preCadastro: montarPreCadastro(naCorrida) } };
    }
    throw erro("criar o pré-cadastro de medicamento", error);
  }
  return { status: 201, corpo: { criado: true, preCadastro: montarPreCadastro(row) } };
}
