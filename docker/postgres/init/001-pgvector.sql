-- Habilita a extensão pgvector (BC Busca & Indexação, spec 004).
-- A imagem pgvector/pgvector já traz o binário; falta só o CREATE EXTENSION
-- por database criado.
CREATE EXTENSION IF NOT EXISTS vector;
