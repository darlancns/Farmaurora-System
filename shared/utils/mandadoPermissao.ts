import type { Role } from "./rbac";

// Regra ÚNICA de quem enxerga e quem pode resolver o alerta de Mandado de Segurança.
// Usada pela tela (sino) e pelo servidor (PATCH /api/processos/:id), pra nunca divergirem.
//
// - Administrador: todos os processos.
// - Operacional: só os processos em que ele é o responsável — vínculo pelo PRIMEIRO NOME da conta
//   (app_metadata.nome, ex.: "Bruno Alves") com follow_up.responsavel_operacional (ex.: "Bruno"),
//   ignorando maiúsculas e acentos.
// - Consultor, sócio e sem login: nunca.
export const ROLE_VE_TODOS_MANDADO: Role = "administrador";
export const ROLE_VE_PROPRIOS_MANDADO: Role = "operacional";

// Primeiro nome sem acento e em minúsculas ("Rebeca Alcântara" -> "rebeca"; "Bruno" -> "bruno").
export function primeiroNomeNormalizado(nome: string | undefined | null): string {
  const limpo = (nome ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
  return limpo.split(/\s+/)[0] ?? "";
}

// Conta sem nome (contas antigas) ou processo sem responsável: o operacional não vê nem resolve.
export function podeVerAlertaMandado(
  usuario: { role: Role | null | undefined; nome?: string | null },
  responsavelOperacional: string | undefined | null,
): boolean {
  if (usuario.role === ROLE_VE_TODOS_MANDADO) return true;
  if (usuario.role !== ROLE_VE_PROPRIOS_MANDADO) return false;
  const dele = primeiroNomeNormalizado(usuario.nome);
  return dele !== "" && dele === primeiroNomeNormalizado(responsavelOperacional);
}

// Resolver exige exatamente a mesma permissão de ver (um único critério, tela e servidor).
export const podeResolverAlertaMandado = podeVerAlertaMandado;
