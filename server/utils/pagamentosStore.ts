/**
 * Persistência de Pagamentos — arquivo de índice (Round 8, Passo 1).
 *
 * Banco (lotes + lançamentos) e Grupos (despachante/transportadora) foram
 * separados em `./pagamentos/bancoStore.ts` e `./pagamentos/grupoStore.ts`
 * (ver esses arquivos para as regras de negócio detalhadas). Este arquivo só
 * reexporta tudo, pra nenhum import existente em `server/api/pagamentos/**`
 * precisar mudar.
 *
 * A chave PIX e as listas de fornecedores, despachantes e transportadoras vêm dos Cadastros
 * (`../cadastroPagamentos`, só leitura); aqui não há mais PIX.
 */

export * from "./pagamentos/bancoStore";
export * from "./pagamentos/grupoStore";
