import { NOME_CADASTRO_MAX } from "../constants/cadastros";
import type { ItemCompra } from "../types/compra";
import { chaveCadastro, nomeEmMaiusculas } from "./cadastroNome";

// O VÍNCULO do medicamento com o Cadastro (Opção A): o campo é UM texto. Escolher uma sugestão do Cadastro liga o item ao medicamento
// (medicamentoCadastroId + o nome do Cadastro, só leitura); o texto pode ser COMPLETADO depois ("DIPIRONA" → "DIPIRONA 500 mg c/ 10")
// sem perder o vínculo, mas se o começo do texto deixa de ser o nome do Cadastro, o vínculo desaparece (e com ele a temperatura que
// veio do Cadastro). O item "fora do Cadastro" pode ser pedido ao pré-cadastro, mas SÓ por um pedido EXPLÍCITO (botão), com o "nome para
// o cadastro" editável. Funções puras: a tela só aplica o que elas devolvem.

type CampoDoVinculo = "medicamento" | "medicamentoCadastroId" | "medicamentoCadastroNome" | "preCadastroId" | "preCadastroStatus" | "temperatura";

/** O que muda num item quando o texto do medicamento muda (só as chaves que mudam). */
export type MudancaDoItem = Partial<Pick<ItemCompra, CampoDoVinculo>>;

/** O medicamento escolhido numa sugestão do Cadastro. */
export interface MedicamentoEscolhido {
  id: string;
  nome: string;
  temperatura: string;
}

/** O item está ligado a um medicamento do Cadastro? */
export const estaVinculado = (item: Pick<ItemCompra, "medicamentoCadastroId">): boolean => item.medicamentoCadastroId !== null;

/**
 * O vínculo CONTINUA enquanto o texto COMEÇA com o nome do Cadastro (comparação sem acento nem caixa nem espaços repetidos:
 * `chaveCadastro`) e o nome termina numa FRONTEIRA DE PALAVRA: o texto acaba ali, ou o próximo caractere não é letra nem dígito
 * ("DIPIRONA 500 mg" e "DIPIRONA-500" continuam; "DIPIRONAX" e "DIPIRONA2" não). Sem o nome do Cadastro (null ou vazio) não há com
 * o que comparar: não continua.
 */
export function vinculoContinua(texto: string, nomeNoCadastro: string | null): boolean {
  if (nomeNoCadastro === null) return false;
  const chaveCadastroNome = chaveCadastro(nomeNoCadastro);
  if (chaveCadastroNome === "") return false;
  const chaveTexto = chaveCadastro(texto);
  if (!chaveTexto.startsWith(chaveCadastroNome)) return false;
  const proximo = chaveTexto.charAt(chaveCadastroNome.length);
  return proximo === "" || !/[\p{L}\p{N}]/u.test(proximo);
}

/** Escolher uma sugestão do Cadastro: o texto vira o nome do Cadastro; liga o item; a temperatura do Cadastro entra (se tiver). */
export function escolherMedicamentoDoCadastro(escolhido: MedicamentoEscolhido): MudancaDoItem {
  return {
    medicamento: escolhido.nome,
    medicamentoCadastroId: escolhido.id,
    medicamentoCadastroNome: escolhido.nome,
    preCadastroId: null,
    preCadastroStatus: null,
    ...(escolhido.temperatura.trim() !== "" ? { temperatura: escolhido.temperatura } : {}),
  };
}

/**
 * O texto do medicamento mudou (digitação). Ligado e o texto ainda COMEÇA com o nome do Cadastro: só o texto muda. Ligado e deixou de
 * começar: o vínculo some e a temperatura que veio do Cadastro é zerada (não vale para um medicamento novo). Fora do Cadastro: o
 * texto muda e um pedido de pré-cadastro anterior (de OUTRO texto) é esquecido.
 */
