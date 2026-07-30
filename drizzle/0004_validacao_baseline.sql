CREATE SCHEMA "validacao";
--> statement-breakpoint
CREATE TABLE "validacao"."validacoes_orcamento" (
	"id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validacao"."validacoes_orcamento_historico" (
	"id" uuid PRIMARY KEY NOT NULL
);
