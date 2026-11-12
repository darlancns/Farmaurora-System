export interface Medicamento {
  nome: string;
  dosagem?: string;
  quantidade?: string;
}

export interface AtualizacaoProcesso {
  data: string; // texto livre, ex: "31/08" ou "2026-08-31"
  texto: string;
}

export interface TransportadoraNacional {
  nome: string;
  cotacao?: string;
  valor?: number;
}

// Os 5 status do fluxo (a ordem e os rótulos ficam em shared/constants/processos.ts). `elaboracao_fornecedores`
// é o valor gravado de "Na origem" (o nome interno não muda: é o valor do enum no Postgres).
export type StatusProcesso = "elaboracao_fornecedores" | "em_transito" | "desembaraco" | "liberado" | "entregue";

// Valores que ainda existem no enum do Postgres (valor de enum não se remove), mas SAÍRAM do app: nunca são
// gravados (o servidor recusa com 400) e, na leitura, viram um dos 5 (ver normalizarStatusProcesso).
export type StatusProcessoLegado = "aguardando_inicio" | "liberado_parcial" | "outro";

export type EmpresaProcesso = "FARMAURORA" | "MAINZFARMA";

// Tipo independente de shared/types/Patient.ts (ConsultorNome) — Processo não tem
// nenhuma relação/FK com Patient, ver server/utils/processosStore.ts. É um
// SUPERCONJUNTO de ConsultorNome: os 7 de Pacientes + os consultores que só
// existem no Follow-Up. Também é o tipo do nome de consultor das contas (RBAC).
export type ConsultorProcesso =
  | "Alessandra"
  | "André Vitório"
  | "Bolívar"
  | "Bráulio"
  | "Dani"
  | "Flávia"
  | "Gabriela Megda"
  | "Gabriela Santana"
  | "Mateus Morais"
  | "Paulinho"
  | "Paulo Braga"
  | "Thiago Guedes"
  | "Vinícius Alves";

// Tipo usado apenas pra montar as opções do select — o campo Processo.modalEnvio
// em si fica com tipo largo (string), porque registros migrados do doc antigo têm
// modalEnvio "Courier" (valor legado que não existe mais aqui). Ver nota em
// Processo.modalEnvio mais abaixo.
export type ModalEnvio = "Air Cargo" | "Courier Formal" | "Courier Simples";

// Idem: tipo usado só pras opções do select de Despachante. Processo.despachante
// continua string livre pra não travar em registros com valor legado que não bate
// com nenhum dos 3 nomes confirmados (ex.: "Marcelo Lopes", "Marcelo" sem sobrenome).
export type DespachanteProcesso = "Andreza Faconi" | "Bruno Lopes" | "Marcelo Lima";

// Idem: tipo usado só pras opções do select de Fornecedor. "Outro" é o valor
// sentinela do select quando o usuário escolhe digitar um fornecedor fora da
// lista fixa — o que é salvo em Processo.fornecedor nesse caso é o texto
// digitado, nunca a string literal "Outro" (ver ProcessoFormModal.vue).
export type FornecedorProcesso =
  | "Beldimed - Bélgica"
  | "Pharyx - China"
  | "Poros - Turquia"
  | "Speciality - Índia"
  | "Outro";

export type StatusPagamentoProcesso = "pago" | "pendente";

export interface ProcessoDatas {
  dataCompraPO?: string;
  dataEmbarque?: string;
  aberturaThread?: string;
  dataChegadaBrasil?: string;
  registroRadar?: string;
  registroDuimp?: string;
  registroLpco?: string;
  previsaoEntrega?: string;
  supostaEstimativa?: string;
}

