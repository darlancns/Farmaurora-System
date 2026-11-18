import type { ListaCadastro } from "../types/Cadastro";

// Constantes dos Cadastros (Configurações → Cadastros).

export const LISTAS_CADASTRO: readonly ListaCadastro[] = ["fornecedores", "despachantes", "transportadoras", "cias-aereas"];

/** Listas que guardam a chave PIX (dado financeiro: ver shared/utils/cadastroPix.ts). */
export const LISTAS_COM_PIX: readonly ListaCadastro[] = ["despachantes", "transportadoras"];

/** Rótulo da lista (título do bloco na tela). */
export const LISTA_CADASTRO_ROTULO: Record<ListaCadastro, string> = {
  fornecedores: "Fornecedores",
  despachantes: "Despachantes",
  transportadoras: "Transportadoras",
  "cias-aereas": "Cias aéreas",
};

/** Textos de UM item da lista, já com o gênero certo (títulos do painel e aviso de criado). */
export interface TextosItemCadastro {
  tituloNovo: string;
  tituloEditar: string;
  criado: string;
}

export const LISTA_CADASTRO_TEXTOS: Record<ListaCadastro, TextosItemCadastro> = {
  fornecedores: {
    tituloNovo: "Novo fornecedor",
    tituloEditar: "Editar fornecedor",
    criado: "Fornecedor criado.",
  },
  despachantes: {
    tituloNovo: "Novo despachante",
    tituloEditar: "Editar despachante",
    criado: "Despachante criado.",
  },
  transportadoras: {
    tituloNovo: "Nova transportadora",
    tituloEditar: "Editar transportadora",
    criado: "Transportadora criada.",
  },
  "cias-aereas": {
    tituloNovo: "Nova cia aérea",
    tituloEditar: "Editar cia aérea",
    criado: "Cia aérea criada.",
  },
};

/** Tabela de cada lista no Supabase (20261109200000_cadastros.sql e 20261118200000_cadastros_transportadoras_pix.sql). */
export const TABELA_CADASTRO: Record<ListaCadastro, string> = {
  fornecedores: "cadastro_fornecedores",
  despachantes: "cadastro_despachantes",
  transportadoras: "cadastro_transportadoras",
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
/** Chave PIX (o mesmo limite do CHECK das tabelas: length(chave_pix) <= 140). */
export const CHAVE_PIX_CADASTRO_MAX = 140;

// Prazo do alerta do fornecedor: dias corridos a partir da compra (o mesmo CHECK da tabela).
export const PRAZO_ALERTA_MIN_DIAS = 1;
export const PRAZO_ALERTA_MAX_DIAS = 365;

// Telefone: dígitos, espaço e + ( ) - . ; precisa de 8 a 15 dígitos (fixo/celular, com ou sem DDI).
export const TELEFONE_DIGITOS_MIN = 8;
export const TELEFONE_DIGITOS_MAX = 15;
