// Memperkecil foto di perangkat sebelum diunggah: foto kamera HP bisa 4-8 MB, padahal bukti transfer cukup terbaca di ±1600 px.

const SISI_MAKS = 1600;
const BATAS_LANGSUNG = 800 * 1024; // berkas lebih kecil dari ini dikirim apa adanya

/** Mengembalikan Blob siap unggah (JPEG yang diperkecil, atau berkas asli bila sudah kecil / gagal diperkecil). */
export async function kecilkanFoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('Pilih berkas gambar (foto atau tangkapan layar)');
  if (file.size <= BATAS_LANGSUNG && /^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const skala = Math.min(1, SISI_MAKS / Math.max(bmp.width, bmp.height));
    const kanvas = document.createElement('canvas');
    kanvas.width = Math.round(bmp.width * skala);
    kanvas.height = Math.round(bmp.height * skala);
    kanvas.getContext('2d').drawImage(bmp, 0, 0, kanvas.width, kanvas.height);
    const blob = await new Promise((ok) => kanvas.toBlob(ok, 'image/jpeg', 0.85));
    return blob || file;
  } catch {
    return file; // peramban tidak bisa memproses: kirim asli, server tetap memeriksa
  }
}
