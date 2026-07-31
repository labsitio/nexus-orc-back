#!/usr/bin/env bash
# Gate de usage do bloco de 5h — impede que um agente dev INICIE nova task
# quando o bloco corrente de 5h já passou do limiar (default 80%).
#
# Intercepta só os três pontos onde uma task nasce:
#   - skill `claim-issue`
#   - `gh issue edit ... --add-label in-progress` (claim manual)
#   - spawn de subagente `dev-back-end`
# Trabalho já em andamento NUNCA é bloqueado: travar tool call no meio da
# implementação queima mais token do que economiza.
#
# Métrica: custo (USD) do bloco de 5h, via ccusage (lê ~/.claude/projects/**/*.jsonl).
# Custo e não token porque `totalTokens` é ~96% cache read, que quase não pesa em
# cota — custo pondera Opus vs Sonnet vs cache e correlaciona bem melhor.
#
# O teto real de 5h não é derivável: a Anthropic não publica em token/USD e os
# .jsonl não gravam evento de limite atingido. Calibre uma vez, por máquina:
#   rode `/usage` e `ccusage blocks --active` no mesmo instante e cruze —
#   /usage em 40% com ccusage em $8.44  =>  teto ≈ $21  =>  CLAUDE_5H_COST_LIMIT=21
# Cada dev tem conta própria, então o teto é por máquina — nada é somado entre devs.
#
# Env:
#   CLAUDE_5H_COST_LIMIT      teto USD do bloco de 5h (default: maior bloco histórico)
#   CLAUDE_5H_THRESHOLD_PCT   limiar de bloqueio (default 80)
#   CLAUDE_USAGE_GUARD_CACHE  caminho do cache (default $TMPDIR|$TMP|$TEMP|/tmp/claude-usage-guard-$UID.json)
set -uo pipefail

THRESHOLD_PCT=${CLAUDE_5H_THRESHOLD_PCT:-80}
CACHE=${CLAUDE_USAGE_GUARD_CACHE:-${TMPDIR:-${TMP:-${TEMP:-/tmp}}}/claude-usage-guard-$(id -u 2>/dev/null || echo user).json}

allow() { exit 0; }

# libera, mas grita — falha de ferramenta não pode virar gate silenciosamente inerte
warn_raw() { # $1 = mensagem sem aspas duplas
  printf '{"systemMessage":"%s"}\n' "$1"
  exit 0
}

command -v jq >/dev/null 2>&1 || warn_raw \
  'usage-guard: jq ausente nesta maquina - gate de 5h NAO aplicado. Instale jq (brew install jq / apt install jq).'

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

case "$(field '.tool_name')" in
  Bash)
    field '.tool_input.command' \
      | grep -Eq 'gh +issue +edit .*--add-label[ =]?in-progress' || allow
    ;;
  Skill)
    [ "$(field '.tool_input.skill')" = "claim-issue" ] || allow
    ;;
  Task | Agent)
    [ "$(field '.tool_input.subagent_type')" = "dev-back-end" ] || allow
    ;;
  *) allow ;;
esac

# ---- daqui pra baixo: é início de task, então mede ----

CCUSAGE=$(command -v ccusage || true)
[ -n "$CCUSAGE" ] || { [ -x "$HOME/.local/bin/ccusage" ] && CCUSAGE="$HOME/.local/bin/ccusage"; }

# cache de 60s: sem isso cada claim paga um spawn de node
if [ -z "$(find "$CACHE" -mmin -1 2>/dev/null)" ]; then
  if [ -n "$CCUSAGE" ]; then
    "$CCUSAGE" blocks --json >"$CACHE.tmp" 2>/dev/null
  else
    npx -y ccusage@latest blocks --json >"$CACHE.tmp" 2>/dev/null
  fi
  if [ -s "$CACHE.tmp" ]; then mv "$CACHE.tmp" "$CACHE"; else rm -f "$CACHE.tmp"; fi
fi

[ -s "$CACHE" ] || warn "usage-guard: ccusage nao retornou dado - gate de 5h NAO aplicado neste claim."

# PCT = -1 quando não há teto com que comparar. Valores em USD, já formatados.
read -r PCT USED LIMIT <<EOF
$(jq -r --arg limit "${CLAUDE_5H_COST_LIMIT:-}" '
    ([.blocks[] | select(.isGap == false and .isActive != true) | .costUSD] | max) as $peak
  | ([.blocks[] | select(.isActive == true)                    | .costUSD] | add) as $used
  | ((($used // 0) * 100) | floor) as $u
  | ((if ($limit | length) > 0 then ($limit | tonumber) else ($peak // 0) end) * 100 | floor) as $l
  | "\(if $l > 0 then (($u * 100 / $l) | floor) else -1 end) \($u / 100) \($l / 100)"
' <"$CACHE")
EOF

case "${PCT:-}" in ''|*[!0-9-]*) PCT=-1 ;; esac
[ "$PCT" -ge 0 ] || warn "usage-guard: sem bloco de 5h historico para calibrar o teto - gate NAO aplicado. Defina CLAUDE_5H_COST_LIMIT (rode /usage e ccusage blocks --active no mesmo instante e cruze)."

[ "$PCT" -lt "$THRESHOLD_PCT" ] && allow

deny "usage-guard: bloco de 5h em ${PCT}% do teto (\$${USED} de \$${LIMIT}, limiar ${THRESHOLD_PCT}%).
NAO inicie nova task: nao reserve issue, nao rode claim-issue, nao abra subagente dev-back-end.
Termine ou pare o que ja esta em andamento, avise o usuario do estado atual e encerre o turno.
Para liberar: espere o proximo bloco de 5h, ou ajuste CLAUDE_5H_THRESHOLD_PCT / CLAUDE_5H_COST_LIMIT."
