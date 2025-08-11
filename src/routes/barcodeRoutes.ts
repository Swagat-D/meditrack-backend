import express from 'express';
import { scanBarcode, recordMedicationViaBarcode } from '../controllers/barcodeController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.use(authenticateToken);
router.get('/scan/:barcodeData', scanBarcode);
router.post('/record/:medicationId', recordMedicationViaBarcode);

export default router;