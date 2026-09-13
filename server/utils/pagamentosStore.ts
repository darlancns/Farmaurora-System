/**
 * Persistência de Pagamentos — arquivo de índice (Round 8, Passo 1).
 *
 * Banco (lotes + lançamentos) e Grupos (despachante/transportadora) foram
 * separados em `./pagamentos/bancoStore.ts` e `./pagamentos/grupoStore.ts`
 * (ver esses arquivos para as regras de negócio detalhadas). Este arquivo só
 * reexporta tudo, pra nenhum import existente em `server/api/pagamentos/**`
 * precisar mudar.
 *
 * As chaves PIX continuam em arquivo (`data/pagamentos-*-pix.json`) — não há
 * tabela pra elas. Moradas em `./pagamentosPixStore` (livre de Supabase) e
 * re-exportadas aqui para os endpoints não mudarem o import.
 */

export * from "./pagamentos/bancoStore";
export * from "./pagamentos/grupoStore";

export {
  getDespachantePix,
  getTransportadoraPix,
  salvarDespachantePix,
  salvarTransportadoraPix,
} from "./pagamentosPixStore";
