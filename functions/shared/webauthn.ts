// 纯 Web Crypto API 实现的 WebAuthn 服务端验证
// 不依赖 @simplewebauthn/server，避免 reflect-metadata 在 EdgeOne 崩溃

// ============ Base64URL 编解码 ============

export function base64URLEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64URLDecode(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ============ 最小 CBOR 解码器 ============

function cborDecode(data: Uint8Array): any {
  let offset = 0;

  function read(): any {
    if (offset >= data.length) throw new Error('CBOR: unexpected end');
    const initial = data[offset++];
    const major = initial >> 5;
    const additional = initial & 0x1f;

    function readArgument(): number {
      if (additional < 24) return additional;
      if (additional === 24) return data[offset++];
      if (additional === 25) {
        const v = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        return v;
      }
      if (additional === 26) {
        const v = (data[offset] << 24) | (data[offset + 1] << 16) |
                  (data[offset + 2] << 8) | data[offset + 3];
        offset += 4;
        return v >>> 0;
      }
      throw new Error(`CBOR: unsupported additional info ${additional}`);
    }

    switch (major) {
      case 0: return readArgument(); // unsigned int
      case 1: return -1 - readArgument(); // negative int
      case 2: { // byte string
        const len = readArgument();
        const bytes = data.slice(offset, offset + len);
        offset += len;
        return bytes;
      }
      case 3: { // text string
        const len = readArgument();
        const bytes = data.slice(offset, offset + len);
        offset += len;
        return new TextDecoder().decode(bytes);
      }
      case 4: { // array
        const len = readArgument();
        const arr: any[] = [];
        for (let i = 0; i < len; i++) arr.push(read());
        return arr;
      }
      case 5: { // map
        const len = readArgument();
        const map = new Map<any, any>();
        for (let i = 0; i < len; i++) {
          const key = read();
          const val = read();
          map.set(key, val);
        }
        return map;
      }
      case 7: { // simple/float
        if (additional === 20) return false;
        if (additional === 21) return true;
        if (additional === 22) return null;
        throw new Error(`CBOR: unsupported simple value ${additional}`);
      }
      default:
        throw new Error(`CBOR: unsupported major type ${major}`);
    }
  }

  return read();
}

// ============ AuthenticatorData 解析 ============

interface ParsedAuthData {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  attestedCredentialData?: {
    aaguid: Uint8Array;
    credentialId: Uint8Array;
    credentialPublicKey: Map<any, any>;
  };
}

function parseAuthData(authData: Uint8Array): ParsedAuthData {
  let offset = 0;
  const rpIdHash = authData.slice(0, 32); offset += 32;
  const flags = authData[offset++];
  const signCount = (authData[offset] << 24) | (authData[offset + 1] << 16) |
                    (authData[offset + 2] << 8) | authData[offset + 3];
  offset += 4;

  const result: ParsedAuthData = { rpIdHash, flags, signCount };

  // flags bit 6 = attestedCredentialData present
  if (flags & 0x40) {
    const aaguid = authData.slice(offset, offset + 16); offset += 16;
    const credIdLen = (authData[offset] << 8) | authData[offset + 1]; offset += 2;
    const credentialId = authData.slice(offset, offset + credIdLen); offset += credIdLen;
    const credentialPublicKey = cborDecode(authData.slice(offset));
    result.attestedCredentialData = { aaguid, credentialId, credentialPublicKey };
  }

  return result;
}

// ============ DER 签名转 raw (r||s) ============

function derToRaw(der: Uint8Array): Uint8Array {
  // DER: 0x30 <len> 0x02 <rlen> <r> 0x02 <slen> <s>
  if (der[0] !== 0x30) throw new Error('Invalid DER signature');
  let offset = 2;
  if (der[1] & 0x80) offset += (der[1] & 0x7f); // long form length

  // Read r
  if (der[offset++] !== 0x02) throw new Error('Invalid DER: expected integer tag for r');
  const rLen = der[offset++];
  let r = der.slice(offset, offset + rLen);
  offset += rLen;
  // Remove leading zero padding
  if (r[0] === 0 && r.length > 32) r = r.slice(1);

  // Read s
  if (der[offset++] !== 0x02) throw new Error('Invalid DER: expected integer tag for s');
  const sLen = der[offset++];
  let s = der.slice(offset, offset + sLen);
  // Remove leading zero padding
  if (s[0] === 0 && s.length > 32) s = s.slice(1);

  // Pad to 32 bytes each
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}

// ============ 纯数学 ECDSA P-256 验证（EdgeOne 兼容） ============
// EdgeOne 边缘运行时不支持 crypto.subtle.importKey（见 jwt.ts:2）
// 使用 BigInt 实现椭圆曲线运算，仅依赖 crypto.subtle.digest('SHA-256')

const P256_P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFn;
const P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
const P256_GX = 0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296n;
const P256_GY = 0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5n;
const P256_A = P256_P - 3n; // a = -3 mod p

type ECPoint = { x: bigint; y: bigint } | null;

function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [((a % m) + m) % m, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % m) + m) % m;
}

