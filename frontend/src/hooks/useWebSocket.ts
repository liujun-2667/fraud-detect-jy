import { useEffect, useRef } from 'react';
import { message } from 'antd';
import { useCaseStore, sendBrowserNotification, requestNotificationPermission } from '../store/useCaseStore';

let wsInstance: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners: Array<(msg: any) => void> = [];

export const addWsListener = (fn: (msg: any) => void) => {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
};

const getWsUrl = (): string => {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
  return `${proto}//${host}/api/v1/cases/ws`;
};

const connect = () => {
  if (typeof window === 'undefined') return;
  try {
    const ws = new WebSocket(getWsUrl());
    wsInstance = ws;

    ws.onopen = () => {
      useCaseStore.getState().setWsConnected(true);
      requestNotificationPermission();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        listeners.forEach((fn) => {
          try {
            fn(msg);
          } catch (e) {
            // ignore
          }
        });

        if (msg.type === 'case_overtime' && msg.data) {
          message.warning({
            content: msg.data.message,
            duration: 10,
          });
          sendBrowserNotification('案件超时告警', msg.data.message);
        }

        if (msg.type === 'case_assigned' && msg.data) {
          message.info({
            content: `案件${msg.data.case_no}已自动分配给${msg.data.assigned_to_name}`,
            duration: 5,
          });
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      useCaseStore.getState().setWsConnected(false);
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 5000);
      }
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch (e) {
        // ignore
      }
    };
  } catch (e) {
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 5000);
    }
  }
};

export const useWebSocket = () => {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (typeof window !== 'undefined') {
      requestNotificationPermission();
      connect();
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (wsInstance) {
        try {
          wsInstance.close();
        } catch (e) {
          // ignore
        }
        wsInstance = null;
      }
    };
  }, []);
};
