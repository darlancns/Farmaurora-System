import type { DirOpcoes } from "../../shared/types/dir";
import { chaveCadastro } from "../../shared/utils/cadastroNome";
import { listarCadastro } from "./cadastrosStore";

/**
 * As opções do formulário da DIR que vêm dos Cadastros: só as TEMPERATURAS ATIVAS (GET /api/dir/opcoes). A guarda
 * tests/unit/cadastrosPixNenhumaOutraRota.spec.ts permite este arquivo e trava o que ele pode fazer: só `listarCadastro("temperaturas")`
 * (a lista que não tem PIX), sem escrita, sem tabela escrita à mão e sem outra lista.
 *
 * O servidor da DIR continua aceitando texto livre na temperatura: esta lista só alimenta o select.
 */

const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Nomes das temperaturas ativas, em ordem alfabética pela chave do nome (sem acento nem caixa). */
export async function listarOpcoesDaDir(): Promise<DirOpcoes> {
  const todas = await listarCadastro("temperaturas");
  const nomes = todas
    .filter((t) => t.ativo)
    .map((t) => t.nome)
    .sort((a, b) => COLLATOR.compare(chaveCadastro(a), chaveCadastro(b)));
  return { temperaturas: nomes };
}
