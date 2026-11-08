-- Follow-Up: novo campo "Nº Ordem" (PO) — coluna numero_po (text, opcional).
--
-- ADITIVA: só acrescenta uma coluna nula, sem default, sem constraint e sem índice. Linhas existentes ficam com
-- NULL e o código antigo continua funcionando (select("*") ignora a coluna nova).
--
-- ORDEM DE APLICAÇÃO: aplicar ESTA migração ANTES do deploy do código. O código novo grava e lê numero_po;
-- sem a coluna, salvar um processo com Nº Ordem preenchido falha.
--
-- O formato (PO-00-0000, opcionalmente seguido de /texto, em maiúsculas) é validado no servidor
-- (shared/utils/numeroOrdem.ts), não no banco. Idempotente (if not exists).

alter table public.follow_up add column if not exists numero_po text;
