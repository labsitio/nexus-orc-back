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
# Se qualquer ação bloqueada inesperadamente TIVER SUCESSO, o script executa
# o comando de limpeza do recurso criado (best-effort) e falha alto (exit 1)
# — sucesso aqui é o cenário de vazamento de dado real de prod que a SCP
# existe para prevenir.
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

# Sufixo único por execução — evita colisão de nome entre checks/reexecuções
# próximas (nanossegundos, não apenas segundo corrente).
SUFIXO="$(date +%s%N)"

# Regex restrita à mensagem de explicit deny por SCP (Organizations), para
# não confundir com AccessDenied por outra política IAM baseada em
# identidade — que provaria menos (SCP poderia estar ausente e a ação ainda
# assim ser negada por outro motivo).
SCP_DENY_REGEX="with an explicit deny in a service control policy"

# assert_bloqueado <nome-do-check> <comando-de-limpeza-ou-''> -- <comando...>
# Espera que o comando falhe por explicit deny de SCP. Qualquer outro
# desfecho (sucesso, ou falha por motivo diferente) é reportado como FALHA
# do teste de infraestrutura. Em caso de sucesso inesperado, executa o
# comando de limpeza (best-effort) para não deixar o recurso órfão na
# conta dev/hml.
assert_bloqueado() {
  local nome="$1"
  local limpeza="$2"
  shift 3 # descarta nome, limpeza e o separador '--'
  local saida
  local status

  set +e
  saida="$("$@" 2>&1)"
  status=$?
  set -e

  if [ "$status" -eq 0 ]; then
    echo "CRÍTICO [$nome]: a ação NÃO foi bloqueada — teve sucesso. Isso indica ausência/falha da SCP e possível vazamento de dado de prod para dev/hml."
    echo "$saida"
    if [ -n "$limpeza" ]; then
      echo "Executando limpeza best-effort do recurso criado: $limpeza"
      eval "$limpeza" 2>&1 || echo "AVISO: limpeza automática falhou — remover manualmente o recurso criado por [$nome]."
    fi
    RESULTADO=1
    return
  fi

  if echo "$saida" | grep -qiE "$SCP_DENY_REGEX"; then
    echo "OK [$nome]: bloqueado pela SCP (explicit deny)."
  else
    echo "FALHA [$nome]: comando falhou, mas não por explicit deny de SCP — verificar causa raiz (pode ser AccessDenied por outra política IAM, não pela SCP)."
    echo "$saida"
    RESULTADO=1
  fi
}

RDS_SNAPSHOT_COPY_ID="teste-scp-copy-$SUFIXO"
echo "--- rds:CopyDBSnapshot (origem: prod) ---"
assert_bloqueado "rds:CopyDBSnapshot" \
  "aws rds delete-db-snapshot --db-snapshot-identifier '$RDS_SNAPSHOT_COPY_ID'" \
  -- \
  aws rds copy-db-snapshot \
    --source-db-snapshot-identifier "$PROD_RDS_SNAPSHOT_ARN" \
    --target-db-snapshot-identifier "$RDS_SNAPSHOT_COPY_ID"

echo
RDS_RESTORE_ID="teste-scp-restore-$SUFIXO"
echo "--- rds:RestoreDBInstanceFromDBSnapshot (origem: prod) ---"
assert_bloqueado "rds:RestoreDBInstanceFromDBSnapshot" \
  "aws rds delete-db-instance --db-instance-identifier '$RDS_RESTORE_ID' --skip-final-snapshot" \
  -- \
  aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier "$RDS_RESTORE_ID" \
    --db-snapshot-identifier "$PROD_RDS_SNAPSHOT_ARN"

echo
S3_COPY_KEY="teste-scp-copy-$SUFIXO"
echo "--- s3:CopyObject (origem: prod) ---"
assert_bloqueado "s3:CopyObject" \
  "aws s3api delete-object --bucket '$TARGET_S3_BUCKET' --key '$S3_COPY_KEY'" \
  -- \
  aws s3api copy-object \
    --copy-source "${PROD_S3_TEST_OBJECT_URI#s3://}" \
    --bucket "$TARGET_S3_BUCKET" \
    --key "$S3_COPY_KEY"

echo
if [ "$RESULTADO" -eq 0 ]; then
  echo "RESULTADO: SCP de segregação de ambientes bloqueia corretamente as 3 ações verificadas."
else
  echo "RESULTADO: pelo menos uma verificação falhou — ver detalhes acima. Não prosseguir com promoção de dado para dev/hml até corrigir a SCP (T014)."
fi

exit "$RESULTADO"
