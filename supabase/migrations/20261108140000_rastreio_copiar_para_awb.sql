-- Item 5 do lote Follow-Up: "Rastreio" deixa de existir no sistema; fica só "Nº AWB".
--
-- Copia o conteúdo de codigo_rastreio para numero_awb nos processos que só tinham o rastreio.
--
-- JÁ APLICADA À MÃO EM PRODUÇÃO EM 08/11/2026, com backup prévio e conferência dos valores
-- (13 linhas). Este arquivo existe só para registrar o histórico e reproduzir o estado em outros
-- ambientes; reaplicar é inofensivo (idempotente).
--
-- Idempotente: só toca linhas em que numero_awb está vazio (NULL ou só espaços) e codigo_rastreio
-- não está. Nunca sobrescreve um Nº AWB já preenchido.

UPDATE public.follow_up
   SET numero_awb = btrim(codigo_rastreio)
 WHERE btrim(coalesce(numero_awb, '')) = ''
   AND btrim(coalesce(codigo_rastreio, '')) <> '';
