import { reactive, watch } from "vue";
import {
  BANCOS_DIR,
  DESPACHANTES_DIR,
  FORNECEDORES_DIR,
  OBSERVACOES_DIR,
  RECEITAS_DIR,
  RESPONSAVEIS_DIR,
  TEMPERATURAS_DIR,
} from "#shared/constants/dir";
import type { ChecklistChaveDir, Dir, DirPatchDTO, NewDirDTO, StatusDir } from "#shared/types/dir";
import { hojeBrasilia } from "#shared/utils/dataBrasilia";
import {
  CONTRATO_CAMBIO_ERRO,
  contratoCambioValido,
  filtrarContratoCambio,
  normalizarContratoCambio,
} from "#shared/utils/contratoCambio";
import { NUMERO_PO_REGEX as PO_RE } from "#shared/utils/numeroPo";
import { ENVIO_DIR_ERRO, envioDirValido } from "#shared/utils/dirEnvio";
import { CONSULTOR_ERRO, consultorAtivoValido } from "#shared/utils/consultorRegra";
import { aplicarMascaraNumeroPo } from "../utils/aplicarMascaraNumeroPo";
import { aplicarMaiusculasNoCampo } from "../utils/aplicarMaiusculasNoCampo";
import { aplicarTransformacaoNoCampo } from "../utils/aplicarTransformacaoNoCampo";
import { useOutroSentinel } from "./useOutroSentinel";

// Estado e regras do formulário da DIR (DirFormModal.vue). O componente só liga os campos.

// Campos de lista com opção "Outro" digitável (o que se grava é o texto digitado). O Consultor (vendedor) NÃO está aqui:
// é um select simples, só com os consultores ativos do Cadastro (ver `form.vendedor` e montarVendedorDirOptions).
export type CampoComOutro =
  | "responsavel"
  | "fornecedor"
  | "despachante"
  | "banco"
  | "receita"
  | "temperatura"
  | "observacao";

// A temperatura NÃO está aqui: a lista dela chega do Cadastro (ver `temperaturas` em useDirForm) e tem fallback nas constantes.
const LISTAS: Record<Exclude<CampoComOutro, "temperatura">, readonly string[]> = {
  responsavel: RESPONSAVEIS_DIR,
  fornecedor: FORNECEDORES_DIR,
  despachante: DESPACHANTES_DIR,
  banco: BANCOS_DIR,
  receita: RECEITAS_DIR,
  observacao: OBSERVACOES_DIR,
};

const CAMPOS_COM_OUTRO: CampoComOutro[] = [...(Object.keys(LISTAS) as Array<Exclude<CampoComOutro, "temperatura">>), "temperatura"];

// Gravam NA HORA (PATCH) quando o registro já existe — ficam fora do "Salvar alterações".
export const CHAVES_INSTANTANEAS = [
  "conferido",
  "operacaoEncerrada",
  // Grava na hora porque o servidor registra quem marcou e quando.
  "fechamentoRestante",
  "dactes",
  "dsiDirDuimp",
  "logger",
  "fechamento",
  "numerario",
  "protocoloAssinado",
  "swift",
  "termometro",
] as const;

export type ChaveInstantanea = (typeof CHAVES_INSTANTANEAS)[number];

interface FormDir {
  po: string;
  paciente: string;
  /** Consultor: texto; só o valor já gravado ou um consultor ativo do Cadastro (ver validar). */
  vendedor: string;
  medicamento: string;
  envio: string;
  companhiaAerea: string;
  awb: string;
  contratoCambio: string;
  dataEmissao: string;
  dataCobrancaFornecedores: string;
  dataEntrega: string;
  dataPagamento: string;
  status: StatusDir | "";
  exigencia: boolean;
  conferido: boolean;
  operacaoEncerrada: boolean;
  fechamentoRestante: boolean;
  dactes: boolean;
  dsiDirDuimp: boolean;
  logger: boolean;
  fechamento: boolean;
  numerario: boolean;
  protocoloAssinado: boolean;
  swift: boolean;
  termometro: boolean;
}

