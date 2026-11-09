import type { Dir, NewDirDTO } from "../../../shared/types/dir";

// Fixtures SINTÉTICAS da DIR (nomes e dados inventados — nunca copiar linha real da planilha).

export function novoDirDTO(sobrescrever: Partial<NewDirDTO> = {}): NewDirDTO {
  return {
    po: "PO26-10-0001",
    paciente: "PACIENTE TESTE UM",
    conferido: false,
    vendedor: "Mateus Morais",
    responsavel: "Bruno",
    exigencia: false,
    dataEmissao: "2026-10-05",
    dataCobrancaFornecedores: "2026-10-08",
    receita: "Original",
    medicamento: "MEDICAMENTO X",
    temperatura: "2°C a 8°C",
    fornecedor: "Speciality",
    envio: "Air Cargo",
    companhiaAerea: "",
    awb: "Lufthansa: 020-00000000",
    despachante: "STAR CUSTOMS",
    status: "on_going",
    dataEntrega: "",
    contratoCambio: "123456789",
    observacao: "TUDO OK",
    banco: "XP",
    dataPagamento: "",
    operacaoEncerrada: false,
    fechamentoRestante: false,
    dactes: false,
    dsiDirDuimp: false,
    logger: false,
    fechamento: false,
    numerario: false,
    protocoloAssinado: false,
    swift: false,
    termometro: false,
    ...sobrescrever,
  };
}

let contador = 0;

export function novoDir(sobrescrever: Partial<Dir> = {}): Dir {
  contador += 1;
  return {
    ...novoDirDTO(),
    id: `dir_teste_${contador}`,
    fechamentoRestanteEm: "",
    fechamentoRestantePor: "",
    createdAt: "2026-10-05T12:00:00.000Z",
    updatedAt: "2026-10-05T12:00:00.000Z",
    ...sobrescrever,
  };
}
