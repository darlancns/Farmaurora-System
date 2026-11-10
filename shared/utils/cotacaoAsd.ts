import { precisaDespachanteTransportadora } from "../constants/processos";
import type { Processo } from "../types/processo";

// Filtro "Cotações ASD" do Follow-Up: ASD = "a ser definido". Lista os processos que ainda estão sem a cotação
// da transportadora nacional. Função pura, sem I/O: usa só o que a página já carregou. NUNCA grava "ASD" em campo.

/**
 * Um processo entra em "Cotações ASD" quando TODAS valem:
 *  1. o campo Cotação do bloco "Transportadora nacional" está vazio — `transportadoraNacional?.cotacao` (texto)
 *     ausente, null, "" ou só espaços. Nome e Valor não importam;
 *  2. o processo NÃO está na aba Entregues (`status === "entregue"`, a mesma regra de separarAbas);
 *  3. o Envio NÃO é "Courier Simples" (nesse envio o bloco Transportadora nacional nem aparece no formulário —
 *     `precisaDespachanteTransportadora`, a mesma condição de showDespachanteTransportadora). Processo SEM Envio entra.
 *
 * Nota de leitura: o mapper só devolve `transportadoraNacional` quando a coluna Nome não é NULL, então uma cotação
 * "órfã" (sem nome) não chega aqui — e o formulário também a mostra vazia.
 */
export function cotacaoAsd(processo: Pick<Processo, "status" | "modalEnvio" | "transportadoraNacional">): boolean {
  if (processo.status === "entregue") return false;
  if (!precisaDespachanteTransportadora(processo.modalEnvio)) return false;
  return cotacaoVazia(processo.transportadoraNacional?.cotacao);
}

function cotacaoVazia(cotacao: unknown): boolean {
  return typeof cotacao !== "string" || cotacao.trim() === "";
}
