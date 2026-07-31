CREATE SCHEMA "busca_indexacao";
--> statement-breakpoint
CREATE TABLE "busca_indexacao"."indices_orcamento" (
	"id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(1024)
);
--> statement-breakpoint
CREATE TABLE "busca_indexacao"."indices_orcamento_historico" (
	"id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE INDEX "indices_orcamento_embedding_hnsw_idx" ON "busca_indexacao"."indices_orcamento" USING hnsw ("embedding" vector_cosine_ops);