function ecDouble(pt: ECPoint): ECPoint {
  if (!pt) return null;
  const { x, y } = pt;
  if (y === 0n) return null;
  const p = P256_P;
  const lam = ((3n * x * x + P256_A) * modInverse(2n * y, p)) % p;
  const x3 = ((lam * lam - 2n * x) % p + p) % p;
  const y3 = ((lam * (x - x3) - y) % p + p) % p;
  return { x: x3, y: y3 };
}

function ecAdd(p1: ECPoint, p2: ECPoint): ECPoint {
  if (!p1) return p2;
  if (!p2) return p1;
  if (p1.x === p2.x) {
    if (p1.y === p2.y) return ecDouble(p1);
    return null;
  }
  const p = P256_P;
  const lam = ((p2.y - p1.y + p) * modInverse((p2.x - p1.x + p) % p, p)) % p;
  const x3 = ((lam * lam - p1.x - p2.x) % p + p) % p;
  const y3 = ((lam * (p1.x - x3 + p) - p1.y + p) % p + p) % p;
  return { x: x3, y: y3 };
}

function ecMul(k: bigint, pt: ECPoint): ECPoint {
  let result: ECPoint = null;
  let current = pt;
  k = ((k % P256_N) + P256_N) % P256_N;
  while (k > 0n) {
    if (k & 1n) result = ecAdd(result, current);
    current = ecDouble(current);
    k >>= 1n;
  }
  return result;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex.length > 0 ? BigInt('0x' + hex) : 0n;
}

/** 纯数学 ECDSA P-256 签名验证（不依赖 crypto.subtle.importKey/verify） */
async function ecdsaVerifyP256(
  publicKey: Uint8Array,  // 65 bytes: 0x04 || x || y
  rawSig: Uint8Array,     // 64 bytes: r || s
  data: Uint8Array,       // 待验证数据（将被 SHA-256 哈希）
): Promise<boolean> {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) return false;
  if (rawSig.length !== 64) return false;

  const qx = bytesToBigInt(publicKey.slice(1, 33));
  const qy = bytesToBigInt(publicKey.slice(33, 65));
  const Q: ECPoint = { x: qx, y: qy };
  const r = bytesToBigInt(rawSig.slice(0, 32));
  const s = bytesToBigInt(rawSig.slice(32, 64));

  if (r <= 0n || r >= P256_N || s <= 0n || s >= P256_N) return false;

  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const z = bytesToBigInt(new Uint8Array(hashBuf));

  const w = modInverse(s, P256_N);
  const u1 = (z * w) % P256_N;
  const u2 = (r * w) % P256_N;

  const G: ECPoint = { x: P256_GX, y: P256_GY };
  const R = ecAdd(ecMul(u1, G), ecMul(u2, Q));
  if (!R) return false;

  return (R.x % P256_N) === r;
}

// ============ 公开 API ============

export interface RegistrationOptionsInput {
  rpName: string;
  rpID: string;
  userName: string;
  excludeCredentialIDs?: string[];
}

export interface RegistrationOptions {
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: 'public-key'; alg: number }[];
  timeout: number;
  attestation: string;
  authenticatorSelection: {
    residentKey: string;
    userVerification: string;
  };
  excludeCredentials: { id: string; type: 'public-key' }[];
}

export function generateRegistrationOptions(input: RegistrationOptionsInput): RegistrationOptions {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);

  return {
    rp: { name: input.rpName, id: input.rpID },
    user: { id: base64URLEncode(userId), name: input.userName, displayName: input.userName },
    challenge: base64URLEncode(challenge),
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },   // ES256 only — EdgeOne 仅支持 P-256
    ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    excludeCredentials: (input.excludeCredentialIDs || []).map(id => ({ id, type: 'public-key' })),
  };
}

export interface VerifyRegistrationInput {
  response: {
    id: string;
    rawId: string;
    response: { attestationObject: string; clientDataJSON: string };
    type: string;
  };
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
}

export interface VerifyRegistrationResult {
  verified: boolean;
  credential?: {
    id: string;
    publicKey: Uint8Array;
    counter: number;
    transports?: string[];
  };
}

