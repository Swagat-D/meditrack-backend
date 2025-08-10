import express from 'express';
import { scanBarcode } from '../controllers/barcodeController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.use(authenticateToken);
router.get('/scan/:barcodeData', scanBarcode);

export default router;