import { useEffect, useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { getRecentDevices } from '../lib/pairing';
import { useI18n } from '../lib/i18n';
import { ListRow } from './ui/ListRow';

/** Memory is not presence. Open discovery before offering a reconnect. */
export function RecentDevicesRow({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const [devices, setDevices] = useState(getRecentDevices);
  useEffect(() => {
    const sync = () => setDevices(getRecentDevices());
    window.addEventListener('sharetext:recents', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('sharetext:recents', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  if (!devices.length) return null;
  return <ListRow title={t('nearby.recentTitle')}
    subtitle={devices.slice(0, 2).map(device => device.name).join(', ')}
    leading={<MonitorSmartphone className="h-4 w-4" strokeWidth={1.6} aria-hidden />}
    onClick={onOpen} testId="home-recent-devices" />;
}
