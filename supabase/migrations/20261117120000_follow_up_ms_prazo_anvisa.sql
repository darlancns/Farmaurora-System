-- JÁ APLICADA MANUALMENTE EM PRODUÇÃO EM 17/11/2026; NÃO REAPLICAR.
-- (Este arquivo existe só para o repositório ficar fiel ao banco. É idempotente — `if not exists` — mas não há
-- motivo para rodá-lo de novo em produção.)
--
-- Follow-Up: Mandado de Segurança / ANVISA.
--  - ms_anexado_em              date NULL: dia em que o despachante anexou o Mandado de Segurança ("MS Anexado em").
--  - prazo_anvisa               date NULL: prazo que a ANVISA tem para responder ("Prazo da ANVISA").
--  - alerta_anvisa_ciente_prazo date NULL: o prazo_anvisa para o qual alguém deu "Ciente" no aviso "Prazo limite pra
--    Manifestação da ANVISA". O aviso some enquanto este valor for IGUAL ao prazo_anvisa atual; se o prazo mudar,
--    deixa de bater e o aviso volta.
--
-- ADITIVA: três colunas novas, nulas, sem default, sem constraint e sem índice. Nenhum dado existente muda.
-- Coluna `date` NÃO aceita "" — o código grava NULL para campo vazio e o servidor recusa (400) data que não seja
-- AAAA-MM-DD válida.
--
-- Desfazer (só depois de reverter o código que lê/grava estas colunas; perde o que foi preenchido):
--   alter table public.follow_up drop column if exists ms_anexado_em;
--   alter table public.follow_up drop column if exists prazo_anvisa;
--   alter table public.follow_up drop column if exists alerta_anvisa_ciente_prazo;

alter table public.follow_up add column if not exists ms_anexado_em date;
alter table public.follow_up add column if not exists prazo_anvisa date;
alter table public.follow_up add column if not exists alerta_anvisa_ciente_prazo date;
