import { canReadSection, canWriteSection, type Role } from "#shared/utils/rbac";

// O nome do parâmetro (?aba=) e o valor "contas" são os mesmos de contaFoco.ts, que monta o link do sino.

// Abas de /configuracoes por cargo (regra pura, sem Vue/router — testada em tests/unit/abasConfiguracoes.spec.ts).
//
// - "contas": gestão das contas da equipe. Só quem LÊ a seção "admin" (hoje só o administrador); o ContasTab ainda
//   confere canWrite("admin") para os botões de gestão.
// - "minha-conta": nome, e-mail e senha da PRÓPRIA conta — todos os cargos.
// - "cadastros": listas de Fornecedor, Despachante e Temperatura. Aba SÓ do administrador (quem ESCREVE a seção
//   "config"): o sócio não vê Cadastros (nem Contas). As listas em si são lidas por todos os cargos na API; esta aba
//   é a tela de edição.
//
// Ordem: "Minha conta" é SEMPRE a primeira aba e a aba padrão de todos os cargos; "Contas" vem depois, só pra quem a
// vê, e "Cadastros" por último, só pro administrador.
export type AbaConfiguracoes = "contas" | "minha-conta" | "cadastros";

export interface AbaConfiguracoesDef {
  key: AbaConfiguracoes;
  label: string;
}

export const DEF_ABA_CONTAS: AbaConfiguracoesDef = { key: "contas", label: "Contas" };
export const DEF_ABA_CADASTROS: AbaConfiguracoesDef = { key: "cadastros", label: "Cadastros" };
export const DEF_ABA_MINHA_CONTA: AbaConfiguracoesDef = { key: "minha-conta", label: "Minha conta" };

/** Aba padrão de TODOS os cargos: a que abre sem ?aba= (e a que a URL não precisa escrever). */
export const ABA_PADRAO: AbaConfiguracoes = DEF_ABA_MINHA_CONTA.key;

/** Abas visíveis ao cargo, na ordem de exibição. Sem cargo (ainda não carregado) → nenhuma. */
export function abasParaCargo(role: Role | null | undefined): AbaConfiguracoesDef[] {
  if (!role) return [];
  const abas: AbaConfiguracoesDef[] = [DEF_ABA_MINHA_CONTA];
  if (canReadSection(role, "admin")) abas.push(DEF_ABA_CONTAS);
  if (canWriteSection(role, "config")) abas.push(DEF_ABA_CADASTROS);
  return abas;
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
