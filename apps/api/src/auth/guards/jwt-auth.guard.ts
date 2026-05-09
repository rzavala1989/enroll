import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.access_token;
    if (!token) throw new UnauthorizedException();

    try {
      const payload = await this.jwt.verifyAsync(token);
      (request as Request & { user: unknown }).user = payload;
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}
