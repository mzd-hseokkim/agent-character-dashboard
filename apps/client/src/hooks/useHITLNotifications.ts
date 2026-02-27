import { useState } from 'react';
import type { HookEvent } from '../types/index';

export function useHITLNotifications() {
  const [hasPermission, setHasPermission] = useState(false);

  const requestPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setHasPermission(permission === 'granted');
    }
  };

  const notifyHITLRequest = (event: HookEvent) => {
    if (!hasPermission || !event.humanInTheLoop) return;

    const notification = new Notification('Agent Needs Your Input', {
      body: event.humanInTheLoop.question.slice(0, 100),
      icon: '/vite.svg',
      tag: `hitl-${event.id}`,
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  };

  return { hasPermission, requestPermission, notifyHITLRequest };
}
