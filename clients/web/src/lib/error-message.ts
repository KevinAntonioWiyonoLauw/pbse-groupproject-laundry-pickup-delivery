export function apiMessage(error: unknown): string {
  const candidate = error as { status?: number; problem?: { detail?: string }; message?: string };
  if (candidate.status === 403) return 'Akun ini tidak memiliki izin untuk melihat data tersebut.';
  if (candidate.status === 404) return 'Data tidak ditemukan atau tidak tersedia untuk akun ini.';
  if (candidate.status === 412) return 'Data berubah di jendela lain. Segarkan halaman sebelum mencoba lagi.';
  return candidate.problem?.detail ?? candidate.message ?? 'Periksa koneksi lalu coba lagi.';
}
