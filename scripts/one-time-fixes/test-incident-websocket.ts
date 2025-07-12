import WebSocket from 'ws';

// Test the incident WebSocket endpoint
const testIncidentWebSocket = () => {
  const ws = new WebSocket('ws://localhost:5000/ws/incidents');
  
  ws.on('open', () => {
    console.log('Successfully connected to incident WebSocket');
    
    // Send a ping message
    ws.send(JSON.stringify({ type: 'ping' }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('Received message:', message.type, message);
    
    if (message.type === 'connected') {
      console.log('✓ Incident WebSocket connection confirmed');
    }
    
    if (message.type === 'pong') {
      console.log('✓ Ping/pong working');
    }
    
    if (message.type === 'incident_created') {
      console.log('✓ LIVE UPDATE RECEIVED:', message.data.unitId, 'dispatched to', message.data.location);
    }
  });
  
  ws.on('close', () => {
    console.log('Incident WebSocket connection closed');
  });
  
  ws.on('error', (error) => {
    console.error('Incident WebSocket error:', error);
  });
  
  // Keep the connection open for 30 seconds to receive any broadcasts
  setTimeout(() => {
    console.log('Closing test connection after 30 seconds');
    ws.close();
  }, 30000);
};

console.log('Testing incident WebSocket endpoint...');
testIncidentWebSocket();