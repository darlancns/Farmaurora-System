import { defineEventHandler } from "h3";
import { listaDaRota, usuarioVePix } from "../../../utils/cadastroAcesso";
import { listarCadastro } from "../../../utils/cadastrosStore";
import type { Cadastro } from "../../../../shared/types/Cadastro";
import type { AuthUser } from "../../../../shared/types/auth";

// Todos os cargos leem (middleware: /api/cadastros → seção "config", leitura aberta). Devolve os itens ATIVOS e os
// INATIVOS (cada um com `ativo`), em ordem alfabética pt-BR com os ativos primeiro: quem consome decide o que mostrar.
//
// CHAVE PIX (despachantes e transportadoras) é dado financeiro: o campo `chavePix` só vem para o administrador e para quem
// LÊ a seção Pagamentos. Para os demais ele NÃO EXISTE na resposta (nem null) — e a coluna nem é lida do banco.
export default defineEventHandler(async (event): Promise<Cadastro[]> => {
  const user: AuthUser | null | undefined = event.context.user;
  return await listarCadastro(listaDaRota(event), { incluirPix: usuarioVePix(user) });
});
