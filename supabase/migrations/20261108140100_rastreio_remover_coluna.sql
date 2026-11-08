-- NÃO APLICAR ANTES DO DEPLOY DO CÓDIGO SEM codigo_rastreio E DA CONFERÊNCIA FINAL.
-- APLICAR SÓ COM BACKUP.
--
-- Item 5 do lote Follow-Up: remove a coluna codigo_rastreio de public.follow_up. O app deixou de
-- lê-la e de gravá-la; os valores já foram copiados para numero_awb (20261108140000).
--
-- Trava de segurança: se sobrar qualquer linha com rastreio preenchido cujo Nº AWB seja diferente
-- dele (ou seja, um valor que seria perdido), a migração ABORTA e a coluna não é apagada.

DO $$
DECLARE
  pendentes integer;
BEGIN
  SELECT count(*) INTO pendentes
    FROM public.follow_up
   WHERE btrim(coalesce(codigo_rastreio, '')) <> ''
     AND numero_awb IS DISTINCT FROM btrim(codigo_rastreio);

  IF pendentes > 0 THEN
    RAISE EXCEPTION
      'Abortado: % linha(s) de follow_up com codigo_rastreio preenchido e numero_awb diferente. Copie/confira antes de apagar a coluna.',
      pendentes;
  END IF;
END
$$;

ALTER TABLE public.follow_up DROP COLUMN codigo_rastreio;
