import type { AtualizacaoProcesso } from "../types/processo";

// Detecção de itens NOVOS numa lista de pendências (texto) ou de atualizações ({ data, texto }) de um
// processo, comparando a lista de antes da gravação com a de depois. Funções puras — a base do aviso ao
// consultor ("nova pendência" / "nova atualização"), que só pode disparar quando ENTRA algo, nunca ao
// editar ou apagar.
//
// Como o formulário insere: os dois tipos de item são ANEXADOS NO FIM da lista (pendências:
// `pendencias.push("")` em useProcessoForm; atualizações: `adicionarAtualizacao` devolve `[...lista, novo]`;
// o aviso "chegou?" também faz `[...lido.atualizacoes, { data, texto }]`). Por isso os "novos" de verdade são
// sempre os ÚLTIMOS itens adicionados.
//
// Método (diferença de multiconjuntos, comparando itens normalizados com trim):
//   adicionados = itens da lista nova sem par na antiga (repetidos contam);
//   removidos   = itens da lista antiga sem par na nova;
//   novos reais = os ÚLTIMOS (adicionados - removidos) adicionados, quando positivo; senão nenhum.
// Assim editar um texto (sai um item, entra outro) dá saldo zero → nenhum aviso; apagar também; editar +
// adicionar dá saldo 1 → um aviso, o do item anexado no fim.

function chavePendencia(texto: string): string {
  return texto.trim();
}

function chaveAtualizacao(item: AtualizacaoProcesso): string {
  return `${item.data.trim()}\u0000${item.texto.trim()}`;
}

function diferencaDeMulticonjuntos<T>(
  antiga: readonly T[],
  nova: readonly T[],
  chave: (item: T) => string,
  vazio: (item: T) => boolean,
): T[] {
  const itensAntigos = antiga.filter((item) => !vazio(item));
  const itensNovos = nova.filter((item) => !vazio(item));

  // Quantas vezes cada item da lista antiga ainda pode "casar" com um da nova.
  const disponiveis = new Map<string, number>();
  for (const item of itensAntigos) {
    const k = chave(item);
    disponiveis.set(k, (disponiveis.get(k) ?? 0) + 1);
  }

  const adicionados: T[] = [];
  for (const item of itensNovos) {
    const k = chave(item);
    const restante = disponiveis.get(k) ?? 0;
    if (restante > 0) disponiveis.set(k, restante - 1);
    else adicionados.push(item);
  }

  // O que sobrou em `disponiveis` é o que saiu da lista (apagado ou editado).
  let removidos = 0;
  for (const restante of disponiveis.values()) removidos += restante;

  const liquido = adicionados.length - removidos;
  return liquido > 0 ? adicionados.slice(-liquido) : [];
}

/** Pendências novas (texto já com trim). Itens vazios são ignorados dos dois lados. */
export function novasPendencias(antiga: readonly string[], nova: readonly string[]): string[] {
  return diferencaDeMulticonjuntos(
    antiga,
    nova,
    chavePendencia,
    (texto) => chavePendencia(texto) === "",
  ).map((texto) => texto.trim());
}

/** Atualizações novas ({ data, texto } já com trim), comparadas pelo par. Texto vazio é ignorado. */
export function novasAtualizacoes(
  antiga: readonly AtualizacaoProcesso[],
  nova: readonly AtualizacaoProcesso[],
): AtualizacaoProcesso[] {
  return diferencaDeMulticonjuntos(
    antiga,
    nova,
    chaveAtualizacao,
    (item) => item.texto.trim() === "",
  ).map((item) => ({ data: item.data.trim(), texto: item.texto.trim() }));
}
