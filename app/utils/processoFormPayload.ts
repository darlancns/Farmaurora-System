import type {
  ConsultorProcesso,
  EmpresaProcesso,
  Medicamento,
  ProcessoDatas,
  ProcessoFormPatchPayload,
  ProcessoFormUpdatePayload,
  StatusPagamentoProcesso,
  StatusProcesso,
  TransportadoraNacional,
} from "#shared/types/processo";
import { CAMPOS_PROCESSO_LIMPAVEIS } from "#shared/constants/processos";
import { NUMERO_ORDEM_ERRO, normalizarNumeroOrdem, numeroOrdemValido } from "#shared/utils/numeroOrdem";
import { formatOrdemLabel } from "./processoFormatters";

// Funções puras extraídas de ProcessoFormModal.vue (Round 9) — caracterizadas
// em tests/unit/processoFormPayload.spec.ts. Comportamento preservado
// exatamente como estava; nada foi corrigido aqui, mesmo onde algo pareça
// estranho (ver achados no relatório da extração).

// Mesmo shape do FormState de ProcessoFormModal.vue — declarado aqui (não
// importado do componente) pra este módulo não depender de Vue. O `form`
// reativo do componente já bate estruturalmente com esta interface.
export interface ProcessoFormState {
  paciente: string;
  ordem: string;
  numeroPo: string; // Nº Ordem (PO), como mascarado no campo: PO-00-0000[/texto]
  pasta: string;
  empresa: EmpresaProcesso;
  consultor: ConsultorProcesso | "";
  responsavelOperacional: string;
  despachante: string;
  transportadoraNome: string;
  transportadoraCotacao: string;
  transportadoraValor: string;
  modalEnvio: string;
  companhiaAerea: string;
  numeroAwb: string;
  status: StatusProcesso;
  statusOutro: string; // texto livre; só vale (e é obrigatório) com status "outro"
  dataCompraPO: string;
  dataEmbarque: string;
  aberturaThread: string;
  dataChegadaBrasil: string;
  registroRadar: string;
  registroDuimp: string;
  registroLpco: string;
  previsaoEntrega: string;
  supostaEstimativa: string;
  localEntrega: string;
  numeroProcesso: string;
  statusPagamento: StatusPagamentoProcesso | "";
}

// Air Cargo e Courier Formal exigem Despachante e Transportadora; Courier
// Simples esconde os dois. Qualquer outro valor (vazio, ou o legado "Courier"
// de registros migrados) cai no comportamento padrão de mostrar os campos —
// nunca esconde dado já preenchido por causa de um valor que não reconhecemos.
export function precisaDespachanteTransportadora(modalEnvio: string): boolean {
  return modalEnvio !== "Courier Simples";
}

export function buildDatas(form: ProcessoFormState): ProcessoDatas {
  return {
    dataCompraPO: form.dataCompraPO.trim() || undefined,
    dataEmbarque: form.dataEmbarque.trim() || undefined,
    aberturaThread: form.aberturaThread.trim() || undefined,
    dataChegadaBrasil: form.dataChegadaBrasil.trim() || undefined,
    registroRadar: form.registroRadar.trim() || undefined,
    registroDuimp: form.registroDuimp.trim() || undefined,
    registroLpco: form.registroLpco.trim() || undefined,
    previsaoEntrega: form.previsaoEntrega.trim() || undefined,
    supostaEstimativa: form.supostaEstimativa.trim() || undefined,
  };
}

export function buildTransportadoraNacional(form: ProcessoFormState): TransportadoraNacional | undefined {
  if (!form.transportadoraNome.trim()) return undefined;
  return {
    nome: form.transportadoraNome.trim(),
    cotacao: form.transportadoraCotacao.trim() || undefined,
    // O input type="number" faz o Vue 3.4+ converter form.transportadoraValor pra
    // number em runtime mesmo o campo sendo tipado como string aqui — por isso
    // nunca confiamos no tipo declarado e sempre coagimos explicitamente com
    // Number() neste ponto de montagem do payload (mesmo tratamento usado em
    // PatientForm.vue pra remessas/qtd).
    valor: form.transportadoraValor === "" ? undefined : Number(form.transportadoraValor) || undefined,
  };
}

