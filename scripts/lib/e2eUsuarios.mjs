// Peças puras do setup das contas de teste e2e (scripts/setup-e2e-local-users.mjs). Sem rede e sem
// Supabase, pra serem testáveis (tests/unit/e2eUsuarios.spec.ts). Nada aqui lê ou imprime senha.

import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";

/** Domínio dos e-mails de teste. Só existem no Supabase LOCAL; nenhum e-mail é enviado a eles. */
export const DOMINIO_PADRAO = "farmaurora.com.br";

/**
 * Consultor das contas de cargo `consultor`. Tem que ser um dos CONSULTORES_PROCESSO
 * (shared/constants/processos.ts) — tests/unit/e2eUsuarios.spec.ts garante isso.
 */
export const CONSULTOR_NOME_PADRAO = "Alessandra";

/**
 * As 4 contas dedicadas de teste, uma por cargo. `chave` vira o prefixo das variáveis (E2E_<CHAVE>_EMAIL,
 * E2E_<CHAVE>_PASSWORD) que os specs leem.
 */
export const CONTAS_E2E = [
  { chave: "ADMIN", role: "administrador", nome: "E2E Administrador" },
  { chave: "OPERACIONAL", role: "operacional", nome: "E2E Operacional" },
  { chave: "SOCIO", role: "socio", nome: "E2E Socio" },
  { chave: "CONSULTOR", role: "consultor", nome: "E2E Consultor", consultorNome: CONSULTOR_NOME_PADRAO },
];

export function emailDe(conta, dominio = DOMINIO_PADRAO) {
  return `e2e.${conta.chave.toLowerCase()}@${dominio}`;
}

/**
 * app_metadata no MESMO formato de roleAppMetadata (server/utils/authUser.ts):
 * `{ role, consultorNome, nome }`, com `consultorNome: null` fora do cargo consultor.
 * tests/unit/e2eUsuarios.spec.ts compara as duas implementações.
 */
export function appMetadataDe(conta) {
  return {
    role: conta.role,
    consultorNome: conta.role === "consultor" ? conta.consultorNome : null,
    nome: conta.nome,
  };
}

/** Senha forte e aleatória (24 chars base64url + sufixo que garante classes de caractere). */
export function gerarSenha() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

const HOSTS_LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Mesma regra de tests/e2e/_guards/supabaseLocal.ts: só loopback. */
export function urlEhLoopback(url) {
  try {
    return HOSTS_LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Lê chave=valor de um texto .env (via util.parseEnv). */
export function lerEnvTexto(texto) {
  const bruto = parseEnv(texto);
  const env = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (typeof valor === "string") env[chave] = valor.trim();
  }
  return env;
}

/**
 * Define/atualiza `CHAVE=valor` num texto .env sem tocar no resto (comentários, ordem, CRLF/LF).
 * Chave existente: troca a linha. Chave nova: acrescenta no fim.
 */
export function definirNoEnvTexto(texto, pares) {
  const eol = texto.includes("\r\n") ? "\r\n" : "\n";
  const linhas = texto.length === 0 ? [] : texto.split(/\r?\n/);
  if (linhas.length > 0 && linhas[linhas.length - 1] === "") linhas.pop();

  for (const [chave, valor] of Object.entries(pares)) {
    const i = linhas.findIndex((l) => new RegExp(`^\\s*${chave}\\s*=`).test(l));
    const nova = `${chave}=${valor}`;
    if (i >= 0) linhas[i] = nova;
    else linhas.push(nova);
  }
  return linhas.join(eol) + eol;
}

/**
 * Variáveis E2E_* a gravar no .env.e2e. Reaproveita a senha que já está lá (rodar de novo não troca
 * senha, a menos que `rotacionar`), e gera uma nova para quem não tem. `E2E_USER_*` (usado por
 * auth.spec e layout-responsivo.spec) aponta para o operacional.
 */
export function planejarVariaveis(envAtual, { dominio = DOMINIO_PADRAO, rotacionar = false } = {}) {
  const pares = {};
  const senhas = {};

  for (const conta of CONTAS_E2E) {
    const chaveSenha = `E2E_${conta.chave}_PASSWORD`;
    const existente = envAtual[chaveSenha];
    const senha = !rotacionar && existente ? existente : gerarSenha();
    senhas[conta.chave] = senha;

    pares[`E2E_${conta.chave}_EMAIL`] = emailDe(conta, dominio);
    pares[chaveSenha] = senha;
    if (conta.role === "consultor") pares.E2E_CONSULTOR_NOME = conta.consultorNome;
  }

  const operacional = CONTAS_E2E.find((c) => c.chave === "OPERACIONAL");
  pares.E2E_USER_EMAIL = emailDe(operacional, dominio);
  pares.E2E_USER_PASSWORD = senhas.OPERACIONAL;
  if (envAtual.NUXT_SUPABASE_SERVICE_ROLE_KEY) pares.E2E_SERVICE_ROLE_KEY = envAtual.NUXT_SUPABASE_SERVICE_ROLE_KEY;

  return { pares, senhas };
}
