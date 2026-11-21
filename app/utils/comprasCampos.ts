import { REGRAS_CHECKLIST } from "#shared/constants/compraChecklist";
import type { Compra } from "#shared/types/compra";
import { textoMedicamentoDir } from "#shared/utils/compraDir";

// O MAPA ÚNICO do checklist clicável: de cada item do checklist (erro ou aviso) ao campo do formulário que o resolve. Cada campo alvo
// tem o atributo estável `data-campo="<valor>"` (nunca o índice nem a classe CSS). "Ordem N" e "medicamento M" são a POSIÇÃO exibida (1..N).
//
// Os ids do checklist são os de shared/constants/compraChecklist.ts (REGRAS_CHECKLIST), com `ordem-N-` e `med-M-` na frente quando a regra é
// de uma ordem ou de um medicamento. O `data-campo` de cada campo é o MESMO texto do id do checklist, com estas exceções:
//   - `processo` com "Compra particular" marcada → a caixa (`processo-particular`; sem número a preencher);
//   - `ordem-N-med-M-pre-cadastro` → o campo Medicamento da linha (`ordem-N-med-M-nome`);
//   - `ordem-N-texto-dir` → o Medicamento da linha MAIS LONGA da ordem (o que mais pesa no limite de 300 caracteres);
//   - `ordens` (nenhuma ordem) → o botão "+ Adicionar ordem".
// Item "ok" nunca é botão (o despachante dispensado só existe como "ok").

/** Os campos "simples" da compra: o data-campo é o próprio id do checklist. */
export const CAMPOS_SIMPLES = [
  REGRAS_CHECKLIST.paciente,
  REGRAS_CHECKLIST.medico,
  REGRAS_CHECKLIST.vendedor,
  REGRAS_CHECKLIST.responsavel,
  REGRAS_CHECKLIST.despachante,
  REGRAS_CHECKLIST.pagamentoMomento,
  REGRAS_CHECKLIST.localAplicacao,
  REGRAS_CHECKLIST.entrega,
  REGRAS_CHECKLIST.documentos,
  REGRAS_CHECKLIST.ordens,
] as const;

/** O campo que o item do checklist aponta (valor do atributo data-campo), ou null se não há campo (item que não vira botão). */
export function campoDoItem(id: string, compra: Pick<Compra, "compraParticular" | "ordens">): string | null {
  if (id === REGRAS_CHECKLIST.processo) return compra.compraParticular ? "processo-particular" : REGRAS_CHECKLIST.processo;
  if ((CAMPOS_SIMPLES as readonly string[]).includes(id)) return id;

  const item = /^ordem-(\d+)-med-(\d+)-(.+)$/.exec(id);
  if (item) {
    const [, n, m, regra] = item;
    if (regra === REGRAS_CHECKLIST.preCadastro) return `ordem-${n}-med-${m}-${REGRAS_CHECKLIST.medNome}`;
    if (regra === REGRAS_CHECKLIST.medNome || regra === REGRAS_CHECKLIST.medTemperatura || regra === REGRAS_CHECKLIST.medQuantidade) return id;
    return null;
  }

  const ordem = /^ordem-(\d+)-(.+)$/.exec(id);
  if (ordem) {
    const [, n, regra] = ordem;
    if (regra === REGRAS_CHECKLIST.fornecedor || regra === REGRAS_CHECKLIST.envio || regra === REGRAS_CHECKLIST.po || regra === REGRAS_CHECKLIST.medicamentos) return id;
    if (regra === REGRAS_CHECKLIST.textoDir) {
      const linha = linhaMaisLongaDaOrdem(compra, Number(n));
      return linha === null ? `ordem-${n}-${REGRAS_CHECKLIST.medicamentos}` : `ordem-${n}-med-${linha}-${REGRAS_CHECKLIST.medNome}`;
    }
  }
  return null;
}

/** A posição (1..N) do medicamento da ordem N cujo texto na DIR (nome + apresentação, em maiúsculas) é o mais longo; o 1º em caso de empate. */
export function linhaMaisLongaDaOrdem(compra: Pick<Compra, "ordens">, posicaoDaOrdem: number): number | null {
  const ordem = compra.ordens.find((o) => o.posicao === posicaoDaOrdem);
  if (!ordem || ordem.itens.length === 0) return null;
  let melhor: { posicao: number; tamanho: number } | null = null;
  for (const item of [...ordem.itens].sort((a, b) => a.posicao - b.posicao)) {
    const tamanho = textoMedicamentoDir({ itens: [item] }).length;
    if (melhor === null || tamanho > melhor.tamanho) melhor = { posicao: item.posicao, tamanho };
  }
  return melhor?.posicao ?? null;
}

/** Se o campo desabilitado/inexistente não puder receber foco, tenta este (ex.: a Entrega fica desabilitada com "Entrega no mesmo local"). */
export const CAMPO_ALTERNATIVO: Record<string, string> = {
  entrega: "local-aplicacao",
};

/** O data-campo de um campo de ordem ou de medicamento (a ordem N e o medicamento M são posições exibidas). */
export const campoDaOrdem = (numero: number, regra: string): string => `ordem-${numero}-${regra}`;
export const campoDoMedicamento = (numeroOrdem: number, posicao: number, regra: string): string => `ordem-${numeroOrdem}-med-${posicao}-${regra}`;