export function buildBasePayload(
  form: ProcessoFormState,
  medicamentos: Medicamento[],
  pendencias: string[],
  fornecedor: string,
): ProcessoFormUpdatePayload {
  return {
    paciente: form.paciente.trim(),
    ordem: formatOrdemLabel(form.ordem),
    numeroPo: normalizarNumeroOrdem(form.numeroPo) ?? undefined,
    pasta: form.pasta.trim(),
    empresa: form.empresa,
    consultor: form.consultor as ConsultorProcesso,
    responsavelOperacional: form.responsavelOperacional.trim() || undefined,
    despachante: form.despachante.trim() || undefined,
    fornecedor: fornecedor || undefined,
    transportadoraNacional: buildTransportadoraNacional(form),
    modalEnvio: form.modalEnvio || undefined,
    companhiaAerea: form.companhiaAerea.trim() || undefined,
    numeroAwb: form.numeroAwb.trim() || undefined,
    medicamentos: medicamentos
      .filter((item) => item.nome.trim() !== "")
      .map((item) => ({
        nome: item.nome.trim(),
        dosagem: item.dosagem?.trim() || undefined,
        quantidade: item.quantidade?.trim() || undefined,
      })),
    status: form.status,
    statusOutro: form.status === "outro" ? form.statusOutro.trim() || undefined : undefined,
    datas: buildDatas(form),
    localEntrega: form.localEntrega.trim() || undefined,
    numeroProcesso: form.numeroProcesso.trim() || undefined,
    pendencias: pendencias.map((p) => p.trim()).filter((p) => p !== ""),
    statusPagamento: form.statusPagamento || undefined,
  };
}

// Estado do formulário num instante: o que buildBasePayload precisa. A edição guarda um destes ao
// carregar o processo (o "inicial") e compara com o estado na hora de salvar.
export interface EstadoEdicao {
  form: ProcessoFormState;
  medicamentos: Medicamento[];
  pendencias: string[];
  fornecedor: string;
}

const CAMPOS_DATA: ReadonlyArray<keyof ProcessoDatas> = [
  "dataCompraPO",
  "dataEmbarque",
  "aberturaThread",
  "dataChegadaBrasil",
  "registroRadar",
  "registroDuimp",
  "registroLpco",
  "previsaoEntrega",
  "supostaEstimativa",
];

// Obrigatórios e opcionais de valor único: vão no patch SÓ se o valor mudou. Opcionais esvaziados vão
// como `null` (CAMPOS_PROCESSO_LIMPAVEIS). `transportadoraNacional`, `datas`, medicamentos, pendências
// e o par status/statusOutro têm tratamento próprio abaixo.
const CAMPOS_ESCALARES = [
  "paciente",
  "pasta",
  "empresa",
  "consultor",
  "ordem",
  "numeroPo",
  "responsavelOperacional",
  "despachante",
  "fornecedor",
  "modalEnvio",
  "companhiaAerea",
  "numeroAwb",
  "localEntrega",
  "numeroProcesso",
  "statusPagamento",
] as const;

const LIMPAVEIS = new Set<string>(CAMPOS_PROCESSO_LIMPAVEIS);

