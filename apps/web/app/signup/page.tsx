import { Card } from '@ironflow/ui';
import Link from 'next/link';
import { AuthForm } from '../../components/AuthForm';

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-h1 text-text">Create your account</h1>
      <Card>
        <AuthForm mode="signup" />
      </Card>
      <p className="text-label text-muted">
        Already have an account?{' '}
        <Link href="/signin" className="text-accent">
          Log in
        </Link>
      </p>
    </main>
  );
}
