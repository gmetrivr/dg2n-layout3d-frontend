import { useEffect, useState } from 'react';
import { Check, Copy, AlertTriangle } from 'lucide-react';

interface ClipboardNotificationProps {
  message: string;
  type?: 'success' | 'warning' | 'error';
  duration?: number;
}

export function ClipboardNotification({
  message,
  type = 'success',
  duration = 2000
}: ClipboardNotificationProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  const bgColor = type === 'success' ? 'bg-green-500' :
                  type === 'warning' ? 'bg-yellow-500' : 'bg-red-500';

  const Icon = type === 'success' ? Check :
               type === 'warning' ? AlertTriangle : Copy;

  return (
    <div
      className={`fixed bottom-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-in slide-in-from-bottom-5 duration-300`}
      style={{ minWidth: '200px' }}
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
