import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface AdminTokenPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  login(email?: string, password?: string) {
    const expectedEmail = this.config.get<string>('app.admin.email');
    const expectedPassword = this.config.get<string>('app.admin.password');
    if (!expectedEmail || !expectedPassword || email !== expectedEmail || password !== expectedPassword) {
      return null;
    }
    const payload: AdminTokenPayload = {
      sub: email,
      role: 'SUPER_ADMIN',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
    };
    return { accessToken: this.sign(payload), tokenType: 'Bearer', expiresIn: 8 * 60 * 60 };
  }

  verify(token: string): AdminTokenPayload | null {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return null;
    const expected = this.signature(`${header}.${payload}`);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AdminTokenPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  }

  private sign(payload: AdminTokenPayload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.${this.signature(`${header}.${body}`)}`;
  }

  private signature(input: string) {
    return createHmac('sha256', this.jwtSecret()).update(input).digest('base64url');
  }

  private jwtSecret() {
    const secret = this.config.get<string>('app.admin.jwtSecret');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is required for admin authentication');
    }
    return secret;
  }
}
