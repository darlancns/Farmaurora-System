// Limites da edição da PRÓPRIA conta (aba "Minha conta" em /configuracoes).
// Fonte única pro servidor (server/api/auth/conta/**) e pra tela da Fase C.

/** Mínimo de caracteres da senha — mesmo valor já usado em /redefinir-senha e no cadastro de contas. */
export const MIN_PASSWORD_LENGTH = 8;

/** Teto do bcrypt usado pelo Supabase Auth: acima disso a senha seria truncada/recusada. */
export const MAX_PASSWORD_LENGTH = 72;

export const NOME_MAX_LENGTH = 80;

/** Limite prático de um endereço de e-mail (RFC 5321). */
export const EMAIL_MAX_LENGTH = 254;

// Limite de tentativas ERRADAS da senha atual (POST /api/auth/conta/senha e /email), por usuário e por
// tipo de ação. 5 falhas dentro de 15 minutos bloqueiam por 15 minutos; acertar a senha zera o contador.
// Valores passados às funções SQL registrar_falha_conta/verificar_bloqueio_conta (migration
// 20261105100000_conta_tentativas.sql) — o banco não tem nada fixo.
export const LIMITE_FALHAS_SENHA_ATUAL = 5;
export const LIMITE_JANELA_MINUTOS = 15;
export const LIMITE_BLOQUEIO_MINUTOS = 15;
