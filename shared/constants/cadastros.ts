import type { ListaCadastro } from "../types/Cadastro";

// Constantes dos Cadastros (Configurações → Cadastros).

export const LISTAS_CADASTRO: readonly ListaCadastro[] = ["fornecedores", "despachantes", "temperaturas"];

/** Rótulo da lista (aba interna da tela). */
export const LISTA_CADASTRO_ROTULO: Record<ListaCadastro, string> = {
  fornecedores: "Fornecedores",
  despachantes: "Despachantes",
  temperaturas: "Temperaturas",
};

/** Rótulo de UM item da lista (botão "Novo …", título do modal, mensagens). */
export const LISTA_CADASTRO_ITEM: Record<ListaCadastro, string> = {
  fornecedores: "fornecedor",
  despachantes: "despachante",
  temperaturas: "temperatura",
};

/** Tabela de cada lista no Supabase (supabase/migrations/20261109200000_cadastros.sql). */
export const TABELA_CADASTRO: Record<ListaCadastro, string> = {
  fornecedores: "cadastro_fornecedores",
  despachantes: "cadastro_despachantes",
  temperaturas: "cadastro_temperaturas",
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
