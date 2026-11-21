import { pecahTeksSoal } from '../lib/teksSoal.js';

// Menampilkan teks soal; baris berpemisah " | " ditampilkan sebagai tabel sungguhan.
export default function TeksSoal({ teks, className = 'text-base leading-relaxed' }) {
  return (
    <div className={className}>
      {pecahTeksSoal(teks).map((b, i) =>
        b.jenis === 'tabel' ? (
          <div key={i} className="my-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {b.judul.map((c, k) => (
                    <th key={k} className="border border-line bg-card-2 px-3 py-1.5 text-left font-bold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.baris.map((r, k) => (
                  <tr key={k}>
                    {r.map((c, m) => (
                      <td key={m} className="border border-line px-3 py-1.5">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {b.isi}
          </p>
        ),
      )}
    </div>
  );
}
