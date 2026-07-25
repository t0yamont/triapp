import { Button, Card } from '@ironflow/ui';
import Link from 'next/link';

export default function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-4">
        <span className="text-label uppercase tracking-widest text-accent">TriFlow</span>
        <h1 className="text-display text-text">Training anchored to your body, not a formula.</h1>
        <ul className="flex flex-col gap-2 text-body text-muted">
          <li>· Finds your real aerobic and threshold heart rates from ordinary training — no lab.</li>
          <li>· Builds a periodised plan around your races, and adapts it as evidence accumulates.</li>
          <li>· Says out loud how confident it is in every number it uses.</li>
        </ul>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h2 text-text">Get started</h2>
          <p className="text-label text-faint">A plan in under six minutes.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/signup" className="flex-1">
            <Button className="w-full">Create account</Button>
          </Link>
          <Link href="/signin" className="flex-1">
            <Button variant="secondary" className="w-full">
              Log in
            </Button>
          </Link>
        </div>
      </Card>

      <p className="text-label text-faint">
        TriFlow provides training guidance, not medical advice. Seek medical clearance before
        beginning a training programme.
      </p>
    </main>
  );
}