// PATCH de EDIÇÃO diferencial: só o que o usuário alterou desde que o formulário foi aberto.
//
// Por quê: (1) o JSON do PATCH descarta `undefined`, então um campo esvaziado precisa ir como `null`
// para o servidor limpar a coluna; (2) mas mandar TODOS os vazios como null (ou listas/blocos inteiros)
// faria uma edição aberta há tempo apagar o que outra pessoa preencheu depois; (3) um valor do banco
// que o formulário não representa (ordem fora do formato "Ordem N", fornecedor/despachante/modal fora
// das listas) carrega "vazio" ou diferente e seria apagado por qualquer salvamento.
//
// Compara o payload normalizado do estado inicial com o do estado atual (a MESMA normalização usada
// para salvar: trim, vazio → undefined, ordem → "Ordem N"). Campo que o usuário não tocou é idêntico
// nos dois e não vai, seja ou não representável. Retorna `null` quando nada mudou.
//
// - status + statusOutro viajam juntos (o servidor deriva status_outro do status).
// - medicamentos e pendências: se mudaram, vai a lista inteira (substitui, como sempre).
// - datas: só as chaves alteradas (null limpa). Transportadora: só as chaves alteradas; nome esvaziado
//   = `transportadoraNacional: null` (limpa nome, cotação e valor).
// - Nunca inclui atualizações nem alerta*: o formulário não os controla.
// - Valores ocultos (Despachante/Transportadora em "Courier Simples") seguem o mesmo critério: o form
//   os mantém no estado; se o usuário não os alterou, não vão (nada é apagado por estar oculto).
// - `parcial: true` avisa o servidor de que `datas`/`transportadoraNacional` são por chave.
export function montarPatchDiferencial(inicial: EstadoEdicao, atual: EstadoEdicao): ProcessoFormPatchPayload | null {
  const p0 = buildBasePayload(inicial.form, inicial.medicamentos, inicial.pendencias, inicial.fornecedor);
  const p1 = buildBasePayload(atual.form, atual.medicamentos, atual.pendencias, atual.fornecedor);
  const patch: Record<string, unknown> = {};

  for (const campo of CAMPOS_ESCALARES) {
    const antes = p0[campo];
    const depois = p1[campo];
    if (antes === depois) continue;
    patch[campo] = depois === undefined && LIMPAVEIS.has(campo) ? null : depois;
  }

  if (p0.status !== p1.status || p0.statusOutro !== p1.statusOutro) {
    patch.status = p1.status;
    if (p1.statusOutro !== undefined) patch.statusOutro = p1.statusOutro;
  }

  if (JSON.stringify(p0.medicamentos) !== JSON.stringify(p1.medicamentos)) patch.medicamentos = p1.medicamentos;
  if (JSON.stringify(p0.pendencias) !== JSON.stringify(p1.pendencias)) patch.pendencias = p1.pendencias;

  const datas: Record<string, string | null> = {};
  for (const chave of CAMPOS_DATA) {
    if (p0.datas[chave] !== p1.datas[chave]) datas[chave] = p1.datas[chave] ?? null;
  }
  if (Object.keys(datas).length) patch.datas = datas;

  const t0 = p0.transportadoraNacional;
  const t1 = p1.transportadoraNacional;
  if (t1 === undefined) {
    if (t0 !== undefined) patch.transportadoraNacional = null;
  } else {
    const parcial: Record<string, string | number | null> = {};
    if (t0?.nome !== t1.nome) parcial.nome = t1.nome;
    if (t0?.cotacao !== t1.cotacao) parcial.cotacao = t1.cotacao ?? null;
    if (t0?.valor !== t1.valor) parcial.valor = t1.valor ?? null;
    if (Object.keys(parcial).length) patch.transportadoraNacional = parcial;
  }

  if (Object.keys(patch).length === 0) return null;
  patch.parcial = true;
  return patch as ProcessoFormPatchPayload;
}

// `campo` diz qual campo do formulário causou o erro, quando ele deve mostrar a mensagem junto ao campo.
export type ValidarProcessoFormResult =
  | { valido: true; payload: ProcessoFormUpdatePayload }
  | { valido: false; erro: string; campo?: "numeroPo" };

// Valor da transportadora como o formulário o representa: o input é type="number", e o Vue 3 entrega
// string OU number em runtime (vazio = ""). "Preenchido" = número finito, e 0 CONTA (um 0 digitado é
// uma escolha do usuário). Texto não numérico, que o formulário descarta ao montar o payload, conta
// como NÃO preenchido (devolve "").
function valorNormalizado(valor: string | number): string {
  const texto = String(valor).trim();
  if (texto === "") return "";
  const numero = Number(texto);
  return Number.isFinite(numero) ? String(numero) : "";
}

