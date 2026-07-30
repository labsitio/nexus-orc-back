CREATE TYPE "public"."agente_origem" AS ENUM('CLASSIFICADOR', 'HUMANO');--> statement-breakpoint
CREATE TYPE "public"."canal" AS ENUM('PORTAL_WEB', 'API_REST', 'SFTP', 'APP_MOBILE');--> statement-breakpoint
CREATE TYPE "public"."status_orcamento" AS ENUM('RECEBIDO', 'CLASSIFICADO', 'PENDENTE_REVISAO_HUMANA');--> statement-breakpoint
CREATE TABLE "orcamentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"canal" "canal" NOT NULL,
	"recebido_em" timestamp with time zone NOT NULL,
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"version_id" text NOT NULL,
	"referencia_externa" text,
	"status" "status_orcamento" NOT NULL,
	"resultado_fornecedor_identificado" text,
	"resultado_formato_identificado" text,
	"resultado_nivel_confianca" integer,
	"resultado_agente_origem" "agente_origem",
	CONSTRAINT "orcamentos_nivel_confianca_em_faixa" CHECK (("orcamentos"."resultado_nivel_confianca" is null or ("orcamentos"."resultado_nivel_confianca" >= 0 and "orcamentos"."resultado_nivel_confianca" <= 100))),
	CONSTRAINT "orcamentos_resultado_completo_ou_ausente" CHECK (
        (
          "orcamentos"."resultado_fornecedor_identificado" is null
          and "orcamentos"."resultado_formato_identificado" is null
          and "orcamentos"."resultado_nivel_confianca" is null
          and "orcamentos"."resultado_agente_origem" is null
        ) or (
          "orcamentos"."resultado_fornecedor_identificado" is not null
          and "orcamentos"."resultado_formato_identificado" is not null
          and "orcamentos"."resultado_nivel_confianca" is not null
          and "orcamentos"."resultado_agente_origem" is not null
        )
      )
);
--> statement-breakpoint
CREATE TABLE "orcamentos_historico" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"agente" "agente_origem" NOT NULL,
	"ocorreu_em" timestamp with time zone NOT NULL,
	"resultado_fornecedor_identificado" text,
	"resultado_formato_identificado" text,
	"resultado_nivel_confianca" integer,
	"motivo_insucesso" text,
	CONSTRAINT "orcamentos_historico_nivel_confianca_em_faixa" CHECK (("orcamentos_historico"."resultado_nivel_confianca" is null or ("orcamentos_historico"."resultado_nivel_confianca" >= 0 and "orcamentos_historico"."resultado_nivel_confianca" <= 100))),
	CONSTRAINT "orcamentos_historico_sucesso_xor_insucesso" CHECK (
        (
          "orcamentos_historico"."resultado_fornecedor_identificado" is not null
          and "orcamentos_historico"."resultado_formato_identificado" is not null
          and "orcamentos_historico"."resultado_nivel_confianca" is not null
          and "orcamentos_historico"."motivo_insucesso" is null
        ) or (
          "orcamentos_historico"."resultado_fornecedor_identificado" is null
          and "orcamentos_historico"."resultado_formato_identificado" is null
          and "orcamentos_historico"."resultado_nivel_confianca" is null
          and "orcamentos_historico"."motivo_insucesso" is not null
        )
      )
);
--> statement-breakpoint
ALTER TABLE "orcamentos_historico" ADD CONSTRAINT "orcamentos_historico_orcamento_id_orcamentos_id_fk" FOREIGN KEY ("orcamento_id") REFERENCES "public"."orcamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orcamentos_historico_orcamento_id_idx" ON "orcamentos_historico" USING btree ("orcamento_id");