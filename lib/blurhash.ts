import { encode } from 'blurhash';

export const encodeImageToBlurhash = async (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      // Keep dimensions small for fast blurhash encoding
      const width = 32;
      const height = Math.round(32 * (img.height / img.width));
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get 2d context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      
      // Encode to blurhash. component X and Y are usually 4 and 3.
      try {
        const hash = encode(imageData.data, imageData.width, imageData.height, 4, 4);
        resolve(hash);
      } catch (e) {
        reject(e);
      }
    };
    
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    
    img.src = url;
  });
};
