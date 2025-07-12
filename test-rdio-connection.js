// Test script to check Rdio Scanner connection and recent calls
const fetch = require('node-fetch');

async function testRdioConnection() {
  try {
    console.log('Testing EMS-Insight API...');
    
    // Test our local API
    const audioStatus = await fetch('http://localhost:5000/api/audio/status').then(r => r.json());
    console.log('Audio Status:', JSON.stringify(audioStatus, null, 2));
    
    const calls = await fetch('http://localhost:5000/api/calls').then(r => r.json());
    console.log('Recent calls count:', calls.length);
    
    if (calls.length > 0) {
      console.log('Most recent call:', JSON.stringify(calls[0], null, 2));
    }
    
    // Test Rdio Scanner direct connection
    console.log('\nTesting direct Rdio Scanner connection...');
    
    try {
      const response = await fetch('http://hoosierems.ddns.me:3000/api/calls', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'EMS-Insight/1.0'
        }
      });
      
      console.log('Rdio Scanner response status:', response.status);
      console.log('Rdio Scanner response headers:', response.headers.raw());
      
      const text = await response.text();
      console.log('Rdio Scanner response (first 200 chars):', text.substring(0, 200));
      
    } catch (error) {
      console.error('Direct Rdio Scanner test failed:', error.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRdioConnection();