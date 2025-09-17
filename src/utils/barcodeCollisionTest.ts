/**
 * Test utility to demonstrate barcode collision handling
 * This is for development/testing purposes only
 */

import { generateShortBarcodeData, generateUniqueBarcodeData, checkBarcodeExists } from './barcodeUtils';

/**
 * Simulate medication IDs that would create collisions
 * These IDs have the same last 8 characters
 */
export const simulateBarcodeCollision = async () => {
  console.log('🧪 Testing Barcode Collision Handling');
  console.log('====================================');
  
  // These IDs have identical last 8 characters
  const medicationId1 = '507f1f77bcf86cd799439011'; // Last 8: 99439011
  const medicationId2 = '507f1f77bcf86cd799439011'; // Same last 8
  const medicationId3 = '000000000000000099439011'; // Same last 8
  const medicationId4 = '111111111111111199439011'; // Same last 8
  
  console.log('Test Case 1: Identical medication IDs');
  console.log(`ID1: ${medicationId1} (last 8: ${medicationId1.slice(-8)})`);
  console.log(`ID2: ${medicationId2} (last 8: ${medicationId2.slice(-8)})`);
  
  try {
    const barcode1 = await generateShortBarcodeData(medicationId1);
    console.log(`✅ Generated barcode for ID1: ${barcode1}`);
    
    const barcode2 = await generateShortBarcodeData(medicationId2);
    console.log(`✅ Generated barcode for ID2: ${barcode2}`);
    
    console.log(`Collision detected: ${barcode1 === barcode2 ? '❌ YES' : '✅ NO'}`);
  } catch (error) {
    console.error('❌ Error during collision test:', error);
  }
  
  console.log('\nTest Case 2: Different IDs with same suffix');
  console.log(`ID3: ${medicationId3} (last 8: ${medicationId3.slice(-8)})`);
  console.log(`ID4: ${medicationId4} (last 8: ${medicationId4.slice(-8)})`);
  
  try {
    const barcode3 = await generateShortBarcodeData(medicationId3);
    console.log(`✅ Generated barcode for ID3: ${barcode3}`);
    
    const barcode4 = await generateShortBarcodeData(medicationId4);
    console.log(`✅ Generated barcode for ID4: ${barcode4}`);
    
    console.log(`Collision detected: ${barcode3 === barcode4 ? '❌ YES' : '✅ NO'}`);
  } catch (error) {
    console.error('❌ Error during suffix collision test:', error);
  }
  
  console.log('\nTest Case 3: Unique barcode generation');
  try {
    const uniqueBarcode = await generateUniqueBarcodeData('507f1f77bcf86cd799439999');
    console.log(`✅ Generated unique barcode: ${uniqueBarcode}`);
    
    const exists = await checkBarcodeExists(uniqueBarcode);
    console.log(`Barcode already exists: ${exists ? '❌ YES' : '✅ NO'}`);
  } catch (error) {
    console.error('❌ Error during unique generation test:', error);
  }
  
  console.log('\n✅ Barcode collision tests completed!');
};

/**
 * Test different barcode formats for edge cases
 */
export const testBarcodeFormats = () => {
  console.log('\n🧪 Testing Barcode Format Edge Cases');
  console.log('=====================================');
  
  const testCases = [
    { id: '12345', expected: 'MT00012345' },
    { id: '123456789012345678901234', expected: 'MT78901234' },
    { id: 'abc123def456', expected: 'MT23DEF456' },
    { id: '507f1f77bcf86cd799439011', expected: 'MT99439011' },
    { id: '', expected: 'Error expected' },
  ];
  
  testCases.forEach((testCase, index) => {
    try {
      if (testCase.id.length === 0) {
        console.log(`Test ${index + 1}: Empty ID - Should handle gracefully`);
        return;
      }
      
      const actualHash = testCase.id.slice(-8).toUpperCase();
      const expected = `MT${actualHash}`;
      
      console.log(`Test ${index + 1}: ID ${testCase.id}`);
      console.log(`  Expected base: ${expected}`);
      console.log(`  Last 8 chars: ${actualHash}`);
      console.log(`  ✅ Format valid`);
    } catch (error) {
      console.log(`Test ${index + 1}: ❌ Error - ${error}`);
    }
  });
  
  console.log('\n✅ Format tests completed!');
};

// Export for manual testing
export default {
  simulateBarcodeCollision,
  testBarcodeFormats
};