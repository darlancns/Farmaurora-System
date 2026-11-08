import type { Processo } from "#shared/types/processo";
import {
  avisoChegadaDevido,
  chaveAvisoChegadaVisto,
  montarTextoAvisoChegada,
  papelNoAvisoChegada,
  type PapelAvisoChegada,
  type UsuarioAvisoChegada,
} from "#shared/utils/avisoChegada";
import { contarProcessosPorPasta, remessaVisivelNaLinha } from "./remessaNaLinha";

// Itens do aviso "chegou?" no sino (alerta DERIVADO, como Fornecedor e Mandado): calculados a partir de
// Processo[], do usuário e do relógio. Função pura — `agora` e `vistos` vêm de fora para testar.

export interface AvisoChegadaSino {
  /** processoId|dataPrevista — chave estável do item (e da dispensa do administrador). */
  chave: string;
  processoId: string;
  /** "YYYY-MM-DD" */
  dataPrevista: string;
  papel: PapelAvisoChegada;
  /** "Chegou?" (operacional) ou null (administrador). */
  titulo: string | null;
  linhaProcesso: string;
  linhaData: string;
  diasAtraso: number;
}

/**
 * Avisos que o usuário vê agora.
 * - operacional: os processos em que ele é o responsável (vínculo pelo primeiro nome, como no Mandado);
 * - administrador: todos, menos os que ele já dispensou (`vistos`: chaves processoId|dataPrevista);
 * - sócio, consultor e sem login: nenhum.
 * Mais atrasados primeiro (empate: pasta, depois id).
 */
export function calcularAvisosChegada(
  processos: readonly Processo[],
  usuario: UsuarioAvisoChegada,
  agora: Date,
  vistos: ReadonlySet<string> = new Set(),
): AvisoChegadaSino[] {
  if (usuario.role !== "operacional" && usuario.role !== "administrador") return [];

  // A contagem por pasta usa TODOS os processos carregados (mesma regra da linha do Follow-Up).
  const contagem = contarProcessosPorPasta(processos);
  const avisos: AvisoChegadaSino[] = [];

  for (const processo of processos) {
    const papel = papelNoAvisoChegada(usuario, processo.responsavelOperacional);
    if (!papel) continue;

    const devido = avisoChegadaDevido(processo, agora);
    if (!devido.devido || !devido.dataPrevista) continue;

    const chave = chaveAvisoChegadaVisto(processo.id, devido.dataPrevista);
    if (papel === "administrador" && vistos.has(chave)) continue;

    const texto = montarTextoAvisoChegada({
      papel,
      paciente: processo.paciente,
      pasta: processo.pasta,
      numeroRemessa: processo.numeroRemessa,
      remessaVisivel: remessaVisivelNaLinha(processo, contagem),
      companhiaAerea: processo.companhiaAerea,
      numeroAwb: processo.numeroAwb,
      rotuloData: devido.rotuloData,
      diasAtraso: devido.diasAtraso,
    });

    avisos.push({
      chave,
      processoId: processo.id,
      dataPrevista: devido.dataPrevista,
      papel,
      titulo: texto.titulo,
      linhaProcesso: texto.linhaProcesso,
      linhaData: texto.linhaData,
      diasAtraso: devido.diasAtraso,
    });
  }

  return avisos.sort(
    (a, b) => b.diasAtraso - a.diasAtraso || a.linhaProcesso.localeCompare(b.linhaProcesso) || a.chave.localeCompare(b.chave),
  );
}
