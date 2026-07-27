'use client';

/**
 * Settings.
 *
 * Every card here reads the athlete's own data. It previously carried three blocks of hardcoded
 * demo constants — five invented threshold anchors complete with confidence dots and "field test ·
 * 12 days ago", a Garmin connection that claimed to have synced two hours ago, and a profile form
 * pre-filled "Sample Athlete" whose Save button was wired to nothing. Fabricated physiology
 * presented as measured is the exact failure `CLAUDE.md` warns about, and it was health data.
 */

import { AccountCard } from '../../../components/settings/AccountCard';
import { AnchorsCard } from '../../../components/settings/AnchorsCard';
import { DevicesCard } from '../../../components/settings/DevicesCard';
import { FieldTestCard } from '../../../components/settings/FieldTestCard';
import { NotificationSettingsCard } from '../../../components/settings/NotificationsCard';
import { PrivacyCard } from '../../../components/settings/PrivacyCard';
import { ProfileCard } from '../../../components/settings/ProfileCard';
import { SyncHealthCard } from '../../../components/settings/SyncHealthCard';
import { ZonesCard } from '../../../components/settings/ZonesCard';

export default function SettingsPage() {
  return (
    <div className="flex animate-fade-rise flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="text-display text-text">Settings</h1>
        <p className="max-w-2xl text-body text-muted">
          Your profile, connected devices, and the thresholds the whole plan is anchored to.
        </p>
      </header>

      <ZonesCard />
      <FieldTestCard />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col gap-6">
          <ProfileCard />
          <DevicesCard />
          <SyncHealthCard />
          <NotificationSettingsCard />
        </div>

        <div className="flex flex-col gap-6">
          <AnchorsCard />
          <PrivacyCard />
          <AccountCard />
        </div>
      </div>
    </div>
  );
}
