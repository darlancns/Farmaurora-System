import type { ImpactoRenomearConsultor, ResultadoContasConsultor } from "#shared/types/Cadastro";

// Textos do renomear de consultor (Configurações → Cadastros → Consultores): a confirmação com as contagens e o aviso de contas de
// login que não foram atualizadas. Funções PURAS (tests/unit/cadastroConsultor.spec.ts); a tela só mostra o resultado.
// Só números e nomes de consultor/e-mail de conta aqui: nunca dados de pacientes.

const plural = (n: number, singular: string, pluralTexto: string): string => `${n} ${n === 1 ? singular : pluralTexto}`;

/** "3 processos do Follow-Up, 1 prestação, 0 POs da DIR, 4 compras e 2 contas de login". */
export function resumoImpactoRenomear(impacto: Omit<ImpactoRenomearConsultor, "nome">): string {
  return [
    plural(impacto.processos, "processo do Follow-Up", "processos do Follow-Up"),
    plural(impacto.pacientes, "prestação", "prestações"),
    plural(impacto.dir, "PO da DIR", "POs da DIR"),
    plural(impacto.compras, "compra", "compras"),
  ]
    .join(", ")
    .concat(` e ${plural(impacto.contas, "conta de login", "contas de login")}`);
}

/** Mensagem da janela de confirmação, ANTES de salvar. */
export function mensagemConfirmarRenomear(nomeAtual: string, nomeNovo: string, impacto: Omit<ImpactoRenomearConsultor, "nome">): string {
  return (
    `Renomear "${nomeAtual}" para "${nomeNovo}"? O novo nome passa a valer em ${resumoImpactoRenomear(impacto)}. ` +
    "Vale para todo o sistema e não é desfeito automaticamente."
  );
}

/** Aviso depois do renomear, quando alguma conta de login não foi atualizada. */
export function mensagemContasNaoAtualizadas(contas: ResultadoContasConsultor): string {
  const n = contas.falhas.length;
  return n === 1
    ? "Consultor renomeado, mas 1 conta de login não foi atualizada. Tente de novo:"
    : `Consultor renomeado, mas ${n} contas de login não foram atualizadas. Tente de novo:`;
}
