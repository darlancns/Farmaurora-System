import { ROTULO_INATIVO_CADASTRO } from "#shared/constants/cadastros";
import type { TemperaturaCadastro } from "#shared/types/Cadastro";
import { chaveCadastro, ordenarCadastro } from "#shared/utils/cadastroNome";
import type { AppSelectOption } from "../types/appSelect";

// Opções do select "Temperatura" do painel de MEDICAMENTOS (Configurações → Cadastros): "Selecione" + as temperaturas ATIVAS do
// Cadastro de Temperaturas, em ordem alfabética pt-BR. Só uma temperatura ativa pode ser escolhida como valor novo (o servidor
// confere de novo: 422 se não existe ou está inativa). Função pura (tests/unit/cadastroTemperaturaOptions.spec.ts).

/**
 * `atual` = a temperatura que o medicamento já tem (ao editar). Se ela não está entre as ativas, entra como opção extra e continua
 * selecionada, nunca vira vazio, até a pessoa trocá-la: "<valor> (inativo)" quando a temperatura existe no Cadastro como inativa; o
 * próprio valor, sem sufixo, quando não existe no Cadastro. O servidor aceita o valor que o medicamento já tem.
 */
export function montarTemperaturaOptions(atual: string, temperaturas: readonly TemperaturaCadastro[]): AppSelectOption<string>[] {
  const ativas = ordenarCadastro(temperaturas.filter((t) => t.ativo)).map((t) => t.nome);
  const opcoes: AppSelectOption<string>[] = [{ value: "", label: "Selecione" }, ...ativas.map((nome) => ({ value: nome, label: nome }))];

  const valor = atual.trim();
  if (valor !== "" && !ativas.includes(valor)) {
    const noCadastro = temperaturas.find((t) => chaveCadastro(t.nome) === chaveCadastro(valor));
    opcoes.push({ value: atual, label: noCadastro && !noCadastro.ativo ? `${valor} ${ROTULO_INATIVO_CADASTRO}` : valor });
  }
  return opcoes;
}
