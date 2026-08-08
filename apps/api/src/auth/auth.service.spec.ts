import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  describe('me', () => {
    const config = { getOrThrow: jest.fn().mockReturnValue('7d') } as any;

    it('returns the profile of the requested user', async () => {
      const dbRow = {
        id: 'u1',
        email: 'a@student.ucr.edu',
        firstName: 'Ada',
        lastName: 'Lovelace',
        roles: ['STUDENT'],
        classStanding: 'JUNIOR',
        advisor: {
          id: 'adv-1',
          firstName: 'Grace',
          lastName: 'Hopper',
          email: 'grace@ucr.edu',
        },
      };
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(dbRow) },
      } as any;
      const svc = new AuthService({} as any, prisma, config);

      await expect(svc.me('u1')).resolves.toEqual({
        ...dbRow,
        classStanding: 'JUNIOR',
        advisor: dbRow.advisor,
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          roles: true,
          classStanding: true,
          advisor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
    });

    it('throws UnauthorizedException when the user no longer exists', async () => {
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;
      const svc = new AuthService({} as any, prisma, config);

      await expect(svc.me('gone')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
