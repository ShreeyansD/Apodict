import React, { useRef, useState } from 'react';
import { Upload, X, Loader2, ChevronDown } from 'lucide-react';
import { geminiClient } from '../services/geminiClient';
import { ExtractedSyllabusData } from '../types/academic';

const MAX_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 25 * 1024 * 1024;

interface Pdf {
  id: string;
  name: string;
  size: number;
  base64: string;
}

interface Props {
  courseName: string;
  onExtracted: (data: ExtractedSyllabusData) => void;
}

export const AddMaterialsPanel: React.FC<Props> = ({ courseName, onExtracted }) => {
  const [open, setOpen] = useState(false);
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    setError(null);
    let total = pdfs.reduce((s, p) => s + p.size, 0);
    const added: Pdf[] = [];
    for (const file of Array.from(files)) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setError(`"${file.name}" is not a PDF.`);
        return;
      }
      if (file.size > MAX_FILE) {
        setError(`"${file.name}" is over the 10MB limit.`);
        return;
      }
      if (total + file.size > MAX_TOTAL) {
        setError('The files total more than 25MB. Remove some or use smaller PDFs.');
        return;
      }
      total += file.size;
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.slice(result.indexOf(',') + 1));
          };
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(file);
        });
        const head = atob(base64.slice(0, 6000));
        if (!head.includes('%PDF-')) {
          setError(`"${file.name}" does not look like a readable PDF.`);
          return;
        }
        if (head.includes('/Encrypt')) {
          setError(`"${file.name}" is password-protected. Upload an unlocked copy or paste the text instead.`);
          return;
        }
        added.push({ id: `${Date.now()}-${added.length}-${Math.random().toString(36).slice(2, 6)}`, name: file.name, size: file.size, base64 });
      } catch {
        setError(`Could not read "${file.name}".`);
        return;
      }
    }
    setPdfs((prev) => [...prev, ...added]);
  };

  const run = async () => {
    if (pdfs.length === 0 && !text.trim()) {
      setError('Add at least one PDF or paste some text.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await geminiClient.parseSyllabus(
        courseName,
        text,
        pdfs.map(({ name, base64, size }) => ({ name, base64, size }))
      );
      onExtracted(data);
      setPdfs([]);
      setText('');
    } catch (e: any) {
      setError(e?.message || 'Could not read these files. You can still edit the course manually below.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Upload className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">Add PDFs or text</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Pull more deadlines and weights from additional files. Manual editing stays available below.
            </div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => picker.current?.click()}
            className="cursor-pointer rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-600 dark:text-slate-400 hover:border-indigo-500 transition-colors"
          >
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">Click to browse</span> or drag and drop PDF files
            <input
              ref={picker}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {pdfs.length > 0 && (
            <ul className="space-y-1.5">
              {pdfs.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs">
                  <span className="truncate text-slate-800 dark:text-slate-200">{p.name}</span>
                  <span className="flex items-center gap-2 shrink-0 text-slate-500 dark:text-slate-400">
                    {(p.size / 1024 / 1024).toFixed(1)} MB
                    <button type="button" onClick={() => setPdfs(pdfs.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`} className="hover:text-rose-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Or paste syllabus text here (optional)"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />

          {error && <div className="text-xs text-rose-700 dark:text-rose-300">{error}</div>}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{busy ? 'Reading files...' : 'Extract and merge'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};