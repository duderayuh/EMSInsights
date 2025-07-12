import { useEffect, useState, useRef } from 'react';
import { Call } from '@shared/schema';

interface WebSocketData {
  calls: Call[];
  stats: any;
  systemHealth: any[];
  connectionStatus: string;
}

export function useWebSocket(url: string): WebSocketData {
  const [calls, setCalls] = useState<Call[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [systemHealth, setSystemHealth] = useState<any[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}${url}`;
      
      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log('WebSocket connected');
          setConnectionStatus('connected');
          
          // Clear any existing reconnection timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        wsRef.current.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        wsRef.current.onclose = () => {
          console.log('WebSocket disconnected');
          setConnectionStatus('disconnected');
          
          // Attempt to reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            connect();
          }, 5000);
        };

        wsRef.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus('error');
        };

      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setConnectionStatus('error');
      }
    };

    const handleMessage = (message: any) => {
      switch (message.type) {
        case 'initial_calls':
          setCalls(message.data || []);
          break;
          
        case 'new_call':
          setCalls(prev => {
            // Check if call already exists to avoid duplicates
            const exists = prev.some(call => call.id === message.data.id);
            if (exists) {
              // Update existing call
              return prev.map(call => 
                call.id === message.data.id ? message.data : call
              );
            } else {
              // Add new call to the top
              return [message.data, ...prev].slice(0, 100); // Keep only latest 100 calls
            }
          });
          break;
          
        case 'call_update':
          setCalls(prev => {
            const callExists = prev.some(call => call.id === message.data.id);
            if (callExists) {
              // Update existing call
              return prev.map(call => 
                call.id === message.data.id ? message.data : call
              );
            } else {
              // If call doesn't exist, add it (might be a late arrival)
              return [message.data, ...prev].slice(0, 100);
            }
          });
          break;
          
        case 'stats_update':
          setStats(message.data);
          break;
          
        case 'system_health':
          setSystemHealth(message.data || []);
          break;
          
        case 'heartbeat':
          // Send pong response
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'pong',
              timestamp: Date.now()
            }));
          }
          break;
          
        case 'search_results':
          // Handle search results if needed
          break;
          
        case 'error':
          console.error('WebSocket error message:', message.data);
          break;
          
        default:
          console.log('Unknown message type:', message.type);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  // Method to send messages
  const sendMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  // Method to search calls
  const searchCalls = (searchData: any) => {
    sendMessage({
      type: 'search_calls',
      data: searchData,
      timestamp: Date.now()
    });
  };

  return {
    calls,
    stats,
    systemHealth,
    connectionStatus,
    sendMessage,
    searchCalls
  } as WebSocketData & { sendMessage: (message: any) => void, searchCalls: (searchData: any) => void };
}
