/**
 * Generate short barcode data using medication ID
 * Format: MT[8-char-code] 
 */
export const generateShortBarcodeData = (medicationId: string): string => {
  console.log('Generating barcode for medication ID:', medicationId);
  
  // Use the medication ID directly for consistency - NO random elements
  const idHash = medicationId.slice(-8).toUpperCase();
  const barcode = `MT${idHash}`;
  
  console.log('Generated consistent barcode:', barcode);
  
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
  const now = new Date();
  const timeSinceLastDose = (now.getTime() - lastTaken.getTime()) / (1000 * 60 * 60);

  console.log(`Time since last dose: ${timeSinceLastDose.toFixed(2)} hours`);
  console.log(`Required interval: ${intervalHours} hours`);

  if (timeSinceLastDose >= intervalHours) {
    console.log('Enough time has passed - can take now');
    return { canTake: true };
  }

  const nextDoseTime = new Date(lastTaken.getTime() + (intervalHours * 60 * 60 * 1000));
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