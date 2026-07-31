-- [004] T002: habilita extensão pgvector no Aurora Serverless v2 Postgres.
-- Primeira spec do projeto a exigir extensão Postgres além do padrão
-- (plan.md ADR-001, tasks.md T002). Pré-requisito para a coluna
-- `embedding vector(1024)` + índice HNSW de `indices_orcamento` (T003/T015).
-- Habilitação da extensão no cluster é responsabilidade de infraestrutura
-- (Ricardo/DevOps) antes desta migração rodar em cada ambiente.
CREATE EXTENSION IF NOT EXISTS vector;