// O usuário alterou algum dos três campos do bloco da transportadora (nome, cotação, valor) em relação
// ao estado inicial carregado? Comparação pela mesma normalização usada para salvar (trim; valor numérico).
export function blocoTransportadoraTocado(inicial: ProcessoFormState, atual: ProcessoFormState): boolean {
  return (
    inicial.transportadoraNome.trim() !== atual.transportadoraNome.trim() ||
    inicial.transportadoraCotacao.trim() !== atual.transportadoraCotacao.trim() ||
    valorNormalizado(inicial.transportadoraValor) !== valorNormalizado(atual.transportadoraValor)
  );
}

// Cotação ou valor preenchidos sem o nome da transportadora: o dado ficaria órfão no banco (a tela só
// mostra a transportadora quando há nome).
function transportadoraSemNome(form: ProcessoFormState): boolean {
  return (
    form.transportadoraNome.trim() === "" &&
    (form.transportadoraCotacao.trim() !== "" || valorNormalizado(form.transportadoraValor) !== "")
  );
}

// Validação de handleSubmit, reformulada como função pura: decide só
// valido/inválido + payload ou mensagem de erro. O componente decide o que
// fazer com o resultado (emitir "invalid", ou "update"/"submit" com o
// payload). Ordem de checagem: paciente, pasta, Nº Ordem, consultor, status "outro",
// despachante (condicionado ao modalEnvio) e, por último, a transportadora
// (opcional, mas cotação/valor exigem o nome).
//
// `inicial` = estado do formulário quando foi carregado (na criação, o formulário vazio). Só com ele a
// transportadora é validada, e apenas se o bloco foi TOCADO e está VISÍVEL: um processo que já tem
// cotação/valor órfãos no banco não fica impedido de salvar outra coisa, e os campos ocultos (Courier
// Simples) seguem sem alteração. Sem `inicial` (chamadas antigas), não valida a transportadora.
export function validarProcessoForm(
  form: ProcessoFormState,
  medicamentos: Medicamento[],
  pendencias: string[],
  fornecedor: string,
  inicial?: ProcessoFormState,
): ValidarProcessoFormResult {
  if (!form.paciente.trim()) {
    return { valido: false, erro: "Informe o nome do paciente." };
  }
  if (!form.pasta.trim()) {
    return { valido: false, erro: "Informe a pasta do processo." };
  }
  // Nº Ordem: opcional, mas preenchido precisa estar completo (PO-00-0000[/texto]). Só confere se foi
  // alterado desde que o formulário abriu (um valor antigo fora do formato não impede salvar outra coisa).
  if (!inicial || inicial.numeroPo !== form.numeroPo) {
    if (!numeroOrdemValido(form.numeroPo)) {
      return { valido: false, erro: NUMERO_ORDEM_ERRO, campo: "numeroPo" };
    }
  }
  if (form.consultor === "") {
    return { valido: false, erro: "Selecione o consultor responsável." };
  }
  if (form.status === "outro" && !form.statusOutro.trim()) {
    return { valido: false, erro: 'Informe qual é o status (opção "Outro").' };
  }
  // Só o Despachante é obrigatório nesses modais; a Transportadora nacional é opcional (o bloco
  // continua visível, mas pode ficar em branco — buildTransportadoraNacional devolve undefined).
  if (form.modalEnvio === "Air Cargo" || form.modalEnvio === "Courier Formal") {
    if (!form.despachante.trim()) {
      return { valido: false, erro: "Despachante é obrigatório para o modal de envio selecionado." };
    }
  }
  if (
    inicial &&
    precisaDespachanteTransportadora(form.modalEnvio) &&
    blocoTransportadoraTocado(inicial, form) &&
    transportadoraSemNome(form)
  ) {
    return { valido: false, erro: "Informe o nome da transportadora ou limpe a cotação e o valor." };
  }

  return { valido: true, payload: buildBasePayload(form, medicamentos, pendencias, fornecedor) };
}
