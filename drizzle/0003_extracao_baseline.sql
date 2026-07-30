CREATE SCHEMA "extracao";
--> statement-breakpoint
CREATE TABLE "extracao"."extracoes_orcamento" (
	"id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracao"."extracoes_orcamento_historico" (
	"id" uuid PRIMARY KEY NOT NULL
);