export type ResultadoValidacaoDir =
  | { valido: true; payload: NewDirDTO; atualizacao: DirPatchDTO }
  | { valido: false; erro: string };

function formVazio(): FormDir {
  return {
    po: "",
    paciente: "",
    vendedor: "",
    medicamento: "",
    envio: "",
    companhiaAerea: "",
    awb: "",
    contratoCambio: "",
    dataEmissao: hojeBrasilia(),
    dataCobrancaFornecedores: "",
    dataEntrega: "",
    dataPagamento: "",
    status: "",
    exigencia: false,
    conferido: false,
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
  };
}

/**
 * `consultoresAtivos`: os consultores ativos do Cadastro (o servidor confere de novo). Sem ele, só se exige que o campo
 * esteja preenchido (o select já só oferece os ativos e o valor atual).
 */
export function useDirForm(
  editando: () => Dir | null | undefined,
  consultoresAtivos?: () => readonly string[],
  temperaturas: () => readonly string[] = () => TEMPERATURAS_DIR,
) {
  const form = reactive<FormDir>(formVazio());
  const listaDe = (campo: CampoComOutro): (() => readonly string[]) => (campo === "temperatura" ? temperaturas : () => LISTAS[campo]);
  const outros = Object.fromEntries(CAMPOS_COM_OUTRO.map((campo) => [campo, useOutroSentinel(listaDe(campo))])) as Record<
    CampoComOutro,
    ReturnType<typeof useOutroSentinel>
  >;

  const dir = editando();
  if (dir) {
    form.po = dir.po;
    form.paciente = dir.paciente;
    form.vendedor = dir.vendedor;
    form.medicamento = dir.medicamento;
    form.envio = dir.envio;
    form.companhiaAerea = dir.companhiaAerea;
    form.awb = dir.awb;
    form.contratoCambio = dir.contratoCambio;
    form.dataEmissao = dir.dataEmissao;
    form.dataCobrancaFornecedores = dir.dataCobrancaFornecedores;
    form.dataEntrega = dir.dataEntrega;
    form.dataPagamento = dir.dataPagamento;
    form.status = dir.status ?? "";
    form.exigencia = dir.exigencia;
    form.conferido = dir.conferido;
    form.operacaoEncerrada = dir.operacaoEncerrada;
    for (const chave of CHAVES_INSTANTANEAS) form[chave] = dir[chave];
    for (const campo of CAMPOS_COM_OUTRO) outros[campo].load(dir[campo]);
  }

  // A lista de temperaturas pode chegar DEPOIS de o formulário abrir (leitura do Cadastro): quem abriu como "Outro" com um texto que
  // agora está na lista passa a mostrar o item da lista. O texto digitado de verdade (fora da lista) continua como "Outro".
  watch(temperaturas, (lista) => {
    const t = outros.temperatura.state;
    if (t.select === "Outro" && lista.includes(t.outroTexto)) outros.temperatura.load(t.outroTexto);
  });

  // PO: mesma máscara do PO do Follow-Up (PO26-10-0471: prefixo, hífens, 8 dígitos, maiúsculas, colar e cursor),
  // pela mesma função (utils/aplicarMascaraNumeroPo.ts). A validação continua em `validar` (regex completa).
  function onPoInput(event: Event): void {
    form.po = aplicarMascaraNumeroPo(event.target as HTMLInputElement, form.po);
  }

  // Medicamento: tudo em MAIÚSCULAS ao digitar/colar (como o medicamento do Follow-Up). O valor antigo, já gravado
  // em minúsculas, fica como está até a pessoa mexer no campo (o `validar` só faz `trim`, nunca converte).
  function onMedicamentoInput(event: Event): void {
    form.medicamento = aplicarMaiusculasNoCampo(event.target as HTMLInputElement);
  }

  // Contrato de câmbio: só números separados por espaço, vírgula ou barra (shared/utils/contratoCambio.ts, a mesma regra do
  // servidor). Letras e outros símbolos são filtrados ao digitar e ao colar; o cursor fica no ponto.
  function onContratoCambioInput(event: Event): void {
    form.contratoCambio = aplicarTransformacaoNoCampo(event.target as HTMLInputElement, filtrarContratoCambio);
  }

  function validar(): ResultadoValidacaoDir {
    const po = form.po.trim().toUpperCase();
    if (!PO_RE.test(po)) return { valido: false, erro: "Informe o PO no padrão PO26-MM-NNNN." };
    const paciente = form.paciente.trim();
    if (!paciente) return { valido: false, erro: "Informe o nome do paciente." };
    const vendedor = form.vendedor.trim();
    if (!vendedor) return { valido: false, erro: "Informe o consultor." };
    // Consultor: só um ativo do Cadastro. O valor que o registro JÁ tem (inativo, "A ser definido", "Braulio (3RB)"…) não
    // impede salvar os outros campos (o select o mostra como "(inativo)"); qualquer outro valor fora da lista é recusado.
    if (consultoresAtivos && !consultorAtivoValido(vendedor, consultoresAtivos()) && vendedor !== (editando()?.vendedor ?? "").trim()) {
      return { valido: false, erro: CONSULTOR_ERRO };
    }
    // Valor antigo (anotação em texto de antes da regra) igual ao já gravado não impede salvar os outros campos.
    const contratoCambio = normalizarContratoCambio(form.contratoCambio);
    const gravado = normalizarContratoCambio(editando()?.contratoCambio ?? "");
    if (!contratoCambioValido(contratoCambio) && contratoCambio !== gravado) {
      return { valido: false, erro: CONTRATO_CAMBIO_ERRO };
    }

    // Envio: só as opções do Follow-Up. Valor antigo igual ao já gravado não impede salvar os outros campos (o select o mostra
    // como "(inativo)"); qualquer outro valor fora da lista é recusado (o servidor confere de novo).
    const envio = form.envio.trim();
    const envioGravado = (editando()?.envio ?? "").trim();
    if (!envioDirValido(envio) && envio !== envioGravado) return { valido: false, erro: ENVIO_DIR_ERRO };

    const payload: NewDirDTO = {
      po,
      paciente,
      vendedor,
      responsavel: outros.responsavel.build(),
      fornecedor: outros.fornecedor.build(),
      despachante: outros.despachante.build(),
      banco: outros.banco.build(),
      envio,
      receita: outros.receita.build(),
      temperatura: outros.temperatura.build(),
      observacao: outros.observacao.build(),
      medicamento: form.medicamento.trim(),
      // Cia aérea: lista do Follow-Up, sem "Outro". Valor antigo fora da lista continua como está (aparece "(inativo)").
      companhiaAerea: form.companhiaAerea.trim(),
      awb: form.awb.trim(),
      contratoCambio,
      dataEmissao: form.dataEmissao,
      dataCobrancaFornecedores: form.dataCobrancaFornecedores,
      dataEntrega: form.dataEntrega,
      dataPagamento: form.dataPagamento,
      status: form.status === "" ? null : form.status,
      exigencia: form.exigencia,
      conferido: form.conferido,
      operacaoEncerrada: form.operacaoEncerrada,
      // Não se marca PO encerrado: a criação com a operação encerrada nunca vai marcada.
      fechamentoRestante: form.fechamentoRestante && !form.operacaoEncerrada,
      dactes: form.dactes,
      dsiDirDuimp: form.dsiDirDuimp,
      logger: form.logger,
      fechamento: form.fechamento,
      numerario: form.numerario,
      protocoloAssinado: form.protocoloAssinado,
      swift: form.swift,
      termometro: form.termometro,
    };

    // Edição: conferido, operação encerrada e checklist já foram gravados na hora, um a um.
    const atualizacao: DirPatchDTO = { ...payload };
    for (const chave of CHAVES_INSTANTANEAS) delete atualizacao[chave];

    return { valido: true, payload, atualizacao };
  }

  /** Valor mostrado num toggle instantâneo: do registro vivo na edição, do formulário na criação. */
  function valorToggle(chave: ChaveInstantanea | ChecklistChaveDir): boolean {
    const vivo = editando();
    return vivo ? vivo[chave] : form[chave];
  }

  return { form, outros, onPoInput, onMedicamentoInput, onContratoCambioInput, validar, valorToggle };
}
