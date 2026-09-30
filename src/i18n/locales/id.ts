import type { strings as en } from '../strings';

/**
 * Indonesian overrides, merged onto the English dictionary at read time (see
 * useStrings.ts) so any key missing here falls back to English instead of
 * rendering undefined. Scoped to onboarding, setup, the tour's shared chrome,
 * and Help & Tutorials — same pass boundary as locales/fil.ts; everything
 * else (tabs, dashboard labels, per-tour step content, component names)
 * still reads English until a later pass extends this file.
 *
 * Machine-translated; needs native-speaker review before release
 * (LOCALIZATION.md §6).
 */

type DeepPartial<T> = T extends readonly (infer U)[]
  ? readonly DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : string;

export const id: DeepPartial<typeof en> = {
  dashboard: {
    health: {
      estimated: 'Berdasarkan perkiraan jarak tempuh',
    },
    odometer: {
      noReading: 'Belum ada pembacaan',
      estimated: '~{km} perkiraan hari ini',
      estimatedRough: '~{km} perkiraan kasar hari ini',
      needsReading: 'Tambahkan satu pembacaan lagi untuk memperkirakan jarak tempuh',
    },
  },
  odometerReference: {
    none: 'Belum ada pembacaan odometer',
    actual: 'Pembacaan terakhir: {km} pada {date}',
    withEstimate: 'Pembacaan terakhir: {km} pada {date} · ~{estimate} perkiraan hari ini',
    withRoughEstimate: 'Pembacaan terakhir: {km} pada {date} · ~{estimate} perkiraan kasar hari ini',
    needsReading: 'Pembacaan terakhir: {km} pada {date} · tambahkan satu pembacaan lagi untuk memperkirakan jarak tempuh saat ini',
    optionalHint: '{reference}. Kosongkan jika Anda tidak tahu angkanya.',
    requiredError: 'Masukkan angka odometer yang tertera di motor Anda.',
  },
  baseline: {
    notSetUp: 'Belum diatur. Masukkan angka odometer saat terakhir kali dilakukan. Jika dilakukan hari ini, ketuk Just serviced today (masukkan angka hari ini terlebih dahulu jika Anda tahu).',
    needsKm: 'Masukkan angka odometer saat terakhir kali dilakukan',
  },
  remindersList: {
    notificationsEnded: 'Terlambat sejak {date}. Tidak akan ada notifikasi lagi untuk ini; catat setelah selesai dikerjakan.',
  },
  dataPrivacy: {
    deleted: 'Semua data telah dihapus',
    deletedFilesRemain: 'Semua catatan telah dihapus, tetapi beberapa file tersimpan tidak dapat dihapus',
  },
  onboarding: {
    carousel: {
      skip: 'Lewati',
      next: 'Berikutnya',
      getStarted: 'Mulai',
      stages: [
        {
          eyebrow: '01',
          title: 'Kenali motor Anda',
          body: 'Simpan detail motor Anda di satu tempat: model, plat nomor, nomor rangka (VIN), dan odometer yang menjadi dasar semua fitur lainnya.',
        },
        {
          eyebrow: '02',
          title: 'Jangan pernah lewatkan perawatan',
          body: 'Lacak servis, jadwal, dan jarak tempuh, plus Skor Kesehatan langsung agar Anda selalu tahu kondisi motor Anda.',
        },
        {
          eyebrow: '03',
          title: 'Simpan riwayat Anda',
          body: 'Bangun riwayat perawatan yang nyata seiring waktu. Setiap servis, setiap rupiah yang dikeluarkan, semua dalam satu linimasa yang bisa dicari.',
        },
      ],
    },
    language: {
      title: 'Pilih bahasa Anda',
      body: 'Pilih bahasa yang ingin Anda gunakan di Tolits. Anda bisa mengubahnya kapan saja di Pengaturan.',
      english: 'English',
      englishHint: 'Gunakan Bahasa Inggris di seluruh aplikasi',
      tagalog: 'Tagalog',
      tagalogHint: 'Gunakan bahasa Tagalog di seluruh aplikasi',
      vietnamese: 'Tiếng Việt',
      vietnameseHint: 'Gunakan bahasa Vietnam di seluruh aplikasi',
      indonesian: 'Bahasa Indonesia',
      indonesianHint: 'Gunakan Bahasa Indonesia di seluruh aplikasi',
      thai: 'ภาษาไทย',
      thaiHint: 'Gunakan bahasa Thailand di seluruh aplikasi',
      continue: 'Lanjutkan',
    },
    setup: {
      title: 'Siapkan motor Anda',
      stepOf: 'Langkah {current} dari {total}',
      skipStep: 'Lewati langkah ini',
      back: 'Kembali',
      next: 'Berikutnya',
      finish: 'Selesai',
      closeA11y: 'Keluar dari pengaturan',
      exitTitle: 'Keluar dari pengaturan?',
      exitBody: 'Anda bisa menambahkan motor dan riwayat nanti dari Garasi.',
      exitConfirm: 'Keluar dari pengaturan',
      bike: {
        title: 'Tambahkan motor Anda',
        body: 'Beri tahu kami dasar-dasarnya: model, plat nomor, dan odometer saat ini.',
        why: 'Ini adalah dasar dari dasbor dan pengingat Anda.',
      },
      oil: {
        title: 'Ganti oli terakhir',
        body: 'Kapan terakhir kali Anda mengganti oli mesin? Lewati jika tidak yakin.',
        why: 'Kami akan menggunakan ini untuk memulai jadwal perawatan Anda.',
        dateLabel: 'Tanggal ganti oli terakhir',
        odoLabel: 'Odometer saat itu (km, opsional)',
        save: 'Simpan ganti oli',
        saved: 'Ganti oli telah dicatat.',
      },
      done: {
        title: 'Anda sudah siap',
        body: 'Garasi Anda sudah siap. Selanjutnya, dasbor.',
        cta: 'Ke dasbor',
      },
    },
  },
  tutorial: {
    common: {
      next: 'Berikutnya',
      back: 'Kembali',
      done: 'Selesai',
      skip: 'Lewati tur',
      closeA11y: 'Tutup tutorial',
      stepOf: 'Langkah {current} dari {total}',
      tryIt: 'Coba sekarang: ketuk kontrol yang disorot.',
      tryItLong: 'Coba sekarang: tekan dan tahan kontrol yang disorot.',
      tryItNavigate: 'Coba sekarang. Tur akan berlanjut di layar berikutnya.',
      tryItSave: 'Coba sekarang. Tur akan berlanjut setelah Anda menyimpan.',
    },
    offer: {
      title: 'Ingin tur singkat?',
      body: 'Sekitar 3 menit, bisa dilewati kapan saja. Anda juga bisa memutarnya lagi nanti dari Pengaturan.',
      start: 'Mulai tur',
      later: 'Nanti saja',
      never: 'Jangan tampilkan lagi',
    },
    resume: {
      title: 'Lanjutkan tur?',
      body: 'Anda meninggalkan tur di tengah jalan.',
      resume: 'Lanjutkan',
      restart: 'Mulai ulang',
      dismiss: 'Nanti saja',
    },
  },
  help: {
    title: 'Bantuan & Tutorial',
    toursSection: 'Tur terpandu',
    articlesSection: 'Panduan',
    optionsSection: 'Opsi',
    status: {
      completed: 'Selesai',
      inProgress: 'Sedang berlangsung',
      skipped: 'Dilewati',
      notStarted: 'Belum dimulai',
    },
    replayA11y: 'Putar ulang {title}',
    tutorialMode: 'Mode Tutorial',
    tutorialModeCaption: 'Tampilkan kembali semua tip kontekstual dan panduan. Data Anda tidak terpengaruh.',
    showOfferAgain: 'Tampilkan lagi tawaran tur',
    resetProgress: 'Atur ulang progres tutorial',
    resetTitle: 'Atur ulang progres tutorial?',
    resetBody:
      'Tur, tip, dan pengenalan akan ditandai belum dilihat. Motor, perawatan, bensin, pengeluaran, dan dokumen tidak terpengaruh.',
    resetConfirm: 'Atur ulang progres',
    maintenanceDates: {
      rowTitle: 'Cara melacak tanggal perawatan',
      title: 'Cara melacak tanggal perawatan',
      whenTitle: 'Kapan mencatat servis',
      whenBody:
        'Catat item perawatan segera setelah Anda selesai melakukannya, seperti ganti oli atau kampas rem baru. Tolits menggunakan tanggal dan bacaan odometer tersebut untuk merencanakan yang berikutnya.',
      datesTitle: 'Cara kerja tanggal',
      datesBody:
        'Setiap komponen mengingat tanggal terakhir diservis. Anda bisa memperbarui ini kapan saja dari layar komponen di Perawatan, tidak perlu mengaturnya saat pengaturan awal.',
      intervalsTitle: 'Cara kerja interval odometer',
      intervalsBody:
        'Setiap komponen memiliki interval yang direkomendasikan, dalam kilometer, bulan, atau keduanya. Tolits menghitung dari catatan terakhir Anda untuk memperkirakan kapan yang berikutnya jatuh tempo.',
      remindersTitle: 'Cara pengingat menggunakan ini',
      remindersBody:
        'Saat komponen segera jatuh tempo atau terlambat, Tolits menampilkannya di dasbor Anda dan bisa mengirim pengingat. Menjaga odometer tetap diperbarui membuat perkiraan ini tetap akurat.',
    },
  },
};
