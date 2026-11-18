import type { Cadastro, Despachante, Fornecedor, ListaCadastro, NovoPorLista, PatchPorLista, Transportadora } from "#shared/types/Cadastro";
import { chaveCadastro } from "#shared/utils/cadastroNome";
import { validarNovoCadastro, validarPatchCadastro, type ResultadoCadastro } from "#shared/utils/cadastroValidacao";

// Regras puras do formulário de Cadastros (painel lateral CadastroPainel.vue). O componente só liga os campos; a
// validação é a MESMA do servidor (shared/utils/cadastroValidacao.ts), então a mensagem que a pessoa lê é a da API.
//
// Chave PIX (dado financeiro): o campo só existe para quem recebe a chave da API (`incluirPix`/`podeVerPix`). Sem isso
// a chave nunca entra no corpo enviado. Na edição, só vai se mudou (não se regrava uma chave que ficou igual).

/** Alerta do fornecedor: começa SEM escolha ("") — a pessoa precisa decidir entre "Número de dias" e "Sem alerta". */
export type OpcaoAlerta = "" | "dias" | "sem";

export interface FormCadastro {
  nome: string;
  pais: string;
  alertaOpcao: OpcaoAlerta;
  /** Conteúdo do campo "dias" (só vale quando alertaOpcao === "dias"); o <input type=number> pode entregar número. */
  prazoTexto: string | number;
  contatoNome: string;
  telefone: string;
  email: string;
  /** Só despachantes e transportadoras; "" = sem chave. */
  chavePix: string;
}

export function formVazio(): FormCadastro {
  return { nome: "", pais: "", alertaOpcao: "", prazoTexto: "", contatoNome: "", telefone: "", email: "", chavePix: "" };
}

const pixDoItem = (item: Cadastro | null | undefined): string => (item as { chavePix?: string } | null | undefined)?.chavePix ?? "";

export function formDeItem(lista: ListaCadastro, item: Cadastro): FormCadastro {
  const form: FormCadastro = { ...formVazio(), nome: item.nome };
  if (lista === "fornecedores") {
    const f = item as Fornecedor;
    form.pais = f.pais;
    form.alertaOpcao = f.semAlerta ? "sem" : "dias";
    form.prazoTexto = f.semAlerta || f.prazoAlertaDias === null ? "" : String(f.prazoAlertaDias);
  } else if (lista === "despachantes") {
    const d = item as Despachante;
    form.contatoNome = d.contatoNome;
    form.telefone = d.telefone;
    form.email = d.email;
    form.chavePix = pixDoItem(d);
  } else if (lista === "transportadoras") {
    form.chavePix = pixDoItem(item as Transportadora);
  }
  return form;
}

/**
 * "Número de dias": só dígitos viram número (qualquer outra coisa vira NaN, que a validação recusa); vazio = null.
 * Aceita número porque o v-model de um <input type="number"> já entrega número (ou "" quando vazio).
 */
function prazoDoTexto(texto: string | number | null | undefined): number | null {
  const t = String(texto ?? "").trim();
  if (t === "") return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

function alertaDoForm(form: FormCadastro): { semAlerta?: boolean; prazoAlertaDias?: number | null } {
  if (form.alertaOpcao === "sem") return { semAlerta: true, prazoAlertaDias: null };
  if (form.alertaOpcao === "dias") return { semAlerta: false, prazoAlertaDias: prazoDoTexto(form.prazoTexto) };
  return {}; // nada escolhido: a validação recusa com a mensagem de decidir
}

/** Corpo do POST: validado pela regra compartilhada (ou a mensagem de erro). `incluirPix`: quem pode ver/gravar a chave. */
export function montarNovo(
  lista: ListaCadastro,
  form: FormCadastro,
  incluirPix = false,
): ResultadoCadastro<NovoPorLista[ListaCadastro]> {
  if (lista === "fornecedores") {
    return validarNovoCadastro(lista, { nome: form.nome, pais: form.pais, ...alertaDoForm(form) });
  }
  if (lista === "despachantes") {
    return validarNovoCadastro(lista, {
      nome: form.nome,
      contatoNome: form.contatoNome,
      telefone: form.telefone,
      email: form.email,
      ...(incluirPix ? { chavePix: form.chavePix } : {}),
    });
  }
  if (lista === "transportadoras") {
    return validarNovoCadastro(lista, { nome: form.nome, ...(incluirPix ? { chavePix: form.chavePix } : {}) });
  }
  return validarNovoCadastro(lista, { nome: form.nome });
}

/**
 * Corpo do PATCH da edição: só os campos editáveis (o NOME nunca vai — não muda depois de criado). A chave PIX só vai
 * com `incluirPix` E se mudou em relação ao item original ("" limpa a chave).
 */
export function montarAlteracao(
  lista: ListaCadastro,
  form: FormCadastro,
  original?: Cadastro | null,
  incluirPix = false,
): ResultadoCadastro<PatchPorLista[ListaCadastro]> {
  const pixMudou = incluirPix && form.chavePix.trim() !== pixDoItem(original).trim();
  if (lista === "fornecedores") {
    return validarPatchCadastro(lista, { pais: form.pais, ...alertaDoForm(form) });
  }
  if (lista === "despachantes") {
    return validarPatchCadastro(lista, {
      contatoNome: form.contatoNome,
      telefone: form.telefone,
      email: form.email,
      ...(pixMudou ? { chavePix: form.chavePix } : {}),
    });
  }
  if (lista === "transportadoras") {
    return validarPatchCadastro(lista, pixMudou ? { chavePix: form.chavePix } : {});
  }
  return { ok: false, erro: "Esta lista não tem campos editáveis além do nome." };
}

/**
 * A lista tem algum campo editável depois de criada? Cia aérea só tem o nome (só se desativa/reativa); transportadora
 * só tem a chave PIX, então só edita quem pode vê-la (`podeVerPix`).
 */
export function listaTemEdicao(lista: ListaCadastro, podeVerPix = true): boolean {
  if (lista === "cias-aereas") return false;
  if (lista === "transportadoras") return podeVerPix;
  return true;
}

/** Item que já usa este nome (mesma chave: sem acento, caixa e espaços repetidos), inativo ou não. */
export function itemComMesmoNome(itens: readonly Cadastro[], nome: string): Cadastro | null {
  const chave = chaveCadastro(nome);
  if (chave === "") return null;
  return itens.find((i) => chaveCadastro(i.nome) === chave) ?? null;
}
