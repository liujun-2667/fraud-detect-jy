import { useEffect, useRef } from 'react';
import { message } from 'antd';
import { useCaseStore, sendBrowserNotification, requestNotificationPermission } from '../store/useCaseStore';

let wsInstance: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners: Array<(msg: any) => void> = [];

const API_BASE_PATH = '/api/v1';

export const addWsListener = (fn: (msg: any) => void) => {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
};

const getToken = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem('token') || '';
  } catch {
    return '';
  }
};

const getWsUrl = (): string => {
  if (typeof window === 'undefined') return '';

  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '';

  let proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  const host = isLocalhost ? 'localhost:8000' : window.location.host;

  const token = getToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';

  const url = `${proto}//${host}${API_BASE_PATH}/cases/ws${query}`;

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[WebSocket] connecting to:', url);
  }

  return url;
};

const connect = () => {
  if (typeof window === 'undefined') return;
  try {
    const ws = new WebSocket(getWsUrl());
    wsInstance = ws;

    ws.onopen = () => {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[WebSocket] connection established');
      }
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

    ws.onclose = (event) => {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[WebSocket] connection closed, code=', event.code, 'reason=', event.reason);
      }
      useCaseStore.getState().setWsConnected(false);
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 5000);
      }
    };

    ws.onerror = (event) => {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[WebSocket] connection error, will retry in 5s');
      }
      try {
        ws.close();
      } catch (e) {
        // ignore
      }
    };
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[WebSocket] failed to create connection:', e);
    }
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
