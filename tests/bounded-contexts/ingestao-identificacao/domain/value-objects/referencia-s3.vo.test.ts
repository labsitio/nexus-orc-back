import { describe, expect, it } from "vitest";
import {
  ReferenciaS3,
  ReferenciaS3InvalidaError,
} from "../../../../../src/bounded-contexts/ingestao-identificacao/domain/value-objects/referencia-s3.vo.js";

describe("ReferenciaS3", () => {
  it("cria com bucket/key/versionId válidos", () => {
    const ref = ReferenciaS3.de({
      bucket: "nexo-orcamentos-raw",
      key: "sftp-incoming/arquivo.pdf",
      versionId: "v1",
    });
    expect(ref.bucket).toBe("nexo-orcamentos-raw");
  });

  it.each(["bucket", "key", "versionId"] as const)(
    "rejeita %s vazio",
    (campo) => {
      const params = {
        bucket: "b",
        key: "k",
        versionId: "v",
        [campo]: "",
      };
      expect(() => ReferenciaS3.de(params)).toThrow(ReferenciaS3InvalidaError);
    },
  );

  it("equals compara os três campos", () => {
    const a = ReferenciaS3.de({ bucket: "b", key: "k", versionId: "v" });
    const b = ReferenciaS3.de({ bucket: "b", key: "k", versionId: "v" });
    expect(a.equals(b)).toBe(true);
  });
});
