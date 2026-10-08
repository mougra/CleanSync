import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { generateTokens, verifyAccessToken, verifyRefreshToken } from '../auth';

describe('JWT-хелперы', () => {
  it('access-токен проходит проверку и содержит userId', () => {
    const { accessToken } = generateTokens('42');

    const decoded = verifyAccessToken(accessToken);

    expect(decoded?.userId).toBe('42');
  });

  it('refresh-токен проверяется своим секретом и не проходит как access', () => {
    const { refreshToken } = generateTokens('42');

    expect(verifyRefreshToken(refreshToken)?.userId).toBe('42');
    // Секреты разные — refresh-токен не должен приниматься как access.
    expect(verifyAccessToken(refreshToken)).toBeNull();
  });

  it('подделанный токен отклоняется', () => {
    const { accessToken } = generateTokens('42');

    expect(verifyAccessToken(`${accessToken}x`)).toBeNull();
  });

  it('токен, подписанный чужим секретом, отклоняется', () => {
    const foreign = jwt.sign({ userId: '1' }, 'not-our-secret');

    expect(verifyAccessToken(foreign)).toBeNull();
    expect(verifyRefreshToken(foreign)).toBeNull();
  });

  it('мусор вместо токена не бросает исключение', () => {
    expect(verifyAccessToken('not-a-jwt')).toBeNull();
    expect(verifyRefreshToken('')).toBeNull();
  });
});
