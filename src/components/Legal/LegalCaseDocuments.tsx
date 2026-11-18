import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, FileText, Upload } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { useDocumentTypes, useDocumentsForCase, useOneDriveStatus } from "@/hooks/useDocuments";
import { AblageDialog } from "@/components/Documents/DocumentsTab";
import { LegalCase } from "@/types";

const fileSize = (b?: number | null) =>
  !b ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/**
 * Fenster „Dokumente" einer Verfahrenskarte.
 *
 * Die Dateien liegen in der Dokumentenverwaltung (OneDrive) — es gibt KEINE
 * zweite Ablage (Vorgabe Uli 18.11.2026, siehe docs/Dokumentenverwaltung-OneDrive.md).
 * Verknüpft über document_links.entity_type = 'verfahren' (SQL 71).
 * „Ablegen" öffnet den normalen Ablage-Dialog des Dokumente-Tabs, vorbelegt mit
 * Haus des Verfahrens und Typ „Rechtlich relevante Dokumente"; das Verfahren
 * wird immer zusätzlich verknüpft. Mehrere Dateien werden nacheinander abgelegt.
 */
const LegalCaseDocuments = ({ legalCase }: { legalCase: LegalCase }) => {
  const { data: docs = [], isLoading } = useDocumentsForCase(legalCase.id);
  const { data: types = [] } = useDocumentTypes();
  const status = useOneDriveStatus();
  const [open, setOpen] = useState(false);

  // Typ „Rechtlich relevante Dokumente" (o. ä.) vorbelegen, sonst den ersten aktiven
  const activeTypes = types.filter(t => t.is_active);
  const rechtTyp = activeTypes.find(t => /recht/i.test(t.name)) ?? activeTypes[0];
  const verbunden = !!status.data?.connected;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Button size="sm" onClick={() => setOpen(true)} disabled={activeTypes.length === 0}>
          <Upload className="h-4 w-4 mr-1" /> Dokumente ablegen
        </Button>
        <p className="text-xs text-muted-foreground">
          Legt in der Dokumentenverwaltung (OneDrive) ab und verknüpft mit diesem Verfahren.
          Mehrere Dateien auf einmal möglich.
        </p>
      </div>
      {status.data && !verbunden && (
        <p className="text-xs text-amber-700">OneDrive ist nicht verbunden — bitte zuerst im Tab „Dokumente" verbinden.</p>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Lädt …</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine Dokumente mit diesem Verfahren verknüpft.</p>
      ) : (
        <div className="divide-y rounded-md border">
          {(docs as any[]).map(d => (
            <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{d.file_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {format(parseISO(d.created_at), 'dd.MM.yyyy', { locale: de })}
                  {d.size_bytes ? ` · ${fileSize(d.size_bytes)}` : ''}
                  {d.onedrive_path ? ` · ${d.onedrive_path}` : ''}
                </div>
              </div>
              {d.document_types?.name && <Badge variant="outline" className="text-xs shrink-0">{d.document_types.name}</Badge>}
              {d.onedrive_web_url && (
                <a href={d.onedrive_web_url} target="_blank" rel="noreferrer" title="In OneDrive öffnen">
                  <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Verknüpfung entfernen oder Zuordnung ändern: im Tab „Dokumente".
      </p>

      {open && (
        <AblageDialog
          types={activeTypes}
          onClose={() => setOpen(false)}
          preset={{
            typeId: rechtTyp?.id,
            target: 'haus',
            entityId: legalCase.house_id,
            verfahrenId: legalCase.id,
            verfahrenLabel: `${legalCase.houses?.name ?? ''} · ${legalCase.title}`,
          }}
        />
      )}
    </div>
  );
};

export default LegalCaseDocuments;
