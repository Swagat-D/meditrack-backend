import { Request, Response } from 'express';
import Medication from '../models/Medication';
import Patient from '../models/Patient';
import User from '../models/User';

interface AuthRequest extends Request {
  user?: any;
}

export const scanBarcode = async (req: AuthRequest, res: Response) => {
  try {
    const { barcodeData } = req.params;
    const userEmail = req.user.email;

    // Decode barcode data (assuming it contains medication ID)
    const medicationId = barcodeData;

    // Find the medication
    const medication = await Medication.findById(medicationId)
      .populate('patient', 'name email')
      .populate('caregiver', 'name email');

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found. Please check the barcode and try again.'
      });
    }

    // Verify user has access to this medication
    const patient = medication.patient as any;
    if (patient.email !== userEmail) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this medication.'
      });
    }

    // Calculate days left
    const daysLeft = Math.floor(medication.remainingQuantity / medication.frequency);

    const result = {
      medication: {
        id: medication._id,
        name: medication.name,
        dosage: medication.dosage,
        dosageUnit: medication.dosageUnit,
        instructions: medication.instructions || 'Take as directed',
        lastTaken: medication.lastTaken,
        daysLeft: Math.max(0, daysLeft),
        remainingQuantity: medication.remainingQuantity,
        frequency: medication.frequency,
        status: medication.status
      },
      patient: {
        id: patient._id,
        name: patient.name,
        email: patient.email
      },
      caregiver: {
        id: (medication.caregiver as any)._id,
        name: (medication.caregiver as any).name,
        email: (medication.caregiver as any).email
      }
    };

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Barcode scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan barcode. Please try again.'
    });
  }
};