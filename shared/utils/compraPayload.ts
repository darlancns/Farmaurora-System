import type { CompraSalvarDTO, Compra, OrdemCompra, OrdemCompraSalvarDTO } from "../types/compra";

// O corpo do salvamento automático (PATCH /api/compras/:id) a partir da compra que o formulário tem na mão: o ESTADO COMPLETO (todos os
// campos editáveis e as ordens com os itens). `posicao` NÃO vai (a posição é a ordem do array). O formato é o que validarCompraSalvar aceita (testado em ida e volta).

function ordemParaSalvar(o: OrdemCompra): OrdemCompraSalvarDTO {
  return {
    id: o.id,
    fornecedor: o.fornecedor,
    envio: o.envio,
    cia: o.cia,
    po: o.po,
    frete: o.frete,
    freteReal: o.freteReal,
    itens: [...o.itens]
      .sort((a, b) => a.posicao - b.posicao)
      .map((i) => ({
        id: i.id,
        medicamento: i.medicamento,
        medicamentoCadastroId: i.medicamentoCadastroId,
        preCadastroId: i.preCadastroId,
        apresentacao: i.apresentacao,
        referencia: i.referencia,
        laboratorio: i.laboratorio,
        quantidade: i.quantidade,
        temperatura: i.temperatura,
        valorUnitario: i.valorUnitario,
        valorReal: i.valorReal,
      })),
  };
}

/** `atualizadoEm` é a versão que o cliente viu na última leitura/gravação. */
export function corpoParaSalvar(compra: Compra, atualizadoEm: string): CompraSalvarDTO {
  return {
    atualizadoEm,
    paciente: compra.paciente,
    processoNumero: compra.processoNumero,
    medico: compra.medico,
    localAplicacao: compra.localAplicacao,
    entrega: compra.entrega,
    contatos: compra.contatos,
    termoObservacao: compra.termoObservacao,
    despachante: compra.despachante,
    isencaoPara: compra.isencaoPara,
    observacoes: compra.observacoes,
    vendedor: compra.vendedor,
    responsavel: compra.responsavel,
    compraParticular: compra.compraParticular,
    localDeclarado: compra.localDeclarado,
    termoPosterior: compra.termoPosterior,
    courierSimples: compra.courierSimples,
    isencao: compra.isencao,
    recorrente: compra.recorrente,
    pagamentoAlvara: compra.pagamentoAlvara,
    pagamentoMomento: compra.pagamentoMomento,
    documentos: compra.documentos,
    pendencias: [...compra.pendencias],
    ordens: [...compra.ordens].sort((a, b) => a.posicao - b.posicao).map(ordemParaSalvar),
  };
}
