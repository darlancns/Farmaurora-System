import { gerarIdNovoProcesso } from "#shared/utils/idNovoProcesso";
import type { NewProcessoDTO } from "#shared/types/processo";
import { ProcessoJaCriadoError, useProcessos } from "./useProcessos";

export type ResultadoCriarProcesso = { tipo: "criado" } | { tipo: "ja_criado" };

/**
 * Criação de processo pelo formulário "Novo processo", com a segunda proteção contra envio repetido (a primeira é a trava de
 * envio da página): o id do processo é gerado UMA vez ao abrir o formulário (`iniciar`) e vai em todo envio deste mesmo
 * formulário. Se um envio já criou o processo e outro chega depois, o servidor responde 409 e `criar` devolve
 * `{ tipo: "ja_criado" }` (a lista é recarregada em segundo plano; nada novo foi gravado). `encerrar` esquece o id
 * (ao fechar); o próximo `iniciar` gera outro.
 */
export function useCriarProcesso() {
  const { addProcesso, fetchProcessos } = useProcessos();
  let idDoFormulario: string | undefined;

  function iniciar(): void {
    idDoFormulario = gerarIdNovoProcesso();
  }

  function encerrar(): void {
    idDoFormulario = undefined;
  }

  async function criar(payload: NewProcessoDTO): Promise<ResultadoCriarProcesso> {
    try {
      await addProcesso(idDoFormulario ? { ...payload, id: idDoFormulario } : payload);
      return { tipo: "criado" };
    } catch (e) {
      if (e instanceof ProcessoJaCriadoError) {
        void fetchProcessos(true); // o processo existe no servidor: traz para a tela (sem esperar)
        return { tipo: "ja_criado" };
      }
      throw e;
    }
  }

  return { iniciar, encerrar, criar };
}
