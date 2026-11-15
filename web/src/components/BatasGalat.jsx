import { Component } from 'react';

// Menangkap error saat menggambar layar dan menampilkannya, supaya layar tidak kosong tanpa petunjuk.
export default class BatasGalat extends Component {
  constructor(props) {
    super(props);
    this.state = { galat: null };
  }

  static getDerivedStateFromError(galat) {
    return { galat };
  }

  render() {
    const { galat } = this.state;
    if (!galat) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-5">
        <div className="rounded-2xl border border-bahaya/40 bg-bahaya/10 p-4 text-sm">
          <p className="font-bold">Terjadi kesalahan pada tampilan</p>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-redup">
            {String(galat?.stack || galat?.message || galat).split('\n').slice(0, 6).join('\n')}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 rounded-xl bg-card-2 px-4 py-2 font-semibold"
          >
            Muat ulang
          </button>
        </div>
      </div>
    );
  }
}
