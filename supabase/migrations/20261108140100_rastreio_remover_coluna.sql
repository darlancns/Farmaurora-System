-- APLICADA à mão em produção em 08/11/2026, depois do deploy do código sem codigo_rastreio (f935e15),
-- com backup, ensaio em ROLLBACK e trava. Idempotente: se a coluna não existir, não faz nada.
-- NÃO remover a trava.
--
-- Item 5 do lote Follow-Up: remove a coluna codigo_rastreio de public.follow_up. O app deixou de
-- lê-la e de gravá-la; os valores já foram copiados para numero_awb (20261108140000).
--
-- Trava: se sobrar qualquer linha com rastreio preenchido cujo Nº AWB seja diferente dele (um valor
-- que seria perdido), a migração ABORTA e a coluna não é apagada. A consulta da trava e o DROP ficam
-- em EXECUTE porque citam a coluna, que pode não existir.

DO $$
DECLARE
  pendentes integer;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'follow_up'
       AND column_name = 'codigo_rastreio'
  ) THEN
    EXECUTE $q$
      SELECT count(*)
        FROM public.follow_up
       WHERE nullif(btrim(codigo_rastreio), '') IS NOT NULL
         AND numero_awb IS DISTINCT FROM btrim(codigo_rastreio)
    $q$ INTO pendentes;

    IF pendentes > 0 THEN
      RAISE EXCEPTION 'TRAVA: existe rastreio sem AWB correspondente (% linha(s))', pendentes;
    END IF;

    EXECUTE 'ALTER TABLE public.follow_up DROP COLUMN codigo_rastreio';
  END IF;
END
$$;
