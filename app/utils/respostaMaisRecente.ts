/**
 * Proteções contra corrida de requisições (usadas por usePagamentos):
 *
 *  - `criarFilaPorChave`: executa as tarefas de uma MESMA chave (ex.: o loteId)
 *    uma por vez, na ordem pedida; chaves diferentes não esperam umas pelas
 *    outras. Erro de uma tarefa não trava a fila (quem pediu recebe o erro).
 *  - `criarGuardaSequencia`: cada requisição recebe um número ao ser disparada;
 *    a resposta só pode ser aplicada se nenhuma resposta MAIS NOVA (de uma
 *    requisição disparada depois) já foi aplicada. O contador é compartilhado por
 *    quem usar a mesma instância — por isso é global, não por lote.
 */

export interface FilaPorChave {
  enfileirar<T>(chave: string, tarefa: () => Promise<T>): Promise<T>;
}

export function criarFilaPorChave(): FilaPorChave {
  const filas = new Map<string, Promise<void>>();

  return {
    enfileirar<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
      const anterior = filas.get(chave) ?? Promise.resolve();
      const atual = anterior.then(tarefa);
      const marcador = atual.then(
        () => undefined,
        () => undefined,
      );
      filas.set(chave, marcador);
      void marcador.then(() => {
        if (filas.get(chave) === marcador) filas.delete(chave);
      });
      return atual;
    },
  };
}

export interface GuardaSequencia {
  // Chamar ao DISPARAR a requisição; guarda o token para `podeAplicar`.
  proximo(): number;
  // Chamar ao RECEBER a resposta: true se pode aplicar (e registra o token como
  // o mais novo aplicado); false se uma resposta mais nova já foi aplicada.
  podeAplicar(token: number): boolean;
}

export function criarGuardaSequencia(): GuardaSequencia {
  let despachada = 0;
  let aplicada = 0;

  return {
    proximo(): number {
      despachada += 1;
      return despachada;
    },
    podeAplicar(token: number): boolean {
      if (token < aplicada) return false;
      aplicada = token;
      return true;
    },
  };
}
