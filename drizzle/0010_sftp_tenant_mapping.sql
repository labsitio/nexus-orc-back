CREATE TABLE "sftp_tenant_mapping" (
	"servidor_id" text NOT NULL,
	"usuario" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "sftp_tenant_mapping_servidor_id_usuario_pk" PRIMARY KEY("servidor_id","usuario")
);