export function digitarMedicamento(item: Pick<ItemCompra, "medicamentoCadastroId" | "medicamentoCadastroNome" | "preCadastroId">, texto: string): MudancaDoItem {
  if (estaVinculado(item)) {
    if (vinculoContinua(texto, item.medicamentoCadastroNome)) return { medicamento: texto };
    return { medicamento: texto, medicamentoCadastroId: null, medicamentoCadastroNome: null, preCadastroId: null, preCadastroStatus: null, temperatura: "" };
  }
  if (item.preCadastroId !== null) return { medicamento: texto, preCadastroId: null, preCadastroStatus: null };
  return { medicamento: texto };
}

/** Limpar o campo do medicamento: texto e vínculo somem; a temperatura só some se veio do Cadastro (estava ligado). */
export function limparMedicamento(item: Pick<ItemCompra, "medicamentoCadastroId">): MudancaDoItem {
  return {
    medicamento: "",
    medicamentoCadastroId: null,
    medicamentoCadastroNome: null,
    preCadastroId: null,
    preCadastroStatus: null,
    ...(estaVinculado(item) ? { temperatura: "" } : {}),
  };
}

// ── "Fora do Cadastro" e o pedido EXPLÍCITO de pré-cadastro ──────────────────────────────────────────────────

/** Tem texto e não está ligado ao Cadastro. */
export const estaForaDoCadastro = (item: Pick<ItemCompra, "medicamento" | "medicamentoCadastroId">): boolean =>
  item.medicamento.trim() !== "" && item.medicamentoCadastroId === null;

/** Texto limpo (pontas sem espaço, espaços repetidos viram um), SEM mudar a caixa. */
const limpo = (texto: string): string => texto.replace(/\s+/g, " ").trim();

/**
 * O "nome para o cadastro" que o campo mostra ao ficar fora do Cadastro: o texto atual, limpo, EDITÁVEL (a pessoa pode encurtar:
 * "DIPIRONA 500 mg c/ 10" → "DIPIRONA"). Passa de NOME_CADASTRO_MAX? Corta no limite (o campo também tem maxlength).
 */
export const nomeInicialParaOCadastro = (medicamento: string): string => limpo(medicamento).slice(0, NOME_CADASTRO_MAX);

/** O nome como VAI no pedido: limpo e em MAIÚSCULAS (o mesmo `toUpperCase` dos campos de medicamento). */
export const nomeEnviadoAoCadastro = (nome: string): string => nomeEmMaiusculas(limpo(nome));

export interface PedidoPreCadastro {
  /** Já em MAIÚSCULAS e limpo. */
  nome: string;
  temperatura: string;
}

export const PRE_CADASTRO_SEM_NOME = "Informe o nome para o cadastro.";
export const PRE_CADASTRO_NOME_LONGO = `Nome para o cadastro: no máximo ${NOME_CADASTRO_MAX} caracteres.`;
export const PRE_CADASTRO_SEM_TEMPERATURA = "Escolha a temperatura antes de pedir o cadastro.";

/**
 * O pedido de pré-cadastro (POST /api/compras/pre-cadastro-medicamentos): o nome vai em MAIÚSCULAS e a TEMPERATURA é obrigatória.
 * Nome vazio, nome maior que NOME_CADASTRO_MAX ou temperatura vazia: não há pedido (devolve a mensagem para a tela).
 */
export function montarPedidoPreCadastro(nome: string, temperatura: string): { ok: true; pedido: PedidoPreCadastro } | { ok: false; erro: string } {
  const nomeFinal = nomeEnviadoAoCadastro(nome);
  if (nomeFinal === "") return { ok: false, erro: PRE_CADASTRO_SEM_NOME };
  if (nomeFinal.length > NOME_CADASTRO_MAX) return { ok: false, erro: PRE_CADASTRO_NOME_LONGO };
  const temp = temperatura.trim();
  if (temp === "") return { ok: false, erro: PRE_CADASTRO_SEM_TEMPERATURA };
  return { ok: true, pedido: { nome: nomeFinal, temperatura: temp } };
}

/** Pode oferecer o pedido explícito? Fora do Cadastro e ainda sem pedido feito (a temperatura é conferida ao pedir). */
export const podeOferecerPreCadastro = (item: Pick<ItemCompra, "medicamento" | "medicamentoCadastroId" | "preCadastroId">): boolean =>
  estaForaDoCadastro(item) && item.preCadastroId === null;
