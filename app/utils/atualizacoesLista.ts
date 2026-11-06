import type { AtualizacaoProcesso } from "#shared/types/processo";

// Operações PURAS sobre a lista de atualizações (timeline) de um processo: nunca alteram a lista
// recebida e devolvem uma lista nova — ou `null` quando a operação não pode ser feita (texto vazio,
// índice fora da lista, item que já não é o que o usuário viu). Quem chama decide a mensagem.
//
// `esperado` (editar/excluir): o item como o usuário o viu ao clicar. Como as gravações são
// enfileiradas e calculadas sobre a lista mais recente, o índice pode ter passado a apontar para
// outro item (ex.: uma exclusão anterior deslocou a lista) — `esperado` impede editar/excluir o item
// errado em silêncio.

function normalizar(item: AtualizacaoProcesso): AtualizacaoProcesso | null {
  const texto = item.texto.trim();
  if (!texto) return null;
  return { data: item.data.trim(), texto };
}

function mesmoItem(a: AtualizacaoProcesso, b: AtualizacaoProcesso): boolean {
  return a.data === b.data && a.texto === b.texto;
}

function indiceValido(lista: readonly AtualizacaoProcesso[], indice: number): boolean {
  return Number.isInteger(indice) && indice >= 0 && indice < lista.length;
}

export function adicionarAtualizacao(
  lista: readonly AtualizacaoProcesso[],
  item: AtualizacaoProcesso,
): AtualizacaoProcesso[] | null {
  const novo = normalizar(item);
  if (!novo) return null;
  return [...lista.map((a) => ({ ...a })), novo];
}

export function editarAtualizacao(
  lista: readonly AtualizacaoProcesso[],
  indice: number,
  item: AtualizacaoProcesso,
  esperado?: AtualizacaoProcesso,
): AtualizacaoProcesso[] | null {
  const novo = normalizar(item);
  if (!novo || !indiceValido(lista, indice)) return null;
  if (esperado && !mesmoItem(lista[indice]!, esperado)) return null;
  return lista.map((a, i) => (i === indice ? novo : { ...a }));
}

export function excluirAtualizacao(
  lista: readonly AtualizacaoProcesso[],
  indice: number,
  esperado?: AtualizacaoProcesso,
): AtualizacaoProcesso[] | null {
  if (!indiceValido(lista, indice)) return null;
  if (esperado && !mesmoItem(lista[indice]!, esperado)) return null;
  return lista.filter((_, i) => i !== indice).map((a) => ({ ...a }));
}

// Chave estável pro v-for: índice + hash do texto (a mesma frase em posições diferentes não colide,
// e o Vue não reaproveita o DOM de um item para outro ao editar/excluir).
export function chaveAtualizacao(item: AtualizacaoProcesso, indice: number): string {
  let hash = 0;
  for (let i = 0; i < item.texto.length; i++) {
    hash = (Math.imul(hash, 31) + item.texto.charCodeAt(i)) | 0;
  }
  return `${indice}-${(hash >>> 0).toString(36)}`;
}
