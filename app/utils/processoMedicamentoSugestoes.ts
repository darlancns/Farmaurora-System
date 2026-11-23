import type { MedicamentoLido } from "#shared/types/Cadastro";
import { chaveCadastro } from "#shared/utils/cadastroNome";

// Sugestão do NOME do medicamento no formulário do Follow-Up, a partir do Cadastro de Medicamentos (lista já carregada no cliente; sem rede).
// É só AJUDA para digitar: o campo continua texto livre, guarda só o nome (como sempre) e não liga o processo ao Cadastro. Funções puras.

/** O máximo de sugestões na lista (o Cadastro tem centenas de medicamentos; uma busca curta casaria com muitos). */
export const LIMITE_SUGESTOES_MEDICAMENTO = 50;

/** Uma sugestão no formato do AppSearchSelect (`valor` é a chave da opção; `rotulo` é o que aparece e o que vai para o campo). */
export interface SugestaoMedicamento {
  valor: string;
  rotulo: string;
}

/**
 * Os medicamentos ATIVOS do Cadastro cujo nome tem o texto digitado, sem acento nem diferença de caixa (a mesma comparação do app para nomes do
 * Cadastro: chaveCadastro). Primeiro os que COMEÇAM com o texto, depois os que o têm no meio, cada grupo na ordem do Cadastro (alfabética). Inativos
 * nunca são sugeridos. Texto vazio (ou só espaços) não sugere nada.
 */
export function sugerirMedicamentos(
  medicamentos: readonly MedicamentoLido[],
  consulta: string,
  limite: number = LIMITE_SUGESTOES_MEDICAMENTO,
): SugestaoMedicamento[] {
  const q = chaveCadastro(consulta);
  if (q === "") return [];
  const comecam: SugestaoMedicamento[] = [];
  const contem: SugestaoMedicamento[] = [];
  for (const m of medicamentos) {
    if (!m.ativo) continue;
    const chave = chaveCadastro(m.nome);
    const sugestao = { valor: m.nome, rotulo: m.nome };
    if (chave.startsWith(q)) comecam.push(sugestao);
    else if (chave.includes(q)) contem.push(sugestao);
  }
  return [...comecam, ...contem].slice(0, limite);
}