export interface Processo {
  id: string;
  paciente: string;
  // Nº Remessa (rótulo da tela "Nº Remessa"): inteiro >= 1, SEMPRE presente (processo novo = 1). Substitui o antigo
  // `ordem` ("Ordem 2"), cuja coluna ficou congelada no banco. Ver shared/utils/numeroRemessa.ts.
  numeroRemessa: number;
  // PO, rótulo da tela "PO". Só o PO completo no formato da DIR, ex.: "PO26-10-0471" (ou ausente).
  // Não confundir com o Nº Remessa. Ver shared/utils/numeroPo.ts.
  numeroPo?: string;
  pasta: string; // ex: "2026 - 234" (renomeado de "codigo")
  empresa: EmpresaProcesso;
  consultor: ConsultorProcesso;
  responsavelOperacional?: string; // Bruno, Rebeca
  despachante?: string; // um dos DespachanteProcesso, ou valor legado não migrado (ver tipo)
  fornecedor?: string; // um dos FornecedorProcesso, texto livre quando "Outro", ou valor legado
  transportadoraNacional?: TransportadoraNacional;
  // string livre (não ModalEnvio) pelo mesmo motivo de despachante/fornecedor:
  // registros migrados têm modalEnvio "Courier", valor que não existe mais no
  // enum novo (ModalEnvio). Não reclassificar automaticamente — só a Cris decide
  // Simples vs Formal pra cada processo legado.
  modalEnvio?: string;
  companhiaAerea?: string;
  numeroAwb?: string;
  medicamentos: Medicamento[];
  // Sempre um dos 5 (o servidor normaliza o legado na leitura). O antigo texto livre do status "Outro"
  // (coluna status_outro) saiu do app: a coluna fica intocada no banco e nada a lê ou grava.
  status: StatusProcesso;
  datas: ProcessoDatas;
  localEntrega?: string;
  numeroProcesso?: string;
  pendencias: string[];
  statusPagamento?: StatusPagamentoProcesso;
  // true = usuário marcou manualmente o alerta de prazo de fornecedor como
  // resolvido pra este processo, suprimindo a notificação mesmo que o prazo
  // já tenha passado (ver app/utils/prazoFornecedor.ts).
  alertaFornecedorResolvido?: boolean;
  // true = o alerta "solicitar Mandado de Segurança" (7 dias após o registro do LPCO) foi
  // resolvido pra este processo, some do sino pra todos (ver app/utils/prazoMandado.ts).
  alertaMandadoResolvido?: boolean;
  atualizacoes: AtualizacaoProcesso[];
  createdAt: string;
  updatedAt: string;
}

// `numeroRemessa` é opcional na criação: ausente = 1 (o servidor preenche).
export type NewProcessoDTO = Omit<Processo, "id" | "createdAt" | "updatedAt" | "numeroRemessa"> & {
  numeroRemessa?: number;
};

// Payload de edição não inclui `atualizacoes` — a timeline é gerenciada à parte,
// via ProcessoDetail (campo rápido de atualização), pra não sobrescrever entradas
// já registradas quando o usuário só edita outros campos por este formulário.
export type ProcessoFormUpdatePayload = Omit<NewProcessoDTO, "atualizacoes">;

// Campos OPCIONAIS controlados pelo formulário de edição. No PATCH, `null` significa "o usuário
// esvaziou o campo: limpe a coluna" (NULL no banco). Ausente (`undefined`) significa "não toque".
// O JSON NÃO transporta `undefined` (a chave some), por isso o esvaziamento precisa ir como `null`.
// A lista em runtime é CAMPOS_PROCESSO_LIMPAVEIS (shared/constants/processos.ts).
export type CampoProcessoLimpavel =
  | "numeroPo"
  | "responsavelOperacional"
  | "despachante"
  | "fornecedor"
  | "transportadoraNacional"
  | "modalEnvio"
  | "companhiaAerea"
  | "numeroAwb"
  | "localEntrega"
  | "numeroProcesso"
  | "statusPagamento";

// Datas do PATCH: cada chave opcional; `null` limpa a coluna. Com `parcial: true` só as chaves PRESENTES
// são tocadas; sem `parcial` (formato antigo) a chave ausente também limpa.
export type ProcessoDatasPatch = { [K in keyof ProcessoDatas]?: string | null };

// Transportadora do PATCH por chave (com `parcial: true`): só as chaves presentes são tocadas e `null`
// limpa. `nome: null` limpa o bloco inteiro (sem nome não há transportadora). Sem `parcial`, é o objeto
// completo de sempre (nome obrigatório), que substitui as três colunas.
export interface TransportadoraNacionalPatch {
  nome?: string | null;
  cotacao?: string | null;
  valor?: number | null;
}

// Corpo do PATCH: como Partial<NewProcessoDTO>, mas os campos opcionais acima também aceitam `null`.
// Os obrigatórios (paciente, pasta, empresa, consultor, status), medicamentos, pendências e
// atualizações NÃO aceitam null. `parcial: true` marca o formato novo do formulário (patch diferencial:
// só o que mudou, datas e transportadora por chave); o servidor o remove antes de gravar.
export type ProcessoPatchDTO = Omit<
  Partial<NewProcessoDTO>,
  CampoProcessoLimpavel | "datas"
> & {
  [K in Exclude<CampoProcessoLimpavel, "transportadoraNacional">]?: NewProcessoDTO[K] | null;
} & {
  transportadoraNacional?: TransportadoraNacionalPatch | null;
  datas?: ProcessoDatasPatch;
  parcial?: boolean;
};

// Payload do formulário de EDIÇÃO (nunca leva `atualizacoes`), já com os campos esvaziados como null.
// `versao` = o updatedAt do processo no instante em que o formulário foi ABERTO (string opaca). Só vai quando
// o patch traz `pendencias` ou `medicamentos` (o servidor a exige nesse caso e responde 409 se a linha mudou).
export type ProcessoFormPatchPayload = Omit<ProcessoPatchDTO, "atualizacoes"> & { versao?: string };
