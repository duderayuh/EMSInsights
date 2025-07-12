import { postProcessingPipeline } from './server/services/post-processing-pipeline';
import { nlpClassifier } from './server/services/nlp-classifier';

async function testSpecificCall() {
  const transcript = "Squad 13, Ambulance 14, North Pennsylvania Street and East Washington Street, Unconscious Person, Squad 13, Ambulance 14, North Pennsylvania Street and East Washington Street, Unconscious Person, 19, 19 hours, location 50 North 100 East";
  
  console.log('Testing specific call transcript:');
  console.log(`Original: "${transcript}"`);
  console.log('\n--- Post-Processing ---');
  
  const postProcessed = await postProcessingPipeline.process(transcript, 0.7);
  console.log(`Extracted address: "${postProcessed.extractedAddress}"`);
  console.log(`Extracted units: ${postProcessed.extractedUnits?.join(', ')}`);
  console.log(`Extracted call type: ${postProcessed.extractedCallType}`);
  
  console.log('\n--- NLP Classification ---');
  const extractedData = {
    extractedAddress: postProcessed.extractedAddress,
    extractedUnits: postProcessed.extractedUnits,
    extractedCallType: postProcessed.extractedCallType
  };
  
  const classification = await nlpClassifier.classify(transcript, extractedData, 'test');
  console.log(`Call type: ${classification.callType}`);
  console.log(`Location: ${classification.location}`);
  
  process.exit(0);
}

testSpecificCall();
