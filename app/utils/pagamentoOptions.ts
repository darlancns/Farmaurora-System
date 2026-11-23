import { BANCO_CAMBIO_LABEL, BANCOS_CAMBIO, MOEDA_LABEL, MOEDAS } from "#shared/constants/pagamentos";
import { NOME_RESERVADO_CADASTRO } from "#shared/constants/cadastros";
import type { AppSelectOption } from "../types/appSelect";
import type { BancoCambio, ItemCadastroPagamento, Moeda } from "#shared/types/Pagamento";
import { chaveCadastro } from "#shared/utils/cadastroNome";
import {
  acharFornecedorPorTexto,
  acharItemPorNome,
  itensAtivos,
  mesmoNomeCadastro,
  rotuloFornecedorPagamento,
  rotuloValorGravado,
} from "#shared/utils/pagamentoCadastro";

// Opções do SegmentedControl de moeda (Novo pagamento); mesma forma de AppSelectOption.
export const MOEDA_OPTIONS: AppSelectOption<Moeda>[] = MOEDAS.map((moeda) => ({
  value: moeda,
  label: MOEDA_LABEL[moeda],
}));

export const BANCO_CAMBIO_OPTIONS: AppSelectOption<BancoCambio>[] = BANCOS_CAMBIO.map((banco) => ({
  value: banco,
  label: BANCO_CAMBIO_LABEL[banco],
}));

const SELECIONE: AppSelectOption<string> = { value: "", label: "Selecione" };

/**
 * Select de despachante/transportadora: "Selecione" + os ATIVOS do Cadastro (já em ordem alfabética). Só os ativos podem
 * ser escolhidos como valor novo. `valorAtual` (edição de um registro que já existe) fora da lista ativa entra como
 * opção extra, como está gravado ("(inativo)" só quando o item existe no Cadastro como inativo): continua visível e
 * selecionado, nunca vira vazio.
 */
export function montarOpcoesNome(
  itens: readonly ItemCadastroPagamento[],
  valorAtual = "",
  // `gravadoExato` (o Follow-Up): o valor gravado entra como opção sempre que NÃO é EXATAMENTE o nome de um ativo. Sem isso (Pagamentos), um
  // gravado que só casa por chaveCadastro ("ajc" para "AJC") não vira opção, e o select do Follow-Up ficaria sem nada selecionado.
  opcoes: { gravadoExato?: boolean } = {},
): AppSelectOption<string>[] {
  const ativos = itensAtivos(itens);
  const resultado: AppSelectOption<string>[] = [SELECIONE, ...ativos.map((i) => ({ value: i.nome, label: i.nome }))];
  const atual = valorAtual.trim();
  const jaEhOpcao = opcoes.gravadoExato === true ? ativos.some((i) => i.nome === valorAtual) : acharItemPorNome(ativos, atual) !== undefined;
  if (atual !== "" && !jaEhOpcao) {
    resultado.push({ value: valorAtual, label: rotuloValorGravado(valorAtual, acharItemPorNome(itens, atual)) });
  }
  return resultado;
}

/** Os rótulos "Nome - País" dos fornecedores ATIVOS (o que se grava no lançamento), na ordem do Cadastro. */
export function rotulosFornecedoresAtivos(fornecedores: readonly ItemCadastroPagamento[]): string[] {
  return itensAtivos(fornecedores).map(rotuloFornecedorPagamento);
}

/**
 * Variações do select de fornecedor para quem não é Pagamentos (o Follow-Up). Sem opções (o padrão), nada muda para Pagamentos.
 * - `extras`: valores FIXOS que ficam depois dos ativos do Cadastro e antes de "Outro" (ex.: "Nacional", que não é um fornecedor do Cadastro);
 * - `manterGravadoAtivo`: o valor gravado que casa com um fornecedor ATIVO do Cadastro, mas não é o rótulo exato (ex.: legado sem país,
 *   "Can Pharma" para "Can Pharma - China"), também continua selecionado, COMO ESTÁ GRAVADO, em vez de cair em "Outro". Assim abrir e salvar
 *   o processo não muda o fornecedor (nada de PATCH falso). Em Pagamentos só o INATIVO é mantido.
 */
export interface OpcoesFornecedorFixos {
  extras?: readonly string[];
  manterGravadoAtivo?: boolean;
}

/**
 * Valores fixos do select de fornecedor (sem o sentinela "Outro"): os rótulos dos ativos (+ `extras`) e, na edição, o valor gravado
 * quando ele é de um fornecedor que existe no Cadastro como INATIVO (assim ele continua selecionado, não vira "Outro"); com
 * `manterGravadoAtivo`, também quando casa com um ativo por outro texto.
 */
export function fornecedoresFixos(
  fornecedores: readonly ItemCadastroPagamento[],
  valorAtual = "",
  opcoes: OpcoesFornecedorFixos = {},
): string[] {
  const fixos = [...rotulosFornecedoresAtivos(fornecedores), ...(opcoes.extras ?? [])];
  const atual = valorAtual.trim();
  if (atual === "" || fixos.includes(valorAtual)) return fixos;
  const doCadastro = acharFornecedorPorTexto(fornecedores, atual);
  return doCadastro && (!doCadastro.ativo || opcoes.manterGravadoAtivo === true) ? [...fixos, valorAtual] : fixos;
}

/** Select de fornecedor do lançamento: "Selecione" + fixos (ver `fornecedoresFixos`) + "Outro" (texto livre) por último. */
export function montarOpcoesFornecedor(
  fornecedores: readonly ItemCadastroPagamento[],
  valorAtual = "",
  opcoes: OpcoesFornecedorFixos = {},
): AppSelectOption<string>[] {
  const fixos = fornecedoresFixos(fornecedores, valorAtual, opcoes);
  return [
    SELECIONE,
    ...fixos.map((valor) => ({
      value: valor,
      label: rotuloValorGravado(valor, acharFornecedorPorTexto(fornecedores, valor)),
    })),
    { value: NOME_RESERVADO_CADASTRO, label: NOME_RESERVADO_CADASTRO },
  ];
}

/**
 * Opções de um filtro por nome (despachante/transportadora/fornecedor) a partir dos valores que JÁ EXISTEM nos dados:
 * sem repetição (pela chaveCadastro), em ordem alfabética pt-BR, cada um como está gravado — inclusive os que saíram da lista
 * ativa (nomes antigos). "(inativo)" só quando o item existe no Cadastro como inativo. O valor da opção é o texto gravado.
 */
export function opcoesFiltroDosDados(
  valoresGravados: readonly string[],
  achar: (valor: string) => ItemCadastroPagamento | undefined,
  rotuloTodos: string,
): AppSelectOption<string>[] {
  const vistos = new Map<string, string>();
  for (const valor of valoresGravados) {
    const chave = chaveCadastro(valor);
    if (chave !== "" && !vistos.has(chave)) vistos.set(chave, valor);
  }
  const valores = [...vistos.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [{ value: "", label: rotuloTodos }, ...valores.map((v) => ({ value: v, label: rotuloValorGravado(v, achar(v)) }))];
}

/** O filtro está ligado e o valor gravado é o mesmo nome (pela chaveCadastro)? Filtro vazio = tudo passa. */
export function passaFiltroNome(filtro: string, valorGravado: string): boolean {
  return filtro === "" || mesmoNomeCadastro(filtro, valorGravado);
}
