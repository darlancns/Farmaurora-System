/**
 * Persistência de Pagamentos — arquivo de índice (Round 8, Passo 1).
 *
 * Banco (lotes + lançamentos) e Grupos (despachante/transportadora) foram
 * separados em `./pagamentos/bancoStore.ts` e `./pagamentos/grupoStore.ts`
 * (ver esses arquivos para as regras de negócio detalhadas). Este arquivo só
 * reexporta tudo, pra nenhum import existente em `server/api/pagamentos/**`
 * precisar mudar.
 *
 * As chaves PIX (`getDespachantePix`/`salvarDespachantePix`/
 * `getTransportadoraPix`/`salvarTransportadoraPix`) moram em
 * `./pagamentosPixStore` e devem ser importadas direto de lá — não são
 * reexportadas aqui para evitar colisão de auto-import com o Nitro.
 */

export * from "./pagamentos/bancoStore";
export * from "./pagamentos/grupoStore";
