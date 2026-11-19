import { ordenarCadastro } from "./cadastroNome";

// Consultor = a lista "consultores" do Cadastro (Configurações → Cadastros) é a ÚNICA fonte: Contas, Follow-Up, Prestação e DIR
// leem dela (nenhuma lista própria nas telas). Regras PURAS, sem Nuxt nem rede: o servidor e os formulários usam as mesmas.
//
// O valor continua sendo TEXTO nos registros (follow_up.consultor, prestacao_pacientes.consultor, dir.vendedor, e
// app_metadata.consultorNome das contas). Registros antigos têm valores que não estão na lista ativa — consultor desativado,
// "A ser definido", "Braulio (3RB)", "Flavinha"… — e eles continuam exibidos e editáveis, sem nunca serem apagados: o valor que o
// registro JÁ tem é sempre aceito; só um valor NOVO precisa ser de um consultor ativo.

/** Mensagem do 400 (servidor) e do aviso dos formulários quando o consultor novo não é um consultor ativo do Cadastro. */
export const CONSULTOR_ERRO = "Consultor inválido: escolha um consultor ativo do Cadastro.";

/** O mínimo de um consultor do Cadastro que as regras precisam. */
export interface ItemConsultor {
  nome: string;
  ativo: boolean;
}

/** Nomes dos consultores ativos, em ordem alfabética pt-BR (os inativos ficam de fora). */
export function nomesConsultoresAtivos(itens: readonly ItemConsultor[]): string[] {
  return ordenarCadastro(itens.filter((i) => i.ativo)).map((i) => i.nome);
}

/** O valor é exatamente (sem espaços nas pontas, sensível a caixa) o nome de um consultor ativo? */
export function consultorAtivoValido(valor: string | null | undefined, ativos: readonly string[]): boolean {
  const texto = (valor ?? "").trim();
  return texto !== "" && ativos.includes(texto);
}

/**
 * Regra de gravação: o consultor enviado precisa ser um consultor ativo do Cadastro. Tolerância a dado antigo: um valor IGUAL
 * ao já gravado no registro (inativo, "A ser definido", "Braulio (3RB)"…) não impede salvar os outros campos — por isso o
 * PATCH informa o valor `atual`. Na criação não há `atual`. Devolve a mensagem de erro (400) ou null.
 */
export function erroConsultor(valor: string, ativos: readonly string[], atual?: { consultor: string | null }): string | null {
  if (consultorAtivoValido(valor, ativos)) return null;
  if (atual && valor.trim() === (atual.consultor ?? "").trim()) return null;
  return CONSULTOR_ERRO;
}

/**
 * Situação de um valor de consultor gravado num registro, diante do Cadastro: "ativo" (está na lista ativa), "inativo" (existe
 * no Cadastro, desativado) ou "desconhecido" (não existe no Cadastro: valor antigo, literal, "Flavinha"…).
 */
export type SituacaoConsultor = "ativo" | "inativo" | "desconhecido";

export function situacaoDoConsultor(valor: string, itens: readonly ItemConsultor[]): SituacaoConsultor {
  const item = itens.find((i) => i.nome === valor);
  if (!item) return "desconhecido";
  return item.ativo ? "ativo" : "inativo";
}
