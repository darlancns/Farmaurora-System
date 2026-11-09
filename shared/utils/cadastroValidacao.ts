import {
  CONTATO_CADASTRO_MAX,
  EMAIL_CADASTRO_MAX,
  NOME_CADASTRO_MAX,
  NOME_RESERVADO_CADASTRO,
  PAIS_CADASTRO_MAX,
  PRAZO_ALERTA_MAX_DIAS,
  PRAZO_ALERTA_MIN_DIAS,
  TELEFONE_CADASTRO_MAX,
  TELEFONE_DIGITOS_MAX,
  TELEFONE_DIGITOS_MIN,
} from "../constants/cadastros";
import type { ListaCadastro, NovoPorLista, PatchPorLista } from "../types/Cadastro";
import { nomeReservadoCadastro } from "./cadastroNome";

// Validação PURA dos Cadastros — o servidor (handlers) e o formulário da tela usam as mesmas regras, então as
// mensagens são as que a pessoa lê. Devolve o objeto já LIMPO (texto aparado, só as chaves conhecidas) ou a mensagem.

export type ResultadoCadastro<T> = { ok: true; valor: T } | { ok: false; erro: string };

const MSG_PRAZO_DECIDIR = `Defina o alerta: informe o número de dias (${PRAZO_ALERTA_MIN_DIAS} a ${PRAZO_ALERTA_MAX_DIAS}) ou marque "Sem alerta".`;
const MSG_PRAZO_FAIXA = `O prazo do alerta deve ser um número inteiro de ${PRAZO_ALERTA_MIN_DIAS} a ${PRAZO_ALERTA_MAX_DIAS} dias.`;
const MSG_EMAIL = "Informe um e-mail válido (ex.: nome@empresa.com).";
const MSG_TELEFONE = `Informe um telefone válido (de ${TELEFONE_DIGITOS_MIN} a ${TELEFONE_DIGITOS_MAX} dígitos; pode ter +, parênteses, espaço e traço).`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONE_RE = /^\+?[\d\s().-]+$/;

function objeto(corpo: unknown): Record<string, unknown> | null {
  return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null;
}

function erro<T>(mensagem: string): ResultadoCadastro<T> {
  return { ok: false, erro: mensagem };
}

/** Telefone preenchido: só dígitos, espaço e + ( ) - . , com 8 a 15 dígitos. */
export function telefoneValido(valor: string): boolean {
  if (valor.length > TELEFONE_CADASTRO_MAX || !TELEFONE_RE.test(valor)) return false;
  const digitos = valor.replace(/\D/g, "").length;
  return digitos >= TELEFONE_DIGITOS_MIN && digitos <= TELEFONE_DIGITOS_MAX;
}

export function emailValido(valor: string): boolean {
  return valor.length <= EMAIL_CADASTRO_MAX && EMAIL_RE.test(valor);
}

function validarNome(v: unknown): ResultadoCadastro<string> {
  if (typeof v !== "string" || v.trim() === "") return erro("Informe o nome.");
  const nome = v.trim().replace(/\s+/g, " ");
  if (nome.length > NOME_CADASTRO_MAX) return erro(`O nome pode ter no máximo ${NOME_CADASTRO_MAX} caracteres.`);
  if (nomeReservadoCadastro(nome)) {
    return erro(`"${NOME_RESERVADO_CADASTRO}" é um nome reservado (é a opção de digitar um valor fora da lista).`);
  }
  return { ok: true, valor: nome };
}

type CampoTexto = { nome: string; max: number; extra?: (valor: string) => string | null };

// Texto opcional: ausente ou vazio vale "" ; preenchido é aparado e conferido.
function textoOpcional(v: unknown, campo: CampoTexto): ResultadoCadastro<string> {
  if (v === undefined || v === null) return { ok: true, valor: "" };
  if (typeof v !== "string") return erro(`${campo.nome} inválido.`);
  const texto = v.trim();
  if (texto.length > campo.max) return erro(`${campo.nome} pode ter no máximo ${campo.max} caracteres.`);
  const problema = texto === "" ? null : campo.extra?.(texto);
  return problema ? erro(problema) : { ok: true, valor: texto };
}

