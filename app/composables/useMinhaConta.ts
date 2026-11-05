import { computed, ref, type ComputedRef, type Ref } from "vue";
import type {
  AlterarEmailDTO,
  AlterarEmailResult,
  AlterarNomeDTO,
  AlterarNomeResult,
  AlterarSenhaDTO,
  AlterarSenhaResult,
} from "#shared/types/conta";
import { MENSAGEM_NOME_BLOQUEADO, podeEditarNomeDaConta } from "#shared/utils/contaCampos";
import { apiFetch } from "../utils/apiFetch";
import { getErrorMessage } from "../utils/errorMessages";
import { useAuth } from "./useAuth";

export interface EstadoAcaoConta {
  carregando: Ref<boolean>;
  /** Mensagem do servidor (pt-BR) da última tentativa; null enquanto não falhou. */
  erro: Ref<string | null>;
}

export interface UseMinhaContaReturn {
  /** Consultor e operacional não editam o próprio nome (shared/utils/contaCampos.ts). */
  podeEditarNome: ComputedRef<boolean>;
  estadoNome: EstadoAcaoConta;
  estadoEmail: EstadoAcaoConta;
  estadoSenha: EstadoAcaoConta;
  alterarNome: (nome: string) => Promise<boolean>;
  alterarEmail: (email: string, confirmacao: string, senhaAtual: string) => Promise<boolean>;
  alterarSenha: (senhaAtual: string, novaSenha: string) => Promise<boolean>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Edição da PRÓPRIA conta (aba "Minha conta" — a tela é da Fase C). Chama os endpoints
 * /api/auth/conta/{nome,email,senha}; cada ação devolve `true` no sucesso e `false` no erro (a mensagem
 * fica em `estado*.erro`).
 *
 * - Depois do sucesso atualiza `useAuth().user` com o que a resposta devolveu (nome ou e-mail novos).
 *   NÃO chama `load(true)`: o cache de 8s do server/middleware/auth.ts poderia devolver o valor antigo.
 * - Senhas e e-mails digitados existem só como argumento e no corpo da requisição: nunca vão pra
 *   `useState` (que viajaria no payload do SSR), pra log nem pra estado deste composable. Os campos
 *   do formulário (v-model) quem limpa é a tela, depois de a ação devolver.
 * - As refs deste composable são locais (por chamada), não compartilhadas entre componentes.
 */
export function useMinhaConta(): UseMinhaContaReturn {
  const { user, role } = useAuth();

  const podeEditarNome = computed<boolean>(() => (role.value ? podeEditarNomeDaConta(role.value) : false));

  const estadoNome: EstadoAcaoConta = { carregando: ref(false), erro: ref(null) };
  const estadoEmail: EstadoAcaoConta = { carregando: ref(false), erro: ref(null) };
  const estadoSenha: EstadoAcaoConta = { carregando: ref(false), erro: ref(null) };

  // Roda uma ação: ignora duplo clique, zera o erro, e traduz a falha pra mensagem do estado.
  async function executar(estado: EstadoAcaoConta, fallback: string, acao: () => Promise<void>): Promise<boolean> {
    if (estado.carregando.value) return false;
    estado.carregando.value = true;
    estado.erro.value = null;
    try {
      await acao();
      return true;
    } catch (e) {
      estado.erro.value = getErrorMessage(e, fallback);
      return false;
    } finally {
      estado.carregando.value = false;
    }
  }

  async function alterarNome(nome: string): Promise<boolean> {
    if (!podeEditarNome.value) {
      // Evita a ida ao servidor (que também responde 403): mostra a mesma orientação.
      estadoNome.erro.value =
        (role.value && MENSAGEM_NOME_BLOQUEADO[role.value]) || "Peça ao administrador para alterar o seu nome.";
      return false;
    }
    const corpo: AlterarNomeDTO = { nome };
    return executar(estadoNome, "Erro ao alterar o nome.", async () => {
      const res = await apiFetch<AlterarNomeResult>(
        "/api/auth/conta/nome",
        { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(corpo) },
        "Erro ao alterar o nome.",
      );
      if (user.value) user.value = { ...user.value, nome: res.nome };
    });
  }

  async function alterarEmail(email: string, confirmacao: string, senhaAtual: string): Promise<boolean> {
    const corpo: AlterarEmailDTO = { senhaAtual, email, emailConfirmacao: confirmacao };
    return executar(estadoEmail, "Erro ao alterar o e-mail.", async () => {
      const res = await apiFetch<AlterarEmailResult>(
        "/api/auth/conta/email",
        { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(corpo) },
        "Erro ao alterar o e-mail.",
      );
      if (user.value) user.value = { ...user.value, email: res.email };
    });
  }

  async function alterarSenha(senhaAtual: string, novaSenha: string): Promise<boolean> {
    const corpo: AlterarSenhaDTO = { senhaAtual, novaSenha };
    return executar(estadoSenha, "Erro ao alterar a senha.", async () => {
      // A resposta é só `{ atualizada: true }` e a sessão continua válida: não há nada a atualizar em `user`.
      await apiFetch<AlterarSenhaResult>(
        "/api/auth/conta/senha",
        { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(corpo) },
        "Erro ao alterar a senha.",
      );
    });
  }

  return { podeEditarNome, estadoNome, estadoEmail, estadoSenha, alterarNome, alterarEmail, alterarSenha };
}
