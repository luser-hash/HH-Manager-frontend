import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';
import { WorkspaceProvider } from '@/components/workspace';

export const metadata: Metadata = { title: 'Hill Horizon Manager', description: 'Hill Horizon’s internal booking workspace.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><WorkspaceProvider>{children}</WorkspaceProvider></body></html>;
}