const CAMPO_PAIS: CampoTexto = { nome: "O país", max: PAIS_CADASTRO_MAX };
const CAMPO_CONTATO: CampoTexto = { nome: "O nome do contato", max: CONTATO_CADASTRO_MAX };
const CAMPO_TELEFONE: CampoTexto = {
  nome: "O telefone",
  max: TELEFONE_CADASTRO_MAX,
  extra: (t) => (telefoneValido(t) ? null : MSG_TELEFONE),
};
const CAMPO_EMAIL: CampoTexto = {
  nome: "O e-mail",
  max: EMAIL_CADASTRO_MAX,
  extra: (t) => (emailValido(t) ? null : MSG_EMAIL),
};

/**
 * Alerta do fornecedor: DECIDIDO, nunca em branco. Ou `semAlerta: true` com prazo vazio, ou `semAlerta: false` com um
 * inteiro de 1 a 365 (o mesmo CHECK da tabela). `prazoAlertaDias` precisa vir (null quando sem alerta).
 */
export function validarAlertaFornecedor(
  semAlerta: unknown,
  prazoAlertaDias: unknown,
): ResultadoCadastro<{ semAlerta: boolean; prazoAlertaDias: number | null }> {
  if (typeof semAlerta !== "boolean") return erro(MSG_PRAZO_DECIDIR);
  if (semAlerta) {
    if (prazoAlertaDias !== null && prazoAlertaDias !== undefined) {
      return erro('Com "Sem alerta" marcado, não há prazo em dias.');
    }
    return { ok: true, valor: { semAlerta: true, prazoAlertaDias: null } };
  }
  if (prazoAlertaDias === null || prazoAlertaDias === undefined || prazoAlertaDias === "") return erro(MSG_PRAZO_DECIDIR);
  if (
    typeof prazoAlertaDias !== "number" ||
    !Number.isInteger(prazoAlertaDias) ||
    prazoAlertaDias < PRAZO_ALERTA_MIN_DIAS ||
    prazoAlertaDias > PRAZO_ALERTA_MAX_DIAS
  ) {
    return erro(MSG_PRAZO_FAIXA);
  }
  return { ok: true, valor: { semAlerta: false, prazoAlertaDias } };
}

function chavesDesconhecidas(corpo: Record<string, unknown>, permitidas: readonly string[]): string | null {
  const fora = Object.keys(corpo).find((k) => !permitidas.includes(k));
  return fora ? `Campo desconhecido: ${fora}.` : null;
}

const CHAVES_NOVO: Record<ListaCadastro, readonly string[]> = {
  fornecedores: ["nome", "pais", "prazoAlertaDias", "semAlerta"],
  despachantes: ["nome", "contatoNome", "telefone", "email"],
  "cias-aereas": ["nome"],
};

const CHAVES_PATCH: Record<ListaCadastro, readonly string[]> = {
  fornecedores: ["nome", "pais", "prazoAlertaDias", "semAlerta", "ativo"],
  despachantes: ["nome", "contatoNome", "telefone", "email", "ativo"],
  "cias-aereas": ["nome", "ativo"],
};

