import { postProcessingPipeline } from './server/services/post-processing-pipeline.js';

async function testTranscriptionDictionary() {
  console.log('Testing transcription dictionary corrections...\n');
  
  // Wait a moment for dictionary to load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const testCases = [
    {
      input: "Medic 26 responded to a Tessane Park call at 123 Main Street",
      expected: "Chest Pain"
    },
    {
      input: "Patient reports Adorno-Batain v symptoms for 2 hours",
      expected: "Abdominal Pain B"
    },
    {
      input: "Sieg-Hurzen person needs assistance at the location",
      expected: "Sick Person"
    },
    {
      input: "MVC with injuries at the intersection",
      expected: "Motor Vehicle Crash"
    },
    {
      input: "GSW to the chest, critical condition",
      expected: "Gunshot Wound"
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`Input: "${testCase.input}"`);
    
    const result = await postProcessingPipeline.process(testCase.input, 0.8);
    
    console.log(`Output: "${result.cleanedTranscript}"`);
    console.log(`Expected to contain: "${testCase.expected}"`);
    console.log(`Success: ${result.cleanedTranscript.includes(testCase.expected) ? '✓' : '✗'}`);
    console.log('---');
  }
  
  process.exit(0);
}

testTranscriptionDictionary();