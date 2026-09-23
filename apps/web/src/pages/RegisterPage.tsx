import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@pulse/shared';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { FieldError, Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);
    try {
      await registerUser(data);
      navigate('/dashboard');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted">Start monitoring your services in minutes</p>

      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
      >
        {serverError && (
          <div className="rounded-lg border border-danger/20 bg-danger-muted px-4 py-3 text-sm text-danger">
            {serverError}
          </div>
        )}

        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Jane Doe" autoComplete="name" {...register('name')} />
          <FieldError message={errors.name?.message} />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:text-primary-hover">
          Sign in
        </Link>
      </p>
    </div>
  );
}
