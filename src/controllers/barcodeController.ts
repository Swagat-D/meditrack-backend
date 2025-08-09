// Backend: src/controllers/barcodeController.ts
import { Request, Response } from 'express';
import Medication from '../models/Medication';
import Patient from '../models/Patient';
import User from '../models/User';

interface AuthRequest extends Request {
  user?: any;
}

// Get medication details by barcode
export const getMedicationByBarcode = async (req: AuthRequest, res: Response) => {
  try {
    const { barcodeData } = req.params;

    if (!barcodeData) {
      return res.status(400).json({
        success: false,
        message: 'Barcode data is required'
      });
    }

    // Find medication by barcode
    const medication = await Medication.findOne({ barcodeData })
      .populate('patient', 'name email age gender phoneNumber')
      .populate('caregiver', 'name email phoneNumber');

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found for this barcode'
      });
    }

    // Format response with complete medication and patient details
    const response = {
      barcode: {
        data: medication.barcodeData,
        scannedAt: new Date().toISOString(),
        isValid: true
      },
      medication: {
        id: medication._id,
        name: medication.name,
        dosage: medication.dosage,
        dosageUnit: medication.dosageUnit,
        frequency: medication.frequency,
        timingRelation: medication.timingRelation,
        totalQuantity: medication.totalQuantity,
        remainingQuantity: medication.remainingQuantity,
        expiryDate: medication.expiryDate,
        instructions: medication.instructions,
        status: medication.status,
        adherenceRate: medication.adherenceRate,
        lastTaken: medication.lastTaken,
        daysLeft: Math.floor(medication.remainingQuantity / medication.frequency),
        createdAt: medication.createdAt
      },
      patient: {
        id: (medication.patient as any)._id,
        name: (medication.patient as any).name,
        email: (medication.patient as any).email,
        age: (medication.patient as any).age,
        gender: (medication.patient as any).gender,
        phoneNumber: (medication.patient as any).phoneNumber
      },
      caregiver: {
        id: (medication.caregiver as any)._id,
        name: (medication.caregiver as any).name,
        email: (medication.caregiver as any).email,
        phoneNumber: (medication.caregiver as any).phoneNumber
      }
    };

    res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Get medication by barcode error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve medication details'
    });
  }
};

// Verify barcode access (for patients and caregivers)
export const verifyBarcodeAccess = async (req: AuthRequest, res: Response) => {
  try {
    const { barcodeData } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const medication = await Medication.findOne({ barcodeData })
      .populate('patient')
      .populate('caregiver');

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Invalid barcode'
      });
    }

    let hasAccess = false;

    if (userRole === 'caregiver') {
      // Caregiver can access if they are the assigned caregiver
      hasAccess = medication.caregiver._id.toString() === userId.toString();
    } else if (userRole === 'patient') {
      // Patient can access if it's their medication
      const patient = await Patient.findOne({ 
        email: req.user.email,
        _id: medication.patient._id 
      });
      hasAccess = !!patient;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this medication'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Access verified',
      hasAccess: true
    });

  } catch (error) {
    console.error('Verify barcode access error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify access'
    });
  }
};

// Get barcode statistics (for analytics)
export const getBarcodeStats = async (req: AuthRequest, res: Response) => {
  try {
    const caregiverId = req.user._id;

    const stats = await Medication.aggregate([
      { $match: { caregiver: caregiverId } },
      {
        $group: {
          _id: null,
          totalBarcodes: { $sum: 1 },
          activeMedications: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          expiringSoon: {
            $sum: {
              $cond: [
                {
                  $lte: [
                    '$expiryDate',
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
                  ]
                },
                1,
                0
              ]
            }
          },
          lowStock: {
            $sum: {
              $cond: [
                { $lte: ['$remainingQuantity', 7] }, // Less than 7 days supply
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalBarcodes: 0,
      activeMedications: 0,
      expiringSoon: 0,
      lowStock: 0
    };

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Get barcode stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get barcode statistics'
    });
  }
};