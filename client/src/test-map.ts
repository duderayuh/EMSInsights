// Test script to manually trigger map operations for debugging
export function testMapFunctionality() {
  console.log('=== MAP TEST START ===');
  
  // Test data with coordinates from our calls
  const testCalls = [
    {
      id: 31,
      latitude: 39.65018,
      longitude: -86.1371,
      callType: "Medical Emergency",
      location: "7212 US 31 South",
      timestamp: "2025-07-03T07:08:38.262Z"
    },
    {
      id: 32,
      latitude: 39.771633,
      longitude: -86.17565,
      callType: "Unknown",
      location: "550 University Boulevard Cedar",
      timestamp: "2025-07-03T07:14:40.219Z"
    }
  ];

  console.log('Test calls:', testCalls);
  
  // Try to import and use map functions
  import('./lib/map-utils').then(mapUtils => {
    console.log('Map utils loaded');
    
    // Check if map is already initialized
    const emergencyMapElement = document.getElementById('emergencyMap');
    console.log('Emergency map element exists:', !!emergencyMapElement);
    
    if (emergencyMapElement) {
      console.log('Map element dimensions:', {
        width: emergencyMapElement.clientWidth,
        height: emergencyMapElement.clientHeight
      });
    }
    
    // Try to initialize map if not already done
    try {
      mapUtils.initializeMap();
      
      // Wait a bit for initialization, then try to add markers
      setTimeout(() => {
        console.log('Attempting to add test markers...');
        mapUtils.updateMapMarkers(testCalls);
        console.log('Test markers added');
      }, 2000);
      
    } catch (error) {
      console.error('Map test error:', error);
    }
  }).catch(error => {
    console.error('Failed to load map utils:', error);
  });
  
  console.log('=== MAP TEST END ===');
}

// Export to global scope for manual testing
if (typeof window !== 'undefined') {
  (window as any).testMapFunctionality = testMapFunctionality;
}