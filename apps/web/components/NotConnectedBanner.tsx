export function NotConnectedBanner() {
  return (
    <div className="rounded-control border border-warn/30 bg-warn/10 p-3 text-label text-warn">
      Supabase isn&apos;t connected in this environment yet. The form is wired — set
      <code className="mx-1 font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and
      <code className="mx-1 font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable it.
    </div>
  );
}
