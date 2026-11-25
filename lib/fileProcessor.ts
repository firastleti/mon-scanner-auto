import imageCompression from 'browser-image-compression';

export interface ProcessedUpload {
  kind: 'image' | 'pdf';
  fileName: string;
  imageDataUrl?: string;
  previewUrl?: string;
  sizeKb: number;
  pdfText?: string;
  pdfPageCount?: number;
}

const MAX_HEIC_BYTES = 25 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 1024;

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
    quality: 0.72,
  });

  const blob = Array.isArray(converted) ? converted[0] : converted;
  const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg');

  return new File([blob], jpegName, { type: 'image/jpeg' });
}

function downscaleImageToBlobAndDataUrl(
  file: File,
  maxDim: number
): Promise<{ blob: Blob; dataUrl: string; approxBytes: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Impossible d’initialiser le contexte canvas.'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        const approxBytes = Math.round((dataUrl.length * 3) / 4);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error('Impossible de générer le aperçu image.'));
              return;
            }
            resolve({ blob, dataUrl, approxBytes });
          },
          'image/jpeg',
          0.72
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Impossible de lire l’image sélectionnée.'));
    };

    img.src = objectUrl;
  });
}

async function processImageFile(file: File): Promise<ProcessedUpload> {
  const normalizedFile = await convertHeicIfNeeded(file);

  try {
    const { blob, dataUrl, approxBytes } = await downscaleImageToBlobAndDataUrl(
      normalizedFile,
      MAX_DIMENSION
    );
    const previewUrl = URL.createObjectURL(blob);

    return {
      kind: 'image',
      fileName: normalizedFile.name.replace(/\.(heic|heif)$/i, '.jpg'),
      imageDataUrl: dataUrl,
      previewUrl,
      sizeKb: Math.max(1, Math.round(approxBytes / 1024)),
    };
  } catch {
    const compressedFile = await imageCompression(normalizedFile, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: MAX_DIMENSION,
      useWebWorker: false,
      fileType: 'image/jpeg',
      initialQuality: 0.72,
    });

    const imageDataUrl = await imageCompression.getDataUrlFromFile(compressedFile);
    const previewUrl = URL.createObjectURL(compressedFile);

    return {
      kind: 'image',
      fileName: compressedFile.name,
      imageDataUrl,
      previewUrl,
      sizeKb: Math.max(1, Math.round(compressedFile.size / 1024)),
    };
  }
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
    sizeKb: Math.max(1, Math.round(file.size / 1024)),
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