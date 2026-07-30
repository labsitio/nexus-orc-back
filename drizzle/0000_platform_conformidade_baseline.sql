CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TABLE "platform"."confirmacoes_anonimizacao" (
	"id" uuid PRIMARY KEY NOT NULL,
	"solicitacao_id" uuid NOT NULL,
	"bounded_context" text NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"campos_anonimizados" jsonb NOT NULL,
	"confirmado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."contextos_com_dado_pessoal" (
	"bounded_context" text PRIMARY KEY NOT NULL,
	"possui_dado_pessoal" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."politicas_retencao" (
	"categoria" text PRIMARY KEY NOT NULL,
	"prazo_em_dias" integer NOT NULL,
	"base_legal" text NOT NULL,
	"atualizada_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."solicitacoes_esquecimento" (
	"id" uuid PRIMARY KEY NOT NULL,
	"titular_referencia" text NOT NULL,
	"registrada_em" timestamp with time zone NOT NULL,
	"prazo_limite" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"contextos_esperados" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."trilha_auditoria_acesso" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"ator" text NOT NULL,
	"acao" text NOT NULL,
	"ocorreu_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform"."confirmacoes_anonimizacao" ADD CONSTRAINT "confirmacoes_anonimizacao_solicitacao_id_solicitacoes_esquecimento_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "platform"."solicitacoes_esquecimento"("id") ON DELETE no action ON UPDATE no action;