import type { ItemCadastroPagamento } from "../types/Pagamento";
import type { FornecedorLido, MedicamentoLido } from "../types/Cadastro";
import { ordenarCadastro } from "./cadastroNome";

// Como o Follow-Up (e quem mais só LÊ os Cadastros) transforma o que GET /api/cadastros/:lista devolve: SÓ o que as telas usam
// (nome, ativo, país e, no fornecedor, o prazo do alerta). Funções PURAS e tolerantes: um item sem nome é descartado, e o que não é lista
// vira lista vazia, para uma resposta estranha nunca derrubar a tela.
//
// A CHAVE PIX NUNCA é copiada: a API só a manda a quem lê Pagamentos e ao administrador, e esta leitura (Follow-Up) não a usa. Como o item
// é montado campo a campo, qualquer campo novo da API (inclusive `chavePix`) simplesmente não passa.

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function dadosDoItem(bruto: unknown): { nome: string; ativo: boolean; resto: Record<string, unknown> } | null {
  if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const r = bruto as Record<string, unknown>;
  const nome = texto(r.nome);
  if (nome === "") return null;
  return { nome, ativo: r.ativo === true, resto: r };
}

/** Despachante ou transportadora: nome e ativo (sem país, sem PIX). */
export function itemLido(bruto: unknown): ItemCadastroPagamento | null {
  const d = dadosDoItem(bruto);
  return d ? { nome: d.nome, ativo: d.ativo, pais: "" } : null;
}

/** Fornecedor: nome, ativo, país e o prazo do alerta (`prazoAlertaDias` inteiro de 1 a 365, ou null com `semAlerta`). */
export function fornecedorLido(bruto: unknown): FornecedorLido | null {
  const d = dadosDoItem(bruto);
  if (!d) return null;
  const prazo = d.resto.prazoAlertaDias;
  const prazoValido = typeof prazo === "number" && Number.isInteger(prazo) && prazo >= 1 && prazo <= 365;
  return {
    nome: d.nome,
    ativo: d.ativo,
    pais: texto(d.resto.pais),
    prazoAlertaDias: prazoValido ? prazo : null,
    semAlerta: d.resto.semAlerta === true,
  };
}

/** A lista de despachantes/transportadoras da resposta: ativos primeiro, alfabética pt-BR. Não-lista = []. */
export function itensLidos(lista: unknown): ItemCadastroPagamento[] {
  if (!Array.isArray(lista)) return [];
  return ordenarCadastro(lista.map(itemLido).filter((i): i is ItemCadastroPagamento => i !== null));
}

/** A lista de fornecedores da resposta: ativos primeiro, alfabética pt-BR. Não-lista = []. */
export function fornecedoresLidos(lista: unknown): FornecedorLido[] {
  if (!Array.isArray(lista)) return [];
  return ordenarCadastro(lista.map(fornecedorLido).filter((i): i is FornecedorLido => i !== null));
}

/** Medicamento: só nome e ativo (o id, a temperatura e quem gravou não interessam ao Follow-Up). */
export function medicamentoLido(bruto: unknown): MedicamentoLido | null {
  const d = dadosDoItem(bruto);
  return d ? { nome: d.nome, ativo: d.ativo } : null;
}

/** A lista de medicamentos da resposta: ativos primeiro, alfabética pt-BR. Não-lista = []. */
export function medicamentosLidos(lista: unknown): MedicamentoLido[] {
  if (!Array.isArray(lista)) return [];
  return ordenarCadastro(lista.map(medicamentoLido).filter((i): i is MedicamentoLido => i !== null));
}
