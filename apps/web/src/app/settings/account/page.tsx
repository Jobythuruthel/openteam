import type { Metadata } from 'next';
import { AccountSettings } from './account-settings';

export const metadata: Metadata = { title: 'Account and sessions', robots: { index: false } };

export default function AccountPage() {
  return <AccountSettings />;
}
