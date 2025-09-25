import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Edit, Plus, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
}

interface EmailTemplateEditorProps {
  templates: Record<string, EmailTemplate>;
  onUpdateTemplate: (templates: Record<string, EmailTemplate>) => void;
}

const EmailTemplateEditor = ({ templates, onUpdateTemplate }: EmailTemplateEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    content: ''
  });

  const handleEdit = (templateId: string) => {
    const template = templates[templateId];
    if (template) {
      setEditingTemplate({ ...template, id: templateId });
      setFormData({
        name: template.name,
        subject: template.subject,
        content: template.content
      });
      setIsEditing(true);
    }
  };

  const handleCreate = () => {
    setFormData({
      name: '',
      subject: '',
      content: ''
    });
    setEditingTemplate(null);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.subject || !formData.content) {
      toast({
        title: "Fehler",
        description: "Bitte füllen Sie alle Felder aus.",
        variant: "destructive"
      });
      return;
    }

    const updatedTemplates = { ...templates };

    if (isCreating) {
      // Create new template
      const newId = formData.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      updatedTemplates[newId] = {
        id: newId,
        name: formData.name,
        subject: formData.subject,
        content: formData.content
      };
      toast({
        title: "Vorlage erstellt",
        description: `Die Vorlage "${formData.name}" wurde erfolgreich erstellt.`
      });
    } else if (editingTemplate) {
      // Update existing template
      updatedTemplates[editingTemplate.id] = {
        id: editingTemplate.id,
        name: formData.name,
        subject: formData.subject,
        content: formData.content
      };
      toast({
        title: "Vorlage gespeichert", 
        description: `Die Vorlage "${formData.name}" wurde erfolgreich aktualisiert.`
      });
    }

    onUpdateTemplate(updatedTemplates);
    setIsEditing(false);
    setIsCreating(false);
    setEditingTemplate(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsCreating(false);
    setEditingTemplate(null);
    setFormData({ name: '', subject: '', content: '' });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>E-Mail-Vorlagen verwalten</CardTitle>
          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogTrigger asChild>
              <Button onClick={handleCreate} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Neue Vorlage
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Neue E-Mail-Vorlage erstellen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name der Vorlage</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="z.B. Willkommens-E-Mail"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Betreff</label>
                  <Input
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="E-Mail Betreff"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Nachrichteninhalt</label>
                  <Textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Verfügbare Platzhalter: {GUEST_NAME}, {CHECK_IN}, {CHECK_OUT}, {HOUSE_NAME}, {GUEST_COUNT}"
                    rows={12}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={handleCancel}>
                    <X className="w-4 h-4 mr-2" />
                    Abbrechen
                  </Button>
                  <Button onClick={handleSave}>
                    <Save className="w-4 h-4 mr-2" />
                    Vorlage erstellen
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.entries(templates).map(([key, template]) => (
            <div key={key} className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{template.name}</span>
                  <Badge variant="secondary" className="text-xs">Vorlage</Badge>
                </div>
                <Dialog open={isEditing && editingTemplate?.id === key} onOpenChange={setIsEditing}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(key)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Bearbeiten
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>E-Mail-Vorlage bearbeiten</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Name der Vorlage</label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Betreff</label>
                        <Input
                          value={formData.subject}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Nachrichteninhalt</label>
                        <Textarea
                          value={formData.content}
                          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                          rows={12}
                          className="mt-1 font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Verfügbare Platzhalter: {"{GUEST_NAME}"}, {"{CHECK_IN}"}, {"{CHECK_OUT}"}, {"{HOUSE_NAME}"}, {"{GUEST_COUNT}"}
                        </p>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={handleCancel}>
                          <X className="w-4 h-4 mr-2" />
                          Abbrechen
                        </Button>
                        <Button onClick={handleSave}>
                          <Save className="w-4 h-4 mr-2" />
                          Änderungen speichern
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="text-sm text-muted-foreground mb-1">
                <strong>Betreff:</strong> {template.subject}
              </div>
              <div className="text-sm text-muted-foreground">
                <strong>Vorschau:</strong> {template.content.substring(0, 100)}...
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default EmailTemplateEditor;