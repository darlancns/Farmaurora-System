import { canReadSection, type Role } from "#shared/utils/rbac";

// O nome do parâmetro (?aba=) e o valor "contas" são os mesmos de contaFoco.ts, que monta o link do sino.

// Abas de /configuracoes por cargo (regra pura, sem Vue/router — testada em tests/unit/abasConfiguracoes.spec.ts).
//
// - "contas": gestão das contas da equipe. Só quem LÊ a seção "admin" (sócio e administrador); o que cada
//   um pode escrever lá é decidido dentro do ContasTab (canWrite("admin")), como sempre foi.
// - "minha-conta": nome, e-mail e senha da PRÓPRIA conta — todos os cargos.
//
// Ordem: "Minha conta" é SEMPRE a primeira aba e a aba padrão de todos os cargos; "Contas" vem depois,
// só pra quem a vê.
export type AbaConfiguracoes = "contas" | "minha-conta";

export interface AbaConfiguracoesDef {
  key: AbaConfiguracoes;
  label: string;
}

export const DEF_ABA_CONTAS: AbaConfiguracoesDef = { key: "contas", label: "Contas" };
export const DEF_ABA_MINHA_CONTA: AbaConfiguracoesDef = { key: "minha-conta", label: "Minha conta" };

/** Aba padrão de TODOS os cargos: a que abre sem ?aba= (e a que a URL não precisa escrever). */
export const ABA_PADRAO: AbaConfiguracoes = DEF_ABA_MINHA_CONTA.key;

/** Abas visíveis ao cargo, na ordem de exibição. Sem cargo (ainda não carregado) → nenhuma. */
export function abasParaCargo(role: Role | null | undefined): AbaConfiguracoesDef[] {
  if (!role) return [];
  return canReadSection(role, "admin") ? [DEF_ABA_MINHA_CONTA, DEF_ABA_CONTAS] : [DEF_ABA_MINHA_CONTA];
}

/**
 * Aba a mostrar: o valor de `?aba=` quando for uma aba PERMITIDA ao cargo; qualquer outra coisa
 * (ausente, desconhecido, lista, ou aba de outro cargo) cai na aba padrão (ABA_PADRAO), sem erro.
 */
export function resolverAba(role: Role | null | undefined, valorDaQuery: unknown): AbaConfiguracoes {
  const bruto = Array.isArray(valorDaQuery) ? valorDaQuery[0] : valorDaQuery;
  const permitidas = abasParaCargo(role);
  const escolhida = permitidas.find((aba) => aba.key === bruto);
  return escolhida?.key ?? ABA_PADRAO;
}
