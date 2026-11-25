import imageCompression from 'browser-image-compression';

export type ProcessedUpload =
  | {
      kind: 'image';
      fileName: string;
      sizeKb: number;
      imageDataUrl: string;
    }
  | {
      kind: 'pdf';
      fileName: string;
      sizeKb: number;
      pdfText: string;
      pdfPageCount: number;
    };

export async function normalizeMobileFile(file: File): Promise<File> {
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.(heic|heif)$/i.test(file.name);

  if (!isHeic) return file;

  // Garde-fou OOM mobile : rejeter les fichiers HEIC/RAW massifs (> 25 Mo)
  if (file.size > 25 * 1024 * 1024) {
    throw new Error(
      'Fichier HEIC trop volumineux (> 25 Mo). Compresse-le ou capture une photo plus légère.'
    );
  }

  const heic2any = (await import('heic2any')).default;
  const convertedBlob = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.75,
  });

  const singleBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
  return new File([singleBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
    type: 'image/jpeg',
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Impossible de lire le fichier image.'));
      }
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier.'));
    reader.readAsDataURL(blob);
  });
}

async function extractTextFromPdf(file: File): Promise<{
  text: string;
  pageCount: number;
}> {
  const pdfjsLib = await import('pdfjs-dist');

  if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;

  const pagesText: string[] = [];
  const maxPages = Math.min(pageCount, 20);

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);
    pagesText.push(`--- Page ${i} ---\n${strings.join(' ')}`);
  }

  return {
    text: pagesText.join('\n\n'),
    pageCount,
  };
}

export async function processUploadedFile(file: File): Promise<ProcessedUpload> {
  const isPdf =
    file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (isPdf) {
    const { text, pageCount } = await extractTextFromPdf(file);
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    return {
      kind: 'pdf',
      fileName: file.name,
      sizeKb,
      pdfText: text,
      pdfPageCount: pageCount,
    };
  }

  const normalizedFile = await normalizeMobileFile(file);

  const compressedFile = await imageCompression(normalizedFile, {
    maxSizeMB: 1.2,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.82,
  });

  const imageDataUrl = await blobToDataUrl(compressedFile);
  const sizeKb = Math.max(1, Math.round(compressedFile.size / 1024));

  return {
    kind: 'image',
    fileName: normalizedFile.name,
    sizeKb,
    imageDataUrl,
  };
}