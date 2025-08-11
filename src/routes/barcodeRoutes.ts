import express from 'express';
import { scanBarcode, recordMedicationTaken } from '../controllers/barcodeController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.use(authenticateToken);
router.get('/scan/:barcodeData', scanBarcode);
router.post('/record/:medicationId', recordMedicationTaken);

export default router;