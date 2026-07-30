#!/usr/bin/env bash
# Limite de tasks simultâneas — impede que um agente reserve a 5ª issue enquanto
# já tem 4 abertas com label `in-progress`.
#
# Escopo: por conta GitHub (`--assignee @me`). Todos os agentes de uma máquina
# rodam sob a mesma conta, então o teto vale para o conjunto de agentes daquele
# dev, não para o repositório inteiro — um dev no teto não trava os outros.
# Para teto global do repositório, remova o `--assignee @me` da chamada abaixo.
#
# Intercepta os mesmos três pontos onde uma task nasce:
#   - skill `claim-issue`
#   - `gh issue edit ... --add-label in-progress` (claim manual)
#   - spawn de subagente `dev-back-end`
#
# A issue alvo do próprio comando é descontada da conta: reaplicar
# `--add-label in-progress` numa issue que já é sua não conta como task nova.
#
# Env:
#   CLAUDE_MAX_INPROGRESS   teto de issues in-progress simultâneas (default 4)
set -uo pipefail

MAX=${CLAUDE_MAX_INPROGRESS:-4}

allow() { exit 0; }

warn_raw() { printf '{"systemMessage":"%s"}\n' "$1"; exit 0; }

command -v jq >/dev/null 2>&1 || warn_raw \
  'task-limit: jq ausente nesta maquina - limite de tasks NAO aplicado. Instale jq (brew install jq / apt install jq).'
command -v gh >/dev/null 2>&1 || warn_raw \
  'task-limit: gh ausente nesta maquina - limite de tasks NAO aplicado.'

warn() { jq -n --arg m "$1" '{systemMessage: $m}'; exit 0; }

deny() {
  jq -n --arg m "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $m
    }
  }'
  exit 0
}

INPUT=$(cat)
field() { printf '%s' "$INPUT" | jq -r "$1 // \"\""; }

TARGET=0
case "$(field '.tool_name')" in
  Bash)
    CMD=$(field '.tool_input.command')
    printf '%s' "$CMD" | grep -Eq 'gh +issue +edit .*--add-label[ =]?in-progress' || allow
    N=$(printf '%s' "$CMD" | grep -oE 'gh +issue +edit +[0-9]+' | grep -oE '[0-9]+$' | head -1)
    [ -n "${N:-}" ] && TARGET=$N
    ;;
  Skill)
    [ "$(field '.tool_input.skill')" = "claim-issue" ] || allow
    ;;
  Task | Agent)
    [ "$(field '.tool_input.subagent_type')" = "dev-back-end" ] || allow
    ;;
  *) allow ;;
esac

# ---- daqui pra baixo: é início de task, então conta ----

LIST=$(gh issue list --state open --label in-progress --assignee @me --limit 100 \
         --json number,title 2>/dev/null)
[ -n "${LIST:-}" ] || warn "task-limit: gh nao retornou dado (auth? rede?) - limite de tasks NAO aplicado neste claim."

read -r COUNT ABERTAS <<EOF
$(printf '%s' "$LIST" | jq -r --argjson t "$TARGET" '
  [.[] | select(.number != $t)] as $mine
  | "\($mine | length) \($mine | map("#\(.number)") | join(","))"
')
EOF

case "${COUNT:-}" in ''|*[!0-9]*) warn "task-limit: contagem invalida - limite NAO aplicado." ;; esac
[ "$COUNT" -lt "$MAX" ] && allow

deny "task-limit: voce ja tem ${COUNT} issues in-progress (teto ${MAX}): ${ABERTAS:-}.
NAO reserve outra task. Termine uma das abertas (PR mergeado + label done) ou libere uma
que esteja bloqueada: comentario [released] + 'gh issue edit N --add-label ready --remove-label in-progress --remove-assignee @me'.
Depois disso a proxima reserva passa. Para mudar o teto: CLAUDE_MAX_INPROGRESS."
