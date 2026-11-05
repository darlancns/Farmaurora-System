import type { GrupoPagamento } from "#shared/types/Pagamento";

// Mesma ordem que o servidor entrega (grupoStore.listarGruposPagamento): created_at desc, id asc.
function compararComoServidor(a: GrupoPagamento, b: GrupoPagamento): number {
  const dif = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (dif !== 0 && !Number.isNaN(dif)) return dif;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Aplica na lista local um grupo devolvido pelo servidor (PATCH/POST), sem refazer o GET da lista.
 * - Grupo já está na lista: troca no MESMO lugar (created_at não muda no PATCH, a ordem se mantém).
 * - Grupo novo: entra e a lista é reordenada como o servidor ordena (o mais novo vai pro topo).
 * Devolve uma lista nova; não muta a recebida.
 */
export function aplicarGrupoNaLista(lista: GrupoPagamento[], grupo: GrupoPagamento): GrupoPagamento[] {
  const index = lista.findIndex((g) => g.id === grupo.id);
  if (index !== -1) {
    const copia = lista.slice();
    copia[index] = grupo;
    return copia;
  }
  return [...lista, grupo].sort(compararComoServidor);
}
