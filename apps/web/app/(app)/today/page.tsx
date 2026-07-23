import { Card } from '@ironflow/ui';

export default function TodayPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-text">Today</h1>
      <Card className="flex flex-col gap-2">
        <h2 className="text-h2 text-text">You&apos;re set up.</h2>
        <p className="text-body text-muted">
          Your profile, consent and availability are captured. Connecting a device and generating
          your first plan come next — the engine that builds it (thresholds, zones, load,
          periodisation) is already implemented and tested in{' '}
          <code className="font-mono text-faint">packages/core/physio</code>.
        </p>
      </Card>
    </div>
  );
}
