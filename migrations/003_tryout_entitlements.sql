-- Hak mengerjakan tryout reguler (pay-per-use). Satu baris = satu tryout.
-- Diisi oleh alur pembayaran (webhook payment gateway) / admin; dipakai (dikonsumsi) saat tryout dimulai.
BEGIN;

CREATE TABLE student_tryout_entitlements (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id  UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    sumber      VARCHAR(20) NOT NULL CHECK (sumber IN ('pembelian', 'promo', 'admin')),
    referensi   TEXT,                                   -- id pesanan dari payment gateway
    status      VARCHAR(20) NOT NULL DEFAULT 'tersedia' CHECK (status IN ('tersedia', 'terpakai')),
    attempt_id  UUID        REFERENCES student_attempts(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at     TIMESTAMPTZ
);
-- Webhook yang terkirim dua kali tidak membuat hak ganda
CREATE UNIQUE INDEX uq_tryout_entitlement_referensi
    ON student_tryout_entitlements(referensi) WHERE referensi IS NOT NULL;
CREATE INDEX idx_tryout_entitlement_student
    ON student_tryout_entitlements(student_id, status);

COMMIT;
