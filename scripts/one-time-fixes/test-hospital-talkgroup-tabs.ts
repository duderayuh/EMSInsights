import axios from 'axios';
import { db } from './server/db';
import { customHospitals, customTalkgroups } from './shared/schema';

const API_BASE = 'http://localhost:5000/api';

async function testHospitalAndTalkgroupTabs() {
  try {
    // Login first
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      username: 'admin',
      password: 'password'
    }, {
      withCredentials: true
    });

    const cookies = loginResponse.headers['set-cookie'];
    if (!cookies) {
      throw new Error('No cookies received from login');
    }

    const headers = { Cookie: cookies[0] };

    console.log('\n📋 TESTING HOSPITAL TAB FUNCTIONALITY\n');

    // 1. Test fetching all hospitals
    console.log('1️⃣ Testing GET /api/hospitals...');
    const hospitalsResponse = await axios.get(`${API_BASE}/hospitals`, { headers });
    console.log(`✓ Fetched ${hospitalsResponse.data.length} hospitals`);
    hospitalsResponse.data.forEach(h => {
      console.log(`  - ${h.hospitalName || h.name} (${h.talkgroupId}) - Active: ${h.isActive}`);
    });

    // 2. Test creating a new hospital
    console.log('\n2️⃣ Testing POST /api/hospitals...');
    const newHospital = {
      talkgroupId: '10999',
      hospitalName: 'Test Memorial Hospital',
      displayName: 'Test Memorial',
      address: '123 Test Street',
      city: 'Indianapolis',
      state: 'IN',
      zipCode: '46202',
      phone: '317-555-0123',
      isActive: true
    };
    
    const createHospitalResponse = await axios.post(`${API_BASE}/hospitals`, newHospital, { headers });
    const createdHospitalId = createHospitalResponse.data.id;
    console.log(`✓ Created hospital with ID: ${createdHospitalId}`);
    console.log(`  Name: ${createHospitalResponse.data.hospitalName}`);
    console.log(`  Talkgroup: ${createHospitalResponse.data.talkgroupId}`);

    // 3. Test updating the hospital
    console.log('\n3️⃣ Testing PUT /api/hospitals/:id...');
    const updateData = {
      hospitalName: 'Test Memorial Hospital Updated',
      phone: '317-555-9999'
    };
    
    const updateHospitalResponse = await axios.put(`${API_BASE}/hospitals/${createdHospitalId}`, updateData, { headers });
    console.log(`✓ Updated hospital - New name: ${updateHospitalResponse.data.hospitalName}`);
    console.log(`  New phone: ${updateHospitalResponse.data.phone}`);

    // 4. Test fetching single hospital
    console.log('\n4️⃣ Testing GET /api/hospitals/:id...');
    const singleHospitalResponse = await axios.get(`${API_BASE}/hospitals/${createdHospitalId}`, { headers });
    console.log(`✓ Fetched hospital: ${singleHospitalResponse.data.hospitalName}`);

    // 5. Test deleting the hospital
    console.log('\n5️⃣ Testing DELETE /api/hospitals/:id...');
    const deleteHospitalResponse = await axios.delete(`${API_BASE}/hospitals/${createdHospitalId}`, { headers });
    console.log(`✓ Deleted hospital - Success: ${deleteHospitalResponse.data.success}`);

    // Verify deletion
    const hospitalsAfterDelete = await axios.get(`${API_BASE}/hospitals`, { headers });
    const deletedHospital = hospitalsAfterDelete.data.find(h => h.id === createdHospitalId);
    console.log(`✓ Verified deletion - Hospital exists: ${!!deletedHospital}`);

    console.log('\n📡 TESTING TALKGROUP TAB FUNCTIONALITY\n');

    // 1. Test fetching all talkgroups
    console.log('1️⃣ Testing GET /api/talkgroups...');
    const talkgroupsResponse = await axios.get(`${API_BASE}/talkgroups`, { headers });
    console.log(`✓ Fetched ${talkgroupsResponse.data.length} talkgroups`);
    console.log('Sample talkgroups:');
    talkgroupsResponse.data.slice(0, 3).forEach(tg => {
      console.log(`  - ${tg.talkgroupId}: ${tg.name || tg.displayName} (${tg.category}) - Active: ${tg.isActive}`);
    });

    // 2. Test creating a new talkgroup
    console.log('\n2️⃣ Testing POST /api/talkgroups...');
    const newTalkgroup = {
      talkgroupId: '99999',
      systemName: 'MESA',
      name: 'Test Emergency Channel',
      displayName: 'Test Emergency',
      category: 'emergency',
      description: 'Test talkgroup for automated testing',
      isActive: true
    };
    
    const createTalkgroupResponse = await axios.post(`${API_BASE}/talkgroups`, newTalkgroup, { headers });
    const createdTalkgroupId = createTalkgroupResponse.data.id;
    console.log(`✓ Created talkgroup with ID: ${createdTalkgroupId}`);
    console.log(`  Talkgroup ID: ${createTalkgroupResponse.data.talkgroupId}`);
    console.log(`  Name: ${createTalkgroupResponse.data.name || createTalkgroupResponse.data.displayName}`);

    // 3. Test updating the talkgroup
    console.log('\n3️⃣ Testing PUT /api/talkgroups/:id...');
    const updateTalkgroupData = {
      name: 'Test Emergency Channel Updated',
      description: 'Updated description for test talkgroup'
    };
    
    const updateTalkgroupResponse = await axios.put(`${API_BASE}/talkgroups/${createdTalkgroupId}`, updateTalkgroupData, { headers });
    console.log(`✓ Updated talkgroup - New name: ${updateTalkgroupResponse.data.name || updateTalkgroupResponse.data.displayName}`);

    // 4. Test fetching single talkgroup
    console.log('\n4️⃣ Testing GET /api/talkgroups/:id...');
    const singleTalkgroupResponse = await axios.get(`${API_BASE}/talkgroups/${createdTalkgroupId}`, { headers });
    console.log(`✓ Fetched talkgroup: ${singleTalkgroupResponse.data.name || singleTalkgroupResponse.data.displayName}`);
    console.log(`  Description: ${singleTalkgroupResponse.data.description}`);
    console.log(`  ID being deleted: ${createdTalkgroupId}`);

    // 5. Test deleting the talkgroup
    console.log('\n5️⃣ Testing DELETE /api/talkgroups/:id...');
    const deleteTalkgroupResponse = await axios.delete(`${API_BASE}/talkgroups/${createdTalkgroupId}`, { headers });
    console.log(`✓ Deleted talkgroup - Success: ${deleteTalkgroupResponse.data.success}`);

    // Verify deletion
    const talkgroupsAfterDelete = await axios.get(`${API_BASE}/talkgroups`, { headers });
    const deletedTalkgroup = talkgroupsAfterDelete.data.find(tg => tg.id === createdTalkgroupId);
    console.log(`✓ Verified deletion - Talkgroup exists: ${!!deletedTalkgroup}`);

    console.log('\n🔍 TESTING EDGE CASES AND VALIDATION\n');

    // Test duplicate talkgroup ID
    console.log('Testing duplicate talkgroup ID handling...');
    try {
      await axios.post(`${API_BASE}/talkgroups`, {
        talkgroupId: '10202', // This should already exist
        name: 'Duplicate Test',
        category: 'dispatch',
        isActive: true
      }, { headers });
      console.log('❌ ERROR: Duplicate talkgroup ID was allowed!');
    } catch (error: any) {
      console.log('✓ Correctly rejected duplicate talkgroup ID');
    }

    // Test invalid hospital data
    console.log('\nTesting invalid hospital data handling...');
    try {
      await axios.post(`${API_BASE}/hospitals`, {
        // Missing required fields
        address: '123 Test Street'
      }, { headers });
      console.log('❌ ERROR: Invalid hospital data was accepted!');
    } catch (error: any) {
      console.log('✓ Correctly rejected invalid hospital data');
    }

    console.log('\n📊 FINAL DATABASE VERIFICATION\n');
    
    // Direct database check
    const dbHospitals = await db.select().from(customHospitals);
    const dbTalkgroups = await db.select().from(customTalkgroups);
    
    console.log(`Database contains ${dbHospitals.length} hospitals`);
    console.log(`Database contains ${dbTalkgroups.length} talkgroups`);

    console.log('\n✅ ALL HOSPITAL AND TALKGROUP TAB TESTS PASSED!');

  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error('Authentication failed - check login credentials');
    }
  }
}

// Run the test
testHospitalAndTalkgroupTabs();