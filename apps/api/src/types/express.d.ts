import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the `authenticate` middleware after JWT verification. */
    userId?: string;
  }
}