/** Corpo de criação de um item da lista; o item nasce ativo. */
export function validarNovoCadastro<L extends ListaCadastro>(lista: L, corpo: unknown): ResultadoCadastro<NovoPorLista[L]> {
  const o = objeto(corpo);
  if (!o) return erro("Dados inválidos.");
  const desconhecida = chavesDesconhecidas(o, CHAVES_NOVO[lista]);
  if (desconhecida) return erro(desconhecida);

  const nome = validarNome(o.nome);
  if (!nome.ok) return nome;

  if (lista === "fornecedores") {
    const pais = textoOpcional(o.pais, CAMPO_PAIS);
    if (!pais.ok) return pais;
    const alerta = validarAlertaFornecedor(o.semAlerta, o.prazoAlertaDias);
    if (!alerta.ok) return alerta;
    return { ok: true, valor: { nome: nome.valor, pais: pais.valor, ...alerta.valor } as NovoPorLista[L] };
  }

  if (lista === "despachantes") {
    const contatoNome = textoOpcional(o.contatoNome, CAMPO_CONTATO);
    if (!contatoNome.ok) return contatoNome;
    const telefone = textoOpcional(o.telefone, CAMPO_TELEFONE);
    if (!telefone.ok) return telefone;
    const email = textoOpcional(o.email, CAMPO_EMAIL);
    if (!email.ok) return email;
    return {
      ok: true,
      valor: {
        nome: nome.valor,
        contatoNome: contatoNome.valor,
        telefone: telefone.valor,
        email: email.valor,
      } as NovoPorLista[L],
    };
  }

  return { ok: true, valor: { nome: nome.valor } as NovoPorLista[L] };
}

/**
 * Corpo de alteração parcial. Só as chaves presentes são conferidas e devolvidas. `nome` é aceito aqui (aparado) só
 * para o servidor comparar com o gravado e RECUSAR a troca (422) — o nome não muda depois de criado. `prazoAlertaDias`
 * e `semAlerta` vão juntos (os dois ou nenhum) e passam pela mesma regra de decidir do cadastro.
 */
export function validarPatchCadastro<L extends ListaCadastro>(lista: L, corpo: unknown): ResultadoCadastro<PatchPorLista[L]> {
  const o = objeto(corpo);
  if (!o) return erro("Dados inválidos.");
  const desconhecida = chavesDesconhecidas(o, CHAVES_PATCH[lista]);
  if (desconhecida) return erro(desconhecida);
  if (Object.keys(o).length === 0) return erro("Nenhuma alteração informada.");

  const patch: Record<string, unknown> = {};

  if ("nome" in o) {
    // Só aparar: a regra de "não pode mudar" é do servidor, que conhece o nome gravado.
    if (typeof o.nome !== "string" || o.nome.trim() === "") return erro("Informe o nome.");
    patch.nome = o.nome.trim().replace(/\s+/g, " ");
  }
  if ("ativo" in o) {
    if (typeof o.ativo !== "boolean") return erro("Valor de ativo inválido.");
    patch.ativo = o.ativo;
  }

  const copiarTexto = (chave: string, campo: CampoTexto): string | null => {
    if (!(chave in o)) return null;
    if (o[chave] === undefined || o[chave] === null) return `${campo.nome} inválido.`;
    const r = textoOpcional(o[chave], campo);
    if (!r.ok) return r.erro;
    patch[chave] = r.valor;
    return null;
  };

  const problemas: Array<string | null> = [];
  if (lista === "fornecedores") {
    problemas.push(copiarTexto("pais", CAMPO_PAIS));
    const temSem = "semAlerta" in o;
    const temPrazo = "prazoAlertaDias" in o;
    if (temSem || temPrazo) {
      const alerta = validarAlertaFornecedor(o.semAlerta, o.prazoAlertaDias);
      if (!alerta.ok) return alerta;
      if (!temSem || !temPrazo) return erro(MSG_PRAZO_DECIDIR);
      patch.semAlerta = alerta.valor.semAlerta;
      patch.prazoAlertaDias = alerta.valor.prazoAlertaDias;
    }
  } else if (lista === "despachantes") {
    problemas.push(copiarTexto("contatoNome", CAMPO_CONTATO), copiarTexto("telefone", CAMPO_TELEFONE), copiarTexto("email", CAMPO_EMAIL));
  }

  const problema = problemas.find((p) => p !== null);
  if (problema) return erro(problema);

  return { ok: true, valor: patch as PatchPorLista[L] };
}
