---
name: "claim-issue"
description: "Reserva (claim) uma issue do GitHub antes de começar a implementar: filtra por label de estado (ready/in-progress/done), atribui ao usuário e resolve corrida entre agentes. Use SEMPRE que for pegar, escolher, assumir ou começar a trabalhar em uma issue do GitHub — inclusive antes de /speckit-implement — e quando houver vários agentes dev rodando em máquinas ou worktrees diferentes no mesmo repositório."
argument-hint: "Número da issue, ou vazio para escolher a próxima issue com label ready"
user-invocable: true
disable-model-invocation: false
---

## Entrada

```text
$ARGUMENTS
```

Número de issue → tenta reservar essa. Vazio → escolhe a próxima com label `ready`.

## Modelo de estado

Labels dizem em que estágio a issue está e permitem filtrar na busca, sem abrir issue nenhuma:

| Label | Significado |
|---|---|
| `ready` | refinada, livre, pronta para um agente pegar |
| `in-progress` | reservada por um agente, em implementação |
| `done` | concluída |

Uma issue tem **exatamente um** desses labels. Issue sem nenhum dos três não está refinada — não pegue.

Já criados em `labsitio/nexus-orc-back`. Para recriar em outro repositório (`--force` faz update se já existir, então é idempotente sem engolir erro):

```bash
gh label create ready       --force --color 0E8A16 --description "Livre para um agente dev pegar"
gh label create in-progress --force --color FBCA04 --description "Reservada por um agente dev"
gh label create done        --force --color 6F42C1 --description "Concluída"
```

## Por que label não basta para o lock

Label é conjunto, não tem ordem, e `--add-label in-progress` é aditivo: dois agentes adicionam o mesmo label sem erro e ambos acham que ganharam. `assignee` também não resolve — todos os agentes rodam sob a mesma conta GitHub, então a lista de assignees não distingue máquina A de B, e a API não tem compare-and-swap.

Quem decide é um **comentário de claim**: o GitHub gera IDs de comentário server-side em ordem total, então todos os agentes leem o mesmo vencedor — o claim de menor `id`. Custo: 2 chamadas extras, só na issue candidata, nunca na busca.

Ordene por `id`, **nunca** por `created_at`: os agentes rodam em máquinas diferentes, mas o `id` é gerado pelo servidor do GitHub — relógio de máquina nenhuma entra no desempate, então skew de clock não inverte o vencedor.

## Ferramentas

Use `gh` (preferido: filtra server-side com `--jq`, então só o resultado entra no contexto). Caso não exista, use as ferramentas do GitHub MCP server já usadas por `/speckit-taskstoissues` (`list_issues`, `update_issue`, `add_issue_comment`, `list_issue_comments`) contra o repositório do remote.

**Requer `gh` >= 2.60.** Verifique antes de qualquer coisa — cada máquina tem sua própria instalação e uma versão velha falha nas flags usadas aqui:

```bash
gh --version   # 2.4.0 (repo padrão do Ubuntu) NÃO serve: sem `gh label create`, e `-f 'labels[]=x'` retorna "not a permitted key"
gh auth status # cada máquina precisa da própria autenticação
```

Se a versão for antiga, **pare e avise** — não tente contornar com `gh api --input -`, porque o agente vai falhar mais adiante em `--add-label`/`--remove-label` e pode acabar implementando sem lock. Instale pelo repositório oficial (`https://cli.github.com/packages`).

> [!CAUTION]
> Confirme o repositório com `git config --get remote.origin.url` e só opere se for um remote GitHub. Nunca opere em outro repositório.

Cada máquina precisa da própria autenticação (`gh auth status`, ou token no ambiente do MCP server). Sem isso o agente não consegue reservar nada e vai tentar implementar sem lock.

## Identidade do agente

Gere **uma vez** por sessão e guarde no scratchpad (`$PPID` muda entre chamadas de shell):

```bash
AGENT_ID="$(hostname)/$(basename "$(git rev-parse --show-toplevel)")/${CLAUDE_SESSION_ID:-$PPID}"
```

No Windows, rode a skill pelo **Git Bash** (vem com o Git for Windows) — aí o bloco acima e todos os outros funcionam sem alteração. Em PowerShell, o equivalente:

```powershell
$AGENT_ID = "$(hostname)/$(Split-Path -Leaf (git rev-parse --show-toplevel))/$(if ($env:CLAUDE_SESSION_ID) { $env:CLAUDE_SESSION_ID } else { $PID })"
```

