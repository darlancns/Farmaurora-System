// Identificador de processo gerado pelo CLIENTE ao abrir o formulário "Novo processo" (segunda proteção contra envio
// repetido: o 2º POST com o mesmo id bate na chave primária e o servidor responde 409 em vez de criar outro processo).
// Formato estrito: "proc_" + UUID v4 em minúsculas (crypto.randomUUID). O servidor só aceita esse formato; sem `id` no
// corpo ele continua gerando o seu (clientes antigos seguem funcionando).

export const ID_NOVO_PROCESSO_RE = /^proc_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const MENSAGEM_ID_PROCESSO_INVALIDO = "Identificador do processo inválido.";

export const MENSAGEM_PROCESSO_JA_CRIADO = "Esse processo já foi criado.";

export function isIdNovoProcessoValido(valor: unknown): valor is string {
  return typeof valor === "string" && ID_NOVO_PROCESSO_RE.test(valor);
}

/**
 * Gera `proc_<uuid>` com crypto.randomUUID. Sem suporte (contexto não seguro, navegador antigo) devolve `undefined`:
 * o POST segue sem `id` e o servidor gera o seu, como sempre.
 */
export function gerarIdNovoProcesso(): string | undefined {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (!c || typeof c.randomUUID !== "function") return undefined;
  const id = `proc_${c.randomUUID()}`;
  return isIdNovoProcessoValido(id) ? id : undefined;
}
