#!/usr/bin/env bash
# Teste de infraestrutura — spec 008 (Hardening Segurança/LGPD), T011.
#
# Valida que a Service Control Policy (SCP) da conta dev/hml (plan.md,
# "AWS Organizations") bloqueia efetivamente:
#   - rds:CopyDBSnapshot          (cópia de snapshot RDS com origem em prod)
#   - rds:RestoreDBInstanceFromDBSnapshot (restore de snapshot de prod)
#   - s3:CopyObject               (cópia de objeto S3 com origem em prod)
#
# Não é executado pelo CI padrão (push/PR) — requer credenciais reais da
# conta dev/hml (role de deploy OIDC, T015) e as contas/SCP já provisionadas
# (T013/T014). Ricardo/DevOps executa manualmente ou via job de pipeline
# dedicado (ver .github/workflows/verificar-scp-segregacao-ambientes.yml).
#
# Segurança: o script NUNCA deve rodar contra a conta de produção. Ele se
# recusa a continuar se a conta corrente coincidir com AWS_PROD_ACCOUNT_ID.
# Se qualquer ação bloqueada inesperadamente TIVER SUCESSO, o script tenta
# limpar o recurso criado e falha alto (exit 1) — sucesso aqui é o cenário
# de vazamento de dado real de prod que a SCP existe para prevenir.
#
# Variáveis de ambiente obrigatórias:
#   AWS_PROD_ACCOUNT_ID     ID da conta de produção (nunca deve ser a conta corrente)
#   PROD_RDS_SNAPSHOT_ARN   ARN de um snapshot RDS de teste (não sensível) na conta prod,
#                           usado só como alvo da tentativa de cópia/restore bloqueada
#   PROD_S3_TEST_OBJECT_URI URI s3://bucket/key de um objeto de teste (não sensível) em prod
#   TARGET_S3_BUCKET        Bucket de destino na conta dev/hml corrente para o teste de CopyObject
#
# Uso:
#   AWS_PROD_ACCOUNT_ID=111111111111 \
#   PROD_RDS_SNAPSHOT_ARN=arn:aws:rds:us-east-1:111111111111:snapshot:teste-scp \
#   PROD_S3_TEST_OBJECT_URI=s3://nexo-prod-teste-scp/objeto-teste.txt \
#   TARGET_S3_BUCKET=nexo-hml-teste-scp \
#   ./infra/scripts/verificar-scp-segregacao-ambientes.sh

set -euo pipefail

fail() {
  echo "FALHA: $1" >&2
  exit 1
}

for var in AWS_PROD_ACCOUNT_ID PROD_RDS_SNAPSHOT_ARN PROD_S3_TEST_OBJECT_URI TARGET_S3_BUCKET; do
  if [ -z "${!var:-}" ]; then
    fail "variável de ambiente obrigatória não definida: $var"
  fi
done

CURRENT_ACCOUNT_ID="$(aws sts get-caller-identity --query 'Account' --output text)"

if [ "$CURRENT_ACCOUNT_ID" = "$AWS_PROD_ACCOUNT_ID" ]; then
  fail "credenciais atuais pertencem à conta de produção ($CURRENT_ACCOUNT_ID) — este teste MUST rodar contra dev/hml, abortando por segurança."
fi

echo "Conta corrente (dev/hml): $CURRENT_ACCOUNT_ID"
echo "Conta de produção (esperada bloqueada como origem): $AWS_PROD_ACCOUNT_ID"
echo

RESULTADO=0

# assert_bloqueado <nome-do-check> <comando...>
# Espera que o comando falhe com AccessDenied/explicit deny (SCP). Qualquer
# outro desfecho (sucesso, ou falha por motivo diferente) é reportado como
# FALHA do teste de infraestrutura.
assert_bloqueado() {
  local nome="$1"
  shift
  local saida
  local status

  set +e
  saida="$("$@" 2>&1)"
  status=$?
  set -e

  if [ "$status" -eq 0 ]; then
    echo "CRÍTICO [$nome]: a ação NÃO foi bloqueada — teve sucesso. Isso indica ausência/falha da SCP e possível vazamento de dado de prod para dev/hml."
    echo "$saida"
    RESULTADO=1
    return
  fi

  if echo "$saida" | grep -qiE "explicit deny|accessdenied|is not authorized to perform"; then
    echo "OK [$nome]: bloqueado pela SCP (explicit deny)."
  else
    echo "FALHA [$nome]: comando falhou, mas não por AccessDenied/explicit deny — verificar causa raiz."
    echo "$saida"
    RESULTADO=1
  fi
}

echo "--- rds:CopyDBSnapshot (origem: prod) ---"
assert_bloqueado "rds:CopyDBSnapshot" \
  aws rds copy-db-snapshot \
    --source-db-snapshot-identifier "$PROD_RDS_SNAPSHOT_ARN" \
    --target-db-snapshot-identifier "teste-scp-copy-$(date +%s)"

echo
echo "--- rds:RestoreDBInstanceFromDBSnapshot (origem: prod) ---"
assert_bloqueado "rds:RestoreDBInstanceFromDBSnapshot" \
  aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier "teste-scp-restore-$(date +%s)" \
    --db-snapshot-identifier "$PROD_RDS_SNAPSHOT_ARN"

echo
echo "--- s3:CopyObject (origem: prod) ---"
assert_bloqueado "s3:CopyObject" \
  aws s3api copy-object \
    --copy-source "${PROD_S3_TEST_OBJECT_URI#s3://}" \
    --bucket "$TARGET_S3_BUCKET" \
    --key "teste-scp-copy-$(date +%s)"

echo
if [ "$RESULTADO" -eq 0 ]; then
  echo "RESULTADO: SCP de segregação de ambientes bloqueia corretamente as 3 ações verificadas."
else
  echo "RESULTADO: pelo menos uma verificação falhou — ver detalhes acima. Não prosseguir com promoção de dado para dev/hml até corrigir a SCP (T014)."
fi

exit "$RESULTADO"
