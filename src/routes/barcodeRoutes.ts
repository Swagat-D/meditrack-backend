import express from 'express';
import { scanBarcode, recordMedicationViaBarcode, testBarcodeCollision } from '../controllers/barcodeController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.use(authenticateToken);
router.get('/scan/:barcodeData', scanBarcode);
router.post('/record/:medicationId', recordMedicationViaBarcode);

// Test endpoints (development only)
router.get('/test/collision', testBarcodeCollision);

export default router;