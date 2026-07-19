import { generateKeyPairSync } from "crypto";
import * as jwt from "jsonwebtoken";

import { JwksKeyProvider } from "./jwks.provider";
import { TokenService } from "./token.service";

const ISSUER = "https://auth.corecodeinnovation.com";

describe("TokenService", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_JWKS_URL;
    delete process.env.AUTH_ISSUER;
  });

  afterAll(() => {
    process.env = env;
  });

  describe("modo dev (HS256 con AUTH_JWT_SECRET)", () => {
    const secret = "test-secret";

    function service(): TokenService {
      process.env.AUTH_JWT_SECRET = secret;
      return new TokenService(new JwksKeyProvider());
    }

    function sign(payload: object): string {
      return jwt.sign(payload, secret, { algorithm: "HS256" });
    }

    it("sin token ⇒ viewer anónimo", async () => {
      const user = await service().authenticate(null);
      expect(user).toEqual({ sub: null, email: null, role: "viewer" });
    });

    it("mapea ADMIN ⇒ admin (gana el rol más alto)", async () => {
      const user = await service().authenticate(
        sign({ sub: "u1", email: "a@cci.dev", roles: ["USER", "ADMIN"] }),
      );
      expect(user).toEqual({ sub: "u1", email: "a@cci.dev", role: "admin" });
    });

    it("mapea OPERATOR ⇒ operator", async () => {
      const user = await service().authenticate(sign({ sub: "u2", roles: ["OPERATOR"] }));
      expect(user.role).toBe("operator");
    });

    it("mapea USER (o claims vacíos) ⇒ viewer con identidad", async () => {
      const user = await service().authenticate(sign({ sub: "u3", roles: ["USER"] }));
      expect(user).toMatchObject({ sub: "u3", role: "viewer" });
    });

    it("token con firma inválida ⇒ viewer anónimo", async () => {
      const tampered = sign({ sub: "u4", roles: ["ADMIN"] }).slice(0, -2) + "xx";
      const user = await service().authenticate(tampered);
      expect(user).toEqual({ sub: null, email: null, role: "viewer" });
    });

    it("token sin sub ⇒ viewer anónimo", async () => {
      const user = await service().authenticate(sign({ roles: ["ADMIN"] }));
      expect(user.sub).toBeNull();
      expect(user.role).toBe("viewer");
    });
  });

  describe("modo producción (RS256 vía JWKS)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    function service(): TokenService {
      const jwks = { getPublicKey: jest.fn().mockResolvedValue(publicPem) };
      return new TokenService(jwks as unknown as JwksKeyProvider);
    }

    function sign(payload: object, issuer: string = ISSUER): string {
      return jwt.sign(payload, privateKey, { algorithm: "RS256", issuer, keyid: "k1" });
    }

    it("firma RS256 válida con iss correcto ⇒ mapea el rol", async () => {
      const user = await service().authenticate(sign({ sub: "u5", roles: ["OPERATOR"] }));
      expect(user).toMatchObject({ sub: "u5", role: "operator" });
    });

    it("iss desconocido ⇒ viewer anónimo", async () => {
      const user = await service().authenticate(
        sign({ sub: "u6", roles: ["ADMIN"] }, "https://evil.example.com"),
      );
      expect(user).toEqual({ sub: null, email: null, role: "viewer" });
    });

    it("token expirado ⇒ viewer anónimo", async () => {
      const expired = jwt.sign({ sub: "u7", roles: ["ADMIN"], exp: 1 }, privateKey, {
        algorithm: "RS256",
        issuer: ISSUER,
      });
      const user = await service().authenticate(expired);
      expect(user.sub).toBeNull();
    });

    it("HS256 firmado con la clave pública como secreto ⇒ rechazado (allowlist)", async () => {
      const forged = jwt.sign({ sub: "u8", roles: ["ADMIN"], iss: ISSUER }, publicPem, {
        algorithm: "HS256",
      });
      const user = await service().authenticate(forged);
      expect(user.sub).toBeNull();
    });
  });
});
