import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Validates and (re)assigns `req.body` using a Zod schema.
 * Validation errors are formatted into a readable single message.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      res.status(400).json({ message });
      return;
    }
    req.body = result.data;
    next();
  };
}
