import type { Compra, CompraSalvarDTO } from "../types/compra";

// O corpo do salvamento automático (PATCH /api/compras/:id) a partir da compra que o formulário tem na mão: o ESTADO COMPLETO (todos os
// campos editáveis e os itens). `posicao` NÃO vai (a posição é a ordem do array), nem os campos só de leitura (medicamentoCadastroNome,
// preCadastroStatus). O formato é o que validarCompraSalvar aceita (testado em ida e volta).

/** `atualizadoEm` é a versão que o cliente viu na última leitura/gravação. */
export function corpoParaSalvar(compra: Compra, atualizadoEm: string): CompraSalvarDTO {
  return {
    atualizadoEm,
    sequencia: compra.sequencia,
    fornecedor: compra.fornecedor,
    envio: compra.envio,
    cia: compra.cia,
    empresa: compra.empresa,
    numeroOrdens: compra.numeroOrdens,
    frete: compra.frete,
    freteReal: compra.freteReal,
    paciente: compra.paciente,
    processoNumero: compra.processoNumero,
    compraParticular: compra.compraParticular,
    recorrente: compra.recorrente,
    medico: compra.medico,
    localAplicacao: compra.localAplicacao,
    entrega: compra.entrega,
    contatos: compra.contatos,
    despachante: compra.despachante,
    pagamentoAlvara: compra.pagamentoAlvara,
    pagamentoMomento: compra.pagamentoMomento,
    termoPosterior: compra.termoPosterior,
    termoObservacao: compra.termoObservacao,
    isencao: compra.isencao,
    documentos: compra.documentos,
    pendencias: [...compra.pendencias],
    observacoes: compra.observacoes,
    consultor: compra.consultor,
    responsavel: compra.responsavel,
    itens: [...compra.itens]
      .sort((a, b) => a.posicao - b.posicao)
      .map((i) => ({
        id: i.id,
        medicamento: i.medicamento,
        medicamentoCadastroId: i.medicamentoCadastroId,
        preCadastroId: i.preCadastroId,
        laboratorio: i.laboratorio,
        brand: i.brand,
        quantidade: i.quantidade,
        temperatura: i.temperatura,
        valorUnitario: i.valorUnitario,
        valorReal: i.valorReal,
      })),
  };
}
