import type { Cadastro, Despachante, Fornecedor, ListaCadastro } from "#shared/types/Cadastro";

// Colunas de cada lista na tela de Cadastros (além de Nome, Situação e Ações, que são sempre as mesmas).

export interface ColunaCadastro {
  chave: string;
  titulo: string;
  /** Texto da célula; "—" quando vazio. */
  texto: (item: Cadastro) => string;
}

const VAZIO = "—";

const ou = (valor: string): string => (valor.trim() === "" ? VAZIO : valor);

/** Alerta do fornecedor: "Sem alerta" ou "N dia(s)". */
export function textoAlerta(f: Pick<Fornecedor, "semAlerta" | "prazoAlertaDias">): string {
  if (f.semAlerta) return "Sem alerta";
  if (f.prazoAlertaDias === null) return VAZIO;
  return f.prazoAlertaDias === 1 ? "1 dia" : `${f.prazoAlertaDias} dias`;
}

const COLUNAS: Record<ListaCadastro, ColunaCadastro[]> = {
  fornecedores: [
    { chave: "pais", titulo: "País", texto: (i) => ou((i as Fornecedor).pais) },
    { chave: "alerta", titulo: "Alerta de prazo", texto: (i) => textoAlerta(i as Fornecedor) },
  ],
  despachantes: [
    { chave: "contato", titulo: "Contato", texto: (i) => ou((i as Despachante).contatoNome) },
    { chave: "telefone", titulo: "Telefone", texto: (i) => ou((i as Despachante).telefone) },
    { chave: "email", titulo: "E-mail", texto: (i) => ou((i as Despachante).email) },
  ],
  transportadoras: [],
  "cias-aereas": [],
};

export function colunasDaLista(lista: ListaCadastro): ColunaCadastro[] {
  return COLUNAS[lista];
}
