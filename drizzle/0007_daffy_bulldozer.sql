CREATE TABLE "idempotency_keys" (
	"chave" text PRIMARY KEY NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
