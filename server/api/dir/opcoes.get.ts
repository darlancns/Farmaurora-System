import { defineEventHandler } from "h3";
import type { DirOpcoes } from "../../../shared/types/dir";
import type { AuthUser } from "../../../shared/types/auth";
import { exigirLeituraDir } from "../../utils/dirAcesso";
import { listarOpcoesDaDir } from "../../utils/dirOpcoes";

// As opções da DIR que vêm dos Cadastros (hoje só as temperaturas ativas). Vale a leitura da DIR (`dir = ver`), sem depender de
// GET /api/cadastros/* (que é da seção Configurações). Nunca traz chave PIX nem itens inativos.
export default defineEventHandler(async (event): Promise<DirOpcoes> => {
  const user: AuthUser | null | undefined = event.context.user;
  exigirLeituraDir(user);
  return await listarOpcoesDaDir();
});
