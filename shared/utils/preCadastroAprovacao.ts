import type { AprovarPreCadastroDTO } from "../types/PreCadastro";
import type { StatusPreCadastro } from "../types/compra";
import { validarNovoCadastro, type ResultadoCadastro } from "./cadastroValidacao";

// Validação PURA da decisão dos pré-cadastros: a rota e a tela usam as mesmas regras (e as mesmas mensagens).

const STATUS: readonly StatusPreCadastro[] = ["pendente", "aprovado", "rejeitado"];

/** `?status=` da lista: ausente vale "pendente"; qualquer outro valor que não seja um dos três é erro. */
export function validarStatusDaLista(valor: unknown): ResultadoCadastro<StatusPreCadastro> {
  if (valor === undefined || valor === null || valor === "") return { ok: true, valor: "pendente" };
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (typeof texto === "string" && (STATUS as readonly string[]).includes(texto)) return { ok: true, valor: texto as StatusPreCadastro };
  return { ok: false, erro: "Status inválido: use pendente, aprovado ou rejeitado." };
}

/**
 * Corpo do POST .../aprovar. Ausente ou `{}` é válido (aprova com o nome e a temperatura do pedido). Só `nome`, `temperatura` e
 * `vincularExistente` existem; `nome` e `temperatura`, quando vêm, seguem as MESMAS regras do cadastro normal de medicamento
 * (validarNovoCadastro: MAIÚSCULAS, tamanho, "Outro" reservado) — a temperatura ATIVA quem confere é o servidor ao criar.
 */
export function validarAprovacaoPreCadastro(corpo: unknown, pedido: { nome: string; temperatura: string }): ResultadoCadastro<{ dto: AprovarPreCadastroDTO; nome: string; temperatura: string; vincular: boolean }> {
  if (corpo !== undefined && corpo !== null && (typeof corpo !== "object" || Array.isArray(corpo))) return { ok: false, erro: "Dados inválidos." };
  const o = (corpo ?? {}) as Record<string, unknown>;
  const desconhecida = Object.keys(o).find((k) => !["nome", "temperatura", "vincularExistente"].includes(k));
  if (desconhecida) return { ok: false, erro: `Campo desconhecido: ${desconhecida}.` };
  if (o.vincularExistente !== undefined && typeof o.vincularExistente !== "boolean") return { ok: false, erro: "vincularExistente deve ser verdadeiro ou falso." };

  const nome = o.nome === undefined ? pedido.nome : o.nome;
  const temperatura = o.temperatura === undefined ? pedido.temperatura : o.temperatura;
  const vincular = o.vincularExistente === true;
  // Vincular não cria linha no Cadastro, então a temperatura não vale: só o nome é conferido (o "-" abaixo é só para a validação do nome passar).
  const temperaturaDaValidacao = vincular && (typeof temperatura !== "string" || temperatura.trim() === "") ? "-" : temperatura;
  const limpo = validarNovoCadastro("medicamentos", { nome, temperatura: temperaturaDaValidacao });
  if (!limpo.ok) return limpo;

  const dto: AprovarPreCadastroDTO = {
    ...(o.nome === undefined ? {} : { nome: limpo.valor.nome }),
    ...(o.temperatura === undefined ? {} : { temperatura: limpo.valor.temperatura }),
    ...(o.vincularExistente === undefined ? {} : { vincularExistente: o.vincularExistente }),
  };
  return { ok: true, valor: { dto, nome: limpo.valor.nome, temperatura: limpo.valor.temperatura, vincular } };
}
