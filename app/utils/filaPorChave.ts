// Fila por chave: tarefas da MESMA chave rodam uma de cada vez, na ordem em que foram pedidas;
// chaves diferentes não esperam umas pelas outras. Uma tarefa que falha não trava as seguintes
// (o erro volta só pra quem a pediu). A entrada da chave é removida quando a fila esvazia.
export function createFilaPorChave() {
  const filas = new Map<string, Promise<unknown>>();

  function enfileirar<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
    const anterior = filas.get(chave) ?? Promise.resolve();
    const atual = anterior.then(tarefa, tarefa);
    const marcador = atual.then(
      () => undefined,
      () => undefined
    );
    filas.set(chave, marcador);
    void marcador.then(() => {
      if (filas.get(chave) === marcador) filas.delete(chave);
    });
    return atual;
  }

  return { enfileirar, tamanho: () => filas.size };
}
