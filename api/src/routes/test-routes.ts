import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { body, matchedData, validationResult } from 'express-validator';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { type CreatePostInput, type PostRepository } from '../repositories/PostRepository';

/**
 * Creates a router exposing POST /posts with JSON parsing and validation.
 * @param repository - The repository used to persist posts.
 * @returns A router returning created posts or consistent JSON errors.
 * @throws If router initialization fails.
 */
export function createPostsRouter(repository: PostRepository): Router {
  const router = Router();

  router.post(
    '/posts',
    helmet(),
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' } },
    }),
    express.json(),
    body('title').isString().withMessage('Title must be a string.').bail()
      .trim().notEmpty().withMessage('Title must not be blank.'),
    body('content').isString().withMessage('Content must be a string.').bail()
      .trim().notEmpty().withMessage('Content must not be blank.'),
    async (request: Request, response: Response): Promise<void> => {
      try {
        const errors = validationResult(request);
        if (!errors.isEmpty()) {
          response.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Title and content must be nonblank strings.',
              details: Object.entries(errors.mapped()).map(([field, error]): { field: string; message: string } => ({
                field,
                message: String(error.msg),
              })),
            },
          });
          return;
        }

        const input = matchedData<CreatePostInput>(request, { locations: ['body'] });
        const post = await repository.create(input);
        response.status(201).json(post);
      } catch (error: unknown) {
        console.error('Failed to create blog post.', error);
        response.status(500).json({
          error: { code: 'POST_CREATION_FAILED', message: 'Unable to create blog post.' },
        });
      }
    },
  );

  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction): void => {
    if (error instanceof Error && 'type' in error) {
      if (error.type === 'entity.parse.failed') {
        response.status(400).json({
          error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
        });
        return;
      }
      if (error.type === 'entity.too.large') {
        response.status(413).json({
          error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 100 KB limit.' },
        });
        return;
      }
      if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
        response.status(415).json({
          error: { code: 'UNSUPPORTED_ENCODING', message: 'Request encoding is not supported.' },
        });
        return;
      }
    }
    console.error('Failed to read blog post request.', error);
    response.status(400).json({
      error: { code: 'INVALID_BODY', message: 'Unable to read request body.' },
    });
  });

  return router;
}