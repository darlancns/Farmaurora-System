import { ROTULO_INATIVO_CADASTRO } from "../constants/cadastros";
import type { ItemCadastroPagamento } from "../types/Pagamento";
import { chaveCadastro } from "./cadastroNome";

// Regras PURAS de como Pagamentos usa os Cadastros (fornecedores, despachantes, transportadoras): o servidor e a tela
// usam as mesmas. O casamento de nomes é SEMPRE por `chaveCadastro` (sem acento, sem diferença de caixa, espaços
// colapsados), nunca por texto exato.

const SEPARADOR_PAIS = " - ";

/** Os dois textos são o mesmo nome do Cadastro (pela chave de comparação)? */
export function mesmoNomeCadastro(a: string, b: string): boolean {
  return chaveCadastro(a) === chaveCadastro(b);
}

/** O item do Cadastro cujo nome é `nome` (por chaveCadastro), ou undefined. */
export function acharItemPorNome<T extends { nome: string }>(itens: readonly T[], nome: string): T | undefined {
  const chave = chaveCadastro(nome);
  if (chave === "") return undefined;
  return itens.find((i) => chaveCadastro(i.nome) === chave);
}

/**
 * Texto do fornecedor em Pagamentos, gravado nos lançamentos do Banco: "Nome - País" (nome + " - " + país do Cadastro).
 * Sem país no Cadastro, só o nome.
 */
export function rotuloFornecedorPagamento(item: Pick<ItemCadastroPagamento, "nome" | "pais">): string {
  const pais = item.pais.trim();
  return pais === "" ? item.nome : `${item.nome}${SEPARADOR_PAIS}${pais}`;
}

/** O texto do fornecedor sem o " - País" final ("Beldimed - Bélgica" → "Beldimed"). Sem separador, o próprio texto. */
export function nomeFornecedorSemPais(texto: string): string {
  const corte = texto.lastIndexOf(SEPARADOR_PAIS);
  return corte === -1 ? texto : texto.slice(0, corte);
}

/**
 * O fornecedor do Cadastro a que um texto gravado ("Nome - País", ou só o nome) se refere: casa o texto inteiro com o
 * rótulo "Nome - País" ou, se não casar, o texto sem o país com o nome. undefined quando nenhum casa.
 */
export function acharFornecedorPorTexto(
  fornecedores: readonly ItemCadastroPagamento[],
  texto: string,
): ItemCadastroPagamento | undefined {
  if (chaveCadastro(texto) === "") return undefined;
  const pelaEtiqueta = fornecedores.find((f) => mesmoNomeCadastro(rotuloFornecedorPagamento(f), texto));
  if (pelaEtiqueta) return pelaEtiqueta;
  return acharItemPorNome(fornecedores, nomeFornecedorSemPais(texto));
}

/** País do fornecedor (do Cadastro) para um texto gravado, em maiúsculas; null quando não há fornecedor ou país. */
export function paisDoFornecedorNoCadastro(fornecedores: readonly ItemCadastroPagamento[], texto: string): string | null {
  const pais = acharFornecedorPorTexto(fornecedores, texto)?.pais.trim() ?? "";
  return pais === "" ? null : pais.toLocaleUpperCase("pt-BR");
}

/** Só os ativos, na ordem recebida. */
export function itensAtivos(itens: readonly ItemCadastroPagamento[]): ItemCadastroPagamento[] {
  return itens.filter((i) => i.ativo);
}

/** Rótulo de um valor GRAVADO nos dados: leva "(inativo)" só quando o item existe no Cadastro e está desativado. */
export function rotuloValorGravado(valor: string, itemDoCadastro: ItemCadastroPagamento | undefined): string {
  return itemDoCadastro && !itemDoCadastro.ativo ? `${valor} ${ROTULO_INATIVO_CADASTRO}` : valor;
}
