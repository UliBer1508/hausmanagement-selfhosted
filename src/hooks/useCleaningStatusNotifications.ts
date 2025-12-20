import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CleaningStatusNotification {
  id: string;
  taskId: string;
  houseName: string;
  changedBy: string;
  oldStatus: string | null;
  newStatus: string;
  changedAt: string;
  acknowledged: boolean;
}

const STORAGE_KEY = 'cleaning-status-notifications';
const WATCHED_USERS = ['Teuni', 'Amela', 'Boris'];

// Status-Labels für bessere Lesbarkeit
const STATUS_LABELS: Record<string, string> = {
  'scheduled': 'Geplant',
  'in_progress': 'In Bearbeitung',
  'completed': 'Fertig ✅',
  'cancelled': 'Storniert',
  'pending': 'Ausstehend'
};

export const useCleaningStatusNotifications = () => {
  const [notifications, setNotifications] = useState<CleaningStatusNotification[]>([]);

  // Lade Benachrichtigungen aus localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setNotifications(parsed);
      } catch (e) {
        console.error('Fehler beim Laden der Benachrichtigungen:', e);
      }
    }
  }, []);

  // Speichere bei Änderungen
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  }, [notifications]);

  // Realtime Subscription für service_tasks Änderungen
  useEffect(() => {
    const channel = supabase
      .channel('cleaning-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_tasks'
        },
        async (payload) => {
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          
          // Prüfe ob status_changed_by einer der beobachteten User ist
          const changedBy = newRecord.status_changed_by;
          if (!changedBy || !WATCHED_USERS.includes(changedBy)) {
            return;
          }

          // Prüfe ob sich der Status tatsächlich geändert hat
          if (oldRecord.status === newRecord.status) {
            return;
          }

          // Nur Reinigungsaufträge
          if (newRecord.service_type !== 'cleaning') {
            return;
          }

          // Lade Haus-Name
          let houseName = 'Unbekanntes Haus';
          if (newRecord.house_id) {
            const { data: house } = await supabase
              .from('houses')
              .select('name')
              .eq('id', newRecord.house_id)
              .single();
            if (house) {
              houseName = house.name;
            }
          }

          // Neue Benachrichtigung erstellen
          const notification: CleaningStatusNotification = {
            id: `${newRecord.id}-${Date.now()}`,
            taskId: newRecord.id,
            houseName,
            changedBy,
            oldStatus: oldRecord.status,
            newStatus: newRecord.status,
            changedAt: new Date().toISOString(),
            acknowledged: false
          };

          console.log('🔔 Neue Status-Änderung erkannt:', notification);

          setNotifications(prev => [notification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Benachrichtigung als gesehen markieren
  const acknowledge = useCallback((notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => 
        n.id === notificationId 
          ? { ...n, acknowledged: true }
          : n
      )
    );
  }, []);

  // Alle Benachrichtigungen als gesehen markieren
  const acknowledgeAll = useCallback(() => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, acknowledged: true }))
    );
  }, []);

  // Alte bestätigte Benachrichtigungen löschen (älter als 24h)
  const cleanupOld = useCallback(() => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    setNotifications(prev => 
      prev.filter(n => !n.acknowledged || n.changedAt > oneDayAgo)
    );
  }, []);

  // Cleanup beim Mount
  useEffect(() => {
    cleanupOld();
  }, [cleanupOld]);

  // Unbestätigte Benachrichtigungen
  const unacknowledgedNotifications = notifications.filter(n => !n.acknowledged);

  // Helper für Status-Label
  const getStatusLabel = (status: string) => STATUS_LABELS[status] || status;

  return {
    notifications,
    unacknowledgedNotifications,
    unacknowledgedCount: unacknowledgedNotifications.length,
    acknowledge,
    acknowledgeAll,
    getStatusLabel
  };
};
