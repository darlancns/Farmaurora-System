// Entrada do "Resumo da compra": o texto que o operacional copia e cola no WhatsApp (shared/utils/compraResumo.ts).
//
// Os campos de texto livre chegam COMO DIGITADOS (a função faz trim e junta espaços repetidos). Os valores em dinheiro são números
// ("vazio" = null ou undefined) e saem em dólar ("US$ 0,00"). Nada aqui é a Compra do banco: é só o que o resumo precisa.
//
// Nomes com sufixo "Resumo" de propósito: `Medicamento` já é o item de um processo do Follow-Up (shared/types/processo.ts) e
// `MedicamentoCadastro` é o do Cadastro.

/** Dinheiro opcional: número, ou vazio (null/undefined). NaN também conta como vazio. */
export type ValorOpcionalResumo = number | null | undefined;

/** Um medicamento de uma ordem. */
export interface MedicamentoResumo {
  /** Do Cadastro ou texto livre do pré-cadastro. */
  readonly nome: string;
  /** Texto livre ("500 mg c/ 30 comprimidos"); opcional. */
  readonly apresentacao?: string;
  /** Referência / Bioequivalente; opcional. */
  readonly referencia?: string;
  readonly laboratorio?: string;
  /** TEXTO com a unidade ("12 ampolas"). */
  readonly quantidade?: string;
  readonly valorUnitario?: ValorOpcionalResumo;
  readonly valorReal?: ValorOpcionalResumo;
  readonly temperatura?: string;
}

/** Uma ordem de compra: um fornecedor, um envio e seus medicamentos (1 a N). */
export interface OrdemResumo {
  readonly fornecedor: string;
  readonly envio: string;
  readonly frete?: ValorOpcionalResumo;
  readonly freteReal?: ValorOpcionalResumo;
  readonly medicamentos: readonly MedicamentoResumo[];
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

/** Despachante da compra; `null` na entrada = a compra não tem despachante (o bloco some). */
export interface DespachanteResumo {
  /** Courier Simples não tem despachante: o resumo diz só "Despachante: N/A". */
  readonly courierSimples: boolean;
  readonly nome?: string;
  readonly telefone?: string;
  readonly email?: string;
  readonly contato?: string;
}

export interface AvisosResumo {
  readonly isencao: boolean;
  /** Para quem pedir a isenção; só aparece com `isencao`. */
  readonly isencaoPara?: string;
  /** true: ✅, false: ❌, null: a linha não sai. */
  readonly documentos: boolean | null;
  /** Chips e texto livre JÁ UNIDOS por quem chama. */
  readonly pendencias: readonly string[];
  readonly observacoes?: string;
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
  readonly ordens: readonly OrdemResumo[];
  readonly pagamento: PagamentoResumo;
  readonly termoPosterior: TermoPosteriorResumo;
  readonly paciente: string;
  readonly despachante: DespachanteResumo | null;
  readonly avisos: AvisosResumo;
  readonly vendedor: string;
  readonly responsavel: string;
  readonly processo: ProcessoResumo;
  readonly medico: string;
  readonly localAplicacao: string;
  /** O local de aplicação é o declarado pelo cliente (muda o rótulo da linha). */
  readonly localDeclarado: boolean;
  readonly entrega: string;
  readonly contatos: string;
}
