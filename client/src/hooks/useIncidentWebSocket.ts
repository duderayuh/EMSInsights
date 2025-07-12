import { useEffect, useState, useRef } from 'react';

interface UseIncidentWebSocketOptions {
  onMessage?: (message: any) => void;
}

export function useIncidentWebSocket(url: string, onMessage?: (message: any) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}${url}`;
      
      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log('Incident WebSocket connected');
          setIsConnected(true);
          
          // Clear any existing reconnection timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        wsRef.current.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('Received WebSocket message:', message.type, message);
            if (onMessage) {
              onMessage(message);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        wsRef.current.onclose = () => {
          console.log('Incident WebSocket disconnected');
          setIsConnected(false);
          
          // Attempt to reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect incident WebSocket...');
            connect();
          }, 5000);
        };

        wsRef.current.onerror = (error) => {
          console.error('Incident WebSocket error:', error);
          setIsConnected(false);
        };

      } catch (error) {
        console.error('Failed to create incident WebSocket connection:', error);
        setIsConnected(false);
      }
    };

    // Connect immediately
    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url, onMessage]);

  return { isConnected };
}