-- Program (produk yang bisa dibeli), hak akses siswa per program, dan pesanan pembayaran (transfer manual).
-- Satu siswa boleh punya banyak program. Tiap modul aplikasi hanya bertanya "siswa ini punya akses aktif ke program X?".
BEGIN;

CREATE TABLE programs (
    kode          VARCHAR(30)  PRIMARY KEY,
    nama          VARCHAR(120) NOT NULL,
    deskripsi     TEXT         NOT NULL DEFAULT '',
    harga_rupiah  INTEGER      NOT NULL DEFAULT 0 CHECK (harga_rupiah >= 0),   -- 0 = harga belum ditetapkan
    durasi_hari   INTEGER      CHECK (durasi_hari IS NULL OR durasi_hari > 0), -- NULL = berlaku selamanya
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    urutan        INTEGER      NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Hak akses. Aktif bila berlaku_sampai kosong (selamanya) atau masih di masa depan.
CREATE TABLE student_access (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id      UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    program_kode    VARCHAR(30) NOT NULL REFERENCES programs(kode),
    berlaku_mulai   TIMESTAMPTZ NOT NULL DEFAULT now(),
    berlaku_sampai  TIMESTAMPTZ,
    sumber          VARCHAR(20) NOT NULL CHECK (sumber IN ('pembayaran', 'admin', 'promo')),
    pembayaran_id   UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, program_kode)   -- satu baris per siswa per program; perpanjangan memperbarui baris ini
);
CREATE INDEX idx_student_access_student ON student_access(student_id);

-- Pesanan pembayaran transfer manual.
--  menunggu_transfer     : pesanan dibuat, siswa belum melapor sudah transfer
--  menunggu_verifikasi   : siswa melapor sudah transfer, menunggu admin mengecek mutasi rekening
--  lunas / ditolak       : keputusan admin
--  dibatalkan            : dibatalkan siswa sebelum melapor
CREATE TABLE payments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    program_kode       VARCHAR(30) NOT NULL REFERENCES programs(kode),
    harga_rupiah       INTEGER     NOT NULL CHECK (harga_rupiah >= 0),
    kode_unik          INTEGER     NOT NULL CHECK (kode_unik BETWEEN 0 AND 999),  -- ditambahkan ke nominal agar mutasi mudah dicocokkan
    status             VARCHAR(24) NOT NULL DEFAULT 'menunggu_transfer'
                       CHECK (status IN ('menunggu_transfer', 'menunggu_verifikasi', 'lunas', 'ditolak', 'dibatalkan')),
    nama_pengirim      VARCHAR(120),
    bukti_path         TEXT,                                          -- berkas bukti transfer di bucket privat Supabase Storage
    catatan_siswa      TEXT,
    catatan_admin      TEXT,
    dilapor_pada       TIMESTAMPTZ,
    diputuskan_oleh    UUID REFERENCES students(id),
    diputuskan_pada    TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_student ON payments(student_id, created_at DESC);
CREATE INDEX idx_payments_status ON payments(status, created_at);
-- Hanya satu pesanan terbuka per siswa per program: mencegah tumpukan pesanan dan kode unik ganda.
CREATE UNIQUE INDEX uq_payments_terbuka
    ON payments(student_id, program_kode) WHERE status IN ('menunggu_transfer', 'menunggu_verifikasi');

ALTER TABLE student_access
    ADD CONSTRAINT fk_student_access_pembayaran FOREIGN KEY (pembayaran_id) REFERENCES payments(id) ON DELETE SET NULL;

-- Program awal: Drill Soal (ZenQuest). Harga 0 = belum ditetapkan; atur dengan UPDATE programs SET harga_rupiah = ... WHERE kode = 'cbt'.
INSERT INTO programs (kode, nama, deskripsi, harga_rupiah, durasi_hari, urutan)
VALUES ('cbt', 'Drill Soal ZenQuest', 'Latihan soal SNBT berjenjang dengan level, RR, dan laporan pencapaian.', 0, 30, 1);

COMMIT;
