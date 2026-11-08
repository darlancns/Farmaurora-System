-- Item 5 do lote Follow-Up: "Rastreio" deixa de existir no sistema; fica só "Nº AWB".
--
-- Copia o conteúdo de codigo_rastreio para numero_awb nos processos que só tinham o rastreio.
--
-- Aplicada à mão em produção em 08/11/2026, com backup e conferência (13 linhas).
-- Idempotente: sem a coluna codigo_rastreio, não faz nada.
--
-- Só toca linhas em que numero_awb está vazio (NULL ou só espaços) e codigo_rastreio não está:
-- nunca sobrescreve um Nº AWB já preenchido. O UPDATE fica dentro de EXECUTE para que a coluna
-- inexistente (banco novo, ou depois de 20261108140100) não quebre o parse.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'follow_up'
       AND column_name = 'codigo_rastreio'
  ) THEN
    EXECUTE $q$
      UPDATE public.follow_up
         SET numero_awb = btrim(codigo_rastreio)
       WHERE nullif(btrim(numero_awb), '') IS NULL
         AND nullif(btrim(codigo_rastreio), '') IS NOT NULL
    $q$;
  END IF;
END
$$;
