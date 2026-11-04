import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "@/lib/routes";
import { formatMessageTime, initials, slugify } from "@/lib/format";

describe("safeNextPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeNextPath("/canais/seguranca")).toBe("/canais/seguranca");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/ok\r\nSet-Cookie: x"])(
    "rejeita destino externo ou malicioso: %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/");
    },
  );
  it("usa o fallback quando vazio", () => {
    expect(safeNextPath(null, "/perfil")).toBe("/perfil");
  });
});

describe("isPublicPath", () => {
  it("login, recuperação e callbacks de auth são públicos", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/recuperar")).toBe(true);
    expect(isPublicPath("/auth/confirm")).toBe(true);
  });
  it("o resto exige sessão", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/canais/seguranca")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
    expect(isPublicPath("/nova-palavra-passe")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});

describe("format", () => {
  it("mostra só a hora para hoje", () => {
    const now = new Date("2026-11-04T18:00:00");
    expect(formatMessageTime(new Date("2026-11-04T09:05:00").toISOString(), now)).toMatch(/^09:05$/);
  });
  it("mostra o dia para datas anteriores", () => {
    const now = new Date("2026-11-04T18:00:00");
    expect(formatMessageTime(new Date("2026-11-01T09:05:00").toISOString(), now)).toContain("09:05");
    expect(formatMessageTime(new Date("2026-11-01T09:05:00").toISOString(), now)).not.toMatch(/^09:05$/);
  });
  it("iniciais", () => {
    expect(initials("Maria da Silva")).toBe("MS");
    expect(initials("joão")).toBe("J");
    expect(initials("  ")).toBe("?");
  });
  it("slugify remove acentos e símbolos", () => {
    expect(slugify("PALCO ↔ MESA")).toBe("palco-mesa");
    expect(slugify("Receção & Apoio")).toBe("rececao-apoio");
  });
});
