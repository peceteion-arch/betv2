import multer from 'multer';
import { Request } from 'express';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';

const uploadDir = join(__dirname, '../../uploads/competition-logos');

if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${randomUUID()}${extname(file.originalname)}`;
    cb(null, uniqueSuffix);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const ext = allowedTypes.test(extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (ext && mimetype) {
    return cb(null, true);
  }
  cb(new Error('Only images (png, jpg, webp) are allowed'));
};

export const uploadCompetitionLogo = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
});
