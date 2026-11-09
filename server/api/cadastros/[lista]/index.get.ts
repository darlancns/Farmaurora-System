import { defineEventHandler } from "h3";
import { listaDaRota } from "../../../utils/cadastroAcesso";
import { listarCadastro } from "../../../utils/cadastrosStore";
import type { Cadastro } from "../../../../shared/types/Cadastro";

// Todos os cargos leem (middleware: /api/cadastros → seção "config", leitura aberta). Devolve os itens ATIVOS e os
// INATIVOS (cada um com `ativo`), em ordem alfabética pt-BR com os ativos primeiro: quem consome decide o que mostrar.
export default defineEventHandler(async (event): Promise<Cadastro[]> => {
  return await listarCadastro(listaDaRota(event));
});
