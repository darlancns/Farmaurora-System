// "Ir até as contas" em /configuracoes: a notificação "conta_editada" do sino leva a
// /configuracoes?aba=contas. A página ainda NÃO lê esse parâmetro (a aba "Contas" já é a padrão
// hoje) — a Fase C passa a escolher a aba por ele. Mesmo mecanismo de ?processo= e ?recado=.
export const QUERY_ABA = "aba";
export const ABA_CONTAS = "contas";

export interface RotaConfiguracoes {
  path: string;
  query: Record<string, string>;
}

export function rotaParaContas(): RotaConfiguracoes {
  return { path: "/configuracoes", query: { [QUERY_ABA]: ABA_CONTAS } };
}
