import { ordenarCadastro } from "./cadastroNome";

// Consultor (campo `vendedor`) da DIR = os consultores ATIVOS do Cadastro (lista "consultores", Configurações → Cadastros;
// nenhuma lista própria na DIR). Regras PURAS, sem Nuxt nem rede: o servidor (dirStore) e o formulário usam as mesmas.
//
// O valor continua sendo TEXTO no registro (nada é renomeado nem convertido). Registros antigos têm valores que não estão
// na lista ativa — consultor desativado, "A ser definido", "Braulio (3RB)", "ASD"… — e eles continuam editáveis: o valor
// que o registro JÁ tem é sempre aceito; só um valor NOVO precisa ser de um consultor ativo.

/** Mensagem do 400 (servidor) e do aviso do formulário quando o consultor novo não é um consultor ativo do Cadastro. */
export const VENDEDOR_DIR_ERRO = "Consultor inválido: escolha um consultor ativo do Cadastro.";

/** Nomes dos consultores ativos, em ordem alfabética pt-BR (os inativos ficam de fora). */
export function nomesConsultoresAtivos(itens: ReadonlyArray<{ nome: string; ativo: boolean }>): string[] {
  return ordenarCadastro(itens.filter((i) => i.ativo)).map((i) => i.nome);
}

/** O valor é exatamente (sem espaços nas pontas, sensível a caixa, como o Envio) o nome de um consultor ativo? */
export function vendedorDirValido(valor: string | null | undefined, ativos: readonly string[]): boolean {
  const texto = (valor ?? "").trim();
  return texto !== "" && ativos.includes(texto);
}

/**
 * Regra de gravação: o consultor enviado precisa ser um consultor ativo do Cadastro. Tolerância a dado antigo: um valor
 * IGUAL ao já gravado no registro (inativo, "A ser definido", "Braulio (3RB)"…) não impede salvar os outros campos — por
 * isso o PATCH informa o valor `atual`. Na criação não há `atual`. Corpo sem a chave `vendedor` não é conferido.
 * Devolve a mensagem de erro (400) ou null.
 */
export function erroVendedorDir(
  corpo: { vendedor?: string },
  ativos: readonly string[],
  atual?: { vendedor: string | null },
): string | null {
  if (!("vendedor" in corpo) || corpo.vendedor === undefined) return null;
  if (vendedorDirValido(corpo.vendedor, ativos)) return null;
  if (atual && corpo.vendedor.trim() === (atual.vendedor ?? "").trim()) return null;
  return VENDEDOR_DIR_ERRO;
}