export async function verifyRegistrationResponse(input: VerifyRegistrationInput): Promise<VerifyRegistrationResult> {
  // 1. 解析 clientDataJSON
  const clientDataBytes = base64URLDecode(input.response.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));

  if (clientData.type !== 'webauthn.create') return { verified: false };
  if (clientData.challenge !== input.expectedChallenge) return { verified: false };
  if (clientData.origin !== input.expectedOrigin) return { verified: false };

  // 2. 解析 attestationObject (CBOR)
  const attObjBytes = base64URLDecode(input.response.response.attestationObject);
  const attObj = cborDecode(attObjBytes);
  const authData = attObj.get('authData') as Uint8Array;

  // 3. 验证 rpIdHash
  const rpIdHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.expectedRPID));
  const parsed = parseAuthData(authData);
  const expectedHash = new Uint8Array(rpIdHash);
  for (let i = 0; i < 32; i++) {
    if (parsed.rpIdHash[i] !== expectedHash[i]) return { verified: false };
  }

  // 4. 检查 flags: UP (bit 0) 必须为 1
  if (!(parsed.flags & 0x01)) return { verified: false };

  // 5. 提取凭证数据
  if (!parsed.attestedCredentialData) return { verified: false };
  const { credentialId, credentialPublicKey } = parsed.attestedCredentialData;

  // 6. 提取公钥字节 (COSE key → raw)
  const kty = credentialPublicKey.get(1);
  const alg = credentialPublicKey.get(3);

  let publicKeyBytes: Uint8Array;
  if (kty === 2 && alg === -7) {
    // EC2 / ES256 / P-256
    const x = credentialPublicKey.get(-2) as Uint8Array;
    const y = credentialPublicKey.get(-3) as Uint8Array;
    // 未压缩格式: 0x04 || x || y
    publicKeyBytes = new Uint8Array(1 + x.length + y.length);
    publicKeyBytes[0] = 0x04;
    publicKeyBytes.set(x, 1);
    publicKeyBytes.set(y, 1 + x.length);
  } else {
    // 不支持的算法 — 直接拒绝注册，避免存储无效公钥
    console.error(`Passkey registration rejected: unsupported algorithm kty=${kty} alg=${alg}`);
    return { verified: false };
  }

  return {
    verified: true,
    credential: {
      id: base64URLEncode(credentialId),
      publicKey: publicKeyBytes,
      counter: parsed.signCount,
      transports: input.response.type === 'public-key' ? undefined : undefined,
    },
  };
}

export interface AuthenticationOptionsInput {
  rpID: string;
  allowCredentialIDs: string[];
}

export interface AuthenticationOptions {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials: { id: string; type: 'public-key' }[];
  userVerification: string;
}

export function generateAuthenticationOptions(input: AuthenticationOptionsInput): AuthenticationOptions {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  return {
    challenge: base64URLEncode(challenge),
    timeout: 60000,
    rpId: input.rpID,
    allowCredentials: input.allowCredentialIDs.map(id => ({ id, type: 'public-key' })),
    userVerification: 'preferred',
  };
}

export interface VerifyAuthenticationInput {
  response: {
    id: string;
    rawId: string;
    response: {
      authenticatorData: string;
      clientDataJSON: string;
      signature: string;
    };
    type: string;
  };
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: {
    publicKey: Uint8Array;
    counter: number;
  };
}

export interface VerifyAuthenticationResult {
  verified: boolean;
  newCounter: number;
}

export async function verifyAuthenticationResponse(input: VerifyAuthenticationInput): Promise<VerifyAuthenticationResult> {
  // 1. 解析 clientDataJSON
  const clientDataBytes = base64URLDecode(input.response.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));

  if (clientData.type !== 'webauthn.get') return { verified: false, newCounter: 0 };
  if (clientData.challenge !== input.expectedChallenge) return { verified: false, newCounter: 0 };
  if (clientData.origin !== input.expectedOrigin) return { verified: false, newCounter: 0 };

  // 2. 解析 authenticatorData
  const authDataBytes = base64URLDecode(input.response.response.authenticatorData);
  const parsed = parseAuthData(authDataBytes);

  // 3. 验证 rpIdHash
  const rpIdHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.expectedRPID));
  const expectedHash = new Uint8Array(rpIdHash);
  for (let i = 0; i < 32; i++) {
    if (parsed.rpIdHash[i] !== expectedHash[i]) return { verified: false, newCounter: 0 };
  }

  // 4. 检查 UP flag
  if (!(parsed.flags & 0x01)) return { verified: false, newCounter: 0 };

  // 5. 验证签名
  const signatureBytes = base64URLDecode(input.response.response.signature);
  const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataBytes as any);

  // signedData = authData || SHA-256(clientDataJSON)
  const signedData = new Uint8Array(authDataBytes.length + 32);
  signedData.set(authDataBytes, 0);
  signedData.set(new Uint8Array(clientDataHash), authDataBytes.length);

  try {
    // ES256 (P-256) 签名验证 — 兼容 EdgeOne 边缘运行时
    const publicKey = input.credential.publicKey;
    const rawSig = derToRaw(signatureBytes);

    // 策略 1：尝试 JWK 格式导入（比 raw 格式更兼容）
    try {
      const x = publicKey.slice(1, 33);
      const y = publicKey.slice(33, 65);
      const jwk = {
        kty: 'EC', crv: 'P-256',
        x: base64URLEncode(x), y: base64URLEncode(y),
      };
      const key = await crypto.subtle.importKey(
        'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
      );
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, key, rawSig as any, signedData as any,
      );
      return { verified: valid, newCounter: parsed.signCount };
    } catch (jwkErr) {
      console.warn('WebAuthn: JWK importKey failed, falling back to pure-math ECDSA:', jwkErr);
    }

    // 策略 2：纯数学 ECDSA P-256 验证（仅依赖 crypto.subtle.digest）
    const valid = await ecdsaVerifyP256(publicKey, rawSig, signedData);
    return { verified: valid, newCounter: parsed.signCount };
  } catch (err) {
    console.error('WebAuthn signature verification error:', err);
    return { verified: false, newCounter: 0 };
  }
}
