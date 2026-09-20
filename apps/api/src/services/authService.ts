import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AuthResponse, LoginInput, RegisterInput, UserDTO } from '@pulse/shared';
import { User, type IUser } from '../models/User.js';
import { env } from '../config/env.js';
import { ConflictError, UnauthorizedError } from '../utils/errors.js';

const SALT_ROUNDS = 12;

function toUserDTO(user: IUser): UserDTO {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

function signToken(user: IUser): string {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  const email = input.email.toLowerCase();

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await User.create({ name: input.name, email, passwordHash });

  return { token: signToken(user), user: toUserDTO(user) };
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const user = await User.findOne({ email: input.email.toLowerCase() });
  if (!user) {
    // Same error message to avoid user enumeration
    throw new UnauthorizedError('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return { token: signToken(user), user: toUserDTO(user) };
}

export async function getCurrentUser(userId: string): Promise<UserDTO> {
  const user = await User.findById(userId);
  if (!user) {
    throw new UnauthorizedError('User not found');
  }
  return toUserDTO(user);
}
