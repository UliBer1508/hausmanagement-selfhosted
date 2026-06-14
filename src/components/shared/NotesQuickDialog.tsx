import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface NotesQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  value: string | null | undefined;
  onSave: (newValue: string) => Promise<void> | void;
  saving?: boolean;
}

const NotesQuickDialog = ({
  open,
  onOpenChange,
  title = 'Notiz',
  value,
  onSave,
  saving = false,
}: NotesQuickDialogProps) => {
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    if (open) setDraft(value ?? '');
  }, [open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Hier kannst du eine Notiz zu diesem Eintrag hinzufügen oder bearbeiten.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Notiz eingeben..."
          rows={6}
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button
            onClick={async () => {
              await onSave(draft.trim());
              onOpenChange(false);
            }}
            disabled={saving}
          >
            {saving ? 'Speichert...' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NotesQuickDialog;