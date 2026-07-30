ALTER TABLE "extracao"."extracoes_orcamento_historico" ALTER COLUMN "id" SET DATA TYPE bigserial;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD COLUMN "status" text NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD COLUMN "referencia_classificacao_fornecedor_identificado" text NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD COLUMN "referencia_classificacao_formato_identificado" text NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD COLUMN "referencia_classificacao_agente_origem" text NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD COLUMN "referencia_bruta_s3_bucket" text NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD COLUMN "referencia_bruta_s3_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD COLUMN "referencia_bruta_s3_version_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD COLUMN "itens" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD COLUMN "condicoes_comerciais" jsonb;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" ADD COLUMN "extracao_orcamento_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" ADD COLUMN "agente" text NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" ADD COLUMN "ocorreu_em" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" ADD COLUMN "resultado" text;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" ADD COLUMN "motivo_insucesso" text;--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" ADD CONSTRAINT "extracoes_orcamento_historico_extracao_orcamento_id_extracoes_orcamento_id_fk" FOREIGN KEY ("extracao_orcamento_id") REFERENCES "extracao"."extracoes_orcamento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extracoes_orcamento_historico_extracao_orcamento_id_idx" ON "extracao"."extracoes_orcamento_historico" USING btree ("extracao_orcamento_id");--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD CONSTRAINT "extracoes_orcamento_status_valido" CHECK (status in ('PENDENTE', 'EXTRAIDO', 'PENDENTE_REVISAO_HUMANA', 'EXTRAIDO_COM_PENDENCIA_CONFIRMADA'));--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento" ADD CONSTRAINT "extracoes_orcamento_ref_classificacao_agente_valido" CHECK (referencia_classificacao_agente_origem in ('CLASSIFICADOR', 'HUMANO'));--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" ADD CONSTRAINT "extracoes_orcamento_historico_agente_valido" CHECK (agente in ('EXTRATOR', 'HUMANO'));--> statement-breakpoint
ALTER TABLE "extracao"."extracoes_orcamento_historico" ADD CONSTRAINT "extracoes_orcamento_historico_sucesso_xor_insucesso" CHECK (
        ("extracao"."extracoes_orcamento_historico"."resultado" is not null and "extracao"."extracoes_orcamento_historico"."motivo_insucesso" is null) or
        ("extracao"."extracoes_orcamento_historico"."resultado" is null and "extracao"."extracoes_orcamento_historico"."motivo_insucesso" is not null)
      );