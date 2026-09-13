import { isAuthWeakPasswordError, type WeakPasswordReasons } from "@supabase/supabase-js";

const REASON_LABEL: Partial<Record<WeakPasswordReasons, string>> = {
  length: "está muito curta",
  characters: "precisa combinar letras maiúsculas, minúsculas, números e/ou símbolos",
  pwned: "já apareceu em vazamentos de dados conhecidos — escolha uma diferente",
};

function joinFrase(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/**
 * Traduz o motivo real de rejeição de senha pelo Supabase (`AuthWeakPasswordError.reasons`)
 * pra uma mensagem específica em português. Usado tanto no client
 * (`supabase.auth.updateUser`) quanto no server (`admin.auth.admin.createUser`/
 * `updateUserById`) — mesmos erros, mesma tradução.
 *
 * Qualquer erro que não seja de senha fraca (rede, sessão expirada, e-mail já
 * existente, etc.) cai no `fallback` do chamador — não inventamos que é sobre
 * senha quando não é.
 */
export function formatPasswordError(error: unknown, fallback: string): string {
  if (!isAuthWeakPasswordError(error)) return fallback;

  const labels = error.reasons
    .map((reason) => REASON_LABEL[reason])
    .filter((label): label is string => !!label);

  if (labels.length === 0) return error.message || fallback;

  return `A senha ${joinFrase(labels)}.`;
}