`cmd.exe` não serve: não tem `basename`, nem `$(...)`, nem aspas simples como literal — os `--jq '...'` desta skill quebram.

`hostname` é o que separa as máquinas — o resto do repositório é idêntico em todas. Se as máquinas puderem ter hostname repetido (containers com `--hostname` fixo, imagens clonadas), o `AGENT_ID` deixa de ser único e o desempate quebra: nesse caso troque `$(hostname)` por um identificador único e estável da máquina — `cat /etc/machine-id` no Linux, `(Get-CimInstance Win32_ComputerSystemProduct).UUID` no Windows.

Não guarde o lock no scratchpad: máquinas diferentes não compartilham filesystem, o scratchpad serve só para reusar o `AGENT_ID` dentro da sessão. A verdade do lock está sempre no GitHub.

## Protocolo

1. **Buscar candidatas** (pule se veio número na entrada):

   ```bash
   gh issue list --state open --label ready --search "no:assignee sort:created-asc" \
     --json number,title,labels --limit 50
   ```

   Escolha a primeira coerente com o trabalho atual, respeitando ordem de dependência das tasks `T###`. Issues `in-progress` ou com assignee já estão reservadas — não toque.

2. **Reconferir a candidata com leitura direta**:

   ```bash
   gh issue view <N> --json number,state,labels,assignees
   ```

   O índice de busca do passo 1 é eventualmente consistente: ele pode devolver como `ready` uma issue que outra máquina marcou `in-progress` segundos antes. `gh issue view` é um GET direto e reflete o estado atual. Se já vier `in-progress`, com assignee, ou fechada, descarte e volte ao passo 1.

3. **Marcar e atribuir** (lock visível para humanos, ainda sem garantia):

   ```bash
   gh issue edit <N> --add-label in-progress --remove-label ready --add-assignee @me
   ```

4. **Postar o claim** — operação que decide o vencedor:

   ```bash
   gh issue comment <N> --body "[claim] $AGENT_ID"
   ```

   O marcador é ASCII puro de propósito. Com emoji, um agente em Windows/PowerShell pode gravar o corpo com o caractere mutilado pela code page; o `startswith` do passo 5 então não casa, o claim fica **invisível** para o desempate, e os dois agentes se consideram vencedores — exatamente a falha que a skill existe para evitar. Não troque `[claim]`/`[released]` por emoji.

5. **Ler o vencedor** — menor `id` ganha:

   ```bash
   gh api "repos/{owner}/{repo}/issues/<N>/comments" \
     --jq '[.[] | select(.body | startswith("[claim]"))] | sort_by(.id) | .[0].body'
   ```

   Se a saída **não contiver o seu `AGENT_ID` em nenhum comentário da lista**, o seu próprio claim ainda não propagou (read-after-write). Não conclua que perdeu: releia uma vez antes de decidir. Só decida com o seu claim visível na lista.

6. **Decidir**:
   - Contém o seu `AGENT_ID` → claim seu. Prossiga com a implementação.
   - É de outro agente → você perdeu. Marque só o **seu** comentário e volte ao passo 1 com a próxima issue:

     ```bash
     gh issue comment <N> --body "[released] $AGENT_ID (perdeu corrida de claim)"
     ```

     Comentário novo, não edição do anterior: o claim do perdedor continua na thread com o `id` dele, e isso é irrelevante para o desempate — o vencedor é sempre o de **menor** `id`, então claims perdedores acumulados nunca mudam o resultado.

     > [!CAUTION]
     > Perdedor **não** roda `--remove-assignee @me` nem mexe em label. Todos os agentes são o mesmo usuário GitHub: remover o assignee ou devolver o label `ready` apagaria o lock do vencedor e liberaria a issue para um terceiro agente.

7. **Reportar**: número, título e `AGENT_ID` que ficou com a issue.

## Encerrar

Concluído (PR com `Closes #N`):

```bash
gh issue edit <N> --add-label done --remove-label in-progress
```

Abandonado sem concluir — só faça isso se **você** é o vencedor do claim:

```bash
gh issue comment <N> --body "[released] $AGENT_ID"
gh issue edit <N> --add-label ready --remove-label in-progress --remove-assignee @me
```

<!-- ponytail: desempate por ordem de comentário; se o número de agentes crescer e as 2 chamadas por claim incomodarem, trocar por lock externo (Redis ou branch em repo de coordenação) -->
