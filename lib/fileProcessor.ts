import imageCompression from 'browser-image-compression';

export interface ProcessedUpload {
  kind: 'image' | 'pdf';
  fileName: string;
  imageDataUrl?: string;
  sizeKb: number;
  pdfText?: string;
  pdfPageCount?: number;
}

const MAX_HEIC_BYTES = 25 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

async function convertHeicIfNeeded(file: File): Promise<File> {
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.(heic|heif)$/i.test(file.name);

  if (!isHeic) return file;

  if (file.size > MAX_HEIC_BYTES) {
    throw new Error(
      'Cette photo HEIC est trop lourde (> 25 Mo). Réduis sa résolution ou envoie une capture d’écran.'
    );
  }

  const heic2any = (await import('heic2any')).default;
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.75,
  });

  const blob = Array.isArray(converted) ? converted[0] : converted;
  const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg');

  return new File([blob], jpegName, { type: 'image/jpeg' });
}

async function processImageFile(file: File): Promise<ProcessedUpload> {
  const normalizedFile = await convertHeicIfNeeded(file);

  const compressedFile = await imageCompression(normalizedFile, {
    maxSizeMB: 1.2,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  });

  const imageDataUrl = await imageCompression.getDataUrlFromFile(compressedFile);

  return {
    kind: 'image',
    fileName: compressedFile.name,
    imageDataUrl,
    sizeKb: Math.round(compressedFile.size / 1024),
  };
}

async function processPdfFile(file: File): Promise<ProcessedUpload> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('Ce fichier PDF dépasse 20 Mo.');
  }

  const pdfjsLib = await import('pdfjs-dist');

  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageStrings = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);
    fullText += `\n--- Page ${pageNum} ---\n` + pageStrings.join(' ');
  }

  return {
    kind: 'pdf',
    fileName: file.name,
    sizeKb: Math.round(file.size / 1024),
    pdfText: fullText.trim(),
    pdfPageCount: pdf.numPages,
  };
}

export async function processUploadedFile(file: File): Promise<ProcessedUpload> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    return processPdfFile(file);
  }
  return processImageFile(file);
}