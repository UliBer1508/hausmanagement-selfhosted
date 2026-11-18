import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.eml,.msg,.zip";

const fileSize = (b: number) =>
  b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

// Gleiche Datei nicht doppelt aufnehmen (Name + Größe + Änderungszeit)
const keyOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

/**
 * Dateiauswahl für das Rechtliches-Modul: mehrere Dateien per Klick ODER per
 * Hineinziehen. Jede neue Auswahl wird zur Liste HINZUGEFÜGT (nicht ersetzt);
 * einzelne Dateien lassen sich vor dem Hochladen wieder entfernen.
 */
const FileDropZone = ({ files, onChange, disabled }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const add = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const known = new Set(files.map(keyOf));
    const fresh = Array.from(list).filter(f => !known.has(keyOf(f)));
    onChange([...files, ...fresh]);
  };

  const remove = (f: File) => onChange(files.filter(x => keyOf(x) !== keyOf(f)));

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!disabled) add(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-5 text-sm text-muted-foreground cursor-pointer transition-colors",
          dragOver ? "border-primary bg-primary/5 text-primary" : "border-muted-foreground/30 hover:border-primary/60",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <Upload className="h-5 w-5" />
        <span>Dateien hierher ziehen oder <span className="text-primary underline">auswählen</span></span>
        <span className="text-xs">Mehrere auf einmal möglich — weitere Auswahl wird ergänzt</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => { add(e.target.files); e.target.value = ''; }}
        />
      </div>

      {files.length > 0 && (
        <div className="rounded-md border divide-y">
          {files.map(f => (
            <div key={keyOf(f)} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{fileSize(f.size)}</span>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={disabled}
                onClick={() => remove(f)} title="Aus der Auswahl entfernen">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileDropZone;
