import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { body, matchedData, param, validationResult } from 'express-validator';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { CommentsError } from '../errors/CommentsError';
import type { CommentsRepository, CreateCommentInput, UpdateCommentInput } from '../types/comments';

interface CommentParams {
  taskId: number;
  id: number;
}

/**
 * Creates task-scoped comments CRUD routes with validation and safe errors.
 * @param repository - Persistence implementation for comments.
 * @returns A mountable router; application authentication must precede it.
 * @throws If router initialization fails.
 */
export function createCommentsRouter(repository: CommentsRepository): Router {
  const router = Router();
  const collection = '/tasks/:taskId/comments';
  const member = `${collection}/:id`;
  const identifiers = [
    param('taskId').isInt({ min: 1, max: Number.MAX_SAFE_INTEGER }).withMessage('Task ID must be a positive safe integer.').toInt(),
    param('id').optional().isInt({ min: 1, max: Number.MAX_SAFE_INTEGER }).withMessage('Comment ID must be a positive safe integer.').toInt(),
  ];
  const content = body('content').isString().withMessage('Content must be a string.').bail()
    .trim().isLength({ min: 1, max: 5000 }).withMessage('Content must contain 1 to 5000 characters.');

  router.use(helmet(), rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' } },
  }), express.json());

  /**
   * POST /tasks/:taskId/comments creates a comment.
   * @param request - Task ID and author/content JSON.
   * @param response - Receives the created comment with HTTP 201.
   * @returns Completion of the request.
   * @throws No errors escape the handler.
   */
  router.post(collection, ...identifiers,
    body('userId').isInt({ min: 1, max: Number.MAX_SAFE_INTEGER }).withMessage('User ID must be a positive safe integer.').toInt(),
    content, validate, async (request: Request, response: Response): Promise<void> => {
      try {
        const { taskId } = matchedData<CommentParams>(request, { locations: ['params'] });
        const input = matchedData<CreateCommentInput>(request, { locations: ['body'] });
        response.status(201).json(await repository.create(taskId, input));
      } catch (error: unknown) {
        respondError(error, response);
      }
    });

  /**
   * GET /tasks/:taskId/comments lists comments in ID order.
   * @param request - Parent task ID.
   * @param response - Receives an array with HTTP 200.
   * @returns Completion of the request.
   * @throws No errors escape the handler.
   */
  router.get(collection, ...identifiers, validate, async (request: Request, response: Response): Promise<void> => {
    try {
      const { taskId } = matchedData<CommentParams>(request, { locations: ['params'] });
      response.status(200).json(await repository.findAll(taskId));
    } catch (error: unknown) {
      respondError(error, response);
    }
  });

  /**
   * GET /tasks/:taskId/comments/:id retrieves a comment within its task.
   * @param request - Task and comment IDs.
   * @param response - Receives the comment or HTTP 404.
   * @returns Completion of the request.
   * @throws No errors escape the handler.
   */
  router.get(member, ...identifiers, validate, async (request: Request, response: Response): Promise<void> => {
    try {
      const { taskId, id } = matchedData<CommentParams>(request, { locations: ['params'] });
      const comment = await repository.findById(taskId, id);
      if (comment === null) {
        notFound(response);
        return;
      }
      response.status(200).json(comment);
    } catch (error: unknown) {
      respondError(error, response);
    }
  });

  /**
   * PUT /tasks/:taskId/comments/:id replaces comment content.
   * @param request - Task/comment IDs and replacement content.
   * @param response - Receives the updated comment or HTTP 404.
   * @returns Completion of the request.
   * @throws No errors escape the handler.
   */
  router.put(member, ...identifiers, content, validate, async (request: Request, response: Response): Promise<void> => {
    try {
      const { taskId, id } = matchedData<CommentParams>(request, { locations: ['params'] });
      const input = matchedData<UpdateCommentInput>(request, { locations: ['body'] });
      const comment = await repository.update(taskId, id, input);
      if (comment === null) {
        notFound(response);
        return;
      }
      response.status(200).json(comment);
    } catch (error: unknown) {
      respondError(error, response);
    }
  });

  /**
   * DELETE /tasks/:taskId/comments/:id removes a comment.
   * @param request - Task and comment IDs.
   * @param response - Receives HTTP 204 or HTTP 404.
   * @returns Completion of the request.
   * @throws No errors escape the handler.
   */
  router.delete(member, ...identifiers, validate, async (request: Request, response: Response): Promise<void> => {
    try {
      const { taskId, id } = matchedData<CommentParams>(request, { locations: ['params'] });
      if (!await repository.delete(taskId, id)) {
        notFound(response);
        return;
      }
      response.status(204).send();
    } catch (error: unknown) {
      respondError(error, response);
    }
  });

  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction): void => {
    if (error instanceof Error && 'type' in error) {
      if (error.type === 'entity.parse.failed') {
        response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
        return;
      }
      if (error.type === 'entity.too.large') {
        response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 100 KB limit.' } });
        return;
      }
      if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
        response.status(415).json({ error: { code: 'UNSUPPORTED_ENCODING', message: 'Request encoding is not supported.' } });
        return;
      }
    }
    console.error('Failed to read comment request.', error);
    response.status(400).json({ error: { code: 'INVALID_BODY', message: 'Unable to read request body.' } });
  });

  return router;
}

const validate: RequestHandler = (request: Request, response: Response, next: NextFunction): void => {
  const errors = validationResult(request);
  if (!errors.isEmpty()) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid comment request.',
        details: Object.entries(errors.mapped()).map(([field, error]): { field: string; message: string } => ({
          field, message: String(error.msg),
        })),
      },
    });
    return;
  }
  next();
};

function notFound(response: Response): void {
  response.status(404).json({ error: { code: 'COMMENT_NOT_FOUND', message: 'Comment not found.' } });
}

function respondError(error: unknown, response: Response): void {
  if (error instanceof CommentsError && error.code !== 'COMMENTS_FAILED') {
    response.status(404).json({ error: { code: error.code, message: error.message } });
    return;
  }
  console.error('Failed to process comment request.', error);
  response.status(500).json({ error: { code: 'COMMENTS_FAILED', message: 'Unable to process comments.' } });
}