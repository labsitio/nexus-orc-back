#!/usr/bin/env bash
# Teste de contrato — spec 008 (Hardening Segurança/LGPD), T012.
#
# Valida que a role de deploy de CI/CD (OIDC, T015) do ambiente corrente
# NÃO consegue assumir a role de deploy de nenhum outro ambiente — ou seja,
# `sts:AssumeRole` é restrito por conta (uma role por conta/ambiente, nunca
# uma role única multi-conta, conforme US1 de tasks.md/T015).
#
# Não é executado pelo CI padrão (push/PR) — requer credenciais reais da
# role de deploy do ambiente corrente (T015) e as roles de deploy dos
# demais ambientes já provisionadas (T013/T014/T015). Ricardo/DevOps
# executa manualmente ou via job de pipeline dedicado (ver
# .github/workflows/verificar-contrato-assume-role-por-conta.yml).
#
# Segurança: o script NUNCA deve rodar com credenciais da conta de
# produção. Ele se recusa a continuar se a conta corrente coincidir com
# AWS_PROD_ACCOUNT_ID. Se qualquer AssumeRole cross-conta TIVER SUCESSO,
# o script falha alto (exit 1) — sucesso aqui é o cenário de uma role de
# deploy comprometida em um ambiente conseguir agir sobre outro ambiente,
# exatamente o que a restrição por conta existe para prevenir.
#
# Variáveis de ambiente obrigatórias:
#   AWS_PROD_ACCOUNT_ID     ID da conta de produção (nunca deve ser a conta corrente)
#   OUTRAS_DEPLOY_ROLE_ARNS Lista separada por espaço com o ARN da role de deploy
#                           de cada OUTRO ambiente (dev/hml/prod, exceto o corrente),
#                           usada só como alvo da tentativa de AssumeRole bloqueada
#
# Uso:
#   AWS_PROD_ACCOUNT_ID=111111111111 \
#   OUTRAS_DEPLOY_ROLE_ARNS="arn:aws:iam::222222222222:role/nexo-deploy-hml arn:aws:iam::111111111111:role/nexo-deploy-prod" \
#   ./infra/scripts/verificar-contrato-assume-role-por-conta.sh

set -euo pipefail

fail() {
  echo "FALHA: $1" >&2
  exit 1
}

for var in AWS_PROD_ACCOUNT_ID OUTRAS_DEPLOY_ROLE_ARNS; do
  if [ -z "${!var:-}" ]; then
    fail "variável de ambiente obrigatória não definida: $var"
  fi
done

CURRENT_ACCOUNT_ID="$(aws sts get-caller-identity --query 'Account' --output text)"

if [ "$CURRENT_ACCOUNT_ID" = "$AWS_PROD_ACCOUNT_ID" ]; then
  fail "credenciais atuais pertencem à conta de produção ($CURRENT_ACCOUNT_ID) — este teste MUST rodar contra dev/hml, abortando por segurança."
fi

echo "Conta corrente (role de deploy sob teste): $CURRENT_ACCOUNT_ID"
echo "Conta de produção (nunca deve ser assumível a partir daqui): $AWS_PROD_ACCOUNT_ID"
echo

RESULTADO=0

# Regex restrita a AccessDenied de sts:AssumeRole — não confundir com outro
# tipo de falha (ex.: ARN malformado), que provaria menos sobre a restrição
# de trust policy por conta.
ASSUME_ROLE_DENY_REGEX="is not authorized to perform: sts:AssumeRole|AccessDenied"

# assert_assume_role_bloqueado <role-arn-alvo>
# Espera que sts:assume-role para uma role de deploy de OUTRO ambiente falhe
# por AccessDenied (trust policy da role alvo não confia na conta/role
# corrente). Sucesso na chamada é reportado como CRÍTICO: indica que a role
# de deploy corrente pode agir sobre outro ambiente/conta.
assert_assume_role_bloqueado() {
  local role_arn="$1"
  local nome="AssumeRole -> $role_arn"
  local session_name="teste-contrato-assume-role-$(date +%s%N)"
  local saida
  local status

  set +e
  saida="$(aws sts assume-role --role-arn "$role_arn" --role-session-name "$session_name" 2>&1)"
  status=$?
  set -e

  if [ "$status" -eq 0 ]; then
    echo "CRÍTICO [$nome]: o AssumeRole NÃO foi bloqueado — teve sucesso. A role de deploy corrente consegue assumir role de outro ambiente/conta, violando a segregação exigida (T015)."
    echo "$saida"
    RESULTADO=1
    return
  fi

  if echo "$saida" | grep -qiE "$ASSUME_ROLE_DENY_REGEX"; then
    echo "OK [$nome]: bloqueado (AccessDenied) — trust policy restringe a conta de origem."
  else
    echo "FALHA [$nome]: comando falhou, mas não por AccessDenied de sts:AssumeRole — verificar causa raiz (ex.: role_arn inválido)."
    echo "$saida"
    RESULTADO=1
  fi
}

for ROLE_ARN in $OUTRAS_DEPLOY_ROLE_ARNS; do
  echo "--- sts:AssumeRole (alvo: $ROLE_ARN) ---"
  assert_assume_role_bloqueado "$ROLE_ARN"
  echo
done

if [ "$RESULTADO" -eq 0 ]; then
  echo "RESULTADO: role de deploy da conta corrente não assume role de nenhum outro ambiente verificado — restrição por conta confirmada."
else
  echo "RESULTADO: pelo menos uma verificação falhou — ver detalhes acima. Não prosseguir até corrigir a trust policy da(s) role(s) de deploy (T015)."
fi

exit "$RESULTADO"
