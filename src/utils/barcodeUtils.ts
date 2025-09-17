import { getCurrentIST, convertUTCToIST } from './timezoneUtils';

/**
 * Generate short barcode data using medication ID with collision handling
 * Format: MT[8-char-code] or MT[8-char-code]-[suffix] for duplicates
 */
export const generateShortBarcodeData = async (medicationId: string): Promise<string> => {
  console.log('Generating barcode for medication ID:', medicationId);
  
  // Dynamic import to avoid circular dependency
  const { default: Medication } = await import('../models/Medication');
  
  // Use the medication ID directly for consistency - NO random elements
  const idHash = medicationId.slice(-8).toUpperCase();
  let baseBarcode = `MT${idHash}`;
  let finalBarcode = baseBarcode;
  let suffix = 0;
  
  // Check for existing barcodes and resolve collisions
  while (true) {
    try {
      const existingMedication = await Medication.findOne({ 
        barcodeData: finalBarcode,
        _id: { $ne: medicationId } // Exclude the current medication if updating
      });
      
      if (!existingMedication) {
        // No collision found, barcode is unique
        break;
      }
      
      // Collision detected, add suffix
      suffix++;
      finalBarcode = `${baseBarcode}-${suffix}`;
      console.log(`Barcode collision detected, trying: ${finalBarcode}`);
      
      // Safety check to prevent infinite loops (very unlikely)
      if (suffix > 999) {
        // Fallback to timestamp-based generation
        const timestamp = Date.now().toString().slice(-6);
        finalBarcode = `MT${timestamp}${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
        console.log(`Using timestamp fallback: ${finalBarcode}`);
        break;
      }
    } catch (error) {
      console.error('Error checking barcode collision:', error);
      // If database check fails, use original barcode and let unique constraint handle it
      break;
    }
  }
  
  console.log('Generated collision-safe barcode:', finalBarcode);
  return finalBarcode;
};

/**
 * Synchronous barcode generation (for compatibility)
 * Use the async version for new code to ensure uniqueness
 */
export const generateShortBarcodeDataSync = (medicationId: string): string => {
  console.log('Generating barcode for medication ID (sync):', medicationId);
  
  // Use the medication ID directly with timestamp suffix for uniqueness
  const idHash = medicationId.slice(-8).toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  const barcode = `MT${idHash}${timestamp}`;
  
  console.log('Generated barcode (sync):', barcode);
  return barcode;
};

/**
 * Alternative: Generate using medication data (slightly longer but more readable)
 * Format: MED-[2-letter-code][6-digit-timestamp][2-random]
 */
export const generateMedicationBarcodeData = (medicationData: {
  patientId: string;
  medicationId: string;
  medicationName: string;
  dosage: string;
  dosageUnit: string;
  frequency: number;
  timingRelation: string;
}): string => {
  const timestamp = Date.now().toString().slice(-6);
  const medCode = medicationData.medicationName.substring(0, 2).toUpperCase().replace(/[^A-Z]/g, 'X');
  const random = Math.random().toString(36).substring(2, 4).toUpperCase();
  
  return `MED-${medCode}${timestamp}${random}`;
};

/**
 * Parse barcode data - works with both formats
 */
export const parseMedicationBarcodeData = (barcodeData: string) => {
  try {
    if (barcodeData.startsWith('MED-') || barcodeData.startsWith('MT')) {
      return {
        type: 'SHORT',
        barcodeData: barcodeData
      };
    }
    
    throw new Error('Invalid barcode format');
  } catch (error) {
    throw new Error('Invalid barcode format. Please scan a valid medication barcode.');
  }
};

// Keep the rest of your timing functions...
export const canTakeMedicationNow = (lastTaken: Date | null, frequency: number): { 
  canTake: boolean, 
  nextDoseTime?: Date, 
  hoursRemaining?: number 
} => {
  if (!lastTaken) {
    console.log('No previous dose found - can take now');
    return { canTake: true };
  }

  const hoursPerDay = 24;
  const intervalHours = hoursPerDay / frequency;
  const now = getCurrentIST();
  const lasTakenIST = convertUTCToIST(lastTaken);
  const timeSinceLastDose = (now.getTime() - lasTakenIST.getTime()) / (1000 * 60 * 60);

  console.log(`Time since last dose: ${timeSinceLastDose.toFixed(2)} hours`);
  console.log(`Required interval: ${intervalHours} hours`);

  if (timeSinceLastDose >= intervalHours) {
    console.log('Enough time has passed - can take now');
    return { canTake: true };
  }

  const nextDoseTime = new Date(lasTakenIST.getTime() + (intervalHours * 60 * 60 * 1000));
  const hoursRemaining = Math.ceil(intervalHours - timeSinceLastDose);

  console.log(`Next dose time: ${nextDoseTime}`);
  console.log(`Hours remaining: ${hoursRemaining}`);

  return { 
    canTake: false, 
    nextDoseTime,
    hoursRemaining 
  };
};

/**
 * Validate barcode format
 */
export const isValidMedicationBarcode = (barcodeData: string): boolean => {
  try {
    parseMedicationBarcodeData(barcodeData);
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if a barcode already exists in the database
 */
export const checkBarcodeExists = async (barcodeData: string, excludeMedicationId?: string): Promise<boolean> => {
  try {
    const { default: Medication } = await import('../models/Medication');
    
    const query: any = { barcodeData };
    if (excludeMedicationId) {
      query._id = { $ne: excludeMedicationId };
    }
    
    const existingMedication = await Medication.findOne(query);
    return !!existingMedication;
  } catch (error) {
    console.error('Error checking barcode existence:', error);
    return false;
  }
};

/**
 * Generate a unique barcode ensuring no duplicates exist
 * This is a wrapper around generateShortBarcodeData with additional safety
 */
export const generateUniqueBarcodeData = async (medicationId: string, maxRetries: number = 10): Promise<string> => {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const barcodeData = await generateShortBarcodeData(medicationId);
      
      // Double-check uniqueness
      const exists = await checkBarcodeExists(barcodeData, medicationId);
      if (!exists) {
        return barcodeData;
      }
      
      // If still exists, try again with a timestamp suffix
      const timestamp = Date.now().toString().slice(-3);
      const fallbackBarcode = `${barcodeData}${timestamp}`;
      
      const fallbackExists = await checkBarcodeExists(fallbackBarcode, medicationId);
      if (!fallbackExists) {
        return fallbackBarcode;
      }
      
      retries++;
    } catch (error) {
      console.error('Error in generateUniqueBarcodeData:', error);
      retries++;
    }
  }
  
  // Ultimate fallback
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `MT${timestamp.slice(-8)}${random}`;
};