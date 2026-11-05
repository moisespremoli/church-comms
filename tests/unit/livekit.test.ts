import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.LIVEKIT_URL = "wss://teste.livekit.cloud";
  process.env.LIVEKIT_API_KEY = "APIteste";
  process.env.LIVEKIT_API_SECRET = "segredo-de-teste-com-tamanho-suficiente-123";
});

function decode(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
}

describe("createListenerToken", () => {
  it("dá acesso só para ouvir a sala do canal", async () => {
    const { createListenerToken, radioRoomName, TOKEN_TTL_SECONDS } = await import("@/lib/livekit");
    const grant = await createListenerToken({ userId: "u1", name: "Maria", channelId: "c1" });
    const claims = decode(grant.token);

    expect(grant.url).toBe("wss://teste.livekit.cloud");
    expect(grant.room).toBe(radioRoomName("c1"));
    expect(claims.sub).toBe("u1");
    expect(claims.name).toBe("Maria");
    expect(claims.video.room).toBe("canal-c1");
    expect(claims.video.roomJoin).toBe(true);
    expect(claims.video.canSubscribe).toBe(true);
    // Ninguém publica à partida: o microfone só é autorizado com o turno de fala.
    expect(claims.video.canPublish).toBe(false);
    expect(claims.video.canPublishData).toBe(false);
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(TOKEN_TTL_SECONDS);
  });

  it("salas diferentes por canal", async () => {
    const { radioRoomName } = await import("@/lib/livekit");
    expect(radioRoomName("a")).not.toBe(radioRoomName("b"));
  });
});
