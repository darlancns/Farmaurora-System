// Entrada do "Resumo da compra": o texto que o operacional copia e cola no WhatsApp (shared/utils/compraResumo.ts).
//
// Os campos de texto livre chegam COMO DIGITADOS (a função faz trim e junta espaços repetidos). Os valores em dinheiro são números
// ("vazio" = null ou undefined) e saem em dólar ("US$ 0,00"). Nada aqui é a Compra do banco: é só o que o resumo precisa.
//
// Nomes com sufixo "Resumo" de propósito: `Medicamento` já é o item de um processo do Follow-Up (shared/types/processo.ts) e
// `MedicamentoCadastro` é o do Cadastro.

import type { BlocoDaCompra } from "../constants/compraResumo";

/** Dinheiro opcional: número, ou vazio (null/undefined). NaN também conta como vazio. */
export type ValorOpcionalResumo = number | null | undefined;

/**
 * Um medicamento da compra. `medicamento` é o texto como foi digitado (ou escolhido do Cadastro); a compra não tem apresentação
 * nem "referência" soltos: o Brand (Bioequivalente/Referência) é um campo próprio.
 */
export interface MedicamentoResumo {
  readonly medicamento: string;
  readonly laboratorio?: string;
  /** "bioequivalente" | "referencia" (BRANDS_MEDICAMENTO) ou "" / outro valor (não sai). */
  readonly brand?: string;
  /** TEXTO com a unidade ("12 ampolas"). */
  readonly quantidade?: string;
  readonly temperatura?: string;
  readonly valorUnitario?: ValorOpcionalResumo;
  readonly valorReal?: ValorOpcionalResumo;
}

export type MomentoPagamentoResumo = "vamos_pagar" | "apos_awb";

export interface PagamentoResumo {
  /** true: "alvará na conta"; false e null: nada. */
  readonly alvara: boolean | null;
  readonly momento: MomentoPagamentoResumo | null;
}

export interface TermoPosteriorResumo {
  readonly sim: boolean;
  /** Só aparece quando `sim` é true. */
  readonly observacao?: string;
}

/**
 * Despachante da compra; `null` na entrada = a compra não tem despachante (a linha some). Courier Simples (envio) não tem
 * despachante: quem decide é o `envio` da entrada (o resumo diz "Despachante: N/A"), não este objeto.
 */
export interface DespachanteResumo {
  readonly nome?: string;
  readonly telefone?: string;
  readonly email?: string;
  readonly contato?: string;
}

export interface AvisosResumo {
  readonly isencao: boolean;
  /** true: ✅, false: ❌, null: a linha não sai. */
  readonly documentos: boolean | null;
  /** Chips e texto livre JÁ UNIDOS por quem chama. */
  readonly pendencias: readonly string[];
  readonly observacoes?: string;
  /** Compra recorrente: a linha "Recorrente" sai logo depois de "Pendente". */
  readonly recorrente: boolean;
}

export interface ProcessoResumo {
  /** Compra particular: não tem número de processo. */
  readonly particular: boolean;
  /** Pode ter "/UF" no fim; não se valida aqui. */
  readonly numero?: string;
}

export interface CompraResumoEntrada {
  /** Inteiro >= 1. */
  readonly numero: number;
  /** 1 a 12. */
  readonly mes: number;
  readonly ano: number;
  readonly medicamentos: readonly MedicamentoResumo[];
  /** Quantas ordens (inteiro de 1 a COMPRA_MAX_ORDENS): só um número. */
  readonly numeroOrdens: number;
  readonly frete?: ValorOpcionalResumo;
  readonly freteReal?: ValorOpcionalResumo;
  /** O modal (um de MODAIS_ENVIO) ou "". "Courier Simples" = sem despachante. */
  readonly envio: string;
  /** A cia aérea (já válida para o modal) ou "". Só sai com `envio`. */
  readonly cia: string;
  readonly fornecedor: string;
  /** "FARMAURORA" | "MAINZFARMA": sai em Title Case ("Farmaurora") na linha do CNPJ. */
  readonly empresa: string;
  readonly pagamento: PagamentoResumo;
  readonly termoPosterior: TermoPosteriorResumo;
  readonly paciente: string;
  readonly despachante: DespachanteResumo | null;
  readonly avisos: AvisosResumo;
  readonly consultor: string;
  readonly responsavel: string;
  readonly processo: ProcessoResumo;
  readonly medico: string;
  readonly localAplicacao: string;
  readonly entrega: string;
  readonly contatos: string;
}

/**
 * "modelo": TODOS os rótulos do formulário, com o valor cru (sem "pendente ⏳", sem "n/a" inventado) e `vazio: true` onde não há valor.
 * "copia": o texto que vai para o WhatsApp (linhas sem valor somem; local e entrega vazios saem "pendente ⏳").
 */
export type ModoResumo = "modelo" | "copia";

/**
 * Uma linha do resumo. `id` é estável (não muda com o texto) para a tela achar o campo. `rotulo` é "" na linha do título;
 * `valor` é "" quando `vazio` (modelo) ou quando a linha é só o rótulo (marcadores: "Recorrente", "Pedir isenção imposto ❗").
 */
export interface LinhaDoResumo {
  readonly id: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly vazio: boolean;
  /** O valor sai entre asteriscos (negrito do WhatsApp). */
  readonly negrito?: boolean;
}

export interface BlocoDoResumo {
  readonly id: BlocoDaCompra;
  readonly linhas: readonly LinhaDoResumo[];
}
