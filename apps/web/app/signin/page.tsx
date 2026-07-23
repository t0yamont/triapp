import { Card } from '@ironflow/ui';
import Link from 'next/link';
import { AuthForm } from '../../components/AuthForm';

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-h1 text-text">Log in</h1>
      <Card>
        <AuthForm mode="signin" />
      </Card>
      <p className="text-label text-muted">
        New here?{' '}
        <Link href="/signup" className="text-accent">
          Create an account
        </Link>
      </p>
    </main>
  );
}
