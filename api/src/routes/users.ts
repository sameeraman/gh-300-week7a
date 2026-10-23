import { Router, type Request, type Response } from 'express';
import { type UserRepository } from '../repositories/UserRepository';

/**
 * Creates a router exposing GET /users.
 * @param repository - The repository used to retrieve users.
 * @returns A router returning user arrays and consistent JSON errors.
 * @throws If router initialization fails.
 */
export function createUsersRouter(repository: UserRepository): Router {
  const router = Router();

  router.get('/users', async (_request: Request, response: Response): Promise<void> => {
    try {
      const users = await repository.findAll();
      response.json(users);
    } catch (error: unknown) {
      console.error('Failed to list users.', error);
      response.status(500).json({
        error: { code: 'USER_LIST_FAILED', message: 'Unable to fetch users.' },
      });
    }
  });

  return router;
}
