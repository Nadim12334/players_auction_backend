import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  registerPlayer,
  getPublicTournamentInfo,
  getRegistrations,
  getRegistrationById,
  updateRegistration,
  deleteRegistration,
} from "../controllers/registrationController";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "players");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `player-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

// Multer File Filter & Limits (5 MB limit, image types only)
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file format. Only JPG, JPEG, PNG, and WEBP formats are supported."));
    }
  },
});

const router = Router();

// Public Routes
router.get("/tournaments/public/:slug", getPublicTournamentInfo);
router.get("/tournaments/public", getPublicTournamentInfo);
router.post("/register", upload.single("photoFile"), registerPlayer);
router.post("/register/:slug", upload.single("photoFile"), registerPlayer);

// Admin Routes
router.get("/admin/registrations", getRegistrations);
router.get("/admin/registrations/:id", getRegistrationById);
router.put("/admin/registrations/:id", updateRegistration);
router.delete("/admin/registrations/:id", deleteRegistration);

export default router;
