import type { ListaCadastro } from "../types/Cadastro";

// Constantes dos Cadastros (Configurações → Cadastros).

export const LISTAS_CADASTRO: readonly ListaCadastro[] = ["fornecedores", "despachantes", "cias-aereas"];

/** Rótulo da lista (título do bloco na tela). */
export const LISTA_CADASTRO_ROTULO: Record<ListaCadastro, string> = {
  fornecedores: "Fornecedores",
  despachantes: "Despachantes",
  "cias-aereas": "Cias aéreas",
};

/** Textos de UM item da lista, já com o gênero certo (botão "+ Novo …", título do modal, aviso de criado). */
export interface TextosItemCadastro {
  novo: string;
  tituloNovo: string;
  tituloEditar: string;
  criado: string;
}

export const LISTA_CADASTRO_TEXTOS: Record<ListaCadastro, TextosItemCadastro> = {
  fornecedores: {
    novo: "+ Novo fornecedor",
    tituloNovo: "Novo fornecedor",
    tituloEditar: "Editar fornecedor",
    criado: "Fornecedor criado.",
  },
  despachantes: {
    novo: "+ Novo despachante",
    tituloNovo: "Novo despachante",
    tituloEditar: "Editar despachante",
    criado: "Despachante criado.",
  },
  "cias-aereas": {
    novo: "+ Nova cia aérea",
    tituloNovo: "Nova cia aérea",
    tituloEditar: "Editar cia aérea",
    criado: "Cia aérea criada.",
  },
};

/** Tabela de cada lista no Supabase (supabase/migrations/20261109200000_cadastros.sql). */
export const TABELA_CADASTRO: Record<ListaCadastro, string> = {
  fornecedores: "cadastro_fornecedores",
  despachantes: "cadastro_despachantes",
  "cias-aereas": "cadastro_cias_aereas",
};

// "Outro" é o sentinela dos selects das telas (digitar um valor fora da lista), não um item: o nome é reservado.
export const NOME_RESERVADO_CADASTRO = "Outro";

// Sufixo do rótulo de um item desativado ("Speciality (inativo)"), o mesmo texto que as telas já usam.
export const ROTULO_INATIVO_CADASTRO = "(inativo)";

export const NOME_CADASTRO_MAX = 120;
export const PAIS_CADASTRO_MAX = 60;
export const CONTATO_CADASTRO_MAX = 120;
export const TELEFONE_CADASTRO_MAX = 30;
export const EMAIL_CADASTRO_MAX = 254;

// Prazo do alerta do fornecedor: dias corridos a partir da compra (o mesmo CHECK da tabela).
export const PRAZO_ALERTA_MIN_DIAS = 1;
export const PRAZO_ALERTA_MAX_DIAS = 365;

// Telefone: dígitos, espaço e + ( ) - . ; precisa de 8 a 15 dígitos (fixo/celular, com ou sem DDI).
export const TELEFONE_DIGITOS_MIN = 8;
export const TELEFONE_DIGITOS_MAX = 15;
