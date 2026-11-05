-- Notificação "conta editada": novo valor 'conta_editada' no enum public.tipo_notificacao.
--
-- NÃO APLICADA por quem escreveu este arquivo: rodar à mão no SQL Editor do Supabase, ANTES do deploy
-- dos endpoints de /api/auth/conta/** (sem o valor, o INSERT da notificação falha — a edição da conta
-- continua valendo, mas os administradores não são avisados).
--
-- Idempotente (IF NOT EXISTS) e sem efeito nenhum nas linhas existentes: só acrescenta um valor ao
-- enum. Nenhuma coluna muda — `recado_id` já aceita nulo. O valor novo não é usado nesta mesma
-- transação, então o ADD VALUE não esbarra na regra de "enum recém-criado não pode ser usado".

alter type public.tipo_notificacao add value if not exists 'conta_editada';
