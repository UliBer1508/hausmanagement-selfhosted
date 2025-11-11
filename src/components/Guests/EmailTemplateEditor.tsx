import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useEmailTemplates, EmailTemplate } from '@/hooks/useEmailTemplates';
import { Trash2 } from 'lucide-react';

interface EmailTemplateEditorProps {
  language: string;
  onCreateTemplate: (template: Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>) => void;
  onUpdateTemplate: (updates: Partial<EmailTemplate> & { id: string }) => void;
  onDeleteTemplate: (id: string) => void;
}

const EmailTemplateEditor = ({ language, onCreateTemplate, onUpdateTemplate, onDeleteTemplate }: EmailTemplateEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    template_key: '',
    name: '',
    subject: '',
    content: '',
    language: language,
    is_system: false
  });
  const { toast } = useToast();
  const { templatesArray, isLoading } = useEmailTemplates(language);

  const handleEdit = (template: EmailTemplate) => {
    setFormData({
      template_key: template.template_key,
      name: template.name,
      subject: template.subject,
      content: template.content,
      language: template.language,
      is_system: template.is_system
    });
    setEditingTemplate(template);
    setIsEditing(true);
    setIsCreating(false);
  };

  const handleCreate = () => {
    setFormData({
      template_key: `custom_${Date.now()}`,
      name: '',
      subject: '',
      content: '',
      language: language,
      is_system: false
    });
    setIsCreating(true);
    setIsEditing(false);
    setEditingTemplate(null);
  };

  const handleSave = () => {
    if (!formData.name || !formData.subject || !formData.content) {
      toast({
        title: 'Fehler',
        description: 'Bitte füllen Sie alle Felder aus.',
        variant: 'destructive',
      });
      return;
    }

    if (isCreating) {
      onCreateTemplate({
        template_key: formData.template_key,
        name: formData.name,
        subject: formData.subject,
        content: formData.content,
        language: formData.language,
        is_system: false
      });
    } else if (editingTemplate) {
      onUpdateTemplate({
        id: editingTemplate.id,
        name: formData.name,
        subject: formData.subject,
        content: formData.content
      });
    }

    handleCancel();
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsCreating(false);
    setEditingTemplate(null);
    setFormData({
      template_key: '',
      name: '',
      subject: '',
      content: '',
      language: language,
      is_system: false
    });
  };

  if (isLoading) {
    return <div>Lade Vorlagen...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-Mail-Vorlagen verwalten</CardTitle>
        <CardDescription>
          Erstellen und bearbeiten Sie Ihre E-Mail-Vorlagen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* New Template Button */}
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button onClick={handleCreate}>
              Neue Vorlage erstellen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neue Vorlage erstellen</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Erstellen Sie eine neue E-Mail-Vorlage für Ihre Gästekommunikation
              </p>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-name">Vorlagenname</Label>
                <Input
                  id="new-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Willkommens-E-Mail"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-subject">Betreff</Label>
                <Input
                  id="new-subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="E-Mail Betreff"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-language">Sprache</Label>
                <select
                  id="new-language"
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="de">🇩🇪 Deutsch</option>
                  <option value="en">🇬🇧 English</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-content">Inhalt</Label>
                <Textarea
                  id="new-content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="E-Mail Inhalt (verwenden Sie {guestName} als Platzhalter)"
                  className="min-h-[200px]"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={handleCancel}>
                  Abbrechen
                </Button>
                <Button onClick={handleSave}>
                  Speichern
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Display existing templates */}
        <div className="space-y-4">
          {templatesArray.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <span className="text-lg" title={template.language === 'de' ? 'Deutsch' : 'English'}>
                        {template.language === 'de' ? '🇩🇪' : '🇬🇧'}
                      </span>
                    </div>
                    <CardDescription>{template.subject}</CardDescription>
                  </div>
                  {!template.is_system && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteTemplate(template.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {template.content}
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(template)}
                      >
                        Bearbeiten
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Vorlage bearbeiten</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-name">Vorlagenname</Label>
                          <Input
                            id="edit-name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-subject">Betreff</Label>
                          <Input
                            id="edit-subject"
                            value={formData.subject}
                            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-language">Sprache</Label>
                          <select
                            id="edit-language"
                            value={formData.language}
                            onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                            disabled={editingTemplate?.is_system}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="de">🇩🇪 Deutsch</option>
                            <option value="en">🇬🇧 English</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-content">Inhalt</Label>
                          <Textarea
                            id="edit-content"
                            value={formData.content}
                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            className="min-h-[200px]"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" onClick={handleCancel}>
                            Abbrechen
                          </Button>
                          <Button onClick={handleSave}>
                            Speichern
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default EmailTemplateEditor;
