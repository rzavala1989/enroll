export interface JwtPayload {
  sub: string;
  roles: string[];
  jti: string;
}