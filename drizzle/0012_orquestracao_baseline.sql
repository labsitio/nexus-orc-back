CREATE SCHEMA "orquestracao";
--> statement-breakpoint
CREATE TABLE "orquestracao"."decisoes_workflow" (
	"id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orquestracao"."decisoes_workflow_historico" (
	"id" uuid PRIMARY KEY NOT NULL
);
