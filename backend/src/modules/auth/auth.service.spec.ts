import { describe, expect, it } from '@jest/globals';
import { AuthService } from './auth.service';

function service() {
  return new AuthService({
    get: (key: string) => {
      const values: Record<string, string> = {
        'app.admin.email': 'admin@portapay.local',
        'app.admin.password': 'secret',
        'app.admin.jwtSecret': 'jwt-secret',
      };
      return values[key];
    },
  } as never);
}

describe('AuthService', () => {
  it('issues and verifies admin tokens', () => {
    const auth = service();
    const result = auth.login('admin@portapay.local', 'secret');
    expect(result?.accessToken).toBeTruthy();
    expect(auth.verify(result!.accessToken)).toMatchObject({ sub: 'admin@portapay.local', role: 'SUPER_ADMIN' });
  });

  it('rejects invalid credentials and invalid tokens', () => {
    const auth = service();
    expect(auth.login('admin@portapay.local', 'bad')).toBeNull();
    expect(auth.verify('bad.token.value')).toBeNull();
  });
